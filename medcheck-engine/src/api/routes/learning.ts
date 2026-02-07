import { Hono } from 'hono';
import type { AppBindings } from '../../types/env';
import { handleApiError } from '../../utils/error-handler';
import { createAutoLearner } from '../../services/auto-learner';

const learningRoutes = new Hono<AppBindings>();

// 학습 후보 목록
learningRoutes.get('/candidates', async (c) => {
  try {
    const learningType = c.req.query('type') as string | undefined;
    const limit = parseInt(c.req.query('limit') || '50');

    const learner = createAutoLearner(c.env.DB);
    const candidates = await learner.getPendingLearning({
      learningType,
      limit,
    });

    return c.json({ success: true, data: candidates });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 자동 적용 가능 목록
learningRoutes.get('/auto-apply-eligible', async (c) => {
  try {
    const learner = createAutoLearner(c.env.DB);
    const eligible = await learner.getAutoApplyEligible();

    return c.json({ success: true, data: eligible });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 학습 후보 승인
learningRoutes.post('/candidates/:id/approve', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const learner = createAutoLearner(c.env.DB);
    await learner.approveLearning(id, body.approvedBy);

    return c.json({ success: true, data: { id, status: 'approved' } });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 학습 후보 거부
learningRoutes.post('/candidates/:id/reject', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    if (!body.reason) {
      return c.json({ success: false, error: 'reason is required' }, 400);
    }

    const learner = createAutoLearner(c.env.DB);
    await learner.rejectLearning(id, body.reason);

    return c.json({ success: true, data: { id, status: 'rejected' } });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 예외 후보 생성 트리거
learningRoutes.post('/generate-exceptions', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const patternId = body.patternId;

    const learner = createAutoLearner(c.env.DB);
    const result = await learner.generateExceptionCandidates(patternId);

    return c.json({ success: true, data: result });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 패턴 후보 추출 트리거
learningRoutes.post('/extract-patterns', async (c) => {
  try {
    const learner = createAutoLearner(c.env.DB);
    const candidates = await learner.extractPatternCandidates();

    return c.json({ success: true, data: candidates });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 매핑 학습 트리거
learningRoutes.post('/learn-mappings', async (c) => {
  try {
    const learner = createAutoLearner(c.env.DB);
    const rules = await learner.learnMappingPatterns();

    return c.json({ success: true, data: rules });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

export { learningRoutes };
