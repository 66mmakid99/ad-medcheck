import { Hono } from 'hono';
import type { AppBindings } from '../../types/env';
import { handleApiError } from '../../utils/error-handler';
import { violationDetector } from '../../modules/violation-detector';

const hospitalRoutes = new Hono<AppBindings>();

// POST - 병원 데이터 일괄 저장
hospitalRoutes.post('/collected-hospitals', async (c) => {
  try {
    const { crawlSessionId, hospitals } = await c.req.json();

    for (const hospital of hospitals) {
      await c.env.DB.prepare(`
        INSERT INTO collected_hospitals
        (crawl_session_id, name, address, phone, homepage_url, sido, region,
         department, category, filtering_status, source, crawl_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crawlSessionId, hospital.name, hospital.address, hospital.phone, hospital.homepage_url,
        hospital.sido, hospital.region, hospital.department, hospital.category,
        hospital.filtering_status, hospital.source || 'public_api', hospital.crawl_order || 0
      ).run();
    }

    return c.json({ success: true, count: hospitals.length });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// GET - 병원 목록 조회
hospitalRoutes.get('/collected-hospitals', async (c) => {
  try {
    const crawlSessionId = c.req.query('crawlSessionId');
    const status = c.req.query('status');
    const hasUrl = c.req.query('hasUrl');
    const category = c.req.query('category');
    const region = c.req.query('region');
    const limit = parseInt(c.req.query('limit') || '100');
    const offset = parseInt(c.req.query('offset') || '0');

    let query = 'SELECT * FROM collected_hospitals WHERE 1=1';
    const params: (string | number)[] = [];

    if (crawlSessionId) { query += ' AND crawl_session_id = ?'; params.push(crawlSessionId); }
    if (status) { query += ' AND filtering_status = ?'; params.push(status); }
    if (hasUrl === 'true') { query += ' AND homepage_url IS NOT NULL'; }
    if (category) { query += ' AND category = ?'; params.push(category); }
    if (region) { query += ' AND region LIKE ?'; params.push(`%${region}%`); }

    query += ' ORDER BY crawl_order ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const results = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ success: true, data: results.results, offset, limit });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// POST /v1/analyze-url - URL 기반 텍스트 분석
hospitalRoutes.post('/analyze-url', async (c) => {
  try {
    const { url, hospitalId, hospitalName } = await c.req.json();

    if (!url) {
      return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'url 필드는 필수입니다.' } }, 400);
    }

    // URL 정규화: http(s):// 없으면 자동 추가
    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'http://' + targetUrl;
    }

    const startTime = Date.now();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let htmlResponse: Response;
    try {
      htmlResponse = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
        },
        signal: controller.signal,
      });
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      const msg = fetchError instanceof Error && fetchError.name === 'AbortError'
        ? 'URL 접근 타임아웃 (30초 초과)'
        : `URL 접근 실패: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`;
      return c.json({ success: false, error: { code: 'FETCH_ERROR', message: msg } }, 400);
    }
    clearTimeout(timeoutId);

    if (!htmlResponse.ok) {
      return c.json({ success: false, error: { code: 'FETCH_ERROR', message: `URL 접근 실패: ${htmlResponse.status}` } }, 400);
    }

    const html = await htmlResponse.text();

    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 50000);

    if (textContent.length < 10) {
      return c.json({ success: false, error: { code: 'EMPTY_CONTENT', message: '분석할 텍스트가 부족합니다.' } }, 400);
    }

    const result = violationDetector.analyze({ text: textContent });

    return c.json({
      success: true,
      data: {
        analysisId: result.id,
        url: targetUrl,
        hospitalId,
        hospitalName,
        inputLength: textContent.length,
        violationCount: result.judgment.violations.length,
        violations: result.judgment.violations,
        score: result.judgment.score,
        grade: result.judgment.score.grade,
        gradeDescription: result.judgment.score.gradeDescription,
        summary: result.judgment.summary,
        recommendations: result.judgment.recommendations,
        processingTimeMs: Date.now() - startTime,
        analyzedAt: result.judgment.analyzedAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    return c.json({ success: false, error: { code: 'ANALYSIS_ERROR', message: error instanceof Error ? error.message : String(error) } }, 500);
  }
});

// POST - 병원 배치 분석
hospitalRoutes.post('/collected-hospitals/analyze', async (c) => {
  try {
    const { crawlSessionId, hospitalIds, enableAI } = await c.req.json();

    const hospitals = await c.env.DB.prepare(`
      SELECT * FROM collected_hospitals
      WHERE id IN (${hospitalIds.map(() => '?').join(',')}) AND homepage_url IS NOT NULL
    `).bind(...hospitalIds).all();

    const results = [];

    for (const hospital of hospitals.results as Array<Record<string, unknown>>) {
      const res = await fetch('https://medcheck-engine.mmakid.workers.dev/v1/analyze-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: hospital.homepage_url, enableAI })
      });
      const data = await res.json() as Record<string, unknown>;
      const dataInner = data.data as Record<string, unknown> | undefined;

      await c.env.DB.prepare(`
        INSERT INTO hospital_analysis_results
        (crawl_session_id, hospital_id, url_analyzed, grade, violation_count, summary, violations, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crawlSessionId, hospital.id, hospital.homepage_url,
        dataInner?.grade || '-', dataInner?.violationCount || 0,
        dataInner?.summary || '', JSON.stringify(dataInner?.violations || []),
        data.success ? 'success' : 'error'
      ).run();

      results.push({ hospitalId: hospital.id, ...dataInner });
    }

    return c.json({ success: true, data: results });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

export { hospitalRoutes };
