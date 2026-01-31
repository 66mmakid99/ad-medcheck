/**
 * 자동 학습 기초 모듈
 * 피드백 데이터를 분석하여 예외 규칙, 신뢰도 조정, 매핑 패턴을 자동 학습
 */

import type { D1Database } from '../db/d1';
import type {
  ExceptionCandidate,
  AutoLearningLog,
  LearningType,
  LearningTargetType,
  LearningStatus,
  ContextType,
} from '../types';

// ============================================
// 타입 정의
// ============================================

interface ExceptionGenerationResult {
  candidates: ExceptionCandidate[];
  processed: number;
  generated: number;
}

interface ConfidenceAdjustment {
  patternId: string;
  previousConfidence: number;
  newConfidence: number;
  adjustmentReason: string;
  sourceFeedbackCount: number;
}

interface PatternCandidate {
  suggestedPattern: string;
  patternType: 'regex' | 'keyword';
  sampleTexts: string[];
  sourceCount: number;
  confidence: number;
}

interface MappingRule {
  rawPattern: string;
  normalizedPattern: string;
  mappedProcedureId: string;
  patternType: 'exact' | 'suffix' | 'prefix' | 'contains' | 'synonym';
  confidence: number;
  applicationCount: number;
}

interface LearningSettings {
  exceptionMinOccurrences: number;
  exceptionMinConfidence: number;
  autoApplyConfidence: number;
  learningExpiryDays: number;
}

// ============================================
// 자동 학습 클래스
// ============================================

export class AutoLearner {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  // ============================================
  // 설정 조회
  // ============================================

  async getSettings(): Promise<LearningSettings> {
    const settings = await this.db
      .prepare('SELECT setting_key, setting_value FROM feedback_settings')
      .all();

    const config: Record<string, string> = {};
    for (const row of (settings.results || []) as { setting_key: string; setting_value: string }[]) {
      config[row.setting_key] = row.setting_value;
    }

    return {
      exceptionMinOccurrences: parseInt(config['exception_min_occurrences'] || '5'),
      exceptionMinConfidence: parseFloat(config['exception_min_confidence'] || '0.85'),
      autoApplyConfidence: parseFloat(config['auto_apply_confidence'] || '0.95'),
      learningExpiryDays: parseInt(config['learning_expiry_days'] || '90'),
    };
  }

  // ============================================
  // 예외 규칙 후보 생성
  // ============================================

  /**
   * 오탐 피드백에서 예외 규칙 후보 자동 생성
   */
  async generateExceptionCandidates(patternId?: string): Promise<ExceptionGenerationResult> {
    const result: ExceptionGenerationResult = {
      candidates: [],
      processed: 0,
      generated: 0,
    };

    // 오탐 피드백 조회
    let query = `
      SELECT
        pattern_id,
        context_text,
        context_type,
        hospital_department,
        COUNT(*) as occurrence_count,
        GROUP_CONCAT(DISTINCT id) as feedback_ids
      FROM analysis_feedback_v2
      WHERE feedback_type = 'false_positive'
        AND context_text IS NOT NULL
    `;
    const params: string[] = [];

    if (patternId) {
      query += ' AND pattern_id = ?';
      params.push(patternId);
    }

    query += `
      GROUP BY pattern_id, context_type
      HAVING COUNT(*) >= 3
      ORDER BY occurrence_count DESC
    `;

    const feedbackGroups = await this.db
      .prepare(query)
      .bind(...params)
      .all();

    for (const group of (feedbackGroups.results || []) as any[]) {
      result.processed++;

      // 공통 맥락 추출
      const contextTexts = await this.getContextTextsForPattern(
        group.pattern_id,
        group.context_type
      );

      const commonContext = this.extractCommonContext(contextTexts);

      if (commonContext) {
        const candidate = await this.createOrUpdateExceptionCandidate({
          patternId: group.pattern_id,
          exceptionType: group.context_type ? 'context' : 'keyword',
          exceptionPattern: commonContext,
          contextType: group.context_type,
          feedbackIds: group.feedback_ids.split(','),
          sampleTexts: contextTexts.slice(0, 5),
          occurrenceCount: group.occurrence_count,
        });

        result.candidates.push(candidate);
        result.generated++;
      }
    }

    return result;
  }

  /**
   * 패턴의 오탐 맥락 텍스트 조회
   */
  private async getContextTextsForPattern(
    patternId: string,
    contextType?: string
  ): Promise<string[]> {
    let query = `
      SELECT context_text FROM analysis_feedback_v2
      WHERE pattern_id = ?
        AND feedback_type = 'false_positive'
        AND context_text IS NOT NULL
    `;
    const params: string[] = [patternId];

    if (contextType) {
      query += ' AND context_type = ?';
      params.push(contextType);
    }

    query += ' LIMIT 50';

    const results = await this.db.prepare(query).bind(...params).all();
    return ((results.results || []) as any[]).map((r) => r.context_text);
  }

  /**
   * 공통 맥락/패턴 추출
   */
  extractCommonContext(texts: string[]): string | null {
    if (texts.length < 3) return null;

    // 방법 1: 공통 키워드 추출
    const wordCounts: Record<string, number> = {};
    const stopWords = new Set([
      '의', '를', '을', '이', '가', '은', '는', '에', '에서', '로', '으로',
      '와', '과', '도', '만', '까지', '부터', '처럼', '같이', '보다',
    ]);

    for (const text of texts) {
      const words = text.split(/\s+/).filter((w) => w.length >= 2 && !stopWords.has(w));
      const uniqueWords = new Set(words);

      for (const word of uniqueWords) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    }

    // 70% 이상 등장하는 키워드 추출
    const threshold = texts.length * 0.7;
    const commonWords = Object.entries(wordCounts)
      .filter(([_, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .map(([word, _]) => word);

    if (commonWords.length > 0) {
      return commonWords.slice(0, 3).join(' ');
    }

    // 방법 2: 부정문 패턴 감지
    const negationPatterns = ['아닙니다', '아니다', '없습니다', '없다', '않습니다', '않다'];
    const negationCount = texts.filter((t) =>
      negationPatterns.some((p) => t.includes(p))
    ).length;

    if (negationCount >= threshold) {
      return 'NEGATION_CONTEXT';
    }

    // 방법 3: 인용/면책 패턴 감지
    const disclaimerPatterns = ['※', '*', '주의', '단,', '다만'];
    const disclaimerCount = texts.filter((t) =>
      disclaimerPatterns.some((p) => t.includes(p))
    ).length;

    if (disclaimerCount >= threshold) {
      return 'DISCLAIMER_CONTEXT';
    }

    return null;
  }

  /**
   * 예외 후보 생성 또는 업데이트
   */
  private async createOrUpdateExceptionCandidate(input: {
    patternId: string;
    exceptionType: 'keyword' | 'context' | 'regex' | 'department' | 'composite';
    exceptionPattern: string;
    contextType?: string;
    feedbackIds: string[];
    sampleTexts: string[];
    occurrenceCount: number;
  }): Promise<ExceptionCandidate> {
    const settings = await this.getSettings();

    // 기존 후보 확인
    const existing = await this.db
      .prepare(`
        SELECT * FROM exception_candidates
        WHERE pattern_id = ? AND exception_pattern = ?
      `)
      .bind(input.patternId, input.exceptionPattern)
      .first() as any;

    const confidence = Math.min(
      0.95,
      0.5 + (input.occurrenceCount * 0.05)
    );

    const meetsThreshold = input.occurrenceCount >= settings.exceptionMinOccurrences
      && confidence >= settings.exceptionMinConfidence;

    if (existing) {
      // 기존 후보 업데이트
      const newFeedbackIds = [...new Set([
        ...JSON.parse(existing.source_feedback_ids || '[]'),
        ...input.feedbackIds,
      ])];

      const newSampleTexts = [...new Set([
        ...JSON.parse(existing.sample_texts || '[]'),
        ...input.sampleTexts,
      ])].slice(0, 10);

      const newOccurrence = existing.occurrence_count + input.occurrenceCount;
      const newConfidence = Math.min(0.95, confidence + 0.1);

      await this.db
        .prepare(`
          UPDATE exception_candidates SET
            occurrence_count = ?,
            source_feedback_ids = ?,
            sample_texts = ?,
            confidence = ?,
            meets_threshold = ?,
            status = CASE WHEN ? = 1 AND status = 'collecting' THEN 'pending_review' ELSE status END,
            threshold_met_at = CASE WHEN ? = 1 AND meets_threshold = 0 THEN datetime('now') ELSE threshold_met_at END,
            updated_at = datetime('now')
          WHERE id = ?
        `)
        .bind(
          newOccurrence,
          JSON.stringify(newFeedbackIds),
          JSON.stringify(newSampleTexts),
          newConfidence,
          meetsThreshold ? 1 : 0,
          meetsThreshold ? 1 : 0,
          meetsThreshold ? 1 : 0,
          existing.id
        )
        .run();

      return {
        id: existing.id,
        patternId: input.patternId,
        exceptionType: input.exceptionType,
        exceptionPattern: input.exceptionPattern,
        sourceType: 'auto',
        sourceFeedbackIds: newFeedbackIds,
        sampleTexts: newSampleTexts,
        occurrenceCount: newOccurrence,
        uniqueSources: newFeedbackIds.length,
        confidence: newConfidence,
        meetsThreshold,
        status: meetsThreshold ? 'pending_review' : 'collecting',
        createdAt: existing.created_at,
      };
    }

    // 새 후보 생성
    const candidateId = `EC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await this.db
      .prepare(`
        INSERT INTO exception_candidates
        (id, pattern_id, exception_type, exception_pattern, source_type,
         source_feedback_ids, sample_texts, occurrence_count, unique_sources,
         confidence, meets_threshold, status)
        VALUES (?, ?, ?, ?, 'auto', ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        candidateId,
        input.patternId,
        input.exceptionType,
        input.exceptionPattern,
        JSON.stringify(input.feedbackIds),
        JSON.stringify(input.sampleTexts),
        input.occurrenceCount,
        input.feedbackIds.length,
        confidence,
        meetsThreshold ? 1 : 0,
        meetsThreshold ? 'pending_review' : 'collecting'
      )
      .run();

    // 학습 로그 기록
    await this.logLearning({
      learningType: 'exception_generated',
      targetType: 'exception',
      targetId: candidateId,
      inputData: input,
      outputData: { exceptionPattern: input.exceptionPattern, confidence },
      confidenceScore: confidence,
      sourceFeedbackIds: input.feedbackIds,
    });

    return {
      id: candidateId,
      patternId: input.patternId,
      exceptionType: input.exceptionType,
      exceptionPattern: input.exceptionPattern,
      sourceType: 'auto',
      sourceFeedbackIds: input.feedbackIds,
      sampleTexts: input.sampleTexts,
      occurrenceCount: input.occurrenceCount,
      uniqueSources: input.feedbackIds.length,
      confidence,
      meetsThreshold,
      status: meetsThreshold ? 'pending_review' : 'collecting',
      createdAt: new Date().toISOString(),
    };
  }

  // ============================================
  // 신뢰도 자동 조정
  // ============================================

  /**
   * 패턴 신뢰도 자동 조정
   */
  async adjustPatternConfidence(patternId: string): Promise<ConfidenceAdjustment | null> {
    // 패턴 피드백 통계 조회
    const stats = await this.db
      .prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN feedback_type = 'true_positive' THEN 1 ELSE 0 END) as tp,
          SUM(CASE WHEN feedback_type = 'false_positive' THEN 1 ELSE 0 END) as fp
        FROM analysis_feedback_v2
        WHERE pattern_id = ?
      `)
      .bind(patternId)
      .first() as any;

    if (!stats || stats.total < 10) {
      return null; // 샘플 부족
    }

    const accuracy = stats.tp / (stats.tp + stats.fp);

    // 이전 신뢰도 조회 (patterns 테이블에서)
    const pattern = await this.db
      .prepare('SELECT default_confidence FROM patterns WHERE id = ?')
      .bind(patternId)
      .first() as any;

    const previousConfidence = pattern?.default_confidence || 1.0;

    // 새 신뢰도 계산
    // 가중 평균: 기존 70% + 피드백 기반 30%
    const newConfidence = (previousConfidence * 0.7) + (accuracy * 0.3);

    // 변동폭이 5% 미만이면 조정 안 함
    if (Math.abs(newConfidence - previousConfidence) < 0.05) {
      return null;
    }

    const adjustmentReason = accuracy < 0.8
      ? `정확도 ${(accuracy * 100).toFixed(1)}% 기반 하향 조정`
      : `정확도 ${(accuracy * 100).toFixed(1)}% 기반 조정`;

    // 학습 로그 기록
    const logId = await this.logLearning({
      learningType: 'confidence_adjusted',
      targetType: 'pattern',
      targetId: patternId,
      inputData: { previousConfidence, accuracy, feedbackCount: stats.total },
      outputData: { newConfidence },
      confidenceScore: accuracy,
      sourceFeedbackIds: [],
    });

    return {
      patternId,
      previousConfidence,
      newConfidence,
      adjustmentReason,
      sourceFeedbackCount: stats.total,
    };
  }

  // ============================================
  // 새 패턴 후보 추출 (미탐 분석)
  // ============================================

  /**
   * 미탐 피드백에서 새 패턴 후보 추출
   */
  async extractPatternCandidates(): Promise<PatternCandidate[]> {
    // 미탐 피드백 중 제안된 패턴이 있는 것 조회
    const feedbacks = await this.db
      .prepare(`
        SELECT
          suggested_pattern,
          missed_text,
          COUNT(*) as count,
          GROUP_CONCAT(DISTINCT missed_text) as samples
        FROM analysis_feedback_v2
        WHERE feedback_type = 'false_negative'
          AND (suggested_pattern IS NOT NULL OR missed_text IS NOT NULL)
        GROUP BY COALESCE(suggested_pattern, missed_text)
        HAVING COUNT(*) >= 3
        ORDER BY count DESC
        LIMIT 20
      `)
      .all();

    const candidates: PatternCandidate[] = [];

    for (const row of (feedbacks.results || []) as any[]) {
      const pattern = row.suggested_pattern || this.extractPatternFromText(row.missed_text);

      if (pattern) {
        const confidence = Math.min(0.8, 0.4 + (row.count * 0.1));

        candidates.push({
          suggestedPattern: pattern,
          patternType: pattern.includes('\\') ? 'regex' : 'keyword',
          sampleTexts: row.samples?.split(',').slice(0, 5) || [],
          sourceCount: row.count,
          confidence,
        });

        // 학습 로그 기록
        await this.logLearning({
          learningType: 'pattern_suggested',
          targetType: 'pattern',
          targetId: `NEW-${Date.now()}`,
          inputData: { missedTexts: row.samples },
          outputData: { suggestedPattern: pattern, confidence },
          confidenceScore: confidence,
          sourceFeedbackIds: [],
        });
      }
    }

    return candidates;
  }

  /**
   * 미탐 텍스트에서 패턴 추출
   */
  private extractPatternFromText(text: string): string | null {
    if (!text) return null;

    // 간단한 키워드 추출 (2글자 이상 단어)
    const words = text.match(/[\w가-힣]{2,}/g);
    if (words && words.length > 0) {
      // 가장 긴 단어 반환
      return words.sort((a, b) => b.length - a.length)[0];
    }

    return null;
  }

  // ============================================
  // 매핑 패턴 학습
  // ============================================

  /**
   * 승인된 매핑에서 패턴 학습
   */
  async learnMappingPatterns(): Promise<MappingRule[]> {
    // 최근 승인된 매핑 조회
    const approvals = await this.db
      .prepare(`
        SELECT
          mc.alias_name as raw_name,
          mc.normalized_name,
          pa.procedure_id as mapped_procedure_id,
          pa.alias_name as mapped_alias,
          COUNT(*) OVER (PARTITION BY pa.procedure_id) as approval_count
        FROM mapping_candidates mc
        JOIN procedure_aliases pa ON mc.approved_alias_id = pa.id
        WHERE mc.status = 'approved'
          AND mc.approved_at > datetime('now', '-30 days')
        ORDER BY mc.approved_at DESC
        LIMIT 50
      `)
      .all();

    const rules: MappingRule[] = [];
    const processedPatterns = new Set<string>();

    for (const row of (approvals.results || []) as any[]) {
      const rawName = row.raw_name;
      const normalizedName = row.normalized_name;
      const procedureId = row.mapped_procedure_id;

      // 패턴 유형 판별
      const patternType = this.detectMappingPatternType(rawName, row.mapped_alias);

      if (patternType && !processedPatterns.has(`${patternType}-${normalizedName}`)) {
        processedPatterns.add(`${patternType}-${normalizedName}`);

        const rule: MappingRule = {
          rawPattern: this.generateMappingPattern(rawName, patternType),
          normalizedPattern: normalizedName,
          mappedProcedureId: procedureId,
          patternType,
          confidence: Math.min(0.9, 0.6 + (row.approval_count * 0.05)),
          applicationCount: 0,
        };

        rules.push(rule);

        // 학습 데이터 저장
        const learnId = `MLD-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        await this.db
          .prepare(`
            INSERT INTO mapping_learning_data
            (id, raw_name, normalized_name, mapped_procedure_id, mapped_procedure_name,
             learning_source, pattern_type, learned_pattern, confidence)
            VALUES (?, ?, ?, ?, ?, 'approval', ?, ?, ?)
          `)
          .bind(
            learnId,
            rawName,
            normalizedName,
            procedureId,
            row.mapped_alias,
            patternType,
            rule.rawPattern,
            rule.confidence
          )
          .run();

        // 학습 로그
        await this.logLearning({
          learningType: 'mapping_learned',
          targetType: 'mapping',
          targetId: learnId,
          inputData: { rawName, mappedAlias: row.mapped_alias },
          outputData: rule,
          confidenceScore: rule.confidence,
          sourceFeedbackIds: [],
        });
      }
    }

    return rules;
  }

  /**
   * 매핑 패턴 유형 판별
   */
  private detectMappingPatternType(
    rawName: string,
    mappedName: string
  ): 'exact' | 'suffix' | 'prefix' | 'contains' | 'synonym' | null {
    const raw = rawName.toLowerCase().replace(/\s+/g, '');
    const mapped = mappedName.toLowerCase().replace(/\s+/g, '');

    if (raw === mapped) return 'exact';
    if (raw.startsWith(mapped)) return 'prefix';
    if (raw.endsWith(mapped)) return 'suffix';
    if (raw.includes(mapped) || mapped.includes(raw)) return 'contains';

    // 유사도 체크 (간단한 레벤슈타인)
    const similarity = this.calculateSimilarity(raw, mapped);
    if (similarity > 0.7) return 'synonym';

    return null;
  }

  /**
   * 매핑 패턴 생성
   */
  private generateMappingPattern(rawName: string, patternType: string): string {
    const normalized = rawName.toLowerCase().replace(/\s+/g, '');

    switch (patternType) {
      case 'suffix':
        return `*${normalized.slice(-3)}`;
      case 'prefix':
        return `${normalized.slice(0, 3)}*`;
      case 'contains':
        return `*${normalized}*`;
      default:
        return normalized;
    }
  }

  /**
   * 문자열 유사도 계산 (간단한 방식)
   */
  private calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;

    const matchCount = shorter.split('').filter((char) => longer.includes(char)).length;
    return matchCount / longer.length;
  }

  // ============================================
  // 자동 적용 판단
  // ============================================

  /**
   * 학습 결과 자동 적용 가능 여부 판단
   */
  async shouldAutoApply(logId: string): Promise<{
    eligible: boolean;
    reason: string;
  }> {
    const settings = await this.getSettings();

    const log = await this.db
      .prepare('SELECT * FROM auto_learning_log WHERE id = ?')
      .bind(logId)
      .first() as any;

    if (!log) {
      return { eligible: false, reason: '학습 로그를 찾을 수 없음' };
    }

    // 신뢰도 기준
    if (log.confidence_score < settings.autoApplyConfidence) {
      return {
        eligible: false,
        reason: `신뢰도 ${(log.confidence_score * 100).toFixed(1)}% < ${settings.autoApplyConfidence * 100}%`,
      };
    }

    // 소스 피드백 수 기준
    if (log.source_feedback_count < 10) {
      return {
        eligible: false,
        reason: `피드백 수 ${log.source_feedback_count} < 10`,
      };
    }

    // 학습 유형별 추가 조건
    switch (log.learning_type) {
      case 'exception_generated':
        // 예외 규칙은 신뢰도 95% 이상
        if (log.confidence_score >= 0.95) {
          return { eligible: true, reason: '고신뢰도 예외 규칙' };
        }
        return { eligible: false, reason: '예외 규칙은 검토 필요' };

      case 'confidence_adjusted':
        // 신뢰도 조정은 변동폭 10% 이내만 자동 적용
        const output = JSON.parse(log.output_data || '{}');
        const input = JSON.parse(log.input_data || '{}');
        const change = Math.abs(output.newConfidence - input.previousConfidence);
        if (change <= 0.1) {
          return { eligible: true, reason: '신뢰도 미세 조정' };
        }
        return { eligible: false, reason: '큰 변동은 검토 필요' };

      case 'mapping_learned':
        // 매핑은 5건 이상 일치 시 자동 적용
        if (log.source_feedback_count >= 5) {
          return { eligible: true, reason: '충분한 매핑 사례' };
        }
        return { eligible: false, reason: '매핑 사례 부족' };

      default:
        return { eligible: false, reason: '항상 검토 필요' };
    }
  }

  /**
   * 자동 적용 가능한 학습 결과 조회
   */
  async getAutoApplyEligible(): Promise<AutoLearningLog[]> {
    const results = await this.db
      .prepare(`
        SELECT * FROM auto_learning_log
        WHERE status = 'pending'
          AND auto_apply_eligible = 1
        ORDER BY confidence_score DESC
        LIMIT 50
      `)
      .all();

    return ((results.results || []) as any[]).map((row) => ({
      id: row.id,
      learningType: row.learning_type as LearningType,
      targetType: row.target_type as LearningTargetType,
      targetId: row.target_id,
      inputData: JSON.parse(row.input_data || '{}'),
      outputData: JSON.parse(row.output_data || '{}'),
      confidenceScore: row.confidence_score,
      sourceFeedbackCount: row.source_feedback_count,
      sourceFeedbackIds: JSON.parse(row.source_feedback_ids || '[]'),
      status: row.status as LearningStatus,
      autoApplyEligible: row.auto_apply_eligible === 1,
      autoApplyReason: row.auto_apply_reason,
      createdAt: row.created_at,
    }));
  }

  // ============================================
  // 학습 로그 기록
  // ============================================

  /**
   * 학습 로그 기록
   */
  private async logLearning(input: {
    learningType: LearningType;
    targetType: LearningTargetType;
    targetId: string;
    inputData: unknown;
    outputData: unknown;
    confidenceScore: number;
    sourceFeedbackIds: string[];
  }): Promise<string> {
    const logId = `ALL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const settings = await this.getSettings();

    // 자동 적용 가능 여부 미리 체크
    const autoApplyEligible = input.confidenceScore >= settings.autoApplyConfidence;
    const autoApplyReason = autoApplyEligible
      ? `신뢰도 ${(input.confidenceScore * 100).toFixed(1)}% >= ${settings.autoApplyConfidence * 100}%`
      : null;

    await this.db
      .prepare(`
        INSERT INTO auto_learning_log
        (id, learning_type, target_type, target_id, input_data, output_data,
         confidence_score, source_feedback_count, source_feedback_ids,
         auto_apply_eligible, auto_apply_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        logId,
        input.learningType,
        input.targetType,
        input.targetId,
        JSON.stringify(input.inputData),
        JSON.stringify(input.outputData),
        input.confidenceScore,
        input.sourceFeedbackIds.length,
        JSON.stringify(input.sourceFeedbackIds),
        autoApplyEligible ? 1 : 0,
        autoApplyReason
      )
      .run();

    return logId;
  }

  // ============================================
  // 학습 결과 적용/거부
  // ============================================

  /**
   * 학습 결과 승인 및 적용
   */
  async approveLearning(logId: string, approvedBy?: string): Promise<boolean> {
    await this.db
      .prepare(`
        UPDATE auto_learning_log SET
          status = 'approved',
          applied_at = datetime('now'),
          applied_by = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `)
      .bind(approvedBy || 'system', logId)
      .run();

    return true;
  }

  /**
   * 학습 결과 거부
   */
  async rejectLearning(logId: string, reason: string): Promise<boolean> {
    await this.db
      .prepare(`
        UPDATE auto_learning_log SET
          status = 'rejected',
          rejected_reason = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `)
      .bind(reason, logId)
      .run();

    return true;
  }

  /**
   * 검토 대기 중인 학습 결과 조회
   */
  async getPendingLearning(options: {
    learningType?: LearningType;
    limit?: number;
  } = {}): Promise<AutoLearningLog[]> {
    const { learningType, limit = 50 } = options;

    let query = `
      SELECT * FROM auto_learning_log
      WHERE status = 'pending'
    `;
    const params: (string | number)[] = [];

    if (learningType) {
      query += ' AND learning_type = ?';
      params.push(learningType);
    }

    query += ' ORDER BY confidence_score DESC, created_at ASC LIMIT ?';
    params.push(limit);

    const results = await this.db.prepare(query).bind(...params).all();

    return ((results.results || []) as any[]).map((row) => ({
      id: row.id,
      learningType: row.learning_type as LearningType,
      targetType: row.target_type as LearningTargetType,
      targetId: row.target_id,
      inputData: JSON.parse(row.input_data || '{}'),
      outputData: JSON.parse(row.output_data || '{}'),
      confidenceScore: row.confidence_score,
      sourceFeedbackCount: row.source_feedback_count,
      sourceFeedbackIds: JSON.parse(row.source_feedback_ids || '[]'),
      status: row.status as LearningStatus,
      autoApplyEligible: row.auto_apply_eligible === 1,
      autoApplyReason: row.auto_apply_reason,
      createdAt: row.created_at,
    }));
  }
}

// ============================================
// 팩토리 함수
// ============================================

export function createAutoLearner(db: D1Database): AutoLearner {
  return new AutoLearner(db);
}
