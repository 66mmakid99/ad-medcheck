/**
 * PatternTuner — 사용자 피드백 기반 패턴 성능 조정
 *
 * Phase 6: Flywheel의 피드백 루프
 * - 오탐 신고 → pattern_performance 업데이트 + confidence_adjustment
 * - 미탐 신고 → pattern_candidates에 등록
 * - 동적 네거티브 리스트 생성
 */

import type { D1Database } from '../db/d1';

export class PatternTuner {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * 오탐 신고 처리
   */
  async reportFalsePositive(
    analysisId: string,
    patternId: string,
    reason?: string,
  ): Promise<{ success: boolean; adjustment: number }> {
    try {
      // 1. analysis_archive 업데이트
      await this.db.prepare(`
        UPDATE analysis_archive SET user_verdict = 'false_positive'
        WHERE analysis_id = ? AND pattern_id = ?
      `).bind(analysisId, patternId).run();

      // 2. pattern_performance 업데이트
      await this.adjustPatternPerformance(patternId, false);

      // 3. 현재 adjustment 값 가져오기
      const perf = await this.db.prepare(
        `SELECT confidence_adjustment FROM flywheel_pattern_performance WHERE pattern_id = ?`
      ).bind(patternId).first();

      const adjustment = (perf?.confidence_adjustment as number) || 0;

      // 4. 네거티브 후보 등록 (같은 패턴으로 3회+ FP면)
      const fpCount = await this.db.prepare(
        `SELECT false_positives FROM flywheel_pattern_performance WHERE pattern_id = ?`
      ).bind(patternId).first();

      if (fpCount && (fpCount.false_positives as number) >= 3) {
        // 오탐이 반복되는 매칭 텍스트를 네거티브 후보로 추가
        const archive = await this.db.prepare(`
          SELECT matched_text, context_text FROM analysis_archive
          WHERE pattern_id = ? AND user_verdict = 'false_positive'
          ORDER BY created_at DESC LIMIT 5
        `).bind(patternId).all();

        if (archive.results && archive.results.length > 0) {
          for (const row of archive.results) {
            await this.upsertNegativeCandidate(
              (row.matched_text as string) || '',
              patternId,
              'false_positive_repeat',
              (row.context_text as string) || '',
            );
          }
        }
      }

      return { success: true, adjustment };
    } catch (e) {
      console.warn(`[PatternTuner] FP report error:`, (e as Error).message);
      return { success: false, adjustment: 0 };
    }
  }

  /**
   * 미탐 신고 처리
   */
  async reportFalseNegative(
    analysisId: string,
    description: string,
    category?: string,
  ): Promise<{ success: boolean; candidateId?: number }> {
    try {
      // 1. analysis_archive에 미탐 기록
      await this.db.prepare(`
        INSERT INTO analysis_archive (
          analysis_id, source, pattern_id, matched_text,
          context_text, severity, user_verdict
        ) VALUES (?, 'user_report', 'UNKNOWN', ?, ?, 'minor', 'false_negative')
      `).bind(analysisId, description, description).run();

      // 2. pattern_candidates에 등록
      const result = await this.db.prepare(`
        INSERT INTO pattern_candidates (
          suggested_pattern, category, severity, source,
          example_texts, avg_confidence
        ) VALUES (?, ?, 'minor', 'user_report', ?, 0.5)
      `).bind(description, category || 'unknown', JSON.stringify([description])).run();

      return { success: true, candidateId: result.meta?.last_row_id as number };
    } catch (e) {
      console.warn(`[PatternTuner] FN report error:`, (e as Error).message);
      return { success: false };
    }
  }

  /**
   * 패턴 성능 자동 조정
   *   FP 3회+ → confidence_adjustment -0.10
   *   FP 5회+ → confidence_adjustment -0.15
   *   TP 연속 10회 → confidence_adjustment +0.05
   */
  async adjustPatternPerformance(patternId: string, isTP: boolean): Promise<void> {
    try {
      const existing = await this.db.prepare(
        `SELECT * FROM flywheel_pattern_performance WHERE pattern_id = ?`
      ).bind(patternId).first();

      if (existing) {
        const tp = (existing.true_positives as number) + (isTP ? 1 : 0);
        const fp = (existing.false_positives as number) + (isTP ? 0 : 1);
        const total = (existing.total_matches as number) + 1;
        const precision = total > 0 ? tp / total : 0;

        // confidence_adjustment 계산
        let adjustment = 0;
        if (fp >= 5) adjustment = -0.15;
        else if (fp >= 3) adjustment = -0.10;
        else if (tp >= 10 && fp === 0) adjustment = 0.05;

        await this.db.prepare(`
          UPDATE flywheel_pattern_performance
          SET total_matches = ?, true_positives = ?, false_positives = ?,
              precision = ?, confidence_adjustment = ?,
              updated_at = datetime('now'),
              ${isTP ? "last_tp_at = datetime('now')" : "last_fp_at = datetime('now')"}
          WHERE pattern_id = ?
        `).bind(total, tp, fp, precision, adjustment, patternId).run();
      } else {
        const adjustment = isTP ? 0 : -0.10;
        await this.db.prepare(`
          INSERT INTO flywheel_pattern_performance (
            pattern_id, total_matches, true_positives, false_positives,
            precision, confidence_adjustment,
            ${isTP ? 'last_tp_at' : 'last_fp_at'}
          ) VALUES (?, 1, ?, ?, ?, ?, datetime('now'))
        `).bind(patternId, isTP ? 1 : 0, isTP ? 0 : 1, isTP ? 1.0 : 0.0, adjustment).run();
      }
    } catch (e) {
      console.warn(`[PatternTuner] perf adjust error:`, (e as Error).message);
    }
  }

  /**
   * 동적 네거티브 리스트 로드
   *   기본 76개 + 승인된 네거티브 후보 + MADMEDSALES 확정 데이터
   */
  async getDynamicNegativeList(hospitalId?: string): Promise<string[]> {
    const dynamicTerms: string[] = [];

    try {
      // 승인된 네거티브 후보
      const approved = await this.db.prepare(`
        SELECT term FROM negative_candidates WHERE status = 'approved'
      `).all();
      for (const row of approved.results || []) {
        dynamicTerms.push(row.term as string);
      }

      // MADMEDSALES 확정 데이터 (특정 병원)
      if (hospitalId) {
        const salesData = await this.db.prepare(`
          SELECT term FROM madmedsales_sync
          WHERE hospital_id = ? AND confirmed = 1
        `).bind(hospitalId).all();
        for (const row of salesData.results || []) {
          dynamicTerms.push(row.term as string);
        }
      }
    } catch (e) {
      console.warn(`[PatternTuner] dynamic negative load error:`, (e as Error).message);
    }

    return dynamicTerms;
  }

  /**
   * 네거티브 후보 등록/업데이트
   */
  private async upsertNegativeCandidate(
    term: string,
    category: string,
    source: string,
    context: string,
  ): Promise<void> {
    try {
      const existing = await this.db.prepare(
        `SELECT id, fp_count, example_contexts FROM negative_candidates WHERE term = ? AND status = 'pending'`
      ).bind(term).first();

      if (existing) {
        const contexts = JSON.parse((existing.example_contexts as string) || '[]');
        contexts.push(context);
        await this.db.prepare(`
          UPDATE negative_candidates
          SET fp_count = fp_count + 1, example_contexts = ?
          WHERE id = ?
        `).bind(JSON.stringify(contexts.slice(-10)), existing.id).run();
      } else {
        await this.db.prepare(`
          INSERT INTO negative_candidates (term, category, source, example_contexts)
          VALUES (?, ?, ?, ?)
        `).bind(term, category, source, JSON.stringify([context])).run();
      }
    } catch (e) {
      console.warn(`[PatternTuner] negative upsert error:`, (e as Error).message);
    }
  }

  /**
   * 패턴 후보 목록 (관리자용)
   */
  async getPatternCandidates(status: string = 'pending', limit: number = 20): Promise<any[]> {
    const result = await this.db.prepare(`
      SELECT * FROM pattern_candidates
      WHERE status = ?
      ORDER BY occurrence_count DESC, created_at DESC
      LIMIT ?
    `).bind(status, limit).all();
    return result.results || [];
  }

  /**
   * 패턴 후보 승인
   */
  async approvePatternCandidate(
    id: number,
    patternId: string,
  ): Promise<void> {
    await this.db.prepare(`
      UPDATE pattern_candidates
      SET status = 'approved', approved_at = datetime('now'),
          approved_pattern_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(patternId, id).run();
  }

  /**
   * 패턴 후보 거부
   */
  async rejectPatternCandidate(id: number): Promise<void> {
    await this.db.prepare(`
      UPDATE pattern_candidates
      SET status = 'rejected', updated_at = datetime('now')
      WHERE id = ?
    `).bind(id).run();
  }

  /**
   * 네거티브 후보 승인
   */
  async approveNegativeCandidate(id: number): Promise<void> {
    await this.db.prepare(`
      UPDATE negative_candidates SET status = 'approved' WHERE id = ?
    `).bind(id).run();
  }

  /**
   * 네거티브 후보 거부
   */
  async rejectNegativeCandidate(id: number): Promise<void> {
    await this.db.prepare(`
      UPDATE negative_candidates SET status = 'rejected' WHERE id = ?
    `).bind(id).run();
  }

  /**
   * 저성능 패턴 목록 (precision < 0.7)
   */
  async getWeakPatterns(threshold: number = 0.7): Promise<any[]> {
    const result = await this.db.prepare(`
      SELECT * FROM flywheel_pattern_performance
      WHERE precision IS NOT NULL AND precision < ? AND total_matches >= 3
      ORDER BY precision ASC
      LIMIT 20
    `).bind(threshold).all();
    return result.results || [];
  }
}
