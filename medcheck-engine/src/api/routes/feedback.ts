/**
 * 피드백 API 라우트 (확장)
 * POST /v1/feedback - 오탐/미탐 신고 (기존)
 * POST /v1/feedback/violation - 위반 탐지 피드백 (확장)
 * POST /v1/feedback/price - 가격 추출 피드백
 * GET /v1/feedback/stats - 피드백 통계
 * GET /v1/feedback/:id - 피드백 조회
 */

import { Hono } from 'hono';
import type { D1Database } from '../../db/d1';
import type {
  ViolationFeedbackRequest,
  PriceFeedbackRequest,
  FeedbackTypeExtended,
  ContextType,
  PriceFeedbackType,
} from '../../types';
import { createPerformanceTracker } from '../../services/performance-tracker';
import { createAutoLearner } from '../../services/auto-learner';

// ============================================
// 타입 정의
// ============================================

export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
}

/**
 * 피드백 타입
 */
export type FeedbackType = 'false_positive' | 'false_negative';

/**
 * 피드백 상태
 */
export type FeedbackStatus = 'pending' | 'reviewed' | 'resolved';

/**
 * 피드백 요청
 */
export interface FeedbackRequest {
  /** 분석 ID */
  analysisId: string;
  /** 피드백 타입: false_positive(오탐), false_negative(미탐) */
  type: FeedbackType;
  /** 코멘트 */
  comment?: string;
  /** 위반 패턴 ID (오탐 시) */
  patternId?: string;
  /** 미탐지된 텍스트 (미탐 시) */
  missedText?: string;
  /** 제출자 정보 */
  submittedBy?: string;
}

/**
 * 피드백 레코드
 */
export interface FeedbackRecord {
  id: string;
  analysisId: string;
  type: FeedbackType;
  status: FeedbackStatus;
  comment: string | null;
  patternId: string | null;
  missedText: string | null;
  submittedBy: string | null;
  reviewedBy: string | null;
  reviewComment: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 피드백 응답
 */
export interface FeedbackResponse {
  success: boolean;
  data?: FeedbackRecord | FeedbackRecord[];
  error?: {
    code: string;
    message: string;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================
// 라우트 정의
// ============================================

const feedbackRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /v1/feedback - 피드백 제출
 */
feedbackRoutes.post('/', async (c) => {
  let body: FeedbackRequest;

  try {
    body = await c.req.json<FeedbackRequest>();
  } catch (e) {
    return c.json(
      {
        success: false,
        error: {
          code: 'PARSE_ERROR',
          message: 'Invalid JSON in request body',
        },
      } as FeedbackResponse,
      400
    );
  }

  // 필수 필드 검증
  if (!body.analysisId || typeof body.analysisId !== 'string') {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'analysisId는 필수입니다.',
        },
      } as FeedbackResponse,
      400
    );
  }

  if (!body.type || !['false_positive', 'false_negative'].includes(body.type)) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'type은 false_positive 또는 false_negative이어야 합니다.',
        },
      } as FeedbackResponse,
      400
    );
  }

  // 오탐 시 patternId 권장, 미탐 시 missedText 권장
  if (body.type === 'false_positive' && !body.patternId) {
    console.warn('false_positive feedback without patternId');
  }
  if (body.type === 'false_negative' && !body.missedText) {
    console.warn('false_negative feedback without missedText');
  }

  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // D1에 저장
    await c.env.DB.prepare(
      `INSERT INTO feedback (
        id, analysis_id, type, status, comment, pattern_id, missed_text, submitted_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        body.analysisId,
        body.type,
        'pending',
        body.comment || null,
        body.patternId || null,
        body.missedText || null,
        body.submittedBy || null,
        now,
        now
      )
      .run();

    const record: FeedbackRecord = {
      id,
      analysisId: body.analysisId,
      type: body.type,
      status: 'pending',
      comment: body.comment || null,
      patternId: body.patternId || null,
      missedText: body.missedText || null,
      submittedBy: body.submittedBy || null,
      reviewedBy: null,
      reviewComment: null,
      createdAt: now,
      updatedAt: now,
    };

    return c.json(
      {
        success: true,
        data: record,
      } as FeedbackResponse,
      201
    );
  } catch (error) {
    const err = error as Error;
    console.error('Failed to save feedback:', err);

    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: '피드백 저장에 실패했습니다.',
        },
      } as FeedbackResponse,
      500
    );
  }
});

/**
 * GET /v1/feedback - 피드백 목록 조회
 */
feedbackRoutes.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const status = c.req.query('status') as FeedbackStatus | undefined;
  const type = c.req.query('type') as FeedbackType | undefined;
  const offset = (page - 1) * limit;

  try {
    // 조건 쿼리 구성
    let whereClause = 'WHERE 1=1';
    const params: (string | number)[] = [];

    if (status && ['pending', 'reviewed', 'resolved'].includes(status)) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    if (type && ['false_positive', 'false_negative'].includes(type)) {
      whereClause += ' AND type = ?';
      params.push(type);
    }

    // 전체 개수 조회
    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM feedback ${whereClause}`
    )
      .bind(...params)
      .first<{ total: number }>();

    const total = countResult?.total || 0;

    // 데이터 조회
    const results = await c.env.DB.prepare(
      `SELECT
        id, analysis_id as analysisId, type, status, comment,
        pattern_id as patternId, missed_text as missedText,
        submitted_by as submittedBy, reviewed_by as reviewedBy,
        review_comment as reviewComment,
        created_at as createdAt, updated_at as updatedAt
      FROM feedback
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?`
    )
      .bind(...params, limit, offset)
      .all<FeedbackRecord>();

    return c.json({
      success: true,
      data: results.results || [],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    } as FeedbackResponse);
  } catch (error) {
    const err = error as Error;
    console.error('Failed to fetch feedback list:', err);

    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: '피드백 목록 조회에 실패했습니다.',
        },
      } as FeedbackResponse,
      500
    );
  }
});

/**
 * GET /v1/feedback/:id - 피드백 상세 조회
 */
feedbackRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const result = await c.env.DB.prepare(
      `SELECT
        id, analysis_id as analysisId, type, status, comment,
        pattern_id as patternId, missed_text as missedText,
        submitted_by as submittedBy, reviewed_by as reviewedBy,
        review_comment as reviewComment,
        created_at as createdAt, updated_at as updatedAt
      FROM feedback
      WHERE id = ?`
    )
      .bind(id)
      .first<FeedbackRecord>();

    if (!result) {
      return c.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: '피드백을 찾을 수 없습니다.',
          },
        } as FeedbackResponse,
        404
      );
    }

    return c.json({
      success: true,
      data: result,
    } as FeedbackResponse);
  } catch (error) {
    const err = error as Error;
    console.error('Failed to fetch feedback:', err);

    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: '피드백 조회에 실패했습니다.',
        },
      } as FeedbackResponse,
      500
    );
  }
});

/**
 * PATCH /v1/feedback/:id - 피드백 상태 업데이트
 */
feedbackRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id');

  let body: { status?: FeedbackStatus; reviewedBy?: string; reviewComment?: string };

  try {
    body = await c.req.json();
  } catch (e) {
    return c.json(
      {
        success: false,
        error: {
          code: 'PARSE_ERROR',
          message: 'Invalid JSON in request body',
        },
      } as FeedbackResponse,
      400
    );
  }

  if (body.status && !['pending', 'reviewed', 'resolved'].includes(body.status)) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'status는 pending, reviewed, resolved 중 하나여야 합니다.',
        },
      } as FeedbackResponse,
      400
    );
  }

  try {
    const now = new Date().toISOString();

    // 업데이트할 필드 구성
    const updates: string[] = ['updated_at = ?'];
    const params: (string | null)[] = [now];

    if (body.status) {
      updates.push('status = ?');
      params.push(body.status);
    }
    if (body.reviewedBy !== undefined) {
      updates.push('reviewed_by = ?');
      params.push(body.reviewedBy);
    }
    if (body.reviewComment !== undefined) {
      updates.push('review_comment = ?');
      params.push(body.reviewComment);
    }

    params.push(id);

    await c.env.DB.prepare(
      `UPDATE feedback SET ${updates.join(', ')} WHERE id = ?`
    )
      .bind(...params)
      .run();

    // 업데이트된 레코드 조회
    const result = await c.env.DB.prepare(
      `SELECT
        id, analysis_id as analysisId, type, status, comment,
        pattern_id as patternId, missed_text as missedText,
        submitted_by as submittedBy, reviewed_by as reviewedBy,
        review_comment as reviewComment,
        created_at as createdAt, updated_at as updatedAt
      FROM feedback
      WHERE id = ?`
    )
      .bind(id)
      .first<FeedbackRecord>();

    if (!result) {
      return c.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: '피드백을 찾을 수 없습니다.',
          },
        } as FeedbackResponse,
        404
      );
    }

    return c.json({
      success: true,
      data: result,
    } as FeedbackResponse);
  } catch (error) {
    const err = error as Error;
    console.error('Failed to update feedback:', err);

    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: '피드백 업데이트에 실패했습니다.',
        },
      } as FeedbackResponse,
      500
    );
  }
});

// ============================================
// 확장 API: 위반 탐지 피드백 (v2)
// ============================================

/**
 * POST /v1/feedback/violation - 위반 탐지 피드백 제출 (확장)
 */
feedbackRoutes.post('/violation', async (c) => {
  let body: ViolationFeedbackRequest;

  try {
    body = await c.req.json<ViolationFeedbackRequest>();
  } catch (e) {
    return c.json(
      {
        success: false,
        error: {
          code: 'PARSE_ERROR',
          message: 'Invalid JSON in request body',
        },
      },
      400
    );
  }

  // 필수 필드 검증
  if (!body.analysisId) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'analysisId는 필수입니다.',
        },
      },
      400
    );
  }

  const validTypes: FeedbackTypeExtended[] = ['true_positive', 'false_positive', 'false_negative', 'severity_adjust'];
  if (!body.feedbackType || !validTypes.includes(body.feedbackType)) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'feedbackType은 true_positive, false_positive, false_negative, severity_adjust 중 하나여야 합니다.',
        },
      },
      400
    );
  }

  // severity_adjust 시 correctedSeverity 필수
  if (body.feedbackType === 'severity_adjust' && !body.correctedSeverity) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'severity_adjust 시 correctedSeverity는 필수입니다.',
        },
      },
      400
    );
  }

  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // analysis_feedback_v2에 저장
    await c.env.DB.prepare(
      `INSERT INTO analysis_feedback_v2 (
        id, analysis_id, violation_id, feedback_type, pattern_id,
        original_severity, corrected_severity, context_text, context_type,
        hospital_department, missed_text, suggested_pattern, user_note,
        submitted_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        body.analysisId,
        body.violationId || null,
        body.feedbackType,
        body.patternId || null,
        body.originalSeverity || null,
        body.correctedSeverity || null,
        body.contextText || null,
        body.contextType || null,
        body.hospitalDepartment || null,
        body.missedText || null,
        body.suggestedPattern || null,
        body.userNote || null,
        body.submittedBy || null,
        now,
        now
      )
      .run();

    // 피드백 수가 일정 이상이면 자동 학습 트리거
    if (body.feedbackType === 'false_positive' && body.patternId) {
      const fpCount = await c.env.DB.prepare(
        `SELECT COUNT(*) as count FROM analysis_feedback_v2
         WHERE pattern_id = ? AND feedback_type = 'false_positive'`
      )
        .bind(body.patternId)
        .first<{ count: number }>();

      // 5건 이상 오탐 시 예외 후보 생성 시도
      if (fpCount && fpCount.count >= 5 && fpCount.count % 5 === 0) {
        const autoLearner = createAutoLearner(c.env.DB);
        await autoLearner.generateExceptionCandidates(body.patternId);
      }
    }

    return c.json(
      {
        success: true,
        data: {
          id,
          analysisId: body.analysisId,
          feedbackType: body.feedbackType,
          status: 'pending',
          createdAt: now,
        },
      },
      201
    );
  } catch (error) {
    const err = error as Error;
    console.error('Failed to save violation feedback:', err);

    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: '피드백 저장에 실패했습니다.',
        },
      },
      500
    );
  }
});

// ============================================
// 확장 API: 가격 추출 피드백
// ============================================

/**
 * POST /v1/feedback/price - 가격 추출 피드백 제출
 */
feedbackRoutes.post('/price', async (c) => {
  let body: PriceFeedbackRequest;

  try {
    body = await c.req.json<PriceFeedbackRequest>();
  } catch (e) {
    return c.json(
      {
        success: false,
        error: {
          code: 'PARSE_ERROR',
          message: 'Invalid JSON in request body',
        },
      },
      400
    );
  }

  // 필수 필드 검증
  if (!body.extractedPriceId) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'extractedPriceId는 필수입니다.',
        },
      },
      400
    );
  }

  const validTypes: PriceFeedbackType[] = ['correct', 'wrong_price', 'wrong_procedure', 'wrong_mapping', 'wrong_unit', 'missing_info'];
  if (!body.feedbackType || !validTypes.includes(body.feedbackType)) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'feedbackType은 correct, wrong_price, wrong_procedure, wrong_mapping, wrong_unit, missing_info 중 하나여야 합니다.',
        },
      },
      400
    );
  }

  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `INSERT INTO price_extraction_feedback (
        id, extracted_price_id, ocr_result_id, feedback_type,
        original_price, corrected_price, original_procedure, corrected_procedure,
        corrected_procedure_id, field_corrections, user_note, submitted_by,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        body.extractedPriceId,
        body.ocrResultId || null,
        body.feedbackType,
        body.originalPrice || null,
        body.correctedPrice || null,
        body.originalProcedure || null,
        body.correctedProcedure || null,
        body.correctedProcedureId || null,
        body.fieldCorrections ? JSON.stringify(body.fieldCorrections) : null,
        body.userNote || null,
        body.submittedBy || null,
        now,
        now
      )
      .run();

    return c.json(
      {
        success: true,
        data: {
          id,
          extractedPriceId: body.extractedPriceId,
          feedbackType: body.feedbackType,
          status: 'pending',
          createdAt: now,
        },
      },
      201
    );
  } catch (error) {
    const err = error as Error;
    console.error('Failed to save price feedback:', err);

    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: '피드백 저장에 실패했습니다.',
        },
      },
      500
    );
  }
});

// ============================================
// 확장 API: 피드백 통계
// ============================================

/**
 * GET /v1/feedback/stats - 피드백 통계 조회
 */
feedbackRoutes.get('/stats', async (c) => {
  try {
    // 위반 피드백 통계
    const violationStats = await c.env.DB.prepare(`
      SELECT
        feedback_type,
        COUNT(*) as total,
        SUM(CASE WHEN review_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN review_status = 'applied' THEN 1 ELSE 0 END) as applied
      FROM analysis_feedback_v2
      GROUP BY feedback_type
    `).all();

    // 가격 피드백 통계
    const priceStats = await c.env.DB.prepare(`
      SELECT
        feedback_type,
        COUNT(*) as total,
        SUM(CASE WHEN review_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN review_status = 'applied' THEN 1 ELSE 0 END) as applied
      FROM price_extraction_feedback
      GROUP BY feedback_type
    `).all();

    // 패턴별 오탐 순위
    const topFalsePositives = await c.env.DB.prepare(`
      SELECT
        pattern_id,
        COUNT(*) as fp_count
      FROM analysis_feedback_v2
      WHERE feedback_type = 'false_positive'
        AND pattern_id IS NOT NULL
      GROUP BY pattern_id
      ORDER BY fp_count DESC
      LIMIT 10
    `).all();

    // 맥락별 통계
    const contextStats = await c.env.DB.prepare(`
      SELECT
        context_type,
        feedback_type,
        COUNT(*) as count
      FROM analysis_feedback_v2
      WHERE context_type IS NOT NULL
      GROUP BY context_type, feedback_type
    `).all();

    // 최근 7일 추이
    const recentTrend = await c.env.DB.prepare(`
      SELECT
        DATE(created_at) as date,
        feedback_type,
        COUNT(*) as count
      FROM analysis_feedback_v2
      WHERE created_at > datetime('now', '-7 days')
      GROUP BY DATE(created_at), feedback_type
      ORDER BY date DESC
    `).all();

    // 학습 대기 건수
    const pendingLearning = await c.env.DB.prepare(`
      SELECT
        learning_type,
        COUNT(*) as count
      FROM auto_learning_log
      WHERE status = 'pending'
      GROUP BY learning_type
    `).all();

    return c.json({
      success: true,
      data: {
        violation: {
          byType: violationStats.results,
          topFalsePositives: topFalsePositives.results,
          byContext: contextStats.results,
        },
        price: {
          byType: priceStats.results,
        },
        trend: {
          last7Days: recentTrend.results,
        },
        learning: {
          pending: pendingLearning.results,
        },
      },
    });
  } catch (error) {
    const err = error as Error;
    console.error('Failed to fetch feedback stats:', err);

    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: '통계 조회에 실패했습니다.',
        },
      },
      500
    );
  }
});

/**
 * GET /v1/feedback/stats/pattern/:patternId - 패턴별 통계
 */
feedbackRoutes.get('/stats/pattern/:patternId', async (c) => {
  const patternId = c.req.param('patternId');

  try {
    const tracker = createPerformanceTracker(c.env.DB);

    // 패턴 성능 조회
    const performance = await tracker.getPatternPerformance(patternId);

    // 맥락별 성능 조회
    const contextPerformance = await tracker.analyzeContextPerformance(patternId);

    // 최근 피드백 조회
    const recentFeedback = await c.env.DB.prepare(`
      SELECT id, feedback_type, context_type, context_text, created_at
      FROM analysis_feedback_v2
      WHERE pattern_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).bind(patternId).all();

    // 예외 후보 조회
    const exceptionCandidates = await c.env.DB.prepare(`
      SELECT * FROM exception_candidates
      WHERE pattern_id = ?
      ORDER BY confidence DESC
    `).bind(patternId).all();

    return c.json({
      success: true,
      data: {
        patternId,
        performance,
        contextPerformance,
        recentFeedback: recentFeedback.results,
        exceptionCandidates: exceptionCandidates.results,
      },
    });
  } catch (error) {
    const err = error as Error;
    console.error('Failed to fetch pattern stats:', err);

    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: '패턴 통계 조회에 실패했습니다.',
        },
      },
      500
    );
  }
});

/**
 * GET /v1/feedback/pending - 검토 대기 피드백 조회
 */
feedbackRoutes.get('/pending', async (c) => {
  const type = c.req.query('type'); // 'violation' | 'price' | 'all'
  const limit = parseInt(c.req.query('limit') || '50');

  try {
    const results: { violation?: any[]; price?: any[] } = {};

    if (!type || type === 'violation' || type === 'all') {
      const violationPending = await c.env.DB.prepare(`
        SELECT * FROM analysis_feedback_v2
        WHERE review_status = 'pending'
        ORDER BY created_at ASC
        LIMIT ?
      `).bind(limit).all();
      results.violation = violationPending.results;
    }

    if (!type || type === 'price' || type === 'all') {
      const pricePending = await c.env.DB.prepare(`
        SELECT * FROM price_extraction_feedback
        WHERE review_status = 'pending'
        ORDER BY created_at ASC
        LIMIT ?
      `).bind(limit).all();
      results.price = pricePending.results;
    }

    return c.json({
      success: true,
      data: results,
    });
  } catch (error) {
    const err = error as Error;
    console.error('Failed to fetch pending feedback:', err);

    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: '대기 피드백 조회에 실패했습니다.',
        },
      },
      500
    );
  }
});

/**
 * POST /v1/feedback/:id/review - 피드백 검토 처리
 */
feedbackRoutes.post('/:id/review', async (c) => {
  const id = c.req.param('id');

  let body: {
    status: 'reviewed' | 'applied' | 'rejected';
    reviewedBy?: string;
    reviewComment?: string;
  };

  try {
    body = await c.req.json();
  } catch (e) {
    return c.json(
      {
        success: false,
        error: {
          code: 'PARSE_ERROR',
          message: 'Invalid JSON in request body',
        },
      },
      400
    );
  }

  if (!body.status || !['reviewed', 'applied', 'rejected'].includes(body.status)) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'status는 reviewed, applied, rejected 중 하나여야 합니다.',
        },
      },
      400
    );
  }

  try {
    const now = new Date().toISOString();

    // analysis_feedback_v2에서 먼저 시도
    let result = await c.env.DB.prepare(`
      UPDATE analysis_feedback_v2 SET
        review_status = ?,
        reviewed_by = ?,
        reviewed_at = ?
      WHERE id = ?
    `).bind(body.status, body.reviewedBy || null, now, id).run();

    if (!result.meta.changes) {
      // price_extraction_feedback에서 시도
      result = await c.env.DB.prepare(`
        UPDATE price_extraction_feedback SET
          review_status = ?,
          reviewed_by = ?,
          reviewed_at = ?
        WHERE id = ?
      `).bind(body.status, body.reviewedBy || null, now, id).run();
    }

    if (!result.meta.changes) {
      return c.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: '피드백을 찾을 수 없습니다.',
          },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: {
        id,
        status: body.status,
        reviewedAt: now,
      },
    });
  } catch (error) {
    const err = error as Error;
    console.error('Failed to review feedback:', err);

    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: '피드백 검토 처리에 실패했습니다.',
        },
      },
      500
    );
  }
});

export { feedbackRoutes };
