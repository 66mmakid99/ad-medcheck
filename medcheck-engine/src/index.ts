/**
 * MedCheck Engine - Cloudflare Workers
 * v2.0.0 - 클라우드 크롤러 + 통합 분석 파이프라인
 * 
 * [변경사항]
 * - Cron Trigger 핸들러 등록 (scheduled export 추가)
 * - 수동 분석 API에 파이프라인 연결
 * - 대시보드 요약 API 추가
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
  reportRoutes,
  aeoRoutes,
} from './api/routes';
import type { AppBindings, Env } from './types/env';

// [신규] 클라우드 크롤러 + 파이프라인
import { handleScheduled, handleManualTriggers } from './scheduled/crawler-handler';
import { runAnalysisPipeline, savePipelineResult } from './services/analysis-pipeline';

const app = new Hono<AppBindings>();

app.use('*', cors());

// ============================================
// Health & Info
// ============================================

app.get('/', (c) => {
  return c.json({
    name: 'MedCheck Engine',
    version: '2.0.0',
    status: 'running',
    features: [
      'analyze', 'patterns', 'false-positives', 'exceptions', 
      'pricing-v2', 'screenshots', 'mapping', 'alerts',
      'cloud-crawler', 'analysis-pipeline', 'hybrid-ai',
    ]
  });
});

app.get('/v1/health', (c) => {
  return c.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(), 
    version: '2.0.0',
    cronEnabled: true,
  });
});

// ============================================
// [신규] 통합 분석 API (파이프라인 사용)
// ============================================

/**
 * POST /v1/pipeline/analyze
 * URL을 넣으면 전체 분석 파이프라인 실행 + DB 저장
 * 
 * 대시보드의 "URL 분석" 탭에서 호출합니다.
 */
app.post('/v1/pipeline/analyze', async (c) => {
  try {
    // 인코딩 안전 JSON 파싱 (Windows 터미널 CP949 대응)
    const rawBuffer = await c.req.arrayBuffer();
    let bodyText = new TextDecoder('utf-8').decode(rawBuffer);
    if (bodyText.includes('\uFFFD')) {
      bodyText = new TextDecoder('euc-kr', { fatal: false }).decode(rawBuffer);
    }
    const body = JSON.parse(bodyText) as {
      url: string;
      hospitalId?: number;
      hospitalName?: string;
      enableAI?: boolean;
    };

    if (!body.url) {
      return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'url은 필수입니다' } }, 400);
    }

    const result = await runAnalysisPipeline(
      {
        url: body.url,
        hospitalId: body.hospitalId,
        hospitalName: body.hospitalName,
        enableAI: body.enableAI ?? !!c.env.GEMINI_API_KEY,
      },
      c.env.GEMINI_API_KEY,
    );

    // DB 저장
    await savePipelineResult(c.env.DB, {
      url: body.url,
      hospitalId: body.hospitalId,
      hospitalName: body.hospitalName,
      enableAI: body.enableAI,
    }, result);

    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: { code: 'SERVER_ERROR', message: (error as Error).message },
    }, 500);
  }
});

// ============================================
// [신규] 대시보드 요약 API
// ============================================

/**
 * GET /v1/dashboard/summary
 * 대시보드 홈에서 보여줄 전체 요약 정보
 */
app.get('/v1/dashboard/summary', async (c) => {
  try {
    const db = c.env.DB;

    // 오늘 분석 요약
    const todayStats = await db.prepare(`
      SELECT 
        COUNT(*) as total_analyzed,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
        SUM(violation_count) as total_violations,
        ROUND(AVG(clean_score), 1) as avg_score
      FROM analysis_history
      WHERE analyzed_at >= date('now')
    `).first();

    // 등급 분포 (최신 분석 기준)
    let gradeDistribution: any[] = [];
    try {
      const grades = await db.prepare(`
        SELECT grade, grade_emoji, COUNT(*) as count
        FROM v_latest_analysis
        GROUP BY grade
        ORDER BY count DESC
      `).all();
      gradeDistribution = grades.results || [];
    } catch {
      // 뷰가 없으면 직접 쿼리
      const grades = await db.prepare(`
        SELECT grade, grade_emoji, COUNT(*) as count
        FROM analysis_history ah
        INNER JOIN (
          SELECT hospital_id, MAX(analyzed_at) as latest
          FROM analysis_history WHERE status = 'success'
          GROUP BY hospital_id
        ) l ON ah.hospital_id = l.hospital_id AND ah.analyzed_at = l.latest
        GROUP BY grade
      `).all();
      gradeDistribution = grades.results || [];
    }

    // 크롤러 상태
    const scheduler = await db.prepare(`
      SELECT * FROM crawler_scheduler_status WHERE id = 'singleton'
    `).first();

    const isOnline = scheduler?.is_online === 1 &&
      scheduler?.last_heartbeat &&
      (Date.now() - new Date(scheduler.last_heartbeat as string).getTime()) < 300000; // 5분 이내

    // 최근 배치
    const recentBatch = await db.prepare(`
      SELECT * FROM crawl_batches ORDER BY started_at DESC LIMIT 1
    `).first();

    // 큐 상태
    const queueStats = await db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM crawl_queue
    `).first();

    // 최근 분석 결과 10건
    const recentResults = await db.prepare(`
      SELECT 
        hospital_name, url_analyzed, grade, grade_emoji, 
        clean_score, violation_count, analyzed_at
      FROM analysis_history
      WHERE status = 'success'
      ORDER BY analyzed_at DESC
      LIMIT 10
    `).all();

    return c.json({
      success: true,
      data: {
        today: {
          analyzed: todayStats?.total_analyzed || 0,
          success: todayStats?.success_count || 0,
          violations: todayStats?.total_violations || 0,
          avgScore: todayStats?.avg_score || 0,
        },
        gradeDistribution,
        crawler: {
          online: isOnline,
          lastHeartbeat: scheduler?.last_heartbeat || null,
          mode: 'cloud', // 'cloud' = Cron Trigger, 'local' = 로컬 스케줄러
        },
        queue: {
          total: queueStats?.total || 0,
          pending: queueStats?.pending || 0,
          completed: queueStats?.completed || 0,
          failed: queueStats?.failed || 0,
        },
        recentBatch: recentBatch || null,
        recentResults: recentResults.results || [],
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: { code: 'SUMMARY_ERROR', message: (error as Error).message },
    }, 500);
  }
});

/**
 * GET /v1/dashboard/hospitals
 * 병원 목록 + 최신 분석 결과
 */
app.get('/v1/dashboard/hospitals', async (c) => {
  try {
    const db = c.env.DB;
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
    const grade = c.req.query('grade'); // 등급 필터
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        ah.hospital_id, ah.hospital_name, ah.url_analyzed,
        ah.grade, ah.grade_emoji, ah.clean_score,
        ah.violation_count, ah.critical_count, ah.major_count, ah.minor_count,
        ah.ai_verified, ah.analyzed_at,
        ch.address, ch.phone, ch.category, ch.region
      FROM analysis_history ah
      INNER JOIN (
        SELECT hospital_id, MAX(analyzed_at) as latest
        FROM analysis_history WHERE status = 'success'
        GROUP BY hospital_id
      ) l ON ah.hospital_id = l.hospital_id AND ah.analyzed_at = l.latest
      LEFT JOIN collected_hospitals ch ON ah.hospital_id = ch.id
    `;

    const params: any[] = [];
    if (grade) {
      query += ` WHERE ah.grade = ?`;
      params.push(grade);
    }
    query += ` ORDER BY ah.analyzed_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const results = await db.prepare(query).bind(...params).all();

    // 전체 수
    const countResult = await db.prepare(`
      SELECT COUNT(DISTINCT hospital_id) as total
      FROM analysis_history WHERE status = 'success'
    `).first();

    return c.json({
      success: true,
      data: {
        hospitals: results.results || [],
        pagination: {
          page,
          limit,
          total: countResult?.total || 0,
          totalPages: Math.ceil((countResult?.total as number || 0) / limit),
        },
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: { code: 'QUERY_ERROR', message: (error as Error).message },
    }, 500);
  }
});

/**
 * POST /v1/dashboard/trigger-crawl
 * 대시보드에서 수동 크롤링 실행
 */
app.post('/v1/dashboard/trigger-crawl', async (c) => {
  try {
    // 수동 트리거 실행
    await handleManualTriggers(c.env);
    return c.json({ success: true, message: '크롤링이 시작되었습니다' });
  } catch (error) {
    return c.json({
      success: false,
      error: { code: 'TRIGGER_ERROR', message: (error as Error).message },
    }, 500);
  }
});

/**
 * POST /v1/crawl-queue/add
 * 크롤링 큐에 병원 추가
 */
app.post('/v1/crawl-queue/add', async (c) => {
  try {
    const body = await c.req.json<{
      hospitalId: number;
      hospitalName: string;
      homepageUrl: string;
      priority?: number;
    }>();

    if (!body.hospitalId || !body.homepageUrl) {
      return c.json({ success: false, error: 'hospitalId, homepageUrl 필수' }, 400);
    }

    await c.env.DB.prepare(`
      INSERT OR REPLACE INTO crawl_queue (hospital_id, hospital_name, homepage_url, priority, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).bind(
      body.hospitalId,
      body.hospitalName,
      body.homepageUrl,
      body.priority || 5,
    ).run();

    return c.json({ success: true });
  } catch (error) {
    return c.json({
      success: false,
      error: { code: 'ADD_ERROR', message: (error as Error).message },
    }, 500);
  }
});

/**
 * GET /v1/crawl-queue
 * 크롤링 큐 조회
 */
app.get('/v1/crawl-queue', async (c) => {
  try {
    const status = c.req.query('status');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);

    let query = `SELECT * FROM crawl_queue`;
    const params: any[] = [];

    if (status) {
      query += ` WHERE status = ?`;
      params.push(status);
    }
    query += ` ORDER BY priority ASC, created_at ASC LIMIT ?`;
    params.push(limit);

    const results = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ success: true, data: results.results || [] });
  } catch (error) {
    return c.json({
      success: false,
      error: { code: 'QUERY_ERROR', message: (error as Error).message },
    }, 500);
  }
});

/**
 * GET /v1/crawl-batches
 * 크롤링 배치 이력
 */
app.get('/v1/crawl-batches', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
    const results = await c.env.DB.prepare(`
      SELECT * FROM crawl_batches ORDER BY started_at DESC LIMIT ?
    `).bind(limit).all();
    return c.json({ success: true, data: results.results || [] });
  } catch (error) {
    return c.json({
      success: false,
      error: { code: 'QUERY_ERROR', message: (error as Error).message },
    }, 500);
  }
});

/**
 * GET /v1/analysis-history/:hospitalId
 * 특정 병원의 분석 이력
 */
app.get('/v1/analysis-history/:hospitalId', async (c) => {
  try {
    const hospitalId = c.req.param('hospitalId');
    const results = await c.env.DB.prepare(`
      SELECT * FROM analysis_history 
      WHERE hospital_id = ? 
      ORDER BY analyzed_at DESC 
      LIMIT 20
    `).bind(hospitalId).all();
    return c.json({ success: true, data: results.results || [] });
  } catch (error) {
    return c.json({
      success: false,
      error: { code: 'QUERY_ERROR', message: (error as Error).message },
    }, 500);
  }
});

// ============================================
// 기존 API 라우트 마운트 (변경 없음)
// ============================================

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
app.route('/api/ocr', ocrPipelineRoutes);
app.route('/api/crawler', crawlerRoutes);
app.route('/v1/report', reportRoutes);
app.route('/v1/aeo', aeoRoutes);

// 병원별 스크린샷
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

// ============================================
// [핵심] Export - Cron Trigger 핸들러 등록
// ============================================

export default {
  // HTTP 요청 처리 (기존)
  fetch: app.fetch,

  // Cron Trigger 처리 (신규!)
  // wrangler.toml의 [triggers].crons에 설정된 시간에 자동 실행됩니다.
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // waitUntil로 비동기 작업이 완료될 때까지 Worker를 유지합니다
    ctx.waitUntil(handleScheduled(event, env));
  },
};
