// ================================================================
// MADMEDCHECK Engine - 메인 라우터
// ================================================================
// 위치: src/index.ts
// 기존 index.ts에 prices, units 라우터 추가
// ================================================================

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env } from './types';

// 라우터 임포트
import prices from './routes/prices';
import units from './routes/units';
// 기존 라우터들...
// import ocr from './routes/ocr';
// import hospitals from './routes/hospitals';
// import procedures from './routes/procedures';

const app = new Hono<{ Bindings: Env }>();

// ================================================================
// 미들웨어
// ================================================================
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));
app.use('*', logger());

// ================================================================
// 헬스체크
// ================================================================
app.get('/', (c) => {
  return c.json({
    name: 'MADMEDCHECK Engine',
    version: '1.0.0',
    phase: 'Phase 1 - 가격 DB',
    status: 'running',
    endpoints: {
      prices: '/api/prices',
      units: '/api/units',
      // 기존 엔드포인트들...
    },
  });
});

// ================================================================
// API 라우트 등록
// ================================================================

// Phase 1: 가격 DB
app.route('/api/prices', prices);
app.route('/api/units', units);

// 기존 라우터들 (주석 해제하여 사용)
// app.route('/api/ocr', ocr);
// app.route('/api/hospitals', hospitals);
// app.route('/api/procedures', procedures);

// ================================================================
// 404 핸들러
// ================================================================
app.notFound((c) => {
  return c.json({
    success: false,
    error: 'NOT_FOUND',
    message: `Route not found: ${c.req.method} ${c.req.path}`,
  }, 404);
});

// ================================================================
// 에러 핸들러
// ================================================================
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({
    success: false,
    error: 'INTERNAL_ERROR',
    message: err.message,
  }, 500);
});

export default app;
