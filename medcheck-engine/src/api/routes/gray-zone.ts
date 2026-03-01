/**
 * Gray Zone 관리 API 라우트
 */
import { Hono } from 'hono';
import type { AppBindings } from '../../types/env';
import { GrayZoneCollector } from '../../modules/feedback';

export const grayZoneRoutes = new Hono<AppBindings>();

/**
 * GET /
 * Gray Zone 사례 목록
 */
grayZoneRoutes.get('/', async (c) => {
  try {
    const status = c.req.query('status') || 'pending';
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
    const collector = new GrayZoneCollector(c.env.DB);
    const cases = await collector.list(status, limit);
    return c.json({ success: true, data: cases });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

/**
 * POST /:id/verdict
 * Gray Zone 사례 판정
 */
grayZoneRoutes.post('/:id/verdict', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json<{
      verdict: 'violation' | 'borderline' | 'legal';
      reasoning: string;
      addToPrompt?: boolean;
    }>();
    if (!body.verdict || !body.reasoning) {
      return c.json({ success: false, error: 'verdict, reasoning 필수' }, 400);
    }
    const collector = new GrayZoneCollector(c.env.DB);
    await collector.verdict(id, body.verdict, body.reasoning, body.addToPrompt ?? false);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

/**
 * GET /trends
 * Gray Zone 트렌드 통계
 */
grayZoneRoutes.get('/trends', async (c) => {
  try {
    const collector = new GrayZoneCollector(c.env.DB);
    const trends = await collector.getTrends();
    return c.json({ success: true, data: trends });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

/**
 * GET /prompt-examples
 * Gemini 프롬프트에 주입할 승인된 사례 목록
 */
grayZoneRoutes.get('/prompt-examples', async (c) => {
  try {
    const collector = new GrayZoneCollector(c.env.DB);
    const examples = await collector.getApprovedExamples();
    return c.json({ success: true, data: examples, count: examples.length });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});
