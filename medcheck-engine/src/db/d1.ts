/**
 * Cloudflare D1 Database Client
 * 분석 로그, OCR 로그, 트레이스 저장
 */

import type { ModuleOutput, ViolationResult } from '../types';

// ============================================
// 타입 정의
// ============================================

/**
 * D1 데이터베이스 인터페이스 (Cloudflare Workers)
 */
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(): Promise<T[]>;
}

export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  error?: string;
  meta: {
    duration: number;
    changes: number;
    last_row_id: number;
  };
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

/**
 * 분석 로그 레코드
 */
export interface AnalysisLogRecord {
  id: string;
  source_url: string;
  source_type?: string;
  hospital_name?: string;
  department?: string;
  violation_count: number;
  severity_critical: number;
  severity_major: number;
  severity_minor: number;
  confidence?: number;
  processing_time_ms?: number;
  content_length?: number;
  image_count: number;
  ocr_used: number;
  status: string;
  error_code?: string;
  error_message?: string;
  engine_version?: string;
  pattern_version?: string;
  analyzed_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * 분석 트레이스 레코드
 */
export interface AnalysisTraceRecord {
  id: string;
  analysis_log_id: string;
  step_name: string;
  step_order: number;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  status: string;
  input_summary?: string;
  output_summary?: string;
  details?: string;
  error_code?: string;
  error_message?: string;
  error_stack?: string;
}

/**
 * OCR 로그 레코드
 */
export interface OCRLogRecord {
  id: string;
  analysis_log_id: string;
  image_url: string;
  image_hash?: string;
  image_size_bytes?: number;
  image_width?: number;
  image_height?: number;
  extracted_text?: string;
  text_length?: number;
  word_count?: number;
  confidence?: number;
  avg_char_confidence?: number;
  min_char_confidence?: number;
  regions_count?: number;
  regions_data?: string;
  ocr_provider: string;
  processing_time_ms?: number;
  status: string;
  error_message?: string;
  is_low_quality: number;
  needs_validation: number;
  validated: number;
}

/**
 * 패턴 매칭 레코드
 */
export interface PatternHitRecord {
  id: string;
  analysis_log_id: string;
  pattern_id: string;
  pattern_category?: string;
  pattern_subcategory?: string;
  matched_text: string;
  text_position?: number;
  context_before?: string;
  context_after?: string;
  severity: string;
  confidence?: number;
  is_false_positive: number;
  legal_basis?: string;
  source_type: string;
  ocr_log_id?: string;
}

/**
 * AI 판정 레코드
 */
export interface AIDecisionRecord {
  id: string;
  analysis_log_id: string;
  pattern_hit_id?: string;
  model: string;
  model_version?: string;
  input_text: string;
  input_context?: string;
  decision: string;
  confidence?: number;
  reasoning: string;
  reasoning_steps?: string;
  legal_analysis?: string;
  input_tokens?: number;
  output_tokens?: number;
  processing_time_ms?: number;
}

// ============================================
// UUID 생성
// ============================================

function generateId(): string {
  // crypto.randomUUID() 사용 (Workers 환경)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // 폴백: 간단한 UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================
// D1 Service 클래스
// ============================================

/**
 * D1 데이터베이스 서비스
 */
export class D1Service {
  private db: D1Database | null = null;

  /**
   * D1 바인딩 설정 (Workers 환경)
   */
  setDatabase(db: D1Database): void {
    this.db = db;
  }

  /**
   * DB 연결 확인
   */
  isConnected(): boolean {
    return this.db !== null;
  }

  /**
   * 연결 테스트
   */
  async checkConnection(): Promise<boolean> {
    if (!this.db) return false;
    try {
      await this.db.prepare('SELECT 1').first();
      return true;
    } catch {
      return false;
    }
  }

  // ============================================
  // 분석 로그
  // ============================================

  /**
   * 분석 로그 생성
   */
  async createAnalysisLog(
    sourceUrl: string,
    options?: {
      sourceType?: string;
      hospitalName?: string;
      department?: string;
      engineVersion?: string;
      patternVersion?: string;
    }
  ): Promise<string> {
    if (!this.db) throw new Error('Database not connected');

    const id = generateId();
    const now = new Date().toISOString();

    await this.db
      .prepare(`
        INSERT INTO analysis_logs (
          id, source_url, source_type, hospital_name, department,
          engine_version, pattern_version, status, analyzed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'processing', ?, ?, ?)
      `)
      .bind(
        id,
        sourceUrl,
        options?.sourceType || null,
        options?.hospitalName || null,
        options?.department || null,
        options?.engineVersion || '1.0.0',
        options?.patternVersion || '1.0.0',
        now,
        now,
        now
      )
      .run();

    return id;
  }

  /**
   * 분석 결과 저장
   */
  async saveAnalysisResult(
    analysisLogId: string,
    result: ModuleOutput,
    options?: {
      contentLength?: number;
      imageCount?: number;
      ocrUsed?: boolean;
    }
  ): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    const now = new Date().toISOString();

    // 심각도별 카운트
    const severityCounts = {
      critical: 0,
      major: 0,
      minor: 0,
    };

    result.violations.forEach((v) => {
      if (v.severity === 'high') severityCounts.critical++;
      else if (v.severity === 'medium') severityCounts.major++;
      else severityCounts.minor++;
    });

    // 분석 로그 업데이트
    await this.db
      .prepare(`
        UPDATE analysis_logs SET
          violation_count = ?,
          severity_critical = ?,
          severity_major = ?,
          severity_minor = ?,
          confidence = ?,
          processing_time_ms = ?,
          content_length = ?,
          image_count = ?,
          ocr_used = ?,
          status = 'completed',
          updated_at = ?
        WHERE id = ?
      `)
      .bind(
        result.violations.length,
        severityCounts.critical,
        severityCounts.major,
        severityCounts.minor,
        result.confidence,
        result.processingTime || null,
        options?.contentLength || null,
        options?.imageCount || 0,
        options?.ocrUsed ? 1 : 0,
        now,
        analysisLogId
      )
      .run();

    // 패턴 매칭 저장
    await this.savePatternHits(analysisLogId, result.violations);
  }

  /**
   * 분석 에러 저장
   */
  async saveAnalysisError(
    analysisLogId: string,
    errorCode: string,
    errorMessage: string
  ): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    await this.db
      .prepare(`
        UPDATE analysis_logs SET
          status = 'failed',
          error_code = ?,
          error_message = ?,
          updated_at = ?
        WHERE id = ?
      `)
      .bind(errorCode, errorMessage, new Date().toISOString(), analysisLogId)
      .run();
  }

  /**
   * 분석 로그 조회
   */
  async getAnalysisLog(id: string): Promise<AnalysisLogRecord | null> {
    if (!this.db) throw new Error('Database not connected');

    return this.db
      .prepare('SELECT * FROM analysis_logs WHERE id = ?')
      .bind(id)
      .first<AnalysisLogRecord>();
  }

  // ============================================
  // 분석 트레이스
  // ============================================

  /**
   * 트레이스 시작
   */
  async startTrace(
    analysisLogId: string,
    stepName: string,
    stepOrder: number,
    inputSummary?: Record<string, unknown>
  ): Promise<string> {
    if (!this.db) throw new Error('Database not connected');

    const id = generateId();
    const now = new Date().toISOString();

    await this.db
      .prepare(`
        INSERT INTO analysis_traces (
          id, analysis_log_id, step_name, step_order, started_at, status, input_summary
        ) VALUES (?, ?, ?, ?, ?, 'running', ?)
      `)
      .bind(
        id,
        analysisLogId,
        stepName,
        stepOrder,
        now,
        inputSummary ? JSON.stringify(inputSummary) : null
      )
      .run();

    return id;
  }

  /**
   * 트레이스 완료
   */
  async completeTrace(
    traceId: string,
    outputSummary?: Record<string, unknown>,
    details?: Record<string, unknown>
  ): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    const trace = await this.db
      .prepare('SELECT started_at FROM analysis_traces WHERE id = ?')
      .bind(traceId)
      .first<{ started_at: string }>();

    const now = new Date();
    const startedAt = trace ? new Date(trace.started_at) : now;
    const durationMs = now.getTime() - startedAt.getTime();

    await this.db
      .prepare(`
        UPDATE analysis_traces SET
          completed_at = ?,
          duration_ms = ?,
          status = 'success',
          output_summary = ?,
          details = ?
        WHERE id = ?
      `)
      .bind(
        now.toISOString(),
        durationMs,
        outputSummary ? JSON.stringify(outputSummary) : null,
        details ? JSON.stringify(details) : null,
        traceId
      )
      .run();
  }

  /**
   * 트레이스 실패
   */
  async failTrace(
    traceId: string,
    errorCode: string,
    errorMessage: string,
    errorStack?: string
  ): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    const now = new Date().toISOString();

    await this.db
      .prepare(`
        UPDATE analysis_traces SET
          completed_at = ?,
          status = 'failed',
          error_code = ?,
          error_message = ?,
          error_stack = ?
        WHERE id = ?
      `)
      .bind(now, errorCode, errorMessage, errorStack || null, traceId)
      .run();
  }

  // ============================================
  // OCR 로그
  // ============================================

  /**
   * OCR 로그 생성
   */
  async createOCRLog(
    analysisLogId: string,
    imageUrl: string,
    options?: {
      imageHash?: string;
      imageSizeBytes?: number;
      imageWidth?: number;
      imageHeight?: number;
      ocrProvider?: string;
    }
  ): Promise<string> {
    if (!this.db) throw new Error('Database not connected');

    const id = generateId();

    await this.db
      .prepare(`
        INSERT INTO ocr_logs (
          id, analysis_log_id, image_url, image_hash,
          image_size_bytes, image_width, image_height,
          ocr_provider, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `)
      .bind(
        id,
        analysisLogId,
        imageUrl,
        options?.imageHash || null,
        options?.imageSizeBytes || null,
        options?.imageWidth || null,
        options?.imageHeight || null,
        options?.ocrProvider || 'gemini'
      )
      .run();

    return id;
  }

  /**
   * OCR 결과 저장
   */
  async saveOCRResult(
    ocrLogId: string,
    result: {
      extractedText: string;
      confidence: number;
      avgCharConfidence?: number;
      minCharConfidence?: number;
      regionsCount?: number;
      regionsData?: Array<{
        x: number;
        y: number;
        width: number;
        height: number;
        text: string;
        confidence: number;
      }>;
      processingTimeMs?: number;
    }
  ): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    const textLength = result.extractedText.length;
    const wordCount = result.extractedText.split(/\s+/).filter(Boolean).length;

    // 품질 플래그 결정
    const isLowQuality = result.confidence < 0.7 ? 1 : 0;
    const needsValidation = result.confidence < 0.85 ? 1 : 0;

    await this.db
      .prepare(`
        UPDATE ocr_logs SET
          extracted_text = ?,
          text_length = ?,
          word_count = ?,
          confidence = ?,
          avg_char_confidence = ?,
          min_char_confidence = ?,
          regions_count = ?,
          regions_data = ?,
          processing_time_ms = ?,
          status = 'completed',
          is_low_quality = ?,
          needs_validation = ?
        WHERE id = ?
      `)
      .bind(
        result.extractedText,
        textLength,
        wordCount,
        result.confidence,
        result.avgCharConfidence || null,
        result.minCharConfidence || null,
        result.regionsCount || null,
        result.regionsData ? JSON.stringify(result.regionsData) : null,
        result.processingTimeMs || null,
        isLowQuality,
        needsValidation,
        ocrLogId
      )
      .run();

    // 검증 필요 시 큐에 추가
    if (needsValidation) {
      await this.createOCRValidation(ocrLogId, result.extractedText, result.confidence);
    }
  }

  /**
   * OCR 검증 큐에 추가
   */
  private async createOCRValidation(
    ocrLogId: string,
    ocrText: string,
    confidence: number
  ): Promise<void> {
    if (!this.db) return;

    const ocrLog = await this.db
      .prepare('SELECT image_url FROM ocr_logs WHERE id = ?')
      .bind(ocrLogId)
      .first<{ image_url: string }>();

    if (!ocrLog) return;

    // 우선순위 결정 (신뢰도 낮을수록 높은 우선순위)
    const priority = Math.round((1 - confidence) * 100);

    await this.db
      .prepare(`
        INSERT INTO ocr_validations (
          id, ocr_log_id, image_url, ocr_text, ocr_confidence, priority, reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        generateId(),
        ocrLogId,
        ocrLog.image_url,
        ocrText,
        confidence,
        priority,
        confidence < 0.7 ? 'Low confidence' : 'Medium confidence'
      )
      .run();
  }

  // ============================================
  // 패턴 매칭
  // ============================================

  /**
   * 패턴 매칭 저장
   */
  async savePatternHits(
    analysisLogId: string,
    violations: ViolationResult[],
    sourceType: string = 'text',
    ocrLogId?: string
  ): Promise<void> {
    if (!this.db || violations.length === 0) return;

    const statements = violations.map((v) =>
      this.db!.prepare(`
        INSERT INTO pattern_hits (
          id, analysis_log_id, pattern_id, pattern_category, pattern_subcategory,
          matched_text, text_position, context_before, context_after,
          severity, confidence, legal_basis, source_type, ocr_log_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        generateId(),
        analysisLogId,
        v.patternId || 'unknown',
        v.type,
        null,
        v.matchedText,
        v.position || null,
        null,
        null,
        v.severity === 'high' ? 'critical' : v.severity === 'medium' ? 'major' : 'minor',
        v.confidence,
        v.legalBasis?.[0]?.article || null,
        sourceType,
        ocrLogId || null
      )
    );

    await this.db.batch(statements);

    // 패턴 통계 업데이트
    await this.updatePatternStats(violations);
  }

  /**
   * 패턴 통계 업데이트
   */
  private async updatePatternStats(violations: ViolationResult[]): Promise<void> {
    if (!this.db) return;

    const now = new Date().toISOString();

    for (const v of violations) {
      const patternId = v.patternId || 'unknown';

      await this.db
        .prepare(`
          INSERT INTO pattern_stats (pattern_id, total_matches, true_positives, last_matched_at)
          VALUES (?, 1, 1, ?)
          ON CONFLICT(pattern_id) DO UPDATE SET
            total_matches = total_matches + 1,
            true_positives = true_positives + 1,
            last_matched_at = ?,
            updated_at = ?
        `)
        .bind(patternId, now, now, now)
        .run();
    }
  }

  // ============================================
  // AI 판정
  // ============================================

  /**
   * AI 판정 저장
   */
  async saveAIDecision(
    analysisLogId: string,
    decision: {
      patternHitId?: string;
      model: string;
      modelVersion?: string;
      inputText: string;
      inputContext?: Record<string, unknown>;
      decision: 'violation' | 'likely' | 'possible' | 'clean';
      confidence: number;
      reasoning: string;
      reasoningSteps?: string[];
      legalAnalysis?: Record<string, unknown>;
      inputTokens?: number;
      outputTokens?: number;
      processingTimeMs?: number;
    }
  ): Promise<string> {
    if (!this.db) throw new Error('Database not connected');

    const id = generateId();

    await this.db
      .prepare(`
        INSERT INTO ai_decisions (
          id, analysis_log_id, pattern_hit_id, model, model_version,
          input_text, input_context, decision, confidence, reasoning,
          reasoning_steps, legal_analysis, input_tokens, output_tokens, processing_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        analysisLogId,
        decision.patternHitId || null,
        decision.model,
        decision.modelVersion || null,
        decision.inputText,
        decision.inputContext ? JSON.stringify(decision.inputContext) : null,
        decision.decision,
        decision.confidence,
        decision.reasoning,
        decision.reasoningSteps ? JSON.stringify(decision.reasoningSteps) : null,
        decision.legalAnalysis ? JSON.stringify(decision.legalAnalysis) : null,
        decision.inputTokens || null,
        decision.outputTokens || null,
        decision.processingTimeMs || null
      )
      .run();

    return id;
  }

  // ============================================
  // 메트릭 / 통계
  // ============================================

  /**
   * 시스템 메트릭 저장
   */
  async saveMetric(
    name: string,
    value: number,
    options?: {
      unit?: string;
      category?: string;
      periodStart: Date;
      periodEnd: Date;
      periodType: 'hourly' | 'daily' | 'weekly' | 'monthly';
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    const id = generateId();
    const periodStart = options?.periodStart || new Date();
    const periodEnd = options?.periodEnd || new Date();

    await this.db
      .prepare(`
        INSERT INTO system_metrics (
          id, metric_name, metric_value, metric_unit, category,
          period_start, period_end, period_type, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        name,
        value,
        options?.unit || null,
        options?.category || null,
        periodStart.toISOString(),
        periodEnd.toISOString(),
        options?.periodType || 'hourly',
        options?.metadata ? JSON.stringify(options.metadata) : null
      )
      .run();
  }

  /**
   * 오늘 분석 통계 조회
   */
  async getTodayStats(): Promise<{
    totalAnalyses: number;
    completedAnalyses: number;
    failedAnalyses: number;
    totalViolations: number;
    avgProcessingTime: number;
    ocrUsageCount: number;
  }> {
    if (!this.db) throw new Error('Database not connected');

    const today = new Date().toISOString().split('T')[0];

    const result = await this.db
      .prepare(`
        SELECT
          COUNT(*) as total_analyses,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_analyses,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_analyses,
          SUM(violation_count) as total_violations,
          AVG(processing_time_ms) as avg_processing_time,
          SUM(CASE WHEN ocr_used = 1 THEN 1 ELSE 0 END) as ocr_usage_count
        FROM analysis_logs
        WHERE date(analyzed_at) = ?
      `)
      .bind(today)
      .first<{
        total_analyses: number;
        completed_analyses: number;
        failed_analyses: number;
        total_violations: number;
        avg_processing_time: number;
        ocr_usage_count: number;
      }>();

    return {
      totalAnalyses: result?.total_analyses || 0,
      completedAnalyses: result?.completed_analyses || 0,
      failedAnalyses: result?.failed_analyses || 0,
      totalViolations: result?.total_violations || 0,
      avgProcessingTime: result?.avg_processing_time || 0,
      ocrUsageCount: result?.ocr_usage_count || 0,
    };
  }

  /**
   * OCR 품질 통계 조회
   */
  async getOCRQualityStats(): Promise<{
    totalOCRLogs: number;
    avgConfidence: number;
    lowQualityCount: number;
    pendingValidationCount: number;
    validatedCount: number;
  }> {
    if (!this.db) throw new Error('Database not connected');

    const result = await this.db
      .prepare(`
        SELECT
          COUNT(*) as total_ocr_logs,
          AVG(confidence) as avg_confidence,
          SUM(CASE WHEN is_low_quality = 1 THEN 1 ELSE 0 END) as low_quality_count,
          SUM(CASE WHEN needs_validation = 1 AND validated = 0 THEN 1 ELSE 0 END) as pending_validation_count,
          SUM(CASE WHEN validated = 1 THEN 1 ELSE 0 END) as validated_count
        FROM ocr_logs
      `)
      .first<{
        total_ocr_logs: number;
        avg_confidence: number;
        low_quality_count: number;
        pending_validation_count: number;
        validated_count: number;
      }>();

    return {
      totalOCRLogs: result?.total_ocr_logs || 0,
      avgConfidence: result?.avg_confidence || 0,
      lowQualityCount: result?.low_quality_count || 0,
      pendingValidationCount: result?.pending_validation_count || 0,
      validatedCount: result?.validated_count || 0,
    };
  }
}

/**
 * 기본 D1 서비스 인스턴스
 */
export const d1Service = new D1Service();
