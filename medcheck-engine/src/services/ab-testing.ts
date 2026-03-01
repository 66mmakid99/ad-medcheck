/**
 * A/B 테스트 프레임워크 (자동 개선 Phase 3)
 *
 * 패턴 변경(신뢰도 조정, 예외 규칙 추가 등)의 효과를
 * 실험군/대조군으로 비교하여 자동 개선의 안전성을 검증합니다.
 */

export interface ABTestConfig {
  id: string;
  name: string;
  description: string;

  // 실험 대상
  targetType: 'pattern_confidence' | 'exception_rule' | 'severity_change';
  targetId: string; // 패턴 ID 또는 예외 규칙 ID

  // 변경 내용
  controlValue: string; // 기존 값 (JSON)
  treatmentValue: string; // 새 값 (JSON)

  // 트래픽 분배
  trafficPercent: number; // 실험군 비율 (0-100)

  // 기간
  startDate: string;
  endDate: string | null;

  // 상태
  status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';

  // 성공 기준
  minSampleSize: number;
  significanceLevel: number; // 0.05 = 95% 신뢰구간
}

export interface ABTestResult {
  testId: string;

  // 대조군
  controlSamples: number;
  controlAccuracy: number;
  controlFPRate: number;
  controlFNRate: number;

  // 실험군
  treatmentSamples: number;
  treatmentAccuracy: number;
  treatmentFPRate: number;
  treatmentFNRate: number;

  // 통계
  pValue: number | null;
  isSignificant: boolean;
  recommendation: 'adopt' | 'reject' | 'continue';
  evaluatedAt: string;
}

export class ABTestingService {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  /**
   * 새 A/B 테스트 생성
   */
  async createTest(config: Omit<ABTestConfig, 'id' | 'status'>): Promise<string> {
    const id = `ab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await this.db
      .prepare(
        `INSERT INTO ab_tests (id, name, description, target_type, target_id,
         control_value, treatment_value, traffic_percent,
         start_date, end_date, status, min_sample_size, significance_level, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, datetime('now'))`
      )
      .bind(
        id,
        config.name,
        config.description,
        config.targetType,
        config.targetId,
        config.controlValue,
        config.treatmentValue,
        config.trafficPercent,
        config.startDate,
        config.endDate,
        config.minSampleSize,
        config.significanceLevel
      )
      .run();

    return id;
  }

  /**
   * 테스트 시작
   */
  async startTest(testId: string): Promise<void> {
    await this.db
      .prepare(`UPDATE ab_tests SET status = 'running', started_at = datetime('now') WHERE id = ?`)
      .bind(testId)
      .run();
  }

  /**
   * 분석 시 실험군/대조군 결정
   */
  async assignGroup(testId: string): Promise<'control' | 'treatment'> {
    const test = await this.db
      .prepare(`SELECT traffic_percent FROM ab_tests WHERE id = ? AND status = 'running'`)
      .bind(testId)
      .first<{ traffic_percent: number }>();

    if (!test) return 'control';

    return Math.random() * 100 < test.traffic_percent ? 'treatment' : 'control';
  }

  /**
   * 분석 결과 기록
   */
  async recordResult(
    testId: string,
    group: 'control' | 'treatment',
    isCorrect: boolean,
    isFalsePositive: boolean,
    isFalseNegative: boolean
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO ab_test_results (id, test_id, group_name, is_correct, is_false_positive, is_false_negative, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .bind(
        `abr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        testId,
        group,
        isCorrect ? 1 : 0,
        isFalsePositive ? 1 : 0,
        isFalseNegative ? 1 : 0
      )
      .run();
  }

  /**
   * 테스트 결과 평가
   */
  async evaluateTest(testId: string): Promise<ABTestResult> {
    const control = await this.db
      .prepare(
        `SELECT
         COUNT(*) as samples,
         AVG(is_correct) as accuracy,
         AVG(is_false_positive) as fp_rate,
         AVG(is_false_negative) as fn_rate
       FROM ab_test_results WHERE test_id = ? AND group_name = 'control'`
      )
      .bind(testId)
      .first<any>();

    const treatment = await this.db
      .prepare(
        `SELECT
         COUNT(*) as samples,
         AVG(is_correct) as accuracy,
         AVG(is_false_positive) as fp_rate,
         AVG(is_false_negative) as fn_rate
       FROM ab_test_results WHERE test_id = ? AND group_name = 'treatment'`
      )
      .bind(testId)
      .first<any>();

    const test = await this.db
      .prepare(`SELECT min_sample_size, significance_level FROM ab_tests WHERE id = ?`)
      .bind(testId)
      .first<any>();

    const totalSamples = (control?.samples || 0) + (treatment?.samples || 0);
    const minSamples = test?.min_sample_size || 100;

    // Z-test for proportions (간단한 유의성 검정)
    const pValue = this.calculatePValue(
      control?.accuracy || 0,
      control?.samples || 0,
      treatment?.accuracy || 0,
      treatment?.samples || 0
    );

    const isSignificant =
      pValue !== null && pValue < (test?.significance_level || 0.05);

    let recommendation: 'adopt' | 'reject' | 'continue' = 'continue';
    if (totalSamples >= minSamples && pValue !== null) {
      if (isSignificant && (treatment?.accuracy || 0) > (control?.accuracy || 0)) {
        recommendation = 'adopt';
      } else if (isSignificant) {
        recommendation = 'reject';
      }
    }

    const result: ABTestResult = {
      testId,
      controlSamples: control?.samples || 0,
      controlAccuracy: control?.accuracy || 0,
      controlFPRate: control?.fp_rate || 0,
      controlFNRate: control?.fn_rate || 0,
      treatmentSamples: treatment?.samples || 0,
      treatmentAccuracy: treatment?.accuracy || 0,
      treatmentFPRate: treatment?.fp_rate || 0,
      treatmentFNRate: treatment?.fn_rate || 0,
      pValue,
      isSignificant,
      recommendation,
      evaluatedAt: new Date().toISOString(),
    };

    // 결과 저장
    await this.db
      .prepare(
        `UPDATE ab_tests SET
         last_evaluated_at = datetime('now'),
         recommendation = ?,
         p_value = ?,
         status = CASE WHEN ? = 'continue' THEN status ELSE 'completed' END
       WHERE id = ?`
      )
      .bind(recommendation, pValue, recommendation, testId)
      .run();

    return result;
  }

  /**
   * 활성 테스트 목록
   */
  async listActiveTests(): Promise<ABTestConfig[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM ab_tests WHERE status IN ('running', 'draft') ORDER BY created_at DESC`
      )
      .all();

    return (result.results || []).map(this.mapRow);
  }

  /**
   * 모든 테스트 목록
   */
  async listTests(limit = 20): Promise<ABTestConfig[]> {
    const result = await this.db
      .prepare(`SELECT * FROM ab_tests ORDER BY created_at DESC LIMIT ?`)
      .bind(limit)
      .all();

    return (result.results || []).map(this.mapRow);
  }

  /**
   * Two-proportion Z-test
   */
  private calculatePValue(
    p1: number,
    n1: number,
    p2: number,
    n2: number
  ): number | null {
    if (n1 < 10 || n2 < 10) return null;

    const p = (p1 * n1 + p2 * n2) / (n1 + n2);
    const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));

    if (se === 0) return 1;

    const z = Math.abs(p1 - p2) / se;

    // Approximate p-value from z-score (normal distribution)
    return 2 * (1 - this.normalCDF(z));
  }

  /**
   * Standard normal CDF approximation (Abramowitz & Stegun)
   */
  private normalCDF(x: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989422804014327;
    const p =
      d *
      Math.exp((-x * x) / 2) *
      (t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))));
    return x > 0 ? 1 - p : p;
  }

  private mapRow(row: any): ABTestConfig {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      targetType: row.target_type,
      targetId: row.target_id,
      controlValue: row.control_value,
      treatmentValue: row.treatment_value,
      trafficPercent: row.traffic_percent,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
      minSampleSize: row.min_sample_size,
      significanceLevel: row.significance_level,
    };
  }
}
