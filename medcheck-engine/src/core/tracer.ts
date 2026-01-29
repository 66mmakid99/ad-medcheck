/**
 * 분석 트레이서 (Tracer)
 * 분석 단계별 상세 추적 및 기록
 */

import { D1Service, d1Service } from '../db/d1';
import { Logger, logger } from './logger';

// ============================================
// 타입 정의
// ============================================

/**
 * 분석 단계
 */
export type AnalysisStep =
  | 'init'           // 초기화
  | 'parse'          // HTML 파싱
  | 'normalize'      // 텍스트 정규화
  | 'pattern_match'  // 패턴 매칭
  | 'ocr'            // OCR 처리
  | 'ocr_merge'      // OCR 결과 병합
  | 'ai_review'      // AI 리뷰
  | 'price_check'    // 가격 분석
  | 'aggregate'      // 결과 집계
  | 'complete';      // 완료

/**
 * 트레이스 상태
 */
export type TraceStatus = 'running' | 'success' | 'failed' | 'skipped';

/**
 * 단계별 컨텍스트
 */
export interface StepContext {
  /** 단계 이름 */
  step: AnalysisStep;
  /** 단계 순서 */
  order: number;
  /** 시작 시간 */
  startedAt: Date;
  /** 종료 시간 */
  completedAt?: Date;
  /** 소요 시간 (ms) */
  durationMs?: number;
  /** 상태 */
  status: TraceStatus;
  /** 입력 요약 */
  inputSummary?: Record<string, unknown>;
  /** 출력 요약 */
  outputSummary?: Record<string, unknown>;
  /** 상세 데이터 */
  details?: Record<string, unknown>;
  /** 에러 정보 */
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
}

/**
 * OCR 트레이스 데이터
 */
export interface OCRTraceData {
  imageUrl: string;
  imageHash?: string;
  extractedText: string;
  confidence: number;
  avgCharConfidence?: number;
  minCharConfidence?: number;
  regions?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    confidence: number;
  }>;
  processingTimeMs: number;
  needsValidation: boolean;
}

/**
 * 패턴 매칭 트레이스 데이터
 */
export interface PatternMatchTraceData {
  patternId: string;
  category: string;
  subcategory?: string;
  matchedText: string;
  position: number;
  confidence: number;
  severity: string;
  source: 'text' | 'ocr' | 'ai';
}

/**
 * AI 판정 트레이스 데이터
 */
export interface AIDecisionTraceData {
  model: string;
  inputText: string;
  decision: 'violation' | 'likely' | 'possible' | 'clean';
  confidence: number;
  reasoning: string;
  reasoningSteps?: string[];
  tokensUsed: {
    input: number;
    output: number;
  };
  processingTimeMs: number;
}

/**
 * 트레이서 설정
 */
export interface TracerConfig {
  /** DB에 저장 여부 */
  persistToDb: boolean;
  /** 콘솔 로깅 */
  consoleLog: boolean;
  /** 상세 로깅 */
  verbose: boolean;
  /** OCR 트레이스 저장 */
  traceOCR: boolean;
  /** AI 판정 트레이스 저장 */
  traceAI: boolean;
}

/**
 * 기본 설정
 */
const DEFAULT_CONFIG: TracerConfig = {
  persistToDb: true,
  consoleLog: true,
  verbose: false,
  traceOCR: true,
  traceAI: true,
};

// ============================================
// 트레이서 클래스
// ============================================

/**
 * 분석 트레이서
 * 하나의 분석 세션에 대한 모든 단계를 추적
 */
export class Tracer {
  private config: TracerConfig;
  private db: D1Service;
  private log: Logger;

  /** 분석 로그 ID */
  private analysisLogId: string | null = null;

  /** 현재 단계 트레이스 ID */
  private currentTraceId: string | null = null;

  /** 현재 단계 */
  private currentStep: AnalysisStep | null = null;

  /** 단계별 컨텍스트 */
  private steps: Map<AnalysisStep, StepContext> = new Map();

  /** 단계 순서 카운터 */
  private stepOrder: number = 0;

  /** OCR 트레이스 */
  private ocrTraces: OCRTraceData[] = [];

  /** 패턴 매칭 트레이스 */
  private patternMatches: PatternMatchTraceData[] = [];

  /** AI 판정 트레이스 */
  private aiDecisions: AIDecisionTraceData[] = [];

  /** 전체 시작 시간 */
  private startTime: Date | null = null;

  constructor(config: Partial<TracerConfig> = {}, db?: D1Service, log?: Logger) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db || d1Service;
    this.log = log || logger.child('Tracer');
  }

  // ============================================
  // 세션 관리
  // ============================================

  /**
   * 분석 세션 시작
   */
  async startSession(analysisLogId: string): Promise<void> {
    this.analysisLogId = analysisLogId;
    this.startTime = new Date();
    this.steps.clear();
    this.ocrTraces = [];
    this.patternMatches = [];
    this.aiDecisions = [];
    this.stepOrder = 0;

    if (this.config.consoleLog) {
      this.log.info(`트레이스 세션 시작: ${analysisLogId}`);
    }

    await this.startStep('init');
    await this.completeStep({ message: 'Session initialized' });
  }

  /**
   * 분석 세션 종료
   */
  async endSession(summary?: Record<string, unknown>): Promise<TraceSummary> {
    await this.startStep('complete');
    await this.completeStep(summary);

    const totalDurationMs = this.startTime
      ? Date.now() - this.startTime.getTime()
      : 0;

    const traceSummary: TraceSummary = {
      analysisLogId: this.analysisLogId!,
      totalDurationMs,
      stepsCompleted: Array.from(this.steps.values()).filter(
        (s) => s.status === 'success'
      ).length,
      stepsFailed: Array.from(this.steps.values()).filter(
        (s) => s.status === 'failed'
      ).length,
      ocrImagesProcessed: this.ocrTraces.length,
      patternMatchesFound: this.patternMatches.length,
      aiDecisionsMade: this.aiDecisions.length,
      steps: Array.from(this.steps.values()),
    };

    if (this.config.consoleLog) {
      this.log.info(`트레이스 세션 종료: ${this.analysisLogId}`, {
        totalDurationMs,
        stepsCompleted: traceSummary.stepsCompleted,
        stepsFailed: traceSummary.stepsFailed,
      });
    }

    return traceSummary;
  }

  // ============================================
  // 단계 추적
  // ============================================

  /**
   * 단계 시작
   */
  async startStep(
    step: AnalysisStep,
    inputSummary?: Record<string, unknown>
  ): Promise<void> {
    this.stepOrder++;
    this.currentStep = step;

    const context: StepContext = {
      step,
      order: this.stepOrder,
      startedAt: new Date(),
      status: 'running',
      inputSummary,
    };

    this.steps.set(step, context);

    if (this.config.consoleLog && this.config.verbose) {
      this.log.debug(`단계 시작: ${step}`, inputSummary);
    }

    // DB에 저장
    if (this.config.persistToDb && this.analysisLogId && this.db.isConnected()) {
      try {
        this.currentTraceId = await this.db.startTrace(
          this.analysisLogId,
          step,
          this.stepOrder,
          inputSummary
        );
      } catch (e) {
        this.log.warn(`트레이스 DB 저장 실패: ${(e as Error).message}`);
      }
    }
  }

  /**
   * 단계 완료
   */
  async completeStep(
    outputSummary?: Record<string, unknown>,
    details?: Record<string, unknown>
  ): Promise<void> {
    if (!this.currentStep) return;

    const context = this.steps.get(this.currentStep);
    if (!context) return;

    context.completedAt = new Date();
    context.durationMs = context.completedAt.getTime() - context.startedAt.getTime();
    context.status = 'success';
    context.outputSummary = outputSummary;
    context.details = details;

    if (this.config.consoleLog && this.config.verbose) {
      this.log.debug(`단계 완료: ${this.currentStep} (${context.durationMs}ms)`, outputSummary);
    }

    // DB에 저장
    if (this.config.persistToDb && this.currentTraceId && this.db.isConnected()) {
      try {
        await this.db.completeTrace(this.currentTraceId, outputSummary, details);
      } catch (e) {
        this.log.warn(`트레이스 DB 저장 실패: ${(e as Error).message}`);
      }
    }

    this.currentStep = null;
    this.currentTraceId = null;
  }

  /**
   * 단계 실패
   */
  async failStep(
    errorCode: string,
    errorMessage: string,
    errorStack?: string
  ): Promise<void> {
    if (!this.currentStep) return;

    const context = this.steps.get(this.currentStep);
    if (!context) return;

    context.completedAt = new Date();
    context.durationMs = context.completedAt.getTime() - context.startedAt.getTime();
    context.status = 'failed';
    context.error = {
      code: errorCode,
      message: errorMessage,
      stack: errorStack,
    };

    if (this.config.consoleLog) {
      this.log.error(`단계 실패: ${this.currentStep}`, {
        errorCode,
        errorMessage,
      });
    }

    // DB에 저장
    if (this.config.persistToDb && this.currentTraceId && this.db.isConnected()) {
      try {
        await this.db.failTrace(
          this.currentTraceId,
          errorCode,
          errorMessage,
          errorStack
        );
      } catch (e) {
        this.log.warn(`트레이스 DB 저장 실패: ${(e as Error).message}`);
      }
    }

    this.currentStep = null;
    this.currentTraceId = null;
  }

  /**
   * 단계 스킵
   */
  async skipStep(step: AnalysisStep, reason: string): Promise<void> {
    this.stepOrder++;

    const context: StepContext = {
      step,
      order: this.stepOrder,
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 0,
      status: 'skipped',
      details: { reason },
    };

    this.steps.set(step, context);

    if (this.config.consoleLog && this.config.verbose) {
      this.log.debug(`단계 스킵: ${step} - ${reason}`);
    }
  }

  // ============================================
  // OCR 트레이스
  // ============================================

  /**
   * OCR 결과 기록
   */
  async traceOCR(data: OCRTraceData): Promise<void> {
    if (!this.config.traceOCR) return;

    this.ocrTraces.push(data);

    if (this.config.consoleLog && this.config.verbose) {
      this.log.debug(`OCR 트레이스: ${data.imageUrl.substring(0, 50)}...`, {
        confidence: data.confidence,
        textLength: data.extractedText.length,
        needsValidation: data.needsValidation,
      });
    }
  }

  /**
   * OCR 품질 요약
   */
  getOCRSummary(): {
    totalImages: number;
    avgConfidence: number;
    lowQualityCount: number;
    needsValidationCount: number;
  } {
    if (this.ocrTraces.length === 0) {
      return {
        totalImages: 0,
        avgConfidence: 0,
        lowQualityCount: 0,
        needsValidationCount: 0,
      };
    }

    const avgConfidence =
      this.ocrTraces.reduce((sum, t) => sum + t.confidence, 0) /
      this.ocrTraces.length;

    return {
      totalImages: this.ocrTraces.length,
      avgConfidence,
      lowQualityCount: this.ocrTraces.filter((t) => t.confidence < 0.7).length,
      needsValidationCount: this.ocrTraces.filter((t) => t.needsValidation).length,
    };
  }

  // ============================================
  // 패턴 매칭 트레이스
  // ============================================

  /**
   * 패턴 매칭 결과 기록
   */
  tracePatternMatch(data: PatternMatchTraceData): void {
    this.patternMatches.push(data);

    if (this.config.consoleLog && this.config.verbose) {
      this.log.debug(
        `패턴 매칭: [${data.patternId}] "${data.matchedText.substring(0, 30)}..."`,
        {
          severity: data.severity,
          confidence: data.confidence,
          source: data.source,
        }
      );
    }
  }

  /**
   * 패턴 매칭 요약
   */
  getPatternMatchSummary(): {
    totalMatches: number;
    bySeverity: { critical: number; major: number; minor: number };
    bySource: { text: number; ocr: number; ai: number };
    topPatterns: Array<{ patternId: string; count: number }>;
  } {
    const bySeverity = { critical: 0, major: 0, minor: 0 };
    const bySource = { text: 0, ocr: 0, ai: 0 };
    const patternCounts: Map<string, number> = new Map();

    for (const match of this.patternMatches) {
      // 심각도별
      if (match.severity === 'critical') bySeverity.critical++;
      else if (match.severity === 'major') bySeverity.major++;
      else bySeverity.minor++;

      // 소스별
      bySource[match.source]++;

      // 패턴별
      const count = patternCounts.get(match.patternId) || 0;
      patternCounts.set(match.patternId, count + 1);
    }

    // 상위 패턴
    const topPatterns = Array.from(patternCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([patternId, count]) => ({ patternId, count }));

    return {
      totalMatches: this.patternMatches.length,
      bySeverity,
      bySource,
      topPatterns,
    };
  }

  // ============================================
  // AI 판정 트레이스
  // ============================================

  /**
   * AI 판정 결과 기록
   */
  async traceAIDecision(data: AIDecisionTraceData): Promise<void> {
    if (!this.config.traceAI) return;

    this.aiDecisions.push(data);

    if (this.config.consoleLog && this.config.verbose) {
      this.log.debug(`AI 판정: ${data.decision}`, {
        model: data.model,
        confidence: data.confidence,
        tokensUsed: data.tokensUsed.input + data.tokensUsed.output,
      });
    }

    // DB에 저장
    if (this.config.persistToDb && this.analysisLogId && this.db.isConnected()) {
      try {
        await this.db.saveAIDecision(this.analysisLogId, {
          model: data.model,
          inputText: data.inputText,
          decision: data.decision,
          confidence: data.confidence,
          reasoning: data.reasoning,
          reasoningSteps: data.reasoningSteps,
          inputTokens: data.tokensUsed.input,
          outputTokens: data.tokensUsed.output,
          processingTimeMs: data.processingTimeMs,
        });
      } catch (e) {
        this.log.warn(`AI 판정 DB 저장 실패: ${(e as Error).message}`);
      }
    }
  }

  /**
   * AI 판정 요약
   */
  getAIDecisionSummary(): {
    totalDecisions: number;
    byDecision: Record<string, number>;
    avgConfidence: number;
    totalTokensUsed: number;
    totalProcessingTimeMs: number;
  } {
    if (this.aiDecisions.length === 0) {
      return {
        totalDecisions: 0,
        byDecision: {},
        avgConfidence: 0,
        totalTokensUsed: 0,
        totalProcessingTimeMs: 0,
      };
    }

    const byDecision: Record<string, number> = {};
    let totalConfidence = 0;
    let totalTokens = 0;
    let totalTime = 0;

    for (const decision of this.aiDecisions) {
      byDecision[decision.decision] = (byDecision[decision.decision] || 0) + 1;
      totalConfidence += decision.confidence;
      totalTokens += decision.tokensUsed.input + decision.tokensUsed.output;
      totalTime += decision.processingTimeMs;
    }

    return {
      totalDecisions: this.aiDecisions.length,
      byDecision,
      avgConfidence: totalConfidence / this.aiDecisions.length,
      totalTokensUsed: totalTokens,
      totalProcessingTimeMs: totalTime,
    };
  }

  // ============================================
  // 전체 요약
  // ============================================

  /**
   * 현재 상태 조회
   */
  getStatus(): {
    analysisLogId: string | null;
    currentStep: AnalysisStep | null;
    elapsedMs: number;
    stepsCompleted: number;
  } {
    return {
      analysisLogId: this.analysisLogId,
      currentStep: this.currentStep,
      elapsedMs: this.startTime ? Date.now() - this.startTime.getTime() : 0,
      stepsCompleted: Array.from(this.steps.values()).filter(
        (s) => s.status === 'success'
      ).length,
    };
  }
}

/**
 * 트레이스 요약
 */
export interface TraceSummary {
  analysisLogId: string;
  totalDurationMs: number;
  stepsCompleted: number;
  stepsFailed: number;
  ocrImagesProcessed: number;
  patternMatchesFound: number;
  aiDecisionsMade: number;
  steps: StepContext[];
}

/**
 * 트레이서 팩토리
 */
export function createTracer(config?: Partial<TracerConfig>): Tracer {
  return new Tracer(config);
}

/**
 * 기본 트레이서 인스턴스
 */
export const tracer = new Tracer();
