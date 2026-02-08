import { Hono } from 'hono';
import type { AppBindings } from '../../types/env';
import { handleApiError } from '../../utils/error-handler';

const crawlRoutes = new Hono<AppBindings>();

// 크롤링 상태 업데이트 (크롤러에서 호출)
crawlRoutes.post('/crawl-status', async (c) => {
  try {
    const body = await c.req.json();
    const { jobId, jobType, status, progress, total, found, failed, currentItem, startedAt, message, violationsFound, recentLogs } = body;

    if (!jobId) return c.json({ success: false, error: 'jobId required' }, 400);

    const recentLogsJson = recentLogs ? JSON.stringify(recentLogs) : null;

    await c.env.DB.prepare(`
      INSERT INTO crawl_jobs (id, job_type, status, progress, total, found, failed, current_item, started_at, updated_at, message, violations_found, recent_logs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        progress = excluded.progress,
        total = excluded.total,
        found = excluded.found,
        failed = excluded.failed,
        current_item = excluded.current_item,
        updated_at = datetime('now'),
        message = excluded.message,
        violations_found = excluded.violations_found,
        recent_logs = excluded.recent_logs
    `).bind(jobId, jobType || 'unknown', status || 'running', progress || 0, total || 0, found || 0, failed || 0, currentItem || null, startedAt || new Date().toISOString(), message || null, violationsFound || 0, recentLogsJson).run();

    return c.json({ success: true });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 크롤링 상태 조회 (대시보드에서 호출)
crawlRoutes.get('/crawl-status', async (c) => {
  try {
    const jobId = c.req.query('jobId');
    const status = c.req.query('status');

    let query = `SELECT * FROM crawl_jobs WHERE 1=1`;
    const params: string[] = [];

    if (jobId) { query += ' AND id = ?'; params.push(jobId); }
    if (status) { query += ' AND status = ?'; params.push(status); }

    query += ' ORDER BY updated_at DESC LIMIT 20';

    const results = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ success: true, data: results.results });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 최근 활성 크롤링 작업
crawlRoutes.get('/crawl-status/active', async (c) => {
  try {
    const results = await c.env.DB.prepare(`
      SELECT * FROM crawl_jobs
      WHERE status IN ('running', 'paused')
        OR (status = 'completed' AND updated_at > datetime('now', '-1 hour'))
      ORDER BY updated_at DESC LIMIT 10
    `).all();
    return c.json({ success: true, data: results.results });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// POST - 새 세션 생성
crawlRoutes.post('/crawl-sessions', async (c) => {
  try {
    const { sessionType, targetSido, targetRegion, filterConditions } = await c.req.json();
    const sessionId = `CS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const filterConditionsJson = filterConditions ? JSON.stringify(filterConditions) : null;

    await c.env.DB.prepare(`
      INSERT INTO crawl_sessions (id, session_type, target_sido, target_region, filter_conditions, started_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).bind(sessionId, sessionType, targetSido, targetRegion || '', filterConditionsJson).run();

    return c.json({ success: true, data: { sessionId } });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// GET - 세션 목록 조회
crawlRoutes.get('/crawl-sessions', async (c) => {
  try {
    const status = c.req.query('status');
    const sessionType = c.req.query('sessionType');

    let query = 'SELECT * FROM crawl_sessions WHERE 1=1';
    const params: string[] = [];

    if (status) { query += ' AND status = ?'; params.push(status); }
    if (sessionType) { query += ' AND session_type = ?'; params.push(sessionType); }

    query += ' ORDER BY created_at DESC LIMIT 50';
    const results = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ success: true, data: results.results });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// PUT - 세션 완료
crawlRoutes.put('/crawl-sessions/:sessionId', async (c) => {
  try {
    const sessionId = c.req.param('sessionId');
    const { status, message, outputFile } = await c.req.json();

    await c.env.DB.prepare(`
      UPDATE crawl_sessions
      SET status = ?, completed_at = datetime('now'), message = ?, output_file_path = ?
      WHERE id = ?
    `).bind(status || 'completed', message, outputFile, sessionId).run();

    return c.json({ success: true });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

export { crawlRoutes };
