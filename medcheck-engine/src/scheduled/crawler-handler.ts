/**
 * 클라우드 크롤러 (Scheduled Handler)
 *
 * TODO: 향후 madmedscv로 이관 예정.
 *       현재는 Cloudflare Cron에서 직접 fetch로 정적 사이트만 처리.
 *       SPA 사이트는 madmedscv의 Puppeteer 크롤러가 담당.
 *
 * Cloudflare Workers Cron Trigger로 자동 실행됩니다.
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

import { runAnalysisPipeline, savePipelineResult, runGeminiPipeline } from '../services/analysis-pipeline';
import type { PipelineInput, GeminiPipelineResult } from '../services/analysis-pipeline';
import { saveCheckViolationResult } from '../services/supabase-saver';
import { createAutoLearner } from '../services/auto-learner';
import type { Env } from '../types/env';

// ============================================
// 설정
// ============================================

/** 한 번의 Cron 실행에서 분석할 최대 병원 수 */
const BATCH_SIZE = 5;

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

      const targetUrl = normalizeUrl(hospital.homepage_url);
      console.log(`[Crawler] [${i + 1}/${hospitals.length}] ${hospital.hospital_name}: ${targetUrl}`);

      try {
        // ━━━━ Gemini 파이프라인 우선 시도 ━━━━
        let analysisMode = 'pattern_only';
        let gradeStr = '-';
        let cleanScore = 0;
        let violationCount = 0;
        let criticalCount = 0;
        let majorCount = 0;
        let minorCount = 0;
        let violationsArr: unknown[] = [];
        let analysisSuccess = false;

        if (env.GEMINI_API_KEY) {
          try {
            const geminiResult: GeminiPipelineResult = await runGeminiPipeline(
              {
                url: normalizeUrl(hospital.homepage_url),
                hospitalId: String(hospital.hospital_id),
                hospitalName: hospital.hospital_name,
                db: env.DB,
                supabaseUrl: env.SUPABASE_URL,
                supabaseKey: env.SUPABASE_ANON_KEY,
              },
              env.GEMINI_API_KEY,
            );

            if (geminiResult.success && geminiResult.audit) {
              const audit = geminiResult.audit;
              const grade = audit.grade;
              analysisMode = 'gemini';
              gradeStr = grade.grade;
              cleanScore = grade.cleanScore;
              violationCount = audit.finalCount;

              const violations = audit.finalViolations.map((v) => ({
                type: v.category,
                severity: v.adjustedSeverity || v.severity,
                matchedText: v.originalText,
                confidence: v.confidence,
                patternId: v.patternId,
                ai_reasoning: v.reasoning,
                source: v.source || 'gemini',
              }));
              violationsArr = violations;

              for (const v of violations) {
                if (v.severity === 'critical') criticalCount++;
                else if (v.severity === 'major' || v.severity === 'high') majorCount++;
                else minorCount++;
              }

              analysisSuccess = true;
              totalViolations += violationCount;
              console.log(`  → ${gradeStr}등급 (청정 ${cleanScore}점, 위반 ${violationCount}건, gemini)`);
            } else {
              console.warn(`  → Gemini failed: ${geminiResult.error?.code}, falling back`);
            }
          } catch (geminiErr: unknown) {
            console.warn(`  → Gemini exception: ${(geminiErr as Error).message}, falling back`);
          }
        }

        // ━━━━ Fallback: 기존 패턴 매칭 파이프라인 ━━━━
        if (!analysisSuccess) {
          const input: PipelineInput = {
            url: normalizeUrl(hospital.homepage_url),
            hospitalId: hospital.hospital_id,
            hospitalName: hospital.hospital_name,
            enableAI: false,
            batchId,
            timeout: ANALYSIS_TIMEOUT,
          };

          const result = await runAnalysisPipeline(input, undefined);
          await savePipelineResult(db, input, result);

          if (result.success && result.analysis) {
            analysisMode = 'pattern_only';
            gradeStr = result.analysis.grade;
            cleanScore = result.analysis.cleanScore;
            violationCount = result.analysis.violationCount;
            criticalCount = result.analysis.criticalCount;
            majorCount = result.analysis.majorCount;
            minorCount = result.analysis.minorCount;
            violationsArr = result.analysis.violations;
            analysisSuccess = true;
            totalViolations += violationCount;
            console.log(
              `  → ${result.analysis.gradeEmoji} ${gradeStr}등급 ` +
              `(청정 ${cleanScore}점, 위반 ${violationCount}건, pattern)`
            );
          } else if (result.error?.code === 'SPA_SITE') {
            skipCount++;
            console.log(`  → SPA skip: ${hospital.hospital_name}`);
            await db.prepare(`
              UPDATE crawl_queue SET status = 'skipped',
              error_message = 'SPA site', updated_at = datetime('now')
              WHERE hospital_id = ?
            `).bind(hospital.hospital_id).run();
          } else {
            failCount++;
            console.log(`  → 실패: ${result.error?.message}`);
          }
        }

        // ━━━━ Supabase check_violation_results 저장 (best-effort) ━━━━
        if (analysisSuccess && env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
          const processingTimeMs = Date.now() - startTime;
          await saveCheckViolationResult(
            env.SUPABASE_URL, env.SUPABASE_ANON_KEY,
            {
              hospital_id: String(hospital.hospital_id),
              hospital_name: hospital.hospital_name,
              url: normalizeUrl(hospital.homepage_url),
              grade: gradeStr,
              clean_score: cleanScore,
              violation_count: violationCount,
              critical_count: criticalCount,
              major_count: majorCount,
              minor_count: minorCount,
              violations: violationsArr,
              analysis_mode: analysisMode,
              processing_time_ms: processingTimeMs,
            },
          );
        }

        // crawl_queue 상태 업데이트
        if (analysisSuccess) {
          successCount++;
          await db.prepare(`
            UPDATE crawl_queue
            SET status = 'completed',
                last_analyzed_at = datetime('now'),
                next_analyze_after = datetime('now', '+${REANALYZE_INTERVAL_DAYS} days'),
                updated_at = datetime('now')
            WHERE hospital_id = ?
          `).bind(hospital.hospital_id).run();
        }

      } catch (error) {
        failCount++;
        console.error(`  → 예외: ${(error as Error).message}`);

        await db.prepare(`
          UPDATE crawl_queue
          SET status = 'pending',
              retry_count = retry_count + 1,
              error_message = ?,
              updated_at = datetime('now')
          WHERE hospital_id = ?
        `).bind((error as Error).message, hospital.hospital_id).run();
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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 4: Flywheel 자동 학습 적용 (Phase 2)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  try {
    const learner = createAutoLearner(db);

    // 4-1: 예외 후보 생성 (false_positive 피드백 기반)
    const exceptions = await learner.generateExceptionCandidates();
    if (exceptions.generated > 0) {
      console.log(`[Flywheel] 예외 후보 ${exceptions.generated}건 생성`);
    }

    // 4-2: 패턴 신뢰도 일괄 조정
    const confidence = await learner.adjustAllPatternConfidence();
    if (confidence.adjusted > 0) {
      console.log(`[Flywheel] 신뢰도 조정 ${confidence.adjusted}건`);
    }

    // 4-3: 자동 적용 가능한 학습 결과 일괄 적용
    const autoResult = await learner.autoApplyEligible();
    if (autoResult.applied > 0) {
      console.log(`[Flywheel] 자동 적용 ${autoResult.applied}/${autoResult.total}건 (스킵 ${autoResult.skipped}건)`);
    }
  } catch (flywheelError) {
    console.error(`[Flywheel] 자동 학습 실패 (non-blocking): ${(flywheelError as Error).message}`);
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
      LIMIT ${BATCH_SIZE}
    `).all();

    let successCount = 0;
    const startTime = Date.now();

    for (const hospital of (hospitals.results || []) as any[]) {
      try {
        let analysisSuccess = false;
        let analysisMode = 'pattern_only';
        let gradeStr = '-';
        let cleanScore = 0;
        let violationCount = 0;
        let violationsArr: unknown[] = [];
        let criticalCount = 0;
        let majorCount = 0;
        let minorCount = 0;

        // Gemini 우선
        if (trigger.enable_ai === 1 && env.GEMINI_API_KEY) {
          try {
            const geminiResult: GeminiPipelineResult = await runGeminiPipeline(
              {
                url: normalizeUrl(hospital.homepage_url),
                hospitalId: String(hospital.hospital_id),
                hospitalName: hospital.hospital_name,
                db: env.DB,
                supabaseUrl: env.SUPABASE_URL,
                supabaseKey: env.SUPABASE_ANON_KEY,
              },
              env.GEMINI_API_KEY,
            );

            if (geminiResult.success && geminiResult.audit) {
              const audit = geminiResult.audit;
              analysisMode = 'gemini';
              gradeStr = audit.grade.grade;
              cleanScore = audit.grade.cleanScore;
              violationCount = audit.finalCount;
              violationsArr = audit.finalViolations.map((v) => ({
                type: v.category,
                severity: v.adjustedSeverity || v.severity,
                matchedText: v.originalText,
                confidence: v.confidence,
                patternId: v.patternId,
                ai_reasoning: v.reasoning,
                source: v.source || 'gemini',
              }));
              for (const v of violationsArr as any[]) {
                if (v.severity === 'critical') criticalCount++;
                else if (v.severity === 'major' || v.severity === 'high') majorCount++;
                else minorCount++;
              }
              analysisSuccess = true;
            }
          } catch (geminiErr: unknown) {
            console.warn(`[ManualTrigger] Gemini error: ${(geminiErr as Error).message}`);
          }
        }

        // Fallback
        if (!analysisSuccess) {
          const input: PipelineInput = {
            url: normalizeUrl(hospital.homepage_url),
            hospitalId: hospital.hospital_id,
            hospitalName: hospital.hospital_name,
            enableAI: false,
            batchId,
            timeout: ANALYSIS_TIMEOUT,
          };
          const result = await runAnalysisPipeline(input, undefined);
          await savePipelineResult(db, input, result);
          if (result.success && result.analysis) {
            analysisMode = 'pattern_only';
            gradeStr = result.analysis.grade;
            cleanScore = result.analysis.cleanScore;
            violationCount = result.analysis.violationCount;
            criticalCount = result.analysis.criticalCount;
            majorCount = result.analysis.majorCount;
            minorCount = result.analysis.minorCount;
            violationsArr = result.analysis.violations;
            analysisSuccess = true;
          }
        }

        if (analysisSuccess) {
          successCount++;
          // Supabase 저장
          if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
            await saveCheckViolationResult(
              env.SUPABASE_URL, env.SUPABASE_ANON_KEY,
              {
                hospital_id: String(hospital.hospital_id),
                hospital_name: hospital.hospital_name,
                url: normalizeUrl(hospital.homepage_url),
                grade: gradeStr,
                clean_score: cleanScore,
                violation_count: violationCount,
                critical_count: criticalCount,
                major_count: majorCount,
                minor_count: minorCount,
                violations: violationsArr,
                analysis_mode: analysisMode,
                processing_time_ms: Date.now() - startTime,
              },
            );
          }
        }
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

/** URL 정규화: 프로토콜 없으면 추가, http→https 시도 */
function normalizeUrl(raw: string): string {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  return url;
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
