import { Hono } from 'hono';
import type { AppBindings } from '../../types/env';
import { handleApiError } from '../../utils/error-handler';

const analysisResultsRoutes = new Hono<AppBindings>();

// 분석결과 목록
analysisResultsRoutes.get('/', async (c) => {
  try {
    const crawlSessionId = c.req.query('crawlSessionId');
    const grade = c.req.query('grade');
    const status = c.req.query('status');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    let query = `
      SELECT har.*, ch.name as hospital_name, ch.address, ch.homepage_url
      FROM hospital_analysis_results har
      LEFT JOIN collected_hospitals ch ON har.hospital_id = ch.id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (crawlSessionId) { query += ' AND har.crawl_session_id = ?'; params.push(crawlSessionId); }
    if (grade) { query += ' AND har.grade = ?'; params.push(grade); }
    if (status) { query += ' AND har.status = ?'; params.push(status); }

    query += ' ORDER BY har.analyzed_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const results = await c.env.DB.prepare(query).bind(...params).all();

    const data = (results.results as Array<Record<string, unknown>>).map(r => ({
      ...r,
      violations: r.violations ? JSON.parse(r.violations as string) : []
    }));

    return c.json({ success: true, data, count: data.length });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 분석결과 통계
analysisResultsRoutes.get('/stats', async (c) => {
  try {
    const summary = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN grade = 'A' THEN 1 ELSE 0 END) as gradeA,
        SUM(CASE WHEN grade = 'B' THEN 1 ELSE 0 END) as gradeB,
        SUM(CASE WHEN grade = 'C' THEN 1 ELSE 0 END) as gradeC,
        SUM(CASE WHEN grade = 'D' THEN 1 ELSE 0 END) as gradeD,
        SUM(CASE WHEN violation_count > 0 THEN 1 ELSE 0 END) as violations,
        SUM(CASE WHEN violation_count = 0 THEN 1 ELSE 0 END) as clean,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
      FROM hospital_analysis_results
    `).first();

    const recentByDate = await c.env.DB.prepare(`
      SELECT DATE(analyzed_at) as date, COUNT(*) as count, SUM(violation_count) as violations
      FROM hospital_analysis_results
      WHERE analyzed_at > datetime('now', '-7 days')
      GROUP BY DATE(analyzed_at)
      ORDER BY date DESC
    `).all();

    return c.json({ success: true, data: { ...summary, recentByDate: recentByDate.results } });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 분석결과 상세
analysisResultsRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const result = await c.env.DB.prepare(`
      SELECT har.*, ch.name as hospital_name, ch.address, ch.phone, ch.homepage_url, ch.department
      FROM hospital_analysis_results har
      LEFT JOIN collected_hospitals ch ON har.hospital_id = ch.id
      WHERE har.id = ?
    `).bind(id).first() as Record<string, unknown> | null;

    if (!result) return c.json({ success: false, error: 'Not found' }, 404);

    const data = {
      ...result,
      violations: result.violations ? JSON.parse(result.violations as string) : []
    };

    const prices = await c.env.DB.prepare(`
      SELECT * FROM price_records_v2
      WHERE hospital_id = (SELECT hospital_id FROM hospital_analysis_results WHERE id = ?)
      ORDER BY collected_at DESC LIMIT 10
    `).bind(id).all();

    return c.json({ success: true, data: { ...data, prices: prices.results } });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 분석결과 저장 (파이프라인에서 호출)
analysisResultsRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { crawlSessionId, hospitalId, hospitalName, urlAnalyzed, grade, violationCount, summary, violations, status } = body;

    const id = `HAR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await c.env.DB.prepare(`
      INSERT INTO hospital_analysis_results
      (id, crawl_session_id, hospital_id, url_analyzed, grade, violation_count, summary, violations, status, analyzed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      id, crawlSessionId || null, hospitalId || null, urlAnalyzed || '',
      grade || '-', violationCount || 0, summary || '', JSON.stringify(violations || []),
      status || 'success'
    ).run();

    return c.json({ success: true, data: { id } });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

export { analysisResultsRoutes };
