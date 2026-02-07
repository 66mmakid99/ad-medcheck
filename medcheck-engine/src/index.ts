/**
 * MedCheck Engine - Cloudflare Workers
 * v1.3.0 - 시술가격 v2 (부위별 단가 + 스크린샷 + 매핑 승인)
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import ocr from './routes/ocr';
import prices from './routes/prices';
import units from './routes/units';
import regions from './routes/regions';
import aliases from './routes/aliases';
import alerts from './routes/alerts';
import analytics from './routes/analytics';
import {
  analyzeRoutes,
  patternsRoutes,
  healthRoutes,
  feedbackRoutes,
  validationRoutes,
  falsePositivesRoutes,
  patternExceptionsRoutes,
  exceptionSuggestionsRoutes,
  patternVersionsRoutes,
  allExceptionsRoutes,
  crawlRoutes,
  hospitalRoutes,
  pricingRoutes,
  screenshotRoutes,
  mappingRoutes,
  analysisResultsRoutes,
  performanceRoutes,
  learningRoutes,
  exceptionCandidatesRoutes,
  priceAlertsRoutes,
  competitorRoutes,
  priceHistoryRoutes,
  coldcallRoutes,
  ocrPipelineRoutes,
  crawlerRoutes,
} from './api/routes';
import type { AppBindings } from './types/env';

const app = new Hono<AppBindings>();

app.use('*', cors());

// ============================================
// Health & Info
// ============================================

app.get('/', (c) => {
  return c.json({
    name: 'MedCheck Engine',
    version: '1.3.0',
    status: 'running',
    features: ['analyze', 'patterns', 'false-positives', 'exceptions', 'tricks', 'pricing-v2', 'screenshots', 'mapping', 'alerts']
  });
});

app.get('/v1/health', (c) => {
  return c.json({ status: 'healthy', timestamp: new Date().toISOString(), version: '1.3.0' });
});

// ============================================
// API 라우트 마운트
// ============================================

// 기존 분리된 라우트
app.route('/v1/analyze', analyzeRoutes);
app.route('/v1/patterns', patternsRoutes);
app.route('/v1/health', healthRoutes);
app.route('/v1/ocr', ocr);
app.route('/api/prices', prices);
app.route('/api/units', units);
app.route('/api/regions', regions);
app.route('/api/aliases', aliases);
app.route('/api/alerts', alerts);
app.route('/api/analytics', analytics);
app.route('/v1/feedback', feedbackRoutes);
app.route('/v1/validations', validationRoutes);
app.route('/v1/false-positives', falsePositivesRoutes);
app.route('/v1/exceptions', allExceptionsRoutes);
app.route('/v1/exception-suggestions', exceptionSuggestionsRoutes);

// 패턴별 라우트 (중첩)
app.route('/v1/patterns/:patternId/exceptions', patternExceptionsRoutes);
app.route('/v1/patterns/:patternId/versions', patternVersionsRoutes);

// 새로 분리된 라우트 (v1 prefix)
app.route('/v1', crawlRoutes);
app.route('/v1', hospitalRoutes);
app.route('/v1', pricingRoutes);
app.route('/v1/screenshots', screenshotRoutes);
app.route('/v1/mapping-candidates', mappingRoutes);
app.route('/v1/analysis-results', analysisResultsRoutes);
app.route('/v1/performance', performanceRoutes);
app.route('/v1/learning', learningRoutes);
app.route('/v1/exception-candidates', exceptionCandidatesRoutes);
app.route('/v1/price-alerts', priceAlertsRoutes);
app.route('/v1/competitor-settings', competitorRoutes);
app.route('/v1/price-history', priceHistoryRoutes);
app.route('/v1/coldcall', coldcallRoutes);
app.route('/api/ocr', ocrPipelineRoutes);
app.route('/api/crawler', crawlerRoutes);

// 병원별 스크린샷 (별도 경로)
app.get('/v1/hospitals/:hospitalId/screenshots', async (c) => {
  const hospitalId = c.req.param('hospitalId');
  const results = await c.env.DB.prepare(`
    SELECT * FROM price_screenshots WHERE hospital_id = ? ORDER BY created_at DESC LIMIT 50
  `).bind(hospitalId).all();
  return c.json({ success: true, data: results.results });
});

// 404
app.notFound((c) => {
  return c.json({ success: false, error: { code: 'NOT_FOUND', message: `Route not found: ${c.req.method} ${c.req.path}` } }, 404);
});

export default app;
