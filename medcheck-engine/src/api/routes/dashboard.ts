/**
 * 대시보드 전용 API 라우트
 */
import { Hono } from 'hono';
import type { AppBindings } from '../../types/env';
import { handleManualTriggers } from '../../scheduled/crawler-handler';

export const dashboardRoutes = new Hono<AppBindings>();

/**
 * GET /summary
 */
dashboardRoutes.get('/summary', async (c) => {
  try {
    const db = c.env.DB;

    const todayStats = await db.prepare(`
      SELECT
        COUNT(*) as total_analyzed,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
        SUM(violation_count) as total_violations,
        ROUND(AVG(clean_score), 1) as avg_score
      FROM analysis_history
      WHERE analyzed_at >= date('now')
    `).first();

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

    const scheduler = await db.prepare(`
      SELECT * FROM crawler_scheduler_status WHERE id = 'singleton'
    `).first();

    const isOnline = scheduler?.is_online === 1 &&
      scheduler?.last_heartbeat &&
      (Date.now() - new Date(scheduler.last_heartbeat as string).getTime()) < 300000;

    const recentBatch = await db.prepare(`
      SELECT * FROM crawl_batches ORDER BY started_at DESC LIMIT 1
    `).first();

    const queueStats = await db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM crawl_queue
    `).first();

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
          mode: 'cloud',
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
 * GET /hospitals
 */
dashboardRoutes.get('/hospitals', async (c) => {
  try {
    const db = c.env.DB;
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
    const grade = c.req.query('grade');
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

    const countResult = await db.prepare(`
      SELECT COUNT(DISTINCT hospital_id) as total
      FROM analysis_history WHERE status = 'success'
    `).first();

    return c.json({
      success: true,
      data: {
        hospitals: results.results || [],
        pagination: {
          page, limit,
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
 * POST /trigger-crawl
 */
dashboardRoutes.post('/trigger-crawl', async (c) => {
  try {
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
 * GET /gemini-summary
 */
dashboardRoutes.get('/gemini-summary', async (c) => {
  try {
    const db = c.env.DB;

    const stats = await db.prepare(`
      SELECT
        COUNT(*) as total_hospitals,
        ROUND(AVG(clean_score), 1) as avg_clean_score,
        SUM(violation_count) as total_violations,
        SUM(gray_zone_count) as total_gray_zones,
        MAX(analyzed_at) as last_batch_at
      FROM gemini_analysis_results
      WHERE success = 1
    `).first();

    const grades = await db.prepare(`
      SELECT grade, COUNT(*) as count
      FROM gemini_analysis_results g
      INNER JOIN (
        SELECT url, MAX(analyzed_at) as latest
        FROM gemini_analysis_results WHERE success = 1
        GROUP BY url
      ) l ON g.url = l.url AND g.analyzed_at = l.latest
      WHERE g.success = 1
      GROUP BY grade
      ORDER BY CASE grade
        WHEN 'S' THEN 1 WHEN 'A' THEN 2 WHEN 'B' THEN 3
        WHEN 'C' THEN 4 WHEN 'D' THEN 5 WHEN 'F' THEN 6
        ELSE 7 END
    `).all();

    const gradeDistribution: Record<string, number> = {};
    for (const row of (grades.results || [])) {
      gradeDistribution[row.grade as string] = row.count as number;
    }

    const topCategories = await db.prepare(`
      SELECT json_extract(v.value, '$.category') as category,
             COUNT(*) as count
      FROM gemini_analysis_results g,
           json_each(g.violations_json) v
      WHERE g.success = 1
        AND json_extract(v.value, '$.category') IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
      LIMIT 10
    `).all();

    return c.json({
      success: true,
      data: {
        totalHospitals: stats?.total_hospitals || 0,
        gradeDistribution,
        avgCleanScore: stats?.avg_clean_score || 0,
        totalViolations: stats?.total_violations || 0,
        totalGrayZones: stats?.total_gray_zones || 0,
        lastBatchAt: stats?.last_batch_at || null,
        topViolationCategories: (topCategories.results || []).map((r: any) => ({
          category: r.category,
          count: r.count,
        })),
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
 * GET /gemini-hospitals
 */
dashboardRoutes.get('/gemini-hospitals', async (c) => {
  try {
    const db = c.env.DB;
    const sort = c.req.query('sort') || 'clean_score';
    const order = c.req.query('order') || 'asc';
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
    const page = parseInt(c.req.query('page') || '1');
    const gradeFilter = c.req.query('grade');
    const offset = (page - 1) * limit;

    const allowedSorts: Record<string, string> = {
      clean_score: 'g.clean_score',
      grade: "CASE g.grade WHEN 'S' THEN 1 WHEN 'A' THEN 2 WHEN 'B' THEN 3 WHEN 'C' THEN 4 WHEN 'D' THEN 5 WHEN 'F' THEN 6 ELSE 7 END",
      violation_count: 'g.violation_count',
      analyzed_at: 'g.analyzed_at',
      hospital_name: 'g.hospital_name',
    };
    const sortCol = allowedSorts[sort] || 'g.clean_score';
    const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    let whereClause = 'WHERE g.success = 1';
    const params: any[] = [];
    if (gradeFilter) {
      whereClause += ' AND g.grade = ?';
      params.push(gradeFilter);
    }

    const query = `
      SELECT g.id, g.hospital_name, g.url, g.grade, g.clean_score,
             g.violation_count, g.gray_zone_count, g.crawl_method,
             g.critical_count, g.major_count, g.minor_count,
             g.violations_json, g.analyzed_at, g.total_time_ms
      FROM gemini_analysis_results g
      INNER JOIN (
        SELECT url, MAX(analyzed_at) as latest
        FROM gemini_analysis_results WHERE success = 1
        GROUP BY url
      ) l ON g.url = l.url AND g.analyzed_at = l.latest
      ${whereClause}
      ORDER BY ${sortCol} ${sortOrder}
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const results = await db.prepare(query).bind(...params).all();

    const hospitals = (results.results || []).map((r: any) => {
      let topViolations: any[] = [];
      try {
        const violations = JSON.parse(r.violations_json || '[]');
        topViolations = violations.slice(0, 3).map((v: any) => ({
          patternId: v.patternId,
          category: v.category,
          severity: v.adjustedSeverity || v.severity,
          text: (v.originalText || '').substring(0, 80),
        }));
      } catch {}
      return {
        id: r.id, hospitalName: r.hospital_name, url: r.url,
        grade: r.grade, cleanScore: r.clean_score,
        violationCount: r.violation_count, grayZoneCount: r.gray_zone_count,
        crawlMethod: r.crawl_method,
        criticalCount: r.critical_count, majorCount: r.major_count, minorCount: r.minor_count,
        analyzedAt: r.analyzed_at, totalTimeMs: r.total_time_ms,
        topViolations,
      };
    });

    const countResult = await db.prepare(`
      SELECT COUNT(*) as total FROM (
        SELECT url FROM gemini_analysis_results
        WHERE success = 1 ${gradeFilter ? 'AND grade = ?' : ''}
        GROUP BY url
      )
    `).bind(...(gradeFilter ? [gradeFilter] : [])).first();

    return c.json({
      success: true,
      data: {
        hospitals,
        pagination: {
          page, limit,
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
 * GET /gemini-hospital/:id
 */
dashboardRoutes.get('/gemini-hospital/:id', async (c) => {
  try {
    const db = c.env.DB;
    const id = c.req.param('id');

    const result = await db.prepare(`
      SELECT * FROM gemini_analysis_results WHERE id = ?
    `).bind(id).first();

    if (!result) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: '분석 결과를 찾을 수 없습니다' } }, 404);
    }

    let violations = [];
    let grayZones = [];
    let mandatoryItems = {};
    let auditIssues = [];
    try { violations = JSON.parse(result.violations_json as string || '[]'); } catch {}
    try { grayZones = JSON.parse(result.gray_zones_json as string || '[]'); } catch {}
    try { mandatoryItems = JSON.parse(result.mandatory_items_json as string || '{}'); } catch {}
    try { auditIssues = JSON.parse(result.audit_issues_json as string || '[]'); } catch {}

    return c.json({
      success: true,
      data: {
        id: result.id, hospitalName: result.hospital_name, url: result.url,
        grade: result.grade, cleanScore: result.clean_score,
        violationCount: result.violation_count, grayZoneCount: result.gray_zone_count,
        criticalCount: result.critical_count, majorCount: result.major_count, minorCount: result.minor_count,
        crawlMethod: result.crawl_method, textLength: result.text_length,
        fetchTimeMs: result.fetch_time_ms, geminiTimeMs: result.gemini_time_ms,
        totalTimeMs: result.total_time_ms, analyzedAt: result.analyzed_at,
        violations, grayZones, mandatoryItems, auditIssues,
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
 * POST /gemini-import
 */
dashboardRoutes.post('/gemini-import', async (c) => {
  try {
    const db = c.env.DB;
    const body = await c.req.json<{ results: any[]; batchId?: string }>();

    if (!body.results || !Array.isArray(body.results)) {
      return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'results 배열 필수' } }, 400);
    }

    const batchId = body.batchId || new Date().toISOString();
    let imported = 0;
    let skipped = 0;

    for (const r of body.results) {
      if (!r.url) { skipped++; continue; }
      try {
        await db.prepare(`
          INSERT INTO gemini_analysis_results (
            hospital_name, url, success, crawl_method, text_length,
            grade, clean_score, violation_count, gray_zone_count,
            critical_count, major_count, minor_count,
            violations_json, gray_zones_json, mandatory_items_json, audit_issues_json,
            fetch_time_ms, gemini_time_ms, total_time_ms, error_message, batch_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          r.hospitalName || r.hospital_name || '', r.url,
          r.success ? 1 : 0, r.crawlMethod || r.crawl_method || 'unknown',
          r.textLength || r.text_length || 0, r.grade || '-',
          r.cleanScore ?? r.clean_score ?? 0, r.violationCount ?? r.violation_count ?? 0,
          r.grayZones ?? r.gray_zone_count ?? 0,
          r.criticalCount ?? r.critical_count ?? 0, r.majorCount ?? r.major_count ?? 0,
          r.minorCount ?? r.minor_count ?? 0,
          JSON.stringify(r.violations || []), JSON.stringify(r.grayZones_data || r.gray_zones || []),
          JSON.stringify(r.mandatoryItems || r.mandatory_items || {}),
          JSON.stringify(r.auditIssues || r.audit_issues || []),
          r.fetchTimeMs ?? r.fetch_time_ms ?? 0, r.geminiTimeMs ?? r.gemini_time_ms ?? 0,
          r.totalTimeMs ?? r.total_time_ms ?? 0, r.error || r.error_message || null,
          batchId,
        ).run();
        imported++;
      } catch (e) {
        console.error(`Import error for ${r.url}:`, (e as Error).message);
        skipped++;
      }
    }

    return c.json({ success: true, data: { imported, skipped, batchId } });
  } catch (error) {
    return c.json({
      success: false,
      error: { code: 'IMPORT_ERROR', message: (error as Error).message },
    }, 500);
  }
});

/**
 * POST /crawl-queue/add
 */
dashboardRoutes.post('/crawl-queue/add', async (c) => {
  try {
    const body = await c.req.json<{
      hospitalId: number; hospitalName: string; homepageUrl: string; priority?: number;
    }>();
    if (!body.hospitalId || !body.homepageUrl) {
      return c.json({ success: false, error: 'hospitalId, homepageUrl 필수' }, 400);
    }
    await c.env.DB.prepare(`
      INSERT OR REPLACE INTO crawl_queue (hospital_id, hospital_name, homepage_url, priority, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).bind(body.hospitalId, body.hospitalName, body.homepageUrl, body.priority || 5).run();
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: { code: 'ADD_ERROR', message: (error as Error).message } }, 500);
  }
});

/**
 * GET /crawl-queue
 */
dashboardRoutes.get('/crawl-queue', async (c) => {
  try {
    const status = c.req.query('status');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
    let query = `SELECT * FROM crawl_queue`;
    const params: any[] = [];
    if (status) { query += ` WHERE status = ?`; params.push(status); }
    query += ` ORDER BY priority ASC, created_at ASC LIMIT ?`;
    params.push(limit);
    const results = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ success: true, data: results.results || [] });
  } catch (error) {
    return c.json({ success: false, error: { code: 'QUERY_ERROR', message: (error as Error).message } }, 500);
  }
});

/**
 * GET /crawl-batches
 */
dashboardRoutes.get('/crawl-batches', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
    const results = await c.env.DB.prepare(`
      SELECT * FROM crawl_batches ORDER BY started_at DESC LIMIT ?
    `).bind(limit).all();
    return c.json({ success: true, data: results.results || [] });
  } catch (error) {
    return c.json({ success: false, error: { code: 'QUERY_ERROR', message: (error as Error).message } }, 500);
  }
});

/**
 * GET /analysis-history/:hospitalId
 */
dashboardRoutes.get('/analysis-history/:hospitalId', async (c) => {
  try {
    const hospitalId = c.req.param('hospitalId');
    const results = await c.env.DB.prepare(`
      SELECT * FROM analysis_history WHERE hospital_id = ? ORDER BY analyzed_at DESC LIMIT 20
    `).bind(hospitalId).all();
    return c.json({ success: true, data: results.results || [] });
  } catch (error) {
    return c.json({ success: false, error: { code: 'QUERY_ERROR', message: (error as Error).message } }, 500);
  }
});
