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

import { analyzeRoutes, patternsRoutes, healthRoutes } from './api/routes';
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
      ],
    },
  });
});

// API 라우트 마운트
app.route('/v1/analyze', analyzeRoutes);
app.route('/v1/patterns', patternsRoutes);
app.route('/v1/health', healthRoutes);

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
// Export (ES Module 형식)
// ============================================

export default {
  fetch: app.fetch,
};
