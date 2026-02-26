/**
 * FlywheelCollector — 분석 결과 자동 수집 + 패턴 후보 등록
 *
 * Phase 6: 분석 실행 시 자동으로:
 * 1. 모든 위반을 analysis_archive에 저장
 * 2. Gemini 신규 발견 패턴 → pattern_candidates에 등록
 * 3. Gemini↔규칙엔진 교차 통계 업데이트
 */

import type { AuditResult, AuditedViolation, GeminiViolationOutput, GrayZone } from '../types/violation-types';
import type { D1Database } from '../db/d1';

export class FlywheelCollector {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * 분석 결과 수집 (파이프라인 완료 후 호출)
   */
  async collect(
    geminiResult: GeminiViolationOutput,
    auditResult: AuditResult,
    input: { hospitalId?: string; hospitalName?: string; url?: string },
  ): Promise<{ archived: number; candidatesAdded: number }> {
    let archived = 0;
    let candidatesAdded = 0;

    try {
      // 1. 모든 최종 위반을 아카이브에 저장
      for (const v of auditResult.finalViolations) {
        await this.archiveViolation(v, auditResult.id, input);
        archived++;
      }

      // 2. Gemini가 잡았는데 규칙엔진에 없는 것 → 신규 패턴 후보
      //    auditIssue type='FABRICATED_PATTERN_ID'는 제거된 것
      //    Gemini가 잡은 건 중 규칙엔진에 없는 패턴은 새 패턴 후보
      for (const v of geminiResult.violations) {
        const isInFinal = auditResult.finalViolations.some(
          f => f.patternId === v.patternId && f.originalText === v.originalText,
        );
        // Gemini가 잡았고 최종 결과에도 있지만, source가 gemini인 것 중
        // 규칙엔진 보충이 아닌 것 = Gemini 고유 탐지
        if (isInFinal) {
          const finalV = auditResult.finalViolations.find(
            f => f.patternId === v.patternId && f.originalText === v.originalText,
          );
          if (finalV && finalV.source === 'gemini') {
            // 규칙엔진이 놓친 것 = Gemini 고유 탐지
            // 이미 패턴에 있는 경우는 스킵
            const ruleEngineMatch = auditResult.auditIssues.some(
              i => i.type === 'GEMINI_MISSED' && i.detail?.includes(v.patternId),
            );
            if (!ruleEngineMatch) {
              // 이 위반은 Gemini만 잡은 것 → 패턴 후보는 아님 (이미 패턴에 있음)
              // 하지만 규칙엔진의 regex가 놓친 경우이므로 성능 데이터로 기록
              await this.updatePatternPerformance(v.patternId, true);
            }
          }
        }
      }

      // 3. Gemini가 만든 위반 중 날조로 제거된 것의 패턴 → 신규 패턴 후보로 등록
      //    (Gemini가 생각해낸 새 패턴인 경우)
      for (const issue of auditResult.auditIssues) {
        if (issue.type === 'FABRICATED_PATTERN_ID' && issue.originalViolation) {
          const ov = issue.originalViolation;
          await this.upsertPatternCandidate({
            suggestedPattern: ov.originalText || '',
            category: ov.category || 'unknown',
            severity: ov.severity,
            source: 'gemini_new',
            exampleText: ov.originalText || '',
            hospitalId: input.hospitalId,
            hospitalName: input.hospitalName,
            confidence: ov.confidence,
            reasoning: ov.reasoning || '',
          });
          candidatesAdded++;
        }
      }

      // 4. 교차 통계 업데이트
      await this.updateCrossCheckStats(auditResult);
    } catch (error) {
      console.warn('[FlywheelCollector] collect error:', (error as Error).message);
    }

    return { archived, candidatesAdded };
  }

  /**
   * 위반 아카이브 저장
   */
  private async archiveViolation(
    v: AuditedViolation,
    analysisId: string,
    input: { hospitalId?: string; hospitalName?: string },
  ): Promise<void> {
    try {
      await this.db.prepare(`
        INSERT INTO analysis_archive (
          hospital_id, hospital_name, analysis_id, source,
          pattern_id, matched_text, context_text, section_type,
          severity, confidence, from_image,
          gemini_found, rule_found
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        input.hospitalId || null,
        input.hospitalName || null,
        analysisId,
        v.source || 'gemini',
        v.patternId,
        v.originalText || '',
        v.context || '',
        v.sectionType || 'default',
        v.adjustedSeverity || v.severity,
        v.confidence,
        v.fromImage ? 1 : 0,
        v.source === 'gemini' ? 1 : 0,
        v.source === 'rule_engine_supplement' ? 1 : 0,
      ).run();
    } catch (e) {
      console.warn(`[FlywheelCollector] archive error: ${(e as Error).message}`);
    }
  }

  /**
   * 신규 패턴 후보 등록 (동일 패턴이면 occurrence_count 증가)
   */
  private async upsertPatternCandidate(data: {
    suggestedPattern: string;
    category: string;
    severity: string;
    source: string;
    exampleText: string;
    hospitalId?: string;
    hospitalName?: string;
    confidence: number;
    reasoning: string;
  }): Promise<void> {
    try {
      // 동일 카테고리+유사 텍스트 후보가 있으면 업데이트
      const existing = await this.db.prepare(`
        SELECT id, occurrence_count, example_texts, example_hospitals, avg_confidence
        FROM pattern_candidates
        WHERE category = ? AND status = 'pending'
        ORDER BY occurrence_count DESC LIMIT 1
      `).bind(data.category).first();

      if (existing) {
        const texts = JSON.parse((existing.example_texts as string) || '[]');
        texts.push(data.exampleText);
        const hospitals = JSON.parse((existing.example_hospitals as string) || '[]');
        if (data.hospitalName) hospitals.push(data.hospitalName);
        const newCount = (existing.occurrence_count as number) + 1;
        const avgConf = (((existing.avg_confidence as number) || 0) * (newCount - 1) + data.confidence) / newCount;

        await this.db.prepare(`
          UPDATE pattern_candidates
          SET occurrence_count = ?, example_texts = ?, example_hospitals = ?,
              avg_confidence = ?, updated_at = datetime('now')
          WHERE id = ?
        `).bind(
          newCount, JSON.stringify(texts.slice(-10)), JSON.stringify(hospitals.slice(-10)),
          avgConf, existing.id,
        ).run();
      } else {
        await this.db.prepare(`
          INSERT INTO pattern_candidates (
            suggested_pattern, category, severity, source,
            example_texts, example_hospitals, avg_confidence
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          data.suggestedPattern,
          data.category,
          data.severity,
          data.source,
          JSON.stringify([data.exampleText]),
          JSON.stringify(data.hospitalName ? [data.hospitalName] : []),
          data.confidence,
        ).run();
      }
    } catch (e) {
      console.warn(`[FlywheelCollector] candidate upsert error: ${(e as Error).message}`);
    }
  }

  /**
   * 패턴 성능 업데이트
   */
  private async updatePatternPerformance(
    patternId: string,
    isTP: boolean,
  ): Promise<void> {
    try {
      const existing = await this.db.prepare(
        `SELECT * FROM flywheel_pattern_performance WHERE pattern_id = ?`
      ).bind(patternId).first();

      if (existing) {
        const tp = (existing.true_positives as number) + (isTP ? 1 : 0);
        const fp = (existing.false_positives as number) + (isTP ? 0 : 1);
        const total = (existing.total_matches as number) + 1;
        const precision = total > 0 ? tp / total : 0;

        await this.db.prepare(`
          UPDATE flywheel_pattern_performance
          SET total_matches = ?, true_positives = ?, false_positives = ?,
              precision = ?, updated_at = datetime('now'),
              ${isTP ? "last_tp_at = datetime('now')" : "last_fp_at = datetime('now')"}
          WHERE pattern_id = ?
        `).bind(total, tp, fp, precision, patternId).run();
      } else {
        await this.db.prepare(`
          INSERT INTO flywheel_pattern_performance (
            pattern_id, total_matches, true_positives, false_positives, precision,
            ${isTP ? 'last_tp_at' : 'last_fp_at'}
          ) VALUES (?, 1, ?, ?, ?, datetime('now'))
        `).bind(patternId, isTP ? 1 : 0, isTP ? 0 : 1, isTP ? 1.0 : 0.0).run();
      }
    } catch (e) {
      console.warn(`[FlywheelCollector] perf update error: ${(e as Error).message}`);
    }
  }

  /**
   * 교차 통계 업데이트 (Gemini↔규칙엔진 일치율)
   */
  private async updateCrossCheckStats(auditResult: AuditResult): Promise<void> {
    // 간단한 통계: gemini_only, rule_only, both 카운트
    const geminiOnly = auditResult.finalViolations.filter(v => v.source === 'gemini').length;
    const ruleOnly = auditResult.finalViolations.filter(v => v.source === 'rule_engine_supplement').length;
    const total = auditResult.finalViolations.length;

    console.log(`[FlywheelCollector] CrossCheck: gemini=${geminiOnly}, rule=${ruleOnly}, total=${total}`);
  }
}
