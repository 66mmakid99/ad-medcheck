/**
 * 클라우드 크롤러 (Scheduled Handler)
 * 
 * Cloudflare Workers Cron Trigger로 자동 실행됩니다.
 * 로컬 PC가 필요 없습니다!
 * 
 * 흐름:
 * 1. Cron이 이 핸들러를 호출
 * 2. D1에서 분석 대상 병원 목록을 가져옴 (crawl_queue)
 * 3. 각 병원 URL을 fetch로 가져와서 분석
 * 4. 결과를 D1에 저장
 * 5. 대시보드에서 바로 조회 가능
 * 
 * 위치: src/scheduled/crawler-handler.ts
 */

import { runAnalysisPipeline, savePipelineResult } from '../services/analysis-pipeline';
import type { PipelineInput } from '../services/analysis-pipeline';
import type { Env } from '../types/env';

// ============================================
// 설정
// ============================================

/** 한 번의 Cron 실행에서 분석할 최대 병원 수 */
const BATCH_SIZE = 10;

/** 각 병원 분석 사이 대기 시간 (ms) - API 레이트 리밋 방지 */
const DELAY_BETWEEN = 2000;

/** 개별 분석 타임아웃 (ms) */
const ANALYSIS_TIMEOUT = 20000;

/** 재분석 간격 (일) - 이미 분석한 병원은 N일 후 재분석 */
const REANALYZE_INTERVAL_DAYS = 7;

// ============================================
// 메인 핸들러
// ============================================

/**
 * Cloudflare Cron Trigger에서 호출되는 메인 함수
 * 
 * wrangler.toml에서 이렇게 설정합니다:
 * [triggers]
 * crons = ["0 0 * * *", "0 9 * * *"]
 * 
 * (매일 09:00, 18:00 KST = 00:00, 09:00 UTC)
 */
export async function handleScheduled(
  event: ScheduledEvent,
  env: Env,
): Promise<void> {
  const db = env.DB;
  const batchId = `BATCH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const startTime = Date.now();

  console.log(`[Crawler] 배치 시작: ${batchId}`);

  // 배치 기록 생성
  await db.prepare(`
    INSERT INTO crawl_batches (id, trigger_type, status, started_at)
    VALUES (?, 'cron', 'running', datetime('now'))
  `).bind(batchId).run();

  // 스케줄러 상태를 온라인으로 업데이트 (하트비트 역할)
  await db.prepare(`
    UPDATE crawler_scheduler_status 
    SET is_online = 1, 
        last_heartbeat = datetime('now'),
        running_jobs = 1
    WHERE id = 'singleton'
  `).run();

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;
  let totalViolations = 0;

  try {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Step 1: 분석 대상 가져오기
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const targets = await db.prepare(`
      SELECT hospital_id, hospital_name, homepage_url
      FROM crawl_queue
      WHERE status IN ('pending', 'completed')
        AND (
          -- pending 상태이거나
          status = 'pending'
          -- completed이지만 재분석 시간이 된 것
          OR (status = 'completed' AND next_analyze_after <= datetime('now'))
        )
        AND retry_count < max_retries
      ORDER BY 
        -- pending 우선, 그 다음 재분석 대상
        CASE status WHEN 'pending' THEN 0 ELSE 1 END,
        priority ASC,
        last_analyzed_at ASC NULLS FIRST
      LIMIT ?
    `).bind(BATCH_SIZE).all();

    const hospitals = targets.results || [];
    console.log(`[Crawler] 분석 대상: ${hospitals.length}개 병원`);

    if (hospitals.length === 0) {
      // 분석할 대상이 없으면 조기 종료
      await completeBatch(db, batchId, startTime, 0, 0, 0, 0, 0);
      return;
    }

    // 배치 총 수 업데이트
    await db.prepare(`
      UPDATE crawl_batches SET total_count = ? WHERE id = ?
    `).bind(hospitals.length, batchId).run();

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Step 2: 각 병원 분석 실행
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    for (let i = 0; i < hospitals.length; i++) {
      const hospital = hospitals[i] as {
        hospital_id: number;
        hospital_name: string;
        homepage_url: string;
      };

      // 진행 중 상태로 변경
      await db.prepare(`
        UPDATE crawl_queue SET status = 'processing', updated_at = datetime('now')
        WHERE hospital_id = ?
      `).bind(hospital.hospital_id).run();

      console.log(`[Crawler] [${i + 1}/${hospitals.length}] ${hospital.hospital_name}: ${hospital.homepage_url}`);

      const input: PipelineInput = {
        url: hospital.homepage_url,
        hospitalId: hospital.hospital_id,
        hospitalName: hospital.hospital_name,
        enableAI: !!env.GEMINI_API_KEY, // API 키 있으면 AI 검증도 수행
        batchId,
        timeout: ANALYSIS_TIMEOUT,
      };

      try {
        // 분석 파이프라인 실행
        const result = await runAnalysisPipeline(input, env.GEMINI_API_KEY);

        // 결과 DB 저장
        await savePipelineResult(db, input, result);

        if (result.success && result.analysis) {
          successCount++;
          totalViolations += result.analysis.violationCount;
          console.log(
            `  → ${result.analysis.gradeEmoji} ${result.analysis.grade}등급 ` +
            `(청정 ${result.analysis.cleanScore}점, 위반 ${result.analysis.violationCount}건)`
          );
        } else if (result.error?.code === 'SPA_SITE') {
          skipCount++;
          console.log(`  → ⏭️ SPA skip: ${hospital.hospital_name}`);
          await db.prepare(`
            UPDATE crawl_queue SET status = 'skipped',
            error_message = 'SPA site', updated_at = datetime('now')
            WHERE hospital_id = ?
          `).bind(hospital.hospital_id).run();
        } else {
          failCount++;
          console.log(`  → ❌ 실패: ${result.error?.message}`);
        }

      } catch (error) {
        failCount++;
        console.error(`  → ❌ 예외: ${(error as Error).message}`);

        // 에러 결과 저장
        await savePipelineResult(db, input, {
          success: false,
          meta: {
            url: input.url,
            hospitalId: input.hospitalId,
            textLength: 0,
            analysisTimeMs: 0,
            fetchTimeMs: 0,
            timestamp: new Date().toISOString(),
          },
          error: {
            code: 'EXCEPTION',
            message: (error as Error).message,
          },
        });
      }

      // 다음 병원 전에 잠시 대기 (레이트 리밋 방지)
      if (i < hospitals.length - 1) {
        await sleep(DELAY_BETWEEN);
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Step 3: 배치 완료 기록
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await completeBatch(
      db, batchId, startTime,
      hospitals.length, successCount, failCount, skipCount, totalViolations
    );

    console.log(JSON.stringify({
      event: 'BATCH_COMPLETE',
      batchId,
      results: { success: successCount, fail: failCount, skip: skipCount },
      durationSec: Math.round((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
    }));

  } catch (error) {
    // 전체 배치 실패
    console.error(`[Crawler] 배치 실패: ${(error as Error).message}`);
    await db.prepare(`
      UPDATE crawl_batches 
      SET status = 'failed',
          completed_at = datetime('now'),
          duration_ms = ?,
          error_log = ?
      WHERE id = ?
    `).bind(
      Date.now() - startTime,
      (error as Error).message,
      batchId,
    ).run();
  }

  // 스케줄러 상태 업데이트
  await db.prepare(`
    UPDATE crawler_scheduler_status 
    SET running_jobs = 0,
        last_heartbeat = datetime('now')
    WHERE id = 'singleton'
  `).run();
}

// ============================================
// 수동 트리거 처리
// ============================================

/**
 * 대시보드에서 수동으로 트리거한 크롤링을 처리합니다.
 * 기존 crawler_triggers 테이블의 pending 트리거를 가져와서 실행합니다.
 * 
 * 이 함수는 handleScheduled에서 추가로 호출하거나,
 * 별도의 API 엔드포인트에서 호출할 수 있습니다.
 */
export async function handleManualTriggers(env: Env): Promise<void> {
  const db = env.DB;

  // pending 트리거 가져오기
  const triggers = await db.prepare(`
    SELECT id, region, enable_ai 
    FROM crawler_triggers 
    WHERE status = 'pending' 
    ORDER BY requested_at ASC 
    LIMIT 3
  `).all();

  if (!triggers.results || triggers.results.length === 0) return;

  for (const trigger of triggers.results as any[]) {
    // 트리거 수락
    const batchId = `MANUAL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await db.prepare(`
      UPDATE crawler_triggers 
      SET status = 'acknowledged', acknowledged_at = datetime('now'), job_id = ?
      WHERE id = ?
    `).bind(batchId, trigger.id).run();

    // 해당 지역의 병원 가져와서 분석
    // (간소화: 전체 큐에서 pending인 것 10개)
    const hospitals = await db.prepare(`
      SELECT hospital_id, hospital_name, homepage_url
      FROM crawl_queue
      WHERE status IN ('pending')
      ORDER BY priority ASC
      LIMIT 10
    `).all();

    let successCount = 0;
    const startTime = Date.now();

    for (const hospital of (hospitals.results || []) as any[]) {
      const input: PipelineInput = {
        url: hospital.homepage_url,
        hospitalId: hospital.hospital_id,
        hospitalName: hospital.hospital_name,
        enableAI: trigger.enable_ai === 1 && !!env.GEMINI_API_KEY,
        batchId,
        timeout: ANALYSIS_TIMEOUT,
      };

      try {
        const result = await runAnalysisPipeline(input, env.GEMINI_API_KEY);
        await savePipelineResult(db, input, result);
        if (result.success) successCount++;
      } catch (e) {
        console.error(`[ManualTrigger] Error: ${(e as Error).message}`);
      }

      await sleep(DELAY_BETWEEN);
    }

    // 트리거 완료
    await db.prepare(`
      UPDATE crawler_triggers 
      SET status = 'completed', 
          completed_at = datetime('now'),
          result = ?
      WHERE id = ?
    `).bind(
      JSON.stringify({ batchId, total: (hospitals.results || []).length, success: successCount }),
      trigger.id,
    ).run();
  }
}

// ============================================
// 유틸리티
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function completeBatch(
  db: any,
  batchId: string,
  startTime: number,
  total: number,
  success: number,
  fail: number,
  skip: number,
  violations: number,
): Promise<void> {
  await db.prepare(`
    UPDATE crawl_batches 
    SET status = 'completed',
        total_count = ?,
        success_count = ?,
        fail_count = ?,
        skip_count = ?,
        violations_found = ?,
        completed_at = datetime('now'),
        duration_ms = ?
    WHERE id = ?
  `).bind(
    total, success, fail, skip, violations,
    Date.now() - startTime,
    batchId,
  ).run();

  console.log(
    `[Crawler] 배치 완료: ${batchId} ` +
    `(${success}성공/${fail}실패/${skip}스킵, 위반 ${violations}건, ` +
    `${((Date.now() - startTime) / 1000).toFixed(1)}초)`
  );
}
