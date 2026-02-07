import { Hono } from 'hono';
import type { AppBindings } from '../../types/env';
import { handleApiError } from '../../utils/error-handler';

const priceAlertsRoutes = new Hono<AppBindings>();

// 알림 목록
priceAlertsRoutes.get('/', async (c) => {
  try {
    const subscriberId = c.req.query('subscriberId');
    const isRead = c.req.query('isRead');
    const limit = parseInt(c.req.query('limit') || '50');

    let query = `
      SELECT pa.*,
        p.name as procedure_name,
        h_comp.name as competitor_name,
        h_sub.name as subscriber_name
      FROM price_change_alerts pa
      LEFT JOIN procedures p ON pa.procedure_id = p.id
      LEFT JOIN hospitals h_comp ON pa.competitor_hospital_id = h_comp.id
      LEFT JOIN hospitals h_sub ON pa.subscriber_hospital_id = h_sub.id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (subscriberId) { query += ' AND pa.subscriber_hospital_id = ?'; params.push(subscriberId); }
    if (isRead === 'false') { query += ' AND pa.is_read = 0'; }

    query += ' ORDER BY pa.created_at DESC LIMIT ?';
    params.push(limit);

    const results = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ success: true, data: results.results });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 알림 상세 (스크린샷 비교 포함)
priceAlertsRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const alert = await c.env.DB.prepare(`
      SELECT pa.*,
        p.name as procedure_name,
        h_comp.name as competitor_name, h_comp.region as competitor_region,
        h_sub.name as subscriber_name,
        ta.name as target_area_name,
        ps_prev.full_screenshot_url as previous_screenshot_full_url,
        ps_prev.crop_areas as previous_crop_areas,
        ps_curr.full_screenshot_url as current_screenshot_full_url,
        ps_curr.crop_areas as current_crop_areas
      FROM price_change_alerts pa
      LEFT JOIN procedures p ON pa.procedure_id = p.id
      LEFT JOIN hospitals h_comp ON pa.competitor_hospital_id = h_comp.id
      LEFT JOIN hospitals h_sub ON pa.subscriber_hospital_id = h_sub.id
      LEFT JOIN target_areas ta ON pa.target_area_code = ta.code
      LEFT JOIN price_screenshots ps_prev ON pa.previous_screenshot_id = ps_prev.id
      LEFT JOIN price_screenshots ps_curr ON pa.current_screenshot_id = ps_curr.id
      WHERE pa.id = ?
    `).bind(id).first();

    if (!alert) return c.json({ success: false, error: 'Not found' }, 404);

    await c.env.DB.prepare(`UPDATE price_change_alerts SET is_read = 1, read_at = datetime('now') WHERE id = ?`).bind(id).run();

    return c.json({ success: true, data: alert });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 알림 읽음 처리 (벌크)
priceAlertsRoutes.post('/mark-read', async (c) => {
  try {
    const body = await c.req.json();
    const { ids, subscriberId, all } = body;

    if (all && subscriberId) {
      await c.env.DB.prepare(`
        UPDATE price_change_alerts SET is_read = 1, read_at = datetime('now')
        WHERE subscriber_hospital_id = ? AND is_read = 0
      `).bind(subscriberId).run();
    } else if (ids && ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      await c.env.DB.prepare(`
        UPDATE price_change_alerts SET is_read = 1, read_at = datetime('now')
        WHERE id IN (${placeholders})
      `).bind(...ids).run();
    }

    return c.json({ success: true });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

export { priceAlertsRoutes };
