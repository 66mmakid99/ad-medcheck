/**
 * 피드백 API 라우트
 * POST /v1/feedback - 오탐/미탐 신고
 * GET /v1/feedback/:id - 피드백 조회
 */

import { Hono } from 'hono';
import type { D1Database } from '../../db/d1';

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

export { feedbackRoutes };
