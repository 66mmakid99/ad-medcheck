/**
 * Settings API - feedback_settings 테이블 CRUD
 */
import { Hono } from 'hono';

type Env = { DB: D1Database };

export const settingsRoutes = new Hono<{ Bindings: Env }>();

// GET /v1/settings - 전체 설정 조회
settingsRoutes.get('/', async (c) => {
  const results = await c.env.DB.prepare(
    'SELECT setting_key, setting_value, setting_type, description, updated_at FROM feedback_settings ORDER BY setting_key'
  ).all();

  return c.json({ success: true, data: results.results });
});

// PUT /v1/settings/:key - 단일 설정 수정
settingsRoutes.put('/:key', async (c) => {
  const key = c.req.param('key');
  const body = await c.req.json<{ value: string }>();

  if (body.value === undefined || body.value === null) {
    return c.json({ success: false, error: { code: 'MISSING_VALUE', message: 'value is required' } }, 400);
  }

  // 존재 확인
  const existing = await c.env.DB.prepare(
    'SELECT setting_key FROM feedback_settings WHERE setting_key = ?'
  ).bind(key).first();

  if (!existing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: `Setting '${key}' not found` } }, 404);
  }

  await c.env.DB.prepare(
    "UPDATE feedback_settings SET setting_value = ?, updated_at = datetime('now') WHERE setting_key = ?"
  ).bind(String(body.value), key).run();

  return c.json({ success: true, data: { key, value: body.value } });
});
