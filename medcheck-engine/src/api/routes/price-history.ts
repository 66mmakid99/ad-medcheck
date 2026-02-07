import { Hono } from 'hono';
import type { AppBindings } from '../../types/env';
import { handleApiError } from '../../utils/error-handler';

const priceHistoryRoutes = new Hono<AppBindings>();

priceHistoryRoutes.get('/:hospitalId/:procedureId', async (c) => {
  try {
    const hospitalId = c.req.param('hospitalId');
    const procedureId = c.req.param('procedureId');
    const targetArea = c.req.query('targetArea');

    let query = `
      SELECT ph.*, ps.full_screenshot_url as screenshot_url
      FROM price_history ph
      LEFT JOIN price_screenshots ps ON ph.screenshot_id = ps.id
      WHERE ph.hospital_id = ? AND ph.procedure_id = ?
    `;
    const params: string[] = [hospitalId, procedureId];

    if (targetArea) { query += ' AND ph.target_area_code = ?'; params.push(targetArea); }

    query += ' ORDER BY ph.recorded_at DESC LIMIT 50';

    const results = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ success: true, data: results.results });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

export { priceHistoryRoutes };
