/**
 * GrayZoneCollector — Gray Zone 사례 자동 수집 + 관리
 *
 * Phase 7: MADMEDCHECK의 핵심 해자(moat)
 * - Gemini가 발견한 gray_zones를 DB에 자동 저장
 * - 동일 유형 사례 발견 시 occurrence_count 증가
 * - 관리자 판정 후 승인된 사례를 Gemini 프롬프트에 few-shot 주입
 */

import type { GrayZone } from '../types/violation-types';
import type { D1Database } from '../db/d1';

export interface GrayZoneCase {
  id: number;
  hospital_id: string;
  hospital_name: string;
  source_url: string;
  analysis_id: string;
  evasion_type: string;
  evasion_category: string;
  evasion_description: string;
  target_law: string;
  target_violation: string;
  why_gray: string;
  evidence_text: string;
  gemini_confidence: number;
  admin_verdict: string;
  admin_reasoning: string;
  added_to_prompt: number;
  occurrence_count: number;
  trend_quarter: string;
}

export class GrayZoneCollector {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * 분석 결과에서 Gray Zone 사례 수집
   */
  async collectFromAnalysis(
    grayZones: GrayZone[],
    analysisId: string,
    hospitalId: string,
    hospitalName: string,
    sourceUrl: string,
  ): Promise<{ newCases: number; updatedCases: number }> {
    let newCases = 0;
    let updatedCases = 0;

    const quarter = this.getCurrentQuarter();

    for (const gz of grayZones) {
      try {
        const evasionType = gz.evasion_type || 'other';
        const evasionCategory = this.categorizeEvasion(evasionType);

        // 기존 동일 유형 사례 찾기
        const existing = await this.findSimilarCase(evasionType, gz.legal_target || '');

        if (existing) {
          // 기존 사례 발견 횟수 증가 + 새 증거 추가
          await this.updateExistingCase(
            existing.id as number,
            gz,
            hospitalId,
            sourceUrl,
            quarter,
          );
          updatedCases++;
        } else {
          // 신규 사례 등록
          await this.insertNewCase(
            gz,
            analysisId,
            hospitalId,
            hospitalName,
            sourceUrl,
            evasionType,
            evasionCategory,
            quarter,
          );
          newCases++;
        }
      } catch (e) {
        console.warn(`[GrayZoneCollector] collect error: ${(e as Error).message}`);
      }
    }

    return { newCases, updatedCases };
  }

  /**
   * 동일 유형 판단: evasion_type + target_law가 같으면 유사 사례
   */
  private async findSimilarCase(evasionType: string, targetLaw: string): Promise<any | null> {
    return await this.db.prepare(`
      SELECT * FROM gray_zone_cases
      WHERE evasion_type = ? AND target_law = ? AND admin_verdict != 'legal'
      ORDER BY occurrence_count DESC LIMIT 1
    `).bind(evasionType, targetLaw).first();
  }

  /**
   * 기존 사례 업데이트 (발견 횟수 증가)
   */
  private async updateExistingCase(
    id: number,
    gz: GrayZone,
    hospitalId: string,
    sourceUrl: string,
    quarter: string,
  ): Promise<void> {
    await this.db.prepare(`
      UPDATE gray_zone_cases
      SET occurrence_count = occurrence_count + 1,
          last_seen_at = datetime('now'),
          trend_quarter = ?
      WHERE id = ?
    `).bind(quarter, id).run();
  }

  /**
   * 신규 사례 등록
   */
  private async insertNewCase(
    gz: GrayZone,
    analysisId: string,
    hospitalId: string,
    hospitalName: string,
    sourceUrl: string,
    evasionType: string,
    evasionCategory: string,
    quarter: string,
  ): Promise<void> {
    await this.db.prepare(`
      INSERT INTO gray_zone_cases (
        hospital_id, hospital_name, source_url, analysis_id,
        evasion_type, evasion_category, evasion_description,
        target_law, target_violation, why_gray,
        evidence_text, gemini_confidence,
        trend_quarter, first_seen_quarter, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      hospitalId,
      hospitalName,
      sourceUrl,
      analysisId,
      evasionType,
      evasionCategory,
      gz.description || '',
      gz.legal_target || '',
      gz.evasion_type || '',
      gz.why_gray || '',
      gz.evidence || '',
      gz.confidence || 0.5,
      quarter,
      quarter,
    ).run();
  }

  /**
   * 프롬프트용 few-shot 예시 로드 (승인된 사례만)
   */
  async getApprovedExamples(limit: number = 20): Promise<GrayZoneCase[]> {
    const result = await this.db.prepare(`
      SELECT * FROM gray_zone_cases
      WHERE added_to_prompt = 1 AND admin_verdict IN ('violation', 'borderline')
      ORDER BY occurrence_count DESC
      LIMIT ?
    `).bind(limit).all();
    return (result.results || []) as unknown as GrayZoneCase[];
  }

  /**
   * 관리자: Gray Zone 사례 목록
   */
  async list(
    status: string = 'pending',
    limit: number = 20,
  ): Promise<GrayZoneCase[]> {
    const result = await this.db.prepare(`
      SELECT * FROM gray_zone_cases
      WHERE admin_verdict = ?
      ORDER BY occurrence_count DESC, discovered_at DESC
      LIMIT ?
    `).bind(status, limit).all();
    return (result.results || []) as unknown as GrayZoneCase[];
  }

  /**
   * 관리자: 판정 처리
   */
  async verdict(
    id: number,
    verdict: 'violation' | 'borderline' | 'legal',
    reasoning: string,
    addToPrompt: boolean,
  ): Promise<void> {
    await this.db.prepare(`
      UPDATE gray_zone_cases
      SET admin_verdict = ?,
          admin_reasoning = ?,
          admin_decided_at = datetime('now'),
          added_to_prompt = ?
      WHERE id = ?
    `).bind(verdict, reasoning, addToPrompt ? 1 : 0, id).run();
  }

  /**
   * 트렌드 통계
   */
  async getTrends(): Promise<{
    byCategory: Record<string, number>;
    byQuarter: Record<string, number>;
    total: number;
    pending: number;
  }> {
    const byCategory: Record<string, number> = {};
    const byQuarter: Record<string, number> = {};

    const catResult = await this.db.prepare(`
      SELECT evasion_category, SUM(occurrence_count) as cnt
      FROM gray_zone_cases
      GROUP BY evasion_category
    `).all();
    for (const row of catResult.results || []) {
      byCategory[row.evasion_category as string] = row.cnt as number;
    }

    const quarterResult = await this.db.prepare(`
      SELECT trend_quarter, COUNT(*) as cnt
      FROM gray_zone_cases
      GROUP BY trend_quarter
      ORDER BY trend_quarter DESC
      LIMIT 8
    `).all();
    for (const row of quarterResult.results || []) {
      byQuarter[row.trend_quarter as string] = row.cnt as number;
    }

    const total = await this.db.prepare(
      `SELECT COUNT(*) as cnt FROM gray_zone_cases`
    ).first();

    const pending = await this.db.prepare(
      `SELECT COUNT(*) as cnt FROM gray_zone_cases WHERE admin_verdict = 'pending'`
    ).first();

    return {
      byCategory,
      byQuarter,
      total: (total?.cnt as number) || 0,
      pending: (pending?.cnt as number) || 0,
    };
  }

  // ============================================
  // 유틸리티
  // ============================================

  private categorizeEvasion(evasionType: string): string {
    if (evasionType.startsWith('structure_')) return 'structural';
    if (evasionType.startsWith('wording_')) return 'wording';
    if (evasionType.startsWith('visual_')) return 'visual';
    if (evasionType.startsWith('platform_')) return 'platform';
    return 'other';
  }

  private getCurrentQuarter(): string {
    const now = new Date();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    return `${now.getFullYear()}-Q${quarter}`;
  }
}
