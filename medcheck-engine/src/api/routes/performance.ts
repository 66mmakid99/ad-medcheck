import { Hono } from 'hono';
import type { AppBindings } from '../../types/env';
import { handleApiError } from '../../utils/error-handler';
import { createPerformanceTracker } from '../../services/performance-tracker';

const performanceRoutes = new Hono<AppBindings>();

// 패턴 성능 목록
performanceRoutes.get('/patterns', async (c) => {
  try {
    const flaggedOnly = c.req.query('flaggedOnly') === 'true';
    const limit = parseInt(c.req.query('limit') || '100');
    const orderBy = (c.req.query('orderBy') || 'accuracy') as 'accuracy' | 'total_matches';
    const orderDir = (c.req.query('orderDir') || 'asc') as 'asc' | 'desc';

    const tracker = createPerformanceTracker(c.env.DB);
    const patterns = await tracker.getAllPatternPerformance({
      flaggedOnly,
      limit,
      orderBy,
      orderDir,
    });

    return c.json({ success: true, data: patterns });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 특정 패턴 성능
performanceRoutes.get('/patterns/:patternId', async (c) => {
  try {
    const patternId = c.req.param('patternId');
    const tracker = createPerformanceTracker(c.env.DB);

    const performance = await tracker.getPatternPerformance(patternId);
    const contextPerformance = await tracker.analyzeContextPerformance(patternId);
    const departmentPerformance = await tracker.analyzeDepartmentPerformance(patternId);

    return c.json({
      success: true,
      data: {
        performance,
        contextPerformance,
        departmentPerformance,
      },
    });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 성능 집계 실행 (배치)
performanceRoutes.post('/aggregate', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const periodDays = body.periodDays || 30;

    const tracker = createPerformanceTracker(c.env.DB);
    const result = await tracker.aggregatePatternPerformance(periodDays);

    return c.json({ success: true, data: result });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 성능 리포트 생성
performanceRoutes.get('/report', async (c) => {
  try {
    const periodDays = parseInt(c.req.query('periodDays') || '30');

    const tracker = createPerformanceTracker(c.env.DB);
    const report = await tracker.generatePerformanceReport(periodDays);

    return c.json({ success: true, data: report });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 저성능 패턴 목록
performanceRoutes.get('/flagged', async (c) => {
  try {
    const threshold = parseFloat(c.req.query('threshold') || '0.8');

    const tracker = createPerformanceTracker(c.env.DB);
    const flagged = await tracker.flagLowPerformancePatterns(threshold);

    return c.json({ success: true, data: flagged });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

export { performanceRoutes };
