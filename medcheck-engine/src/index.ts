/**
 * MedCheck Engine - Cloudflare Workers 엔트리포인트
 *
 * 의료광고 위반 탐지 API 서버
 * Hono + Cloudflare Workers + D1
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { timing } from 'hono/timing';

import { analyzeRoutes, patternsRoutes, healthRoutes, feedbackRoutes, validationRoutes, falsePositivesRoutes, patternExceptionsRoutes, allExceptionsRoutes } from './api/routes';
import { violationDetector } from './modules/violation-detector';
import type { D1Database } from './db/d1';

// ============================================
// 타입 정의
// ============================================

export interface Env {
  // Cloudflare D1 바인딩
  DB: D1Database;

  // 환경 변수
  ENVIRONMENT: string;
  PATTERN_VERSION: string;

  // API 키 (선택적)
  API_KEY?: string;

  // 외부 서비스 설정
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SCV_API_URL?: string;
  SCV_API_KEY?: string;
  GEMINI_API_KEY?: string;
}

// ============================================
// 앱 생성
// ============================================

const app = new Hono<{ Bindings: Env }>();

// ============================================
// 미들웨어 설정
// ============================================

// CORS 설정
app.use(
  '*',
  cors({
    origin: ['http://localhost:3000', 'https://medcheck.example.com'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
    exposeHeaders: ['X-Request-ID', 'X-Processing-Time'],
    maxAge: 86400,
    credentials: true,
  })
);

// 보안 헤더
app.use('*', secureHeaders());

// 요청 로깅
app.use('*', logger());

// JSON 포맷팅
app.use('*', prettyJSON());

// 타이밍 헤더
app.use('*', timing());

// ============================================
// API 키 인증 미들웨어 (선택적)
// ============================================

app.use('/v1/analyze/*', async (c, next) => {
  const apiKey = c.req.header('X-API-Key');
  const envApiKey = c.env.API_KEY;

  // API 키가 설정되어 있으면 검증
  if (envApiKey && apiKey !== envApiKey) {
    return c.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or missing API key',
        },
      },
      401
    );
  }

  await next();
});

// ============================================
// 요청 ID 미들웨어
// ============================================

app.use('*', async (c, next) => {
  const requestId = c.req.header('X-Request-ID') || crypto.randomUUID();
  c.res.headers.set('X-Request-ID', requestId);
  await next();
});

// ============================================
// 라우트 설정
// ============================================

// 루트 엔드포인트
app.get('/', (c) => {
  return c.json({
    success: true,
    data: {
      name: 'MedCheck Engine',
      version: '1.0.0',
      description: '의료광고 위반 탐지 API',
      documentation: '/docs',
      endpoints: {
        analyze: '/v1/analyze',
        patterns: '/v1/patterns',
        health: '/v1/health',
        feedback: '/v1/feedback',
        validations: '/v1/validations',
      },
    },
  });
});

// API 문서 (간단 버전)
app.get('/docs', (c) => {
  return c.json({
    success: true,
    data: {
      title: 'MedCheck API Documentation',
      version: '1.0.0',
      baseUrl: '/v1',
      endpoints: [
        {
          path: '/analyze',
          method: 'POST',
          description: '의료광고 텍스트 위반 분석',
          body: {
            text: 'string (필수)',
            url: 'string (선택)',
            options: {
              includeOCR: 'boolean',
              severity: 'string (critical|major|minor)',
            },
          },
        },
        {
          path: '/analyze/:id',
          method: 'GET',
          description: '분석 결과 조회',
        },
        {
          path: '/patterns',
          method: 'GET',
          description: '위반 패턴 목록 조회',
          query: {
            category: 'string (선택)',
            severity: 'string (선택)',
            search: 'string (선택)',
            page: 'number (기본: 1)',
            limit: 'number (기본: 50, 최대: 100)',
          },
        },
        {
          path: '/patterns/categories',
          method: 'GET',
          description: '카테고리 목록 조회',
        },
        {
          path: '/patterns/:id',
          method: 'GET',
          description: '특정 패턴 상세 조회',
        },
        {
          path: '/patterns/stats/summary',
          method: 'GET',
          description: '패턴 통계 조회',
        },
        {
          path: '/health',
          method: 'GET',
          description: '시스템 상태 확인',
          query: {
            detailed: 'boolean (선택)',
            db: 'boolean (기본: true)',
          },
        },
        {
          path: '/health/live',
          method: 'GET',
          description: 'Kubernetes Liveness Probe',
        },
        {
          path: '/health/ready',
          method: 'GET',
          description: 'Kubernetes Readiness Probe',
        },
        {
          path: '/feedback',
          method: 'POST',
          description: '오탐/미탐 피드백 제출',
          body: {
            analysisId: 'string (필수)',
            type: 'string (false_positive|false_negative)',
            comment: 'string (선택)',
            patternId: 'string (선택, 오탐 시)',
            missedText: 'string (선택, 미탐 시)',
          },
        },
        {
          path: '/feedback/:id',
          method: 'GET',
          description: '피드백 상세 조회',
        },
        {
          path: '/validations',
          method: 'GET',
          description: '검증 대기 목록 조회',
          query: {
            status: 'string (pending|approved|rejected)',
            type: 'string (ocr|ai_analysis|pattern_match)',
            page: 'number (기본: 1)',
            limit: 'number (기본: 20)',
          },
        },
        {
          path: '/validations/:id/approve',
          method: 'POST',
          description: '검증 승인',
        },
        {
          path: '/validations/:id/reject',
          method: 'POST',
          description: '검증 거절',
        },
      ],
    },
  });
});

// API 라우트 마운트
app.route('/v1/analyze', analyzeRoutes);
app.route('/v1/patterns', patternsRoutes);
app.route('/v1/health', healthRoutes);
app.route('/v1/feedback', feedbackRoutes);
app.route('/v1/validations', validationRoutes);
app.route('/v1/false-positives', falsePositivesRoutes);
app.route('/v1/exceptions', allExceptionsRoutes);

// 패턴별 예외 라우트 (중첩)
app.route('/v1/patterns/:patternId/exceptions', patternExceptionsRoutes);

// ============================================
// 배치 분석 엔드포인트
// ============================================

/**
 * POST /v1/batch - 여러 텍스트 한번에 분석
 */
app.post('/v1/batch', async (c) => {
  let body: { texts: string[] };

  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({
      success: false,
      error: { code: 'PARSE_ERROR', message: 'Invalid JSON in request body' },
    }, 400);
  }

  if (!body.texts || !Array.isArray(body.texts)) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'texts 배열은 필수입니다.' },
    }, 400);
  }

  if (body.texts.length > 100) {
    return c.json({
      success: false,
      error: { code: 'TOO_MANY_ITEMS', message: '최대 100개까지 분석 가능합니다.' },
    }, 400);
  }

  const startTime = Date.now();
  const results = body.texts.map((text, index) => {
    if (typeof text !== 'string' || text.length === 0) {
      return {
        index,
        success: false,
        error: '유효하지 않은 텍스트',
      };
    }

    try {
      const result = violationDetector.analyze({ text });
      return {
        index,
        success: true,
        inputLength: text.length,
        violationCount: result.judgment.violations.length,
        score: result.judgment.score.totalScore,
        grade: result.judgment.score.grade,
        hasViolation: result.judgment.violations.length > 0,
      };
    } catch (err) {
      return {
        index,
        success: false,
        error: '분석 실패',
      };
    }
  });

  const successCount = results.filter(r => r.success).length;
  const violationCount = results.filter(r => r.success && r.hasViolation).length;

  return c.json({
    success: true,
    data: {
      totalCount: body.texts.length,
      successCount,
      failCount: body.texts.length - successCount,
      violationCount,
      cleanCount: successCount - violationCount,
      processingTimeMs: Date.now() - startTime,
      results,
    },
  });
});

// ============================================
// 통계 엔드포인트
// ============================================

/**
 * GET /v1/stats - 분석 통계 조회
 */
app.get('/v1/stats', async (c) => {
  try {
    // 피드백 통계
    const feedbackStats = await c.env.DB.prepare(`
      SELECT
        type,
        status,
        COUNT(*) as count
      FROM feedback
      GROUP BY type, status
    `).all<{ type: string; status: string; count: number }>();

    // 검증 통계
    const validationStats = await c.env.DB.prepare(`
      SELECT
        type,
        status,
        COUNT(*) as count
      FROM ocr_validations
      GROUP BY type, status
    `).all<{ type: string; status: string; count: number }>();

    // 피드백 집계
    const feedbackSummary = {
      total: 0,
      byType: { false_positive: 0, false_negative: 0 },
      byStatus: { pending: 0, reviewed: 0, resolved: 0 },
    };

    (feedbackStats.results || []).forEach(row => {
      feedbackSummary.total += row.count;
      if (row.type === 'false_positive') feedbackSummary.byType.false_positive += row.count;
      if (row.type === 'false_negative') feedbackSummary.byType.false_negative += row.count;
      if (row.status === 'pending') feedbackSummary.byStatus.pending += row.count;
      if (row.status === 'reviewed') feedbackSummary.byStatus.reviewed += row.count;
      if (row.status === 'resolved') feedbackSummary.byStatus.resolved += row.count;
    });

    // 검증 집계
    const validationSummary = {
      total: 0,
      byType: { ocr: 0, ai_analysis: 0, pattern_match: 0 },
      byStatus: { pending: 0, approved: 0, rejected: 0 },
    };

    (validationStats.results || []).forEach(row => {
      validationSummary.total += row.count;
      if (row.type === 'ocr') validationSummary.byType.ocr += row.count;
      if (row.type === 'ai_analysis') validationSummary.byType.ai_analysis += row.count;
      if (row.type === 'pattern_match') validationSummary.byType.pattern_match += row.count;
      if (row.status === 'pending') validationSummary.byStatus.pending += row.count;
      if (row.status === 'approved') validationSummary.byStatus.approved += row.count;
      if (row.status === 'rejected') validationSummary.byStatus.rejected += row.count;
    });

    // 패턴 정보
    const patternInfo = {
      totalPatterns: violationDetector.getPatternCount(),
      categories: violationDetector.getCategories(),
    };

    return c.json({
      success: true,
      data: {
        feedback: feedbackSummary,
        validations: validationSummary,
        patterns: patternInfo,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const err = error as Error;
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: err.message },
    }, 500);
  }
});

// ============================================
// 에러 핸들링
// ============================================

// 404 핸들러
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route not found: ${c.req.method} ${c.req.path}`,
      },
    },
    404
  );
});

// 전역 에러 핸들러
app.onError((err, c) => {
  console.error(`[Error] ${err.message}`, {
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
  });

  // 특정 에러 타입 처리
  if (err.message.includes('Invalid JSON')) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Request body is not valid JSON',
        },
      },
      400
    );
  }

  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message:
          c.env.ENVIRONMENT === 'production'
            ? 'An internal error occurred'
            : err.message,
      },
    },
    500
  );
});

// ============================================
// Export (ES Module 형식 - Cloudflare Workers)
// ============================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
};
