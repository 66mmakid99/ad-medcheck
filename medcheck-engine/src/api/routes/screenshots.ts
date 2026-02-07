import { Hono } from 'hono';
import type { AppBindings } from '../../types/env';
import { handleApiError } from '../../utils/error-handler';
import { hashString } from '../../utils/helpers';

const screenshotRoutes = new Hono<AppBindings>();

// 스크린샷 저장
screenshotRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { hospitalId, sourceUrl, fullScreenshotPath, fullScreenshotUrl, cropAreas, pageTitle, viewportWidth, viewportHeight } = body;

    if (!hospitalId || !sourceUrl) return c.json({ success: false, error: 'hospitalId and sourceUrl required' }, 400);

    const previous = await c.env.DB.prepare(`
      SELECT id, page_hash FROM price_screenshots
      WHERE hospital_id = ? AND source_url = ?
      ORDER BY created_at DESC LIMIT 1
    `).bind(hospitalId, sourceUrl).first() as Record<string, unknown> | null;

    const pageHash = hashString(fullScreenshotUrl + Date.now());
    const isChanged = previous && previous.page_hash !== pageHash ? 1 : 0;

    const screenshotId = `SS-${Date.now()}`;
    await c.env.DB.prepare(`
      INSERT INTO price_screenshots
      (id, hospital_id, source_url, full_screenshot_path, full_screenshot_url, screenshot_at,
       crop_areas, page_hash, is_changed, previous_screenshot_id, change_detected_at,
       page_title, viewport_width, viewport_height)
      VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      screenshotId, hospitalId, sourceUrl, fullScreenshotPath || null, fullScreenshotUrl || null,
      cropAreas ? JSON.stringify(cropAreas) : null,
      pageHash, isChanged, previous?.id || null, isChanged ? new Date().toISOString() : null,
      pageTitle || null, viewportWidth || null, viewportHeight || null
    ).run();

    return c.json({
      success: true,
      data: { screenshotId, isChanged, previousScreenshotId: previous?.id }
    });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 스크린샷 조회
screenshotRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const screenshot = await c.env.DB.prepare(`
      SELECT s.*, h.name as hospital_name
      FROM price_screenshots s
      LEFT JOIN hospitals h ON s.hospital_id = h.id
      WHERE s.id = ?
    `).bind(id).first();

    if (!screenshot) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: screenshot });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 병원별 스크린샷 히스토리
screenshotRoutes.get('/hospital/:hospitalId', async (c) => {
  try {
    const hospitalId = c.req.param('hospitalId');
    const results = await c.env.DB.prepare(`
      SELECT * FROM price_screenshots WHERE hospital_id = ? ORDER BY created_at DESC LIMIT 50
    `).bind(hospitalId).all();
    return c.json({ success: true, data: results.results });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

export { screenshotRoutes };
