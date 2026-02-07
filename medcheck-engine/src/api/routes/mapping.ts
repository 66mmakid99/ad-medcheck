import { Hono } from 'hono';
import type { AppBindings } from '../../types/env';
import { handleApiError } from '../../utils/error-handler';

const mappingRoutes = new Hono<AppBindings>();

// 매핑 후보 목록
mappingRoutes.get('/', async (c) => {
  try {
    const status = c.req.query('status') || 'pending_review';
    const results = await c.env.DB.prepare(`
      SELECT mc.*, p.name as suggested_procedure_name
      FROM mapping_candidates mc
      LEFT JOIN procedures p ON mc.suggested_procedure_id = p.id
      WHERE mc.status = ?
      ORDER BY mc.total_cases DESC, mc.text_similarity DESC
    `).bind(status).all();
    return c.json({ success: true, data: results.results });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 매핑 후보 상세
mappingRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const candidate = await c.env.DB.prepare(`
      SELECT mc.*, p.name as suggested_procedure_name, p.avg_price as procedure_avg_price
      FROM mapping_candidates mc
      LEFT JOIN procedures p ON mc.suggested_procedure_id = p.id
      WHERE mc.id = ?
    `).bind(id).first() as Record<string, unknown> | null;

    if (!candidate) return c.json({ success: false, error: 'Not found' }, 404);

    const relatedPrices = await c.env.DB.prepare(`
      SELECT pr.*, h.name as hospital_name
      FROM price_records_v2 pr
      LEFT JOIN hospitals h ON pr.hospital_id = h.id
      JOIN collected_procedure_names cpn ON pr.id = cpn.price_record_id
      WHERE cpn.raw_name = ?
      ORDER BY pr.collected_at DESC LIMIT 10
    `).bind(candidate.alias_name as string).all();

    return c.json({ success: true, data: { ...candidate, relatedPrices: relatedPrices.results } });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

export { mappingRoutes };
