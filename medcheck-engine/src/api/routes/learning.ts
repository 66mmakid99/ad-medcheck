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

// ============================================
// Flywheel 학습 적용 엔드포인트
// ============================================

// 학습 결과 적용 (특정 logId 또는 전체 auto-eligible)
learningRoutes.post('/apply', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const learner = createAutoLearner(c.env.DB);

    if (body.logId) {
      // 특정 학습 결과 적용
      const result = await learner.applyLearning(body.logId);
      return c.json({ success: true, data: result });
    }

    // 전체 auto-eligible 일괄 적용
    const result = await learner.autoApplyEligible();
    return c.json({ success: true, data: result });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// 개별 학습 후보 적용
learningRoutes.post('/candidates/:id/apply', async (c) => {
  try {
    const id = c.req.param('id');
    const learner = createAutoLearner(c.env.DB);
    const result = await learner.applyLearning(id);

    return c.json({ success: true, data: result });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// ============================================
// HITL 큐 엔드포인트
// ============================================

// HITL 큐 조회: confidence < threshold + 미결 케이스
learningRoutes.get('/hitl-queue', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50');
    const db = c.env.DB;

    // threshold 설정 조회
    const setting = await db
      .prepare("SELECT setting_value FROM feedback_settings WHERE setting_key = 'hitl_confidence_threshold'")
      .first() as any;
    const threshold = parseFloat(setting?.setting_value || '0.5');

    const results = await db
      .prepare(`
        SELECT
          id, hospital_id, hospital_name, analysis_id, source,
          pattern_id, matched_text, context_text, section_type,
          severity, confidence, composite_confidence, determination,
          detection_source, from_image, created_at
        FROM analysis_archive
        WHERE composite_confidence IS NOT NULL
          AND composite_confidence < ?
          AND user_verdict IS NULL
        ORDER BY composite_confidence ASC, created_at DESC
        LIMIT ?
      `)
      .bind(threshold, limit)
      .all();

    return c.json({
      success: true,
      data: {
        threshold,
        count: results.results?.length || 0,
        items: results.results || [],
      },
    });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// HITL 판정 처리
learningRoutes.post('/hitl-queue/:id/resolve', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { verdict, note } = body as {
      verdict: 'violation' | 'not_violation' | 'borderline';
      note?: string;
    };

    if (!verdict || !['violation', 'not_violation', 'borderline'].includes(verdict)) {
      return c.json({
        success: false,
        error: 'verdict는 violation, not_violation, borderline 중 하나여야 합니다.',
      }, 400);
    }

    const db = c.env.DB;

    // analysis_archive 업데이트
    await db
      .prepare(`
        UPDATE analysis_archive SET
          user_verdict = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `)
      .bind(verdict, id)
      .run();

    // not_violation이면 자동으로 false_positive 피드백 생성 → auto-learner 순환
    if (verdict === 'not_violation') {
      const archive = await db
        .prepare('SELECT * FROM analysis_archive WHERE id = ?')
        .bind(id)
        .first() as any;

      if (archive && archive.pattern_id) {
        const feedbackId = `FB-HITL-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        await db
          .prepare(`
            INSERT INTO analysis_feedback_v2
            (id, analysis_id, feedback_type, pattern_id, context_text, context_type, user_note, submitted_by)
            VALUES (?, ?, 'false_positive', ?, ?, 'normal', ?, 'hitl_queue')
          `)
          .bind(
            feedbackId,
            archive.analysis_id,
            archive.pattern_id,
            archive.context_text || archive.matched_text,
            note || 'HITL 큐에서 not_violation 판정'
          )
          .run();
      }
    }

    return c.json({
      success: true,
      data: {
        id,
        verdict,
        feedbackGenerated: verdict === 'not_violation',
      },
    });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

export { learningRoutes };
