import { Hono } from 'hono';
import type { AppBindings } from '../../types/env';
import { handleApiError } from '../../utils/error-handler';
import {
  resolveProcedureMapping,
  resolveHospital,
  calculateCompleteness,
  updateProcedureStats,
  checkPriceChangeAndAlert,
} from '../../utils/helpers';

const pricingRoutes = new Hono<AppBindings>();

// 시술 목록
pricingRoutes.get('/procedures', async (c) => {
  try {
    const category = c.req.query('category');
    const subcategory = c.req.query('subcategory');
    const hasPrice = c.req.query('hasPrice');

    let query = 'SELECT * FROM procedures WHERE 1=1';
    const params: string[] = [];

    if (category) { query += ' AND category = ?'; params.push(category); }
    if (subcategory) { query += ' AND subcategory = ?'; params.push(subcategory); }
    if (hasPrice === 'true') { query += ' AND price_count > 0'; }

    query += ' ORDER BY category, subcategory, name';
    const results = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ success: true, data: results.results, count: results.results.length });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 시술 상세 (부위별 가격 포함)
pricingRoutes.get('/procedures/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const proc = await c.env.DB.prepare(`SELECT * FROM procedures WHERE id = ?`).bind(id).first();
    if (!proc) return c.json({ success: false, error: 'Not found' }, 404);

    const pricesByArea = await c.env.DB.prepare(`
      SELECT target_area_code, ta.name as target_area_name,
        COUNT(*) as record_count,
        AVG(price) as avg_price,
        MIN(price) as min_price,
        MAX(price) as max_price,
        AVG(shot_count) as avg_shots,
        AVG(price_per_shot) as avg_price_per_shot
      FROM price_records_v2 pr
      LEFT JOIN target_areas ta ON pr.target_area_code = ta.code
      WHERE pr.procedure_id = ?
      GROUP BY target_area_code
      ORDER BY ta.display_order
    `).bind(id).all();

    const recentPrices = await c.env.DB.prepare(`
      SELECT pr.*, h.name as hospital_name, h.region,
        ps.full_screenshot_url as screenshot_url
      FROM price_records_v2 pr
      LEFT JOIN hospitals h ON pr.hospital_id = h.id
      LEFT JOIN price_screenshots ps ON pr.screenshot_id = ps.id
      WHERE pr.procedure_id = ?
      ORDER BY pr.collected_at DESC LIMIT 20
    `).bind(id).all();

    const aliases = await c.env.DB.prepare(`
      SELECT * FROM procedure_aliases WHERE procedure_id = ? AND is_verified = 1
    `).bind(id).all();

    return c.json({
      success: true,
      data: {
        ...proc,
        pricesByArea: pricesByArea.results,
        recentPrices: recentPrices.results,
        aliases: aliases.results
      }
    });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 부위 목록
pricingRoutes.get('/target-areas', async (c) => {
  try {
    const category = c.req.query('category');
    let query = 'SELECT * FROM target_areas WHERE 1=1';
    const params: string[] = [];
    if (category) { query += ' AND category = ?'; params.push(category); }
    query += ' ORDER BY display_order';
    const results = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ success: true, data: results.results });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 가격 통계 (v2)
pricingRoutes.get('/prices/stats', async (c) => {
  try {
    const summary = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_records,
        COUNT(DISTINCT procedure_id) as procedures_with_price,
        COUNT(DISTINCT hospital_id) as hospitals,
        AVG(price) as overall_avg,
        AVG(completeness_score) as avg_completeness,
        SUM(CASE WHEN screenshot_id IS NOT NULL THEN 1 ELSE 0 END) as with_screenshot
      FROM price_records_v2
    `).first();

    const byArea = await c.env.DB.prepare(`
      SELECT target_area_code, ta.name as area_name,
        COUNT(*) as count, AVG(price) as avg_price, AVG(price_per_shot) as avg_per_shot
      FROM price_records_v2 pr
      LEFT JOIN target_areas ta ON pr.target_area_code = ta.code
      GROUP BY target_area_code
      ORDER BY count DESC
    `).all();

    const byCompleteness = await c.env.DB.prepare(`
      SELECT
        CASE
          WHEN completeness_score >= 80 THEN 'complete'
          WHEN completeness_score >= 50 THEN 'partial'
          ELSE 'incomplete'
        END as level,
        COUNT(*) as count
      FROM price_records_v2
      GROUP BY level
    `).all();

    const pendingMappings = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM mapping_candidates WHERE status = 'pending_review'
    `).first() as Record<string, unknown> | null;

    return c.json({
      success: true,
      data: { summary, byArea: byArea.results, byCompleteness: byCompleteness.results, pendingMappings: pendingMappings?.count || 0 }
    });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 가격 등록 (v2 - 자동 매핑 + 스크린샷)
pricingRoutes.post('/prices', async (c) => {
  try {
    const body = await c.req.json();
    const {
      procedureId, procedureName, category, subcategory,
      hospitalId, hospitalName, hospitalDomain, hospitalRegion,
      price, originalText,
      targetAreaCode, targetAreaDetail,
      shotCount, volumeCc, cartridgeType, sessionCount,
      sourceUrl, sourceType,
      screenshotId, ocrRawText, ocrConfidence,
      isEvent, eventName, eventEndDate,
      includesAnesthesia, includesFollowup, includesItems
    } = body;

    if (!price) return c.json({ success: false, error: 'price is required' }, 400);
    if (!procedureId && !procedureName) return c.json({ success: false, error: 'procedureId or procedureName required' }, 400);

    const mapping = await resolveProcedureMapping(c.env.DB, { procedureId, procedureName, category, subcategory, price });
    const hospitalResult = await resolveHospital(c.env.DB, { hospitalId, hospitalName, hospitalDomain, hospitalRegion, sourceUrl });

    const areaCode = targetAreaCode || 'UNKNOWN';
    const pricePerShot = shotCount ? Math.round(price / shotCount) : null;
    const pricePerCc = volumeCc ? Math.round(price / volumeCc) : null;
    const pricePerSession = sessionCount ? Math.round(price / sessionCount) : null;

    const { score, missingFields } = calculateCompleteness({
      price, targetAreaCode, shotCount, screenshotId, isEvent, includesItems
    });

    const priceId = `PR-${Date.now()}`;
    await c.env.DB.prepare(`
      INSERT INTO price_records_v2
      (id, procedure_id, hospital_id, price, price_type, original_text,
       target_area_code, target_area_detail, shot_count, volume_cc, cartridge_type, session_count,
       price_per_shot, price_per_cc, price_per_session,
       source_url, screenshot_id, ocr_raw_text, ocr_confidence,
       is_event, event_name, event_end_date,
       includes_anesthesia, includes_followup, includes_items,
       completeness_score, missing_fields, source_type)
      VALUES (?, ?, ?, ?, 'fixed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      priceId, mapping.procedureId, hospitalResult.hospitalId, price, originalText || null,
      areaCode, targetAreaDetail || null, shotCount || null, volumeCc || null, cartridgeType || null, sessionCount || 1,
      pricePerShot, pricePerCc, pricePerSession,
      sourceUrl || null, screenshotId || null, ocrRawText || null, ocrConfidence || null,
      isEvent ? 1 : 0, eventName || null, eventEndDate || null,
      includesAnesthesia ? 1 : null, includesFollowup ? 1 : null, includesItems ? JSON.stringify(includesItems) : null,
      score, JSON.stringify(missingFields), sourceType || 'crawl'
    ).run();

    if (mapping.procedureId && !mapping.isCandidate) {
      await updateProcedureStats(c.env.DB, mapping.procedureId);
    }

    if (hospitalResult.hospitalId) {
      await c.env.DB.prepare(`
        UPDATE hospitals SET total_prices = total_prices + 1, last_crawled = datetime('now') WHERE id = ?
      `).bind(hospitalResult.hospitalId).run();
    }

    if (hospitalResult.hospitalId && mapping.procedureId) {
      await checkPriceChangeAndAlert(c.env.DB, {
        hospitalId: hospitalResult.hospitalId,
        procedureId: mapping.procedureId,
        targetAreaCode: areaCode,
        newPrice: price,
        shotCount,
        pricePerShot,
        screenshotId
      });
    }

    return c.json({
      success: true,
      data: {
        priceId,
        procedureId: mapping.procedureId,
        hospitalId: hospitalResult.hospitalId,
        mapping: {
          method: mapping.method,
          isNewProcedure: mapping.isNew,
          isCandidate: mapping.isCandidate,
          confidence: mapping.confidence
        },
        completeness: { score, missingFields }
      }
    });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 가격 목록 (v2)
pricingRoutes.get('/prices', async (c) => {
  try {
    const procedureId = c.req.query('procedureId');
    const hospitalId = c.req.query('hospitalId');
    const targetArea = c.req.query('targetArea');
    const minCompleteness = c.req.query('minCompleteness');
    const limit = parseInt(c.req.query('limit') || '50');

    let query = `
      SELECT pr.*, p.name as procedure_name, p.category,
        h.name as hospital_name, h.region,
        ta.name as target_area_name,
        ps.full_screenshot_url as screenshot_url
      FROM price_records_v2 pr
      LEFT JOIN procedures p ON pr.procedure_id = p.id
      LEFT JOIN hospitals h ON pr.hospital_id = h.id
      LEFT JOIN target_areas ta ON pr.target_area_code = ta.code
      LEFT JOIN price_screenshots ps ON pr.screenshot_id = ps.id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (procedureId) { query += ' AND pr.procedure_id = ?'; params.push(procedureId); }
    if (hospitalId) { query += ' AND pr.hospital_id = ?'; params.push(hospitalId); }
    if (targetArea) { query += ' AND pr.target_area_code = ?'; params.push(targetArea); }
    if (minCompleteness) { query += ' AND pr.completeness_score >= ?'; params.push(parseInt(minCompleteness)); }

    query += ' ORDER BY pr.collected_at DESC LIMIT ?';
    params.push(limit);

    const results = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ success: true, data: results.results });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 가격 비교 (부위별 + 샷당 단가)
pricingRoutes.get('/prices/compare/:procedureId', async (c) => {
  try {
    const procedureId = c.req.param('procedureId');
    const targetArea = c.req.query('targetArea');
    const region = c.req.query('region');

    let query = `
      SELECT pr.*, h.name as hospital_name, h.region,
        ps.full_screenshot_url as screenshot_url
      FROM price_records_v2 pr
      JOIN hospitals h ON pr.hospital_id = h.id
      LEFT JOIN price_screenshots ps ON pr.screenshot_id = ps.id
      WHERE pr.procedure_id = ?
    `;
    const params: string[] = [procedureId];

    if (targetArea) { query += ' AND pr.target_area_code = ?'; params.push(targetArea); }
    if (region) { query += ' AND h.region LIKE ?'; params.push(`%${region}%`); }

    query += ' ORDER BY pr.price_per_shot ASC NULLS LAST, pr.price ASC';

    const results = await c.env.DB.prepare(query).bind(...params).all();

    const prices = results.results as Array<Record<string, unknown>>;
    const withShots = prices.filter(p => p.price_per_shot);

    const stats = prices.length > 0 ? {
      totalRecords: prices.length,
      priceRange: { min: Math.min(...prices.map(p => p.price as number)), max: Math.max(...prices.map(p => p.price as number)) },
      priceAvg: Math.round(prices.reduce((a, b) => a + (b.price as number), 0) / prices.length),
      shotPriceRange: withShots.length > 0 ? {
        min: Math.min(...withShots.map(p => p.price_per_shot as number)),
        max: Math.max(...withShots.map(p => p.price_per_shot as number)),
        avg: Math.round(withShots.reduce((a, b) => a + (b.price_per_shot as number), 0) / withShots.length)
      } : null,
      withScreenshot: prices.filter(p => p.screenshot_url).length
    } : null;

    return c.json({ success: true, data: { hospitals: results.results, stats } });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

export { pricingRoutes };
