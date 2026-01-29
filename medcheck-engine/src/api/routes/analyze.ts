/**
 * 분석 API 라우트
 * POST /v1/analyze - 의료광고 위반 분석
 */

import { Hono } from 'hono';
import type { D1Database } from '../../db/d1';
import { violationDetector, GRADE_DESCRIPTIONS } from '../../modules/violation-detector';
import { patternMatcher } from '../../modules/violation-detector';
import { contextAnalyzer } from '../../modules/ai-analyzer';
import type { AnalysisGrade, ScoreResult } from '../../modules/violation-detector';
import type { ViolationResult } from '../../types';

// ============================================
// 타입 정의
// ============================================

export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  ENGINE_VERSION: string;
  PATTERN_VERSION: string;
  CLAUDE_API_KEY?: string;
  GEMINI_API_KEY?: string;
}

/**
 * 분석 요청
 */
export interface AnalyzeRequest {
  /** 분석할 텍스트 (필수) */
  text: string;
  /** AI 분석 활성화 */
  enableAI?: boolean;
  /** 분석 옵션 */
  options?: {
    /** 특정 카테고리만 검사 */
    categories?: string[];
    /** 최소 심각도 */
    minSeverity?: 'critical' | 'major' | 'minor';
    /** 상세 결과 포함 */
    detailed?: boolean;
    /** AI 제공자 (claude/gemini) */
    aiProvider?: 'claude' | 'gemini';
  };
  /** 메타데이터 */
  metadata?: {
    hospitalName?: string;
    department?: string;
    adType?: string;
    url?: string;
  };
}

/**
 * AI 분석 정보
 */
interface AIAnalysisInfo {
  enabled: boolean;
  provider?: string;
  itemsAnalyzed: number;
  additionalViolations: number;
  processingTimeMs: number;
  reasoning?: Array<{
    text: string;
    isViolation: boolean;
    confidence: number;
    reasoning: string;
  }>;
}

/**
 * 분석 응답
 */
export interface AnalyzeResponse {
  success: boolean;
  data?: {
    analysisId: string;
    inputLength: number;
    violationCount: number;
    violations: ViolationResult[];
    score: ScoreResult;
    grade: AnalysisGrade;
    gradeDescription: string;
    summary: string;
    recommendations: string[];
    processingTimeMs: number;
    analyzedAt: string;
    ai?: AIAnalysisInfo;
  };
  error?: {
    code: string;
    message: string;
  };
}

// ============================================
// 라우트 정의
// ============================================

const analyzeRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /v1/analyze - 텍스트 위반 분석
 */
analyzeRoutes.post('/', async (c) => {
  let body: AnalyzeRequest;

  // JSON 파싱
  try {
    body = await c.req.json<AnalyzeRequest>();
  } catch (e) {
    return c.json(
      {
        success: false,
        error: {
          code: 'PARSE_ERROR',
          message: 'Invalid JSON in request body',
        },
      } as AnalyzeResponse,
      400
    );
  }

  // text 필수 검증
  if (!body.text || typeof body.text !== 'string') {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'text 필드는 필수입니다.',
        },
      } as AnalyzeResponse,
      400
    );
  }

  // 텍스트 길이 검증
  if (body.text.length < 1) {
    return c.json(
      {
        success: false,
        error: {
          code: 'EMPTY_CONTENT',
          message: '분석할 텍스트가 비어있습니다.',
        },
      } as AnalyzeResponse,
      400
    );
  }

  if (body.text.length > 100000) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INPUT_TOO_LARGE',
          message: '텍스트가 너무 깁니다. (최대 100,000자)',
        },
      } as AnalyzeResponse,
      400
    );
  }

  try {
    const startTime = Date.now();

    // 1. 패턴 매칭 분석
    const result = violationDetector.analyze({
      text: body.text,
      options: {
        categories: body.options?.categories,
        minSeverity: body.options?.minSeverity,
      },
    });

    let allViolations = [...result.judgment.violations];
    let aiInfo: AIAnalysisInfo = {
      enabled: false,
      itemsAnalyzed: 0,
      additionalViolations: 0,
      processingTimeMs: 0,
    };

    // 2. AI 분석 (enableAI가 true인 경우)
    if (body.enableAI) {
      const provider = body.options?.aiProvider || 'gemini';
      const apiKey = provider === 'claude'
        ? c.env.CLAUDE_API_KEY
        : c.env.GEMINI_API_KEY;

      if (apiKey) {
        try {
          // AI 분석기 설정
          contextAnalyzer.configure({
            provider,
            apiKey,
            confidenceThreshold: 0.7,
            maxAIAnalysis: 5,
          });

          // AI 분석 수행
          const aiResult = await contextAnalyzer.analyze(
            body.text,
            result.matches
          );

          // AI가 추가로 발견한 위반 추가
          allViolations = [...allViolations, ...aiResult.additionalViolations];

          // AI 분석 정보
          aiInfo = {
            enabled: true,
            provider,
            itemsAnalyzed: aiResult.aiCallCount,
            additionalViolations: aiResult.additionalViolations.length,
            processingTimeMs: aiResult.aiProcessingTimeMs,
            reasoning: body.options?.detailed
              ? aiResult.aiAnalyzedItems.map(item => ({
                  text: item.target.text,
                  isViolation: item.result.isViolation,
                  confidence: item.result.confidence,
                  reasoning: item.result.reasoning,
                }))
              : undefined,
          };
        } catch (aiError) {
          // AI 분석 실패 시에도 패턴 매칭 결과는 반환
          aiInfo = {
            enabled: true,
            provider,
            itemsAnalyzed: 0,
            additionalViolations: 0,
            processingTimeMs: 0,
          };
          console.warn('AI analysis failed:', aiError);
        }
      } else {
        aiInfo = {
          enabled: false,
          itemsAnalyzed: 0,
          additionalViolations: 0,
          processingTimeMs: 0,
        };
      }
    }

    // 3. 점수 재계산 (AI 추가 위반 포함)
    const finalScore = result.judgment.score;
    if (aiInfo.additionalViolations > 0) {
      // AI가 추가로 발견한 위반에 대한 점수 추가
      finalScore.totalScore = Math.min(100, finalScore.totalScore + (aiInfo.additionalViolations * 10));

      // 등급 재계산
      if (finalScore.totalScore === 0) finalScore.grade = 'A';
      else if (finalScore.totalScore <= 10) finalScore.grade = 'B';
      else if (finalScore.totalScore <= 30) finalScore.grade = 'C';
      else if (finalScore.totalScore <= 60) finalScore.grade = 'D';
      else finalScore.grade = 'F';

      finalScore.gradeDescription = GRADE_DESCRIPTIONS[finalScore.grade];
      finalScore.complianceRate = 100 - finalScore.totalScore;
    }

    // 4. 요약 업데이트
    let summary = result.judgment.summary;
    if (aiInfo.additionalViolations > 0) {
      summary += ` AI가 ${aiInfo.additionalViolations}건의 추가 위반을 발견했습니다.`;
    }

    const totalProcessingTime = Date.now() - startTime;

    // 응답 생성
    const response: AnalyzeResponse = {
      success: true,
      data: {
        analysisId: result.id,
        inputLength: result.inputLength,
        violationCount: allViolations.length,
        violations: body.options?.detailed
          ? allViolations
          : allViolations.slice(0, 10),
        score: finalScore,
        grade: finalScore.grade,
        gradeDescription: finalScore.gradeDescription,
        summary,
        recommendations: result.judgment.recommendations,
        processingTimeMs: totalProcessingTime,
        analyzedAt: result.judgment.analyzedAt.toISOString(),
        ai: body.enableAI ? aiInfo : undefined,
      },
    };

    return c.json(response);
  } catch (error) {
    const err = error as Error;

    return c.json(
      {
        success: false,
        error: {
          code: 'ANALYSIS_ERROR',
          message: err.message,
        },
      } as AnalyzeResponse,
      500
    );
  }
});

/**
 * POST /v1/analyze/quick - 빠른 점수 조회
 */
analyzeRoutes.post('/quick', async (c) => {
  try {
    const body = await c.req.json<{ text: string }>();

    if (!body.text) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_INPUT', message: 'text 필드는 필수입니다.' },
        },
        400
      );
    }

    const score = violationDetector.quickScore(body.text);

    return c.json({
      success: true,
      data: {
        score: score.totalScore,
        grade: score.grade,
        gradeDescription: score.gradeDescription,
        complianceRate: score.complianceRate,
      },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: { code: 'PARSE_ERROR', message: 'Invalid JSON in request body' },
      },
      400
    );
  }
});

/**
 * POST /v1/analyze/check - 위반 여부만 확인
 */
analyzeRoutes.post('/check', async (c) => {
  try {
    const body = await c.req.json<{ text: string }>();

    if (!body.text) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_INPUT', message: 'text 필드는 필수입니다.' },
        },
        400
      );
    }

    const hasViolation = violationDetector.hasViolation(body.text);

    return c.json({
      success: true,
      data: {
        hasViolation,
        message: hasViolation
          ? '위반 사항이 발견되었습니다.'
          : '위반 사항이 없습니다.',
      },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: { code: 'PARSE_ERROR', message: 'Invalid JSON in request body' },
      },
      400
    );
  }
});

/**
 * GET /v1/analyze/info - 분석 엔진 정보
 */
analyzeRoutes.get('/info', (c) => {
  const hasClaudeKey = !!c.env.CLAUDE_API_KEY;
  const hasGeminiKey = !!c.env.GEMINI_API_KEY;

  return c.json({
    success: true,
    data: {
      patternCount: violationDetector.getPatternCount(),
      categories: violationDetector.getCategories(),
      grades: GRADE_DESCRIPTIONS,
      version: c.env.ENGINE_VERSION || '1.0.0',
      patternVersion: c.env.PATTERN_VERSION || '1.0.0',
      aiAvailable: {
        claude: hasClaudeKey,
        gemini: hasGeminiKey,
      },
    },
  });
});

export { analyzeRoutes };
