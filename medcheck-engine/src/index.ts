/**
 * MedCheck Engine - Cloudflare Workers
 * v2.1.0 - 모듈화 리팩토링
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Legacy routes (migrated to api/routes/)
import ocr from './api/routes/legacy-ocr';
import prices from './api/routes/legacy-prices';
import units from './api/routes/legacy-units';
import regions from './api/routes/legacy-regions';
import aliases from './api/routes/legacy-aliases';
import alerts from './api/routes/legacy-alerts';
import analytics from './api/routes/legacy-analytics';

// API routes (src/api/routes/)
import {
  analyzeRoutes, patternsRoutes, healthRoutes, feedbackRoutes,
  validationRoutes, falsePositivesRoutes, patternExceptionsRoutes,
  exceptionSuggestionsRoutes, patternVersionsRoutes, allExceptionsRoutes,
  crawlRoutes, hospitalRoutes, pricingRoutes, screenshotRoutes,
  mappingRoutes, analysisResultsRoutes, performanceRoutes,
  learningRoutes, exceptionCandidatesRoutes, priceAlertsRoutes,
  competitorRoutes, priceHistoryRoutes, coldcallRoutes,
  ocrPipelineRoutes, crawlerRoutes, reportRoutes, aeoRoutes,
  viralRoutes, authRoutes, coldmailGenRoutes, settingsRoutes,
} from './api/routes';

// Extracted inline routes
import { geminiRoutes } from './api/routes/gemini';
import { crossIntelRoutes } from './api/routes/cross-intel';
import { flywheelRoutes } from './api/routes/flywheel';
import { grayZoneRoutes } from './api/routes/gray-zone';
import { pipelineRoutes } from './api/routes/pipeline';
import { dashboardRoutes } from './api/routes/dashboard';

import type { AppBindings, Env } from './types/env';
import { handleScheduled } from './scheduled/crawler-handler';

const app = new Hono<AppBindings>();

app.use('*', cors());

// ── Root & Health ──
app.get('/', (c) => c.json({
  name: 'MedCheck Engine',
  version: '2.1.0',
  status: 'running',
  features: [
    'analyze', 'patterns', 'false-positives', 'exceptions',
    'pricing-v2', 'screenshots', 'mapping', 'alerts',
    'cloud-crawler', 'analysis-pipeline', 'hybrid-ai',
  ],
}));

// ── Extracted route groups ──
app.route('/v1/gemini', geminiRoutes);
app.route('/v1/cross-intel', crossIntelRoutes);
app.route('/v1/flywheel', flywheelRoutes);
app.route('/v1/gray-zones', grayZoneRoutes);
app.route('/v1/pipeline', pipelineRoutes);
app.route('/v1/report', pipelineRoutes);        // /v1/report/generate
app.route('/v1/cold-email', pipelineRoutes);     // /v1/cold-email/generate
app.route('/v1/dashboard', dashboardRoutes);
app.route('/v1/crawl-queue', dashboardRoutes);   // /v1/crawl-queue/add, /v1/crawl-queue
app.route('/v1/crawl-batches', dashboardRoutes); // /v1/crawl-batches
app.route('/v1/analysis-history', dashboardRoutes);

// ── API routes ──
app.route('/v1/analyze', analyzeRoutes);
app.route('/v1/patterns', patternsRoutes);
app.route('/v1/health', healthRoutes);
app.route('/v1/feedback', feedbackRoutes);
app.route('/v1/validations', validationRoutes);
app.route('/v1/false-positives', falsePositivesRoutes);
app.route('/v1/exceptions', allExceptionsRoutes);
app.route('/v1/exception-suggestions', exceptionSuggestionsRoutes);
app.route('/v1/patterns/:patternId/exceptions', patternExceptionsRoutes);
app.route('/v1/patterns/:patternId/versions', patternVersionsRoutes);
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
app.route('/v1/report', reportRoutes);
app.route('/v1/aeo', aeoRoutes);
app.route('/v1/viral', viralRoutes);
app.route('/v1/auth', authRoutes);
app.route('/v1/coldmail', coldmailGenRoutes);
app.route('/v1/settings', settingsRoutes);

// ── Legacy routes ──
app.route('/v1/ocr', ocr);
app.route('/api/prices', prices);
app.route('/api/units', units);
app.route('/api/regions', regions);
app.route('/api/aliases', aliases);
app.route('/api/alerts', alerts);
app.route('/api/analytics', analytics);
app.route('/api/ocr', ocrPipelineRoutes);
app.route('/api/crawler', crawlerRoutes);

// ── Hospital screenshots (standalone) ──
app.get('/v1/hospitals/:hospitalId/screenshots', async (c) => {
  const hospitalId = c.req.param('hospitalId');
  const results = await c.env.DB.prepare(`
    SELECT * FROM price_screenshots WHERE hospital_id = ? ORDER BY created_at DESC LIMIT 50
  `).bind(hospitalId).all();
  return c.json({ success: true, data: results.results });
});

// ── 404 ──
app.notFound((c) => c.json({
  success: false,
  error: { code: 'NOT_FOUND', message: `Route not found: ${c.req.method} ${c.req.path}` },
}, 404));

// ── Export ──
export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleScheduled(event, env));
  },
};
