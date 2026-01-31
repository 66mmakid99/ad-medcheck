/**
 * 성능 추적 서비스
 * 패턴별/맥락별/진료과목별 성능을 추적하고 집계
 */

import type { D1Database } from '../db/d1';
import type {
  PatternPerformance,
  ContextPerformance,
  DepartmentPerformance,
  PerformanceReport,
  ContextType,
} from '../types';

// ============================================
// 타입 정의
// ============================================

interface FlaggedPattern {
  patternId: string;
  patternName?: string;
  accuracy: number;
  totalMatches: number;
  falsePositives: number;
  flagReason: string;
}

interface PerformanceSettings {
  accuracyThreshold: number;
  contextModifierMinSamples: number;
  performanceAggregationDays: number;
  flagReviewPeriodDays: number;
}

interface AggregationResult {
  patternsProcessed: number;
  patternsUpdated: number;
  patternsFlagged: number;
  errors: string[];
}

// ============================================
// 성능 추적 클래스
// ============================================

export class PerformanceTracker {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  // ============================================
  // 설정 조회
  // ============================================

  /**
   * 성능 추적 설정 조회
   */
  async getSettings(): Promise<PerformanceSettings> {
    const settings = await this.db
      .prepare('SELECT setting_key, setting_value FROM feedback_settings')
      .all();

    const config: Record<string, string> = {};
    for (const row of (settings.results || []) as { setting_key: string; setting_value: string }[]) {
      config[row.setting_key] = row.setting_value;
    }

    return {
      accuracyThreshold: parseFloat(config['accuracy_threshold'] || '0.8'),
      contextModifierMinSamples: parseInt(config['context_modifier_min_samples'] || '10'),
      performanceAggregationDays: parseInt(config['performance_aggregation_days'] || '30'),
      flagReviewPeriodDays: parseInt(config['flag_review_period_days'] || '7'),
    };
  }

  // ============================================
  // 패턴 성능 집계
  // ============================================

  /**
   * 모든 패턴의 성능 집계 (배치 작업)
   */
  async aggregatePatternPerformance(periodDays: number = 30): Promise<AggregationResult> {
    const result: AggregationResult = {
      patternsProcessed: 0,
      patternsUpdated: 0,
      patternsFlagged: 0,
      errors: [],
    };

    const settings = await this.getSettings();
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - periodDays);
    const periodEnd = new Date();

    try {
      // 피드백에서 패턴별 통계 집계
      const stats = await this.db
        .prepare(`
          SELECT
            pattern_id,
            COUNT(*) as total,
            SUM(CASE WHEN feedback_type = 'true_positive' THEN 1 ELSE 0 END) as tp,
            SUM(CASE WHEN feedback_type = 'false_positive' THEN 1 ELSE 0 END) as fp,
            SUM(CASE WHEN feedback_type = 'false_negative' THEN 1 ELSE 0 END) as fn
          FROM analysis_feedback_v2
          WHERE pattern_id IS NOT NULL
            AND created_at >= ?
          GROUP BY pattern_id
        `)
        .bind(periodStart.toISOString())
        .all();

      for (const row of (stats.results || []) as any[]) {
        result.patternsProcessed++;

        const patternId = row.pattern_id;
        const tp = row.tp || 0;
        const fp = row.fp || 0;
        const fn = row.fn || 0;
        const total = tp + fp;

        // 정확도 계산
        const accuracy = total > 0 ? tp / total : null;
        const precision = total > 0 ? tp / total : null;
        const recall = (tp + fn) > 0 ? tp / (tp + fn) : null;
        const f1 = precision && recall && (precision + recall) > 0
          ? 2 * (precision * recall) / (precision + recall)
          : null;

        // 플래그 여부 결정
        const isFlagged = accuracy !== null && accuracy < settings.accuracyThreshold;
        const flagReason = isFlagged ? `정확도 ${(accuracy! * 100).toFixed(1)}% < ${settings.accuracyThreshold * 100}%` : null;

        if (isFlagged) {
          result.patternsFlagged++;
        }

        // 성능 데이터 저장/업데이트
        const perfId = `PP-${patternId}-all_time`;
        await this.db
          .prepare(`
            INSERT INTO pattern_performance
            (id, pattern_id, period_type, period_start, period_end,
             total_matches, true_positives, false_positives, false_negatives,
             accuracy, precision_score, recall_score, f1_score,
             is_flagged, flag_reason, last_calculated)
            VALUES (?, ?, 'all_time', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(pattern_id, period_type, period_start) DO UPDATE SET
              total_matches = excluded.total_matches,
              true_positives = excluded.true_positives,
              false_positives = excluded.false_positives,
              false_negatives = excluded.false_negatives,
              accuracy = excluded.accuracy,
              precision_score = excluded.precision_score,
              recall_score = excluded.recall_score,
              f1_score = excluded.f1_score,
              is_flagged = excluded.is_flagged,
              flag_reason = excluded.flag_reason,
              last_calculated = datetime('now')
          `)
          .bind(
            perfId,
            patternId,
            periodStart.toISOString(),
            periodEnd.toISOString(),
            total,
            tp,
            fp,
            fn,
            accuracy,
            precision,
            recall,
            f1,
            isFlagged ? 1 : 0,
            flagReason
          )
          .run();

        result.patternsUpdated++;
      }
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * 특정 패턴의 성능 조회
   */
  async getPatternPerformance(patternId: string): Promise<PatternPerformance | null> {
    const result = await this.db
      .prepare(`
        SELECT * FROM pattern_performance
        WHERE pattern_id = ? AND period_type = 'all_time'
        ORDER BY last_calculated DESC LIMIT 1
      `)
      .bind(patternId)
      .first();

    if (!result) return null;

    const row = result as any;
    return {
      patternId: row.pattern_id,
      periodType: row.period_type,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      totalMatches: row.total_matches,
      truePositives: row.true_positives,
      falsePositives: row.false_positives,
      falseNegatives: row.false_negatives,
      accuracy: row.accuracy,
      precision: row.precision_score,
      recall: row.recall_score,
      f1Score: row.f1_score,
      isFlagged: row.is_flagged === 1,
      flagReason: row.flag_reason,
    };
  }

  /**
   * 모든 패턴 성능 목록 조회
   */
  async getAllPatternPerformance(options: {
    flaggedOnly?: boolean;
    limit?: number;
    orderBy?: 'accuracy' | 'total_matches';
    orderDir?: 'asc' | 'desc';
  } = {}): Promise<PatternPerformance[]> {
    const { flaggedOnly = false, limit = 100, orderBy = 'accuracy', orderDir = 'asc' } = options;

    let query = `
      SELECT * FROM pattern_performance
      WHERE period_type = 'all_time'
    `;

    if (flaggedOnly) {
      query += ' AND is_flagged = 1';
    }

    query += ` ORDER BY ${orderBy} ${orderDir.toUpperCase()} LIMIT ?`;

    const results = await this.db.prepare(query).bind(limit).all();

    return ((results.results || []) as any[]).map((row) => ({
      patternId: row.pattern_id,
      periodType: row.period_type,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      totalMatches: row.total_matches,
      truePositives: row.true_positives,
      falsePositives: row.false_positives,
      falseNegatives: row.false_negatives,
      accuracy: row.accuracy,
      precision: row.precision_score,
      recall: row.recall_score,
      f1Score: row.f1_score,
      isFlagged: row.is_flagged === 1,
      flagReason: row.flag_reason,
    }));
  }

  // ============================================
  // 맥락별 성능 분석
  // ============================================

  /**
   * 패턴의 맥락별 성능 분석
   */
  async analyzeContextPerformance(patternId: string): Promise<ContextPerformance[]> {
    const settings = await this.getSettings();

    // 맥락별 피드백 집계
    const stats = await this.db
      .prepare(`
        SELECT
          context_type,
          COUNT(*) as total,
          SUM(CASE WHEN feedback_type = 'true_positive' THEN 1 ELSE 0 END) as tp,
          SUM(CASE WHEN feedback_type = 'false_positive' THEN 1 ELSE 0 END) as fp,
          GROUP_CONCAT(DISTINCT SUBSTR(context_text, 1, 100)) as samples
        FROM analysis_feedback_v2
        WHERE pattern_id = ?
          AND context_type IS NOT NULL
        GROUP BY context_type
      `)
      .bind(patternId)
      .all();

    const results: ContextPerformance[] = [];

    for (const row of (stats.results || []) as any[]) {
      const tp = row.tp || 0;
      const fp = row.fp || 0;
      const total = tp + fp;
      const accuracy = total > 0 ? tp / total : 1.0;

      // 신뢰도 배수 계산 (샘플 수가 충분할 때만)
      let confidenceModifier = 1.0;
      if (total >= settings.contextModifierMinSamples) {
        confidenceModifier = accuracy;
      }

      const contextPerf: ContextPerformance = {
        patternId,
        contextType: row.context_type as ContextType,
        totalMatches: total,
        truePositives: tp,
        falsePositives: fp,
        accuracy,
        confidenceModifier,
        sampleTexts: row.samples ? row.samples.split(',').slice(0, 5) : [],
      };

      // DB에 저장
      const perfId = `CP-${patternId}-${row.context_type}`;
      await this.db
        .prepare(`
          INSERT INTO context_performance
          (id, pattern_id, context_type, total_matches, true_positives, false_positives,
           accuracy, confidence_modifier, sample_texts, last_calculated)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(pattern_id, context_type) DO UPDATE SET
            total_matches = excluded.total_matches,
            true_positives = excluded.true_positives,
            false_positives = excluded.false_positives,
            accuracy = excluded.accuracy,
            confidence_modifier = excluded.confidence_modifier,
            sample_texts = excluded.sample_texts,
            last_calculated = datetime('now'),
            updated_at = datetime('now')
        `)
        .bind(
          perfId,
          patternId,
          row.context_type,
          total,
          tp,
          fp,
          accuracy,
          confidenceModifier,
          JSON.stringify(contextPerf.sampleTexts)
        )
        .run();

      results.push(contextPerf);
    }

    return results;
  }

  /**
   * 맥락별 신뢰도 배수 조회
   */
  async getContextModifier(patternId: string, contextType: ContextType): Promise<number> {
    const result = await this.db
      .prepare(`
        SELECT confidence_modifier FROM context_performance
        WHERE pattern_id = ? AND context_type = ?
      `)
      .bind(patternId, contextType)
      .first();

    return (result as any)?.confidence_modifier || 1.0;
  }

  // ============================================
  // 진료과목별 성능 분석
  // ============================================

  /**
   * 패턴의 진료과목별 성능 분석
   */
  async analyzeDepartmentPerformance(patternId: string): Promise<DepartmentPerformance[]> {
    // 진료과목별 피드백 집계
    const stats = await this.db
      .prepare(`
        SELECT
          hospital_department as dept_code,
          COUNT(*) as total,
          SUM(CASE WHEN feedback_type = 'true_positive' THEN 1 ELSE 0 END) as tp,
          SUM(CASE WHEN feedback_type = 'false_positive' THEN 1 ELSE 0 END) as fp
        FROM analysis_feedback_v2
        WHERE pattern_id = ?
          AND hospital_department IS NOT NULL
        GROUP BY hospital_department
      `)
      .bind(patternId)
      .all();

    const results: DepartmentPerformance[] = [];
    const deptNames: Record<string, string> = {
      'dermatology': '피부과',
      'plastic_surgery': '성형외과',
      'dental': '치과',
      'ophthalmology': '안과',
      'orthopedics': '정형외과',
      'internal': '내과',
      'general': '일반',
    };

    for (const row of (stats.results || []) as any[]) {
      const tp = row.tp || 0;
      const fp = row.fp || 0;
      const total = tp + fp;
      const accuracy = total > 0 ? tp / total : 1.0;
      const confidenceModifier = total >= 10 ? accuracy : 1.0;

      const deptPerf: DepartmentPerformance = {
        patternId,
        departmentCode: row.dept_code,
        departmentName: deptNames[row.dept_code] || row.dept_code,
        totalMatches: total,
        truePositives: tp,
        falsePositives: fp,
        accuracy,
        confidenceModifier,
      };

      // DB에 저장
      const perfId = `DP-${patternId}-${row.dept_code}`;
      await this.db
        .prepare(`
          INSERT INTO department_performance
          (id, pattern_id, department_code, department_name, total_matches,
           true_positives, false_positives, accuracy, confidence_modifier, last_calculated)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(pattern_id, department_code) DO UPDATE SET
            total_matches = excluded.total_matches,
            true_positives = excluded.true_positives,
            false_positives = excluded.false_positives,
            accuracy = excluded.accuracy,
            confidence_modifier = excluded.confidence_modifier,
            last_calculated = datetime('now'),
            updated_at = datetime('now')
        `)
        .bind(
          perfId,
          patternId,
          row.dept_code,
          deptPerf.departmentName,
          total,
          tp,
          fp,
          accuracy,
          confidenceModifier
        )
        .run();

      results.push(deptPerf);
    }

    return results;
  }

  // ============================================
  // 저성능 패턴 플래그
  // ============================================

  /**
   * 저성능 패턴 자동 플래그
   */
  async flagLowPerformancePatterns(threshold?: number): Promise<FlaggedPattern[]> {
    const settings = await this.getSettings();
    const accuracyThreshold = threshold ?? settings.accuracyThreshold;

    const flagged = await this.db
      .prepare(`
        SELECT
          pp.pattern_id,
          pp.accuracy,
          pp.total_matches,
          pp.false_positives,
          pp.flag_reason
        FROM pattern_performance pp
        WHERE pp.period_type = 'all_time'
          AND pp.accuracy IS NOT NULL
          AND pp.accuracy < ?
          AND pp.total_matches >= 5
        ORDER BY pp.accuracy ASC
      `)
      .bind(accuracyThreshold)
      .all();

    return ((flagged.results || []) as any[]).map((row) => ({
      patternId: row.pattern_id,
      accuracy: row.accuracy,
      totalMatches: row.total_matches,
      falsePositives: row.false_positives,
      flagReason: row.flag_reason || `정확도 ${(row.accuracy * 100).toFixed(1)}% < ${accuracyThreshold * 100}%`,
    }));
  }

  // ============================================
  // 성능 리포트 생성
  // ============================================

  /**
   * 종합 성능 리포트 생성
   */
  async generatePerformanceReport(periodDays: number = 30): Promise<PerformanceReport> {
    // 먼저 집계 실행
    await this.aggregatePatternPerformance(periodDays);

    // 전체 통계
    const summary = await this.db
      .prepare(`
        SELECT
          COUNT(DISTINCT pattern_id) as total_patterns,
          AVG(accuracy) as avg_accuracy,
          SUM(CASE WHEN is_flagged = 1 THEN 1 ELSE 0 END) as flagged_patterns
        FROM pattern_performance
        WHERE period_type = 'all_time'
      `)
      .first() as any;

    const feedbackCount = await this.db
      .prepare(`SELECT COUNT(*) as count FROM analysis_feedback_v2`)
      .first() as any;

    const pendingLearning = await this.db
      .prepare(`SELECT COUNT(*) as count FROM auto_learning_log WHERE status = 'pending'`)
      .first() as any;

    // 상위 성능 패턴
    const topPerformers = await this.getAllPatternPerformance({
      limit: 10,
      orderBy: 'accuracy',
      orderDir: 'desc',
    });

    // 하위 성능 패턴
    const lowPerformers = await this.getAllPatternPerformance({
      flaggedOnly: true,
      limit: 10,
      orderBy: 'accuracy',
      orderDir: 'asc',
    });

    // 맥락별 통계
    const contextStats = await this.db
      .prepare(`
        SELECT
          context_type,
          AVG(accuracy) as avg_accuracy,
          COUNT(DISTINCT pattern_id) as pattern_count
        FROM context_performance
        GROUP BY context_type
        ORDER BY avg_accuracy ASC
      `)
      .all();

    // 진료과목별 통계
    const deptStats = await this.db
      .prepare(`
        SELECT
          department_name as department,
          AVG(accuracy) as avg_accuracy,
          COUNT(DISTINCT pattern_id) as pattern_count
        FROM department_performance
        GROUP BY department_code
        ORDER BY avg_accuracy ASC
      `)
      .all();

    // 학습 통계
    const learningStats = await this.db
      .prepare(`
        SELECT
          SUM(CASE WHEN status = 'pending' AND learning_type = 'exception_generated' THEN 1 ELSE 0 END) as pending_exceptions,
          SUM(CASE WHEN status = 'approved' AND created_at > datetime('now', '-7 days') THEN 1 ELSE 0 END) as approved_this_week,
          SUM(CASE WHEN status = 'auto_applied' AND created_at > datetime('now', '-7 days') THEN 1 ELSE 0 END) as auto_applied_this_week
        FROM auto_learning_log
      `)
      .first() as any;

    return {
      generatedAt: new Date().toISOString(),
      periodDays,
      summary: {
        totalPatterns: summary?.total_patterns || 0,
        totalFeedbacks: feedbackCount?.count || 0,
        avgAccuracy: summary?.avg_accuracy || 0,
        flaggedPatterns: summary?.flagged_patterns || 0,
        pendingLearning: pendingLearning?.count || 0,
      },
      topPerformers,
      lowPerformers,
      contextStats: ((contextStats.results || []) as any[]).map((row) => ({
        contextType: row.context_type as ContextType,
        avgAccuracy: row.avg_accuracy,
        patternCount: row.pattern_count,
      })),
      departmentStats: ((deptStats.results || []) as any[]).map((row) => ({
        department: row.department,
        avgAccuracy: row.avg_accuracy,
        patternCount: row.pattern_count,
      })),
      learningStats: {
        pendingExceptions: learningStats?.pending_exceptions || 0,
        approvedThisWeek: learningStats?.approved_this_week || 0,
        autoAppliedThisWeek: learningStats?.auto_applied_this_week || 0,
      },
    };
  }

  // ============================================
  // 신뢰도 조정 계산
  // ============================================

  /**
   * 분석 시 사용할 조정된 신뢰도 계산
   */
  async calculateAdjustedConfidence(
    patternId: string,
    baseConfidence: number,
    contextType?: ContextType,
    department?: string
  ): Promise<number> {
    let adjusted = baseConfidence;

    // 맥락별 배수 적용
    if (contextType) {
      const contextModifier = await this.getContextModifier(patternId, contextType);
      adjusted *= contextModifier;
    }

    // 진료과목별 배수 적용
    if (department) {
      const deptResult = await this.db
        .prepare(`
          SELECT confidence_modifier FROM department_performance
          WHERE pattern_id = ? AND department_code = ?
        `)
        .bind(patternId, department)
        .first() as any;

      if (deptResult?.confidence_modifier) {
        adjusted *= deptResult.confidence_modifier;
      }
    }

    // 전체 패턴 성능 기반 조정
    const patternPerf = await this.getPatternPerformance(patternId);
    if (patternPerf && patternPerf.accuracy !== null && patternPerf.totalMatches >= 10) {
      // 정확도가 매우 낮으면 추가 감점
      if (patternPerf.accuracy < 0.5) {
        adjusted *= 0.5;
      } else if (patternPerf.accuracy < 0.7) {
        adjusted *= 0.8;
      }
    }

    return Math.max(0, Math.min(1, adjusted));
  }
}

// ============================================
// 팩토리 함수
// ============================================

export function createPerformanceTracker(db: D1Database): PerformanceTracker {
  return new PerformanceTracker(db);
}
