import { Hono } from 'hono';
import type { AppBindings } from '../../types/env';
import { handleApiError } from '../../utils/error-handler';

const crawlerRoutes = new Hono<AppBindings>();

// ============================================
// GET /status - 크롤러 종합 상태
// ============================================
crawlerRoutes.get('/status', async (c) => {
  try {
    const db = c.env.DB;

    // 스케줄러 상태
    const scheduler = await db.prepare(
      `SELECT * FROM crawler_scheduler_status WHERE id = 'singleton'`
    ).first();

    const isOnline = scheduler?.is_online === 1 &&
      scheduler?.last_heartbeat &&
      (Date.now() - new Date(scheduler.last_heartbeat as string).getTime()) < 120000;

    // 마지막 크롤링
    const lastCrawl = await db.prepare(
      `SELECT * FROM crawl_logs ORDER BY started_at DESC LIMIT 1`
    ).first();

    // 오늘 요약
    const todaySummary = await db.prepare(`
      SELECT
        COUNT(*) as runs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(hospitals_analyzed) as totalHospitals,
        SUM(violations_found) as totalViolations
      FROM crawl_logs
      WHERE started_at >= date('now')
    `).first();

    // 최근 로그 5건
    const recentLogs = await db.prepare(
      `SELECT * FROM crawl_logs ORDER BY started_at DESC LIMIT 5`
    ).all();

    // 대기 트리거 수
    const pendingTriggers = await db.prepare(
      `SELECT COUNT(*) as count FROM crawler_triggers WHERE status = 'pending'`
    ).first();

    return c.json({
      success: true,
      data: {
        schedulerOnline: isOnline,
        lastHeartbeat: scheduler?.last_heartbeat || null,
        schedulerInfo: scheduler ? {
          pid: scheduler.pid,
          schedules: scheduler.schedules ? JSON.parse(scheduler.schedules as string) : null,
          runningJobs: scheduler.running_jobs,
          queuedJobs: scheduler.queued_jobs,
          nextScheduledRun: scheduler.next_scheduled_run,
        } : null,
        lastCrawl: lastCrawl || null,
        todaySummary: {
          runs: todaySummary?.runs || 0,
          completed: todaySummary?.completed || 0,
          failed: todaySummary?.failed || 0,
          totalHospitals: todaySummary?.totalHospitals || 0,
          totalViolations: todaySummary?.totalViolations || 0,
        },
        pendingTriggers: pendingTriggers?.count || 0,
        recentLogs: recentLogs.results,
      }
    });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// ============================================
// POST /trigger - 수동 크롤링 트리거
// ============================================
crawlerRoutes.post('/trigger', async (c) => {
  try {
    const body = await c.req.json();
    const { region = '서울', enableAi = false } = body;

    const id = `TRG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    await c.env.DB.prepare(`
      INSERT INTO crawler_triggers (id, region, enable_ai, status, requested_by, requested_at)
      VALUES (?, ?, ?, 'pending', 'dashboard', datetime('now'))
    `).bind(id, region, enableAi ? 1 : 0).run();

    return c.json({ success: true, data: { id, region, enableAi, status: 'pending' } });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// ============================================
// GET /triggers - 대기 트리거 목록 (스케줄러 폴링)
// ============================================
crawlerRoutes.get('/triggers', async (c) => {
  try {
    const status = c.req.query('status') || 'pending';
    const results = await c.env.DB.prepare(
      `SELECT * FROM crawler_triggers WHERE status = ? ORDER BY requested_at ASC LIMIT 10`
    ).bind(status).all();

    return c.json({ success: true, data: results.results });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// ============================================
// POST /triggers/:id/ack - 트리거 수락
// ============================================
crawlerRoutes.post('/triggers/:id/ack', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { jobId } = body;

    await c.env.DB.prepare(`
      UPDATE crawler_triggers
      SET status = 'acknowledged', acknowledged_at = datetime('now'), job_id = ?
      WHERE id = ? AND status = 'pending'
    `).bind(jobId || null, id).run();

    return c.json({ success: true });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// ============================================
// POST /triggers/:id/complete - 트리거 완료/실패
// ============================================
crawlerRoutes.post('/triggers/:id/complete', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { status = 'completed', result } = body;

    await c.env.DB.prepare(`
      UPDATE crawler_triggers
      SET status = ?, completed_at = datetime('now'), result = ?
      WHERE id = ?
    `).bind(status, result ? JSON.stringify(result) : null, id).run();

    return c.json({ success: true });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// ============================================
// POST /shutdown - 스케줄러 종료 요청
// ============================================
crawlerRoutes.post('/shutdown', async (c) => {
  try {
    const id = `TRG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    await c.env.DB.prepare(`
      INSERT INTO crawler_triggers (id, region, enable_ai, status, requested_by, requested_at)
      VALUES (?, '__SHUTDOWN__', 0, 'pending', 'dashboard', datetime('now'))
    `).bind(id).run();

    return c.json({ success: true, data: { id, message: '스케줄러 종료 요청 전송됨 (최대 30초 후 반영)' } });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// ============================================
// POST /triggers/:id/cancel - 대기 트리거 취소
// ============================================
crawlerRoutes.post('/triggers/:id/cancel', async (c) => {
  try {
    const id = c.req.param('id');

    const result = await c.env.DB.prepare(`
      UPDATE crawler_triggers
      SET status = 'cancelled', completed_at = datetime('now')
      WHERE id = ? AND status = 'pending'
    `).bind(id).run();

    return c.json({ success: true, data: { cancelled: result.meta.changes > 0 } });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// ============================================
// POST /log - 크롤링 로그 기록
// ============================================
crawlerRoutes.post('/log', async (c) => {
  try {
    const body = await c.req.json();
    const {
      id, jobId, type = 'scheduled', region, status = 'running',
      startedAt, completedAt, durationSeconds,
      hospitalsTotal, hospitalsAnalyzed, violationsFound,
      errorCount, errorDetails, triggerId
    } = body;

    const logId = id || `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    await c.env.DB.prepare(`
      INSERT INTO crawl_logs (id, job_id, type, region, status, started_at, completed_at, duration_seconds,
        hospitals_total, hospitals_analyzed, violations_found, error_count, error_details, trigger_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        completed_at = excluded.completed_at,
        duration_seconds = excluded.duration_seconds,
        hospitals_total = excluded.hospitals_total,
        hospitals_analyzed = excluded.hospitals_analyzed,
        violations_found = excluded.violations_found,
        error_count = excluded.error_count,
        error_details = excluded.error_details
    `).bind(
      logId, jobId, type, region || null, status,
      startedAt || new Date().toISOString(), completedAt || null, durationSeconds || null,
      hospitalsTotal || 0, hospitalsAnalyzed || 0, violationsFound || 0,
      errorCount || 0, errorDetails || null, triggerId || null
    ).run();

    return c.json({ success: true, data: { id: logId } });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// ============================================
// GET /logs - 크롤링 로그 목록
// ============================================
crawlerRoutes.get('/logs', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
    const results = await c.env.DB.prepare(
      `SELECT * FROM crawl_logs ORDER BY started_at DESC LIMIT ?`
    ).bind(limit).all();

    return c.json({ success: true, data: results.results });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// ============================================
// POST /heartbeat - 스케줄러 하트비트
// ============================================
crawlerRoutes.post('/heartbeat', async (c) => {
  try {
    const body = await c.req.json();
    const { pid, schedules, runningJobs = 0, queuedJobs = 0, nextScheduledRun, isOnline } = body;

    // isOnline이 명시적으로 false면 오프라인, 그 외엔 온라인
    const online = isOnline === false ? 0 : 1;

    await c.env.DB.prepare(`
      UPDATE crawler_scheduler_status
      SET pid = ?, is_online = ?, schedules = ?, running_jobs = ?, queued_jobs = ?,
          next_scheduled_run = ?, last_heartbeat = datetime('now')
      WHERE id = 'singleton'
    `).bind(
      pid || null, online,
      schedules ? JSON.stringify(schedules) : null,
      runningJobs, queuedJobs,
      nextScheduledRun || null
    ).run();

    return c.json({ success: true });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

export { crawlerRoutes };
