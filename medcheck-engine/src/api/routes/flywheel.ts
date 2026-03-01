/**
 * Flywheel 피드백 API 라우트
 */
import { Hono } from 'hono';
import type { AppBindings } from '../../types/env';
import { PatternTuner } from '../../modules/feedback';

export const flywheelRoutes = new Hono<AppBindings>();

/**
 * POST /false-positive
 * 오탐 신고
 */
flywheelRoutes.post('/false-positive', async (c) => {
  try {
    const body = await c.req.json<{ analysisId: string; patternId: string; reason?: string }>();
    if (!body.analysisId || !body.patternId) {
      return c.json({ success: false, error: 'analysisId, patternId 필수' }, 400);
    }
    const tuner = new PatternTuner(c.env.DB);
    const result = await tuner.reportFalsePositive(body.analysisId, body.patternId, body.reason);
    return c.json({ success: true, ...result });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

/**
 * POST /false-negative
 * 미탐 신고
 */
flywheelRoutes.post('/false-negative', async (c) => {
  try {
    const body = await c.req.json<{ analysisId: string; description: string; category?: string }>();
    if (!body.analysisId || !body.description) {
      return c.json({ success: false, error: 'analysisId, description 필수' }, 400);
    }
    const tuner = new PatternTuner(c.env.DB);
    const result = await tuner.reportFalseNegative(body.analysisId, body.description, body.category);
    return c.json({ success: true, ...result });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

/**
 * GET /pattern-candidates
 * 신규 패턴 후보 목록
 */
flywheelRoutes.get('/pattern-candidates', async (c) => {
  try {
    const status = c.req.query('status') || 'pending';
    const tuner = new PatternTuner(c.env.DB);
    const candidates = await tuner.getPatternCandidates(status);
    return c.json({ success: true, data: candidates });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

/**
 * POST /pattern-candidates/:id/approve
 */
flywheelRoutes.post('/pattern-candidates/:id/approve', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json<{ patternId: string }>();
    const tuner = new PatternTuner(c.env.DB);
    await tuner.approvePatternCandidate(id, body.patternId);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

/**
 * POST /pattern-candidates/:id/reject
 */
flywheelRoutes.post('/pattern-candidates/:id/reject', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const tuner = new PatternTuner(c.env.DB);
    await tuner.rejectPatternCandidate(id);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

/**
 * GET /weak-patterns
 * 저성능 패턴 목록
 */
flywheelRoutes.get('/weak-patterns', async (c) => {
  try {
    const tuner = new PatternTuner(c.env.DB);
    const patterns = await tuner.getWeakPatterns();
    return c.json({ success: true, data: patterns });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});
