import { Hono } from 'hono';
import type { AppBindings } from '../../types/env';
import { handleApiError } from '../../utils/error-handler';

const exceptionCandidatesRoutes = new Hono<AppBindings>();

// 예외 후보 목록
exceptionCandidatesRoutes.get('/', async (c) => {
  try {
    const patternId = c.req.query('patternId');
    const status = c.req.query('status') || 'pending_review';
    const limit = parseInt(c.req.query('limit') || '50');

    let query = 'SELECT * FROM exception_candidates WHERE 1=1';
    const params: (string | number)[] = [];

    if (patternId) {
      query += ' AND pattern_id = ?';
      params.push(patternId);
    }
    if (status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY confidence DESC, occurrence_count DESC LIMIT ?';
    params.push(limit);

    const results = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ success: true, data: results.results });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 예외 후보 승인
exceptionCandidatesRoutes.post('/:id/approve', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    await c.env.DB.prepare(`
      UPDATE exception_candidates SET
        status = 'approved',
        approved_by = ?,
        approved_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(body.approvedBy || 'system', id).run();

    return c.json({ success: true, data: { id, status: 'approved' } });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 예외 후보 거부
exceptionCandidatesRoutes.post('/:id/reject', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    await c.env.DB.prepare(`
      UPDATE exception_candidates SET
        status = 'rejected',
        rejection_reason = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(body.reason || '', id).run();

    return c.json({ success: true, data: { id, status: 'rejected' } });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

export { exceptionCandidatesRoutes };
