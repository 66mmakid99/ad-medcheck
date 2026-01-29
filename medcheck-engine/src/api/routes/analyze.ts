/**
 * 분석 API 라우트
 * POST /v1/analyze - 의료광고 위반 분석
 */

import { Hono } from 'hono';
import { validator } from 'hono/validator';
import type { D1Database } from '../../db/d1';
import { violationDetector, GRADE_DESCRIPTIONS } from '../../modules/violation-detector';
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
}

/**
 * 분석 요청
 */
export interface AnalyzeRequest {
  /** 분석할 텍스트 (필수) */
  text: string;
  /** 분석 옵션 */
  options?: {
    /** 특정 카테고리만 검사 */
    categories?: string[];
    /** 최소 심각도 */
    minSeverity?: 'critical' | 'major' | 'minor';
    /** 상세 결과 포함 */
    detailed?: boolean;
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
 * 분석 응답
 */
export interface AnalyzeResponse {
  success: boolean;
  data?: {
    /** 분석 ID */
    analysisId: string;
    /** 입력 텍스트 길이 */
    inputLength: number;
    /** 위반 건수 */
    violationCount: number;
    /** 위반 목록 */
    violations: ViolationResult[];
    /** 점수 결과 */
    score: ScoreResult;
    /** 등급 */
    grade: AnalysisGrade;
    /** 등급 설명 */
    gradeDescription: string;
    /** 분석 요약 */
    summary: string;
    /** 권장 조치 */
    recommendations: string[];
    /** 처리 시간 (ms) */
    processingTimeMs: number;
    /** 분석 시간 */
    analyzedAt: string;
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
analyzeRoutes.post(
  '/',
  validator('json', (value, c) => {
    const body = value as AnalyzeRequest;

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

    return body;
  }),
  async (c) => {
    const body = c.req.valid('json');

    try {
      // 분석 수행
      const result = violationDetector.analyze({
        text: body.text,
        options: {
          categories: body.options?.categories,
          minSeverity: body.options?.minSeverity,
        },
      });

      // 응답 생성
      const response: AnalyzeResponse = {
        success: true,
        data: {
          analysisId: result.id,
          inputLength: result.inputLength,
          violationCount: result.judgment.violations.length,
          violations: body.options?.detailed
            ? result.judgment.violations
            : result.judgment.violations.slice(0, 10),
          score: result.judgment.score,
          grade: result.judgment.score.grade,
          gradeDescription: result.judgment.score.gradeDescription,
          summary: result.judgment.summary,
          recommendations: result.judgment.recommendations,
          processingTimeMs: result.processingTimeMs,
          analyzedAt: result.judgment.analyzedAt.toISOString(),
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
  }
);

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
        error: { code: 'ANALYSIS_ERROR', message: (error as Error).message },
      },
      500
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
        error: { code: 'ANALYSIS_ERROR', message: (error as Error).message },
      },
      500
    );
  }
});

/**
 * GET /v1/analyze/info - 분석 엔진 정보
 */
analyzeRoutes.get('/info', (c) => {
  return c.json({
    success: true,
    data: {
      patternCount: violationDetector.getPatternCount(),
      categories: violationDetector.getCategories(),
      grades: GRADE_DESCRIPTIONS,
      version: c.env.ENGINE_VERSION || '1.0.0',
      patternVersion: c.env.PATTERN_VERSION || '1.0.0',
    },
  });
});

export { analyzeRoutes };
