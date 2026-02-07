import { Hono } from 'hono';
import type { AppBindings } from '../../types/env';
import { handleApiError } from '../../utils/error-handler';

const competitorRoutes = new Hono<AppBindings>();

// 설정 조회
competitorRoutes.get('/:hospitalId', async (c) => {
  try {
    const hospitalId = c.req.param('hospitalId');
    let settings = await c.env.DB.prepare(`
      SELECT * FROM competitor_settings WHERE hospital_id = ?
    `).bind(hospitalId).first() as Record<string, unknown> | null;

    if (!settings) {
      settings = { hospital_id: hospitalId, auto_detect: 1, same_region: 1, same_category: 1, max_competitors: 10 };
    }

    const myHospital = await c.env.DB.prepare(`SELECT * FROM hospitals WHERE id = ?`).bind(hospitalId).first() as Record<string, unknown> | null;

    let competitors: unknown[] = [];
    if (settings.competitor_ids) {
      const ids = JSON.parse(settings.competitor_ids as string);
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        const result = await c.env.DB.prepare(`SELECT * FROM hospitals WHERE id IN (${placeholders})`).bind(...ids).all();
        competitors = result.results;
      }
    } else if (settings.auto_detect && myHospital) {
      const result = await c.env.DB.prepare(`
        SELECT * FROM hospitals
        WHERE id != ? AND region = ? AND category = ?
        ORDER BY total_prices DESC
        LIMIT ?
      `).bind(hospitalId, myHospital.region, myHospital.category, (settings.max_competitors as number) || 10).all();
      competitors = result.results;
    }

    return c.json({ success: true, data: { settings, competitors } });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 설정 저장
competitorRoutes.post('/:hospitalId', async (c) => {
  try {
    const hospitalId = c.req.param('hospitalId');
    const body = await c.req.json();
    const { competitorIds, autoDetect, sameRegion, sameCategory, maxCompetitors, region, category } = body;

    await c.env.DB.prepare(`
      INSERT INTO competitor_settings (id, hospital_id, competitor_ids, auto_detect, same_region, same_category, max_competitors, region, category, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(hospital_id) DO UPDATE SET
        competitor_ids = excluded.competitor_ids,
        auto_detect = excluded.auto_detect,
        same_region = excluded.same_region,
        same_category = excluded.same_category,
        max_competitors = excluded.max_competitors,
        region = excluded.region,
        category = excluded.category,
        updated_at = datetime('now')
    `).bind(
      `CS-${hospitalId}`, hospitalId,
      competitorIds ? JSON.stringify(competitorIds) : null,
      autoDetect ? 1 : 0, sameRegion ? 1 : 0, sameCategory ? 1 : 0,
      maxCompetitors || 10, region || null, category || null
    ).run();

    return c.json({ success: true });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

export { competitorRoutes };
