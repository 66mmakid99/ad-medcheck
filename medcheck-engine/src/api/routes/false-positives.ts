/**
 * 오탐 관리 API 라우트
 * /v1/false-positives - 오탐 케이스 관리
 * /v1/patterns/:id/exceptions - 패턴 예외 규칙 관리
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
 * 오탐 사유 타입
 */
export type FalsePositiveReason =
  | 'medical_term'      // 의학 용어
  | 'context_dependent' // 문맥 의존적
  | 'proper_noun'       // 고유명사
  | 'quotation'         // 인용문
  | 'other';            // 기타

/**
 * 오탐 케이스 상태
 */
export type FPCaseStatus = 'pending' | 'confirmed' | 'rejected' | 'applied';

/**
 * 예외 타입
 */
export type ExceptionType = 'exact_match' | 'contains' | 'regex' | 'context';

/**
 * 오탐 케이스 레코드
 */
export interface FalsePositiveCase {
  id: string;
  patternId: string;
  patternName: string | null;
  matchedText: string;
  fullContext: string | null;
  reason: FalsePositiveReason;
  reasonDetail: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
  status: FPCaseStatus;
  reportedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  appliedToException: boolean;
  exceptionId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 패턴 예외 규칙 레코드
 */
export interface PatternException {
  id: string;
  patternId: string;
  exceptionType: ExceptionType;
  exceptionValue: string;
  contextBefore: string | null;
  contextAfter: string | null;
  reason: string;
  scope: string;
  scopeValue: string | null;
  isActive: boolean;
  priority: number;
  sourceCaseId: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  appliedCount: number;
  lastAppliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// 오탐 케이스 라우트
// ============================================

const falsePositivesRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /v1/false-positives - 오탐 케이스 목록 조회
 */
falsePositivesRoutes.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const status = c.req.query('status') as FPCaseStatus | undefined;
  const patternId = c.req.query('patternId');
  const offset = (page - 1) * limit;

  try {
    let whereClause = 'WHERE 1=1';
    const params: (string | number)[] = [];

    if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    if (patternId) {
      whereClause += ' AND pattern_id = ?';
      params.push(patternId);
    }

    // 전체 개수
    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM false_positive_cases ${whereClause}`
    ).bind(...params).first<{ total: number }>();

    const total = countResult?.total || 0;

    // 데이터 조회
    const results = await c.env.DB.prepare(
      `SELECT
        id, pattern_id as patternId, pattern_name as patternName,
        matched_text as matchedText, full_context as fullContext,
        reason, reason_detail as reasonDetail,
        source_url as sourceUrl, source_type as sourceType,
        status, reported_by as reportedBy,
        reviewed_by as reviewedBy, reviewed_at as reviewedAt,
        review_comment as reviewComment,
        applied_to_exception as appliedToException,
        exception_id as exceptionId,
        created_at as createdAt, updated_at as updatedAt
      FROM false_positive_cases
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();

    return c.json({
      success: true,
      data: results.results || [],
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    const err = error as Error;
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: err.message },
    }, 500);
  }
});

/**
 * POST /v1/false-positives - 오탐 케이스 등록
 */
falsePositivesRoutes.post('/', async (c) => {
  let body: {
    patternId: string;
    patternName?: string;
    matchedText: string;
    fullContext?: string;
    reason: FalsePositiveReason;
    reasonDetail?: string;
    sourceUrl?: string;
    sourceType?: string;
    reportedBy?: string;
  };

  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({
      success: false,
      error: { code: 'PARSE_ERROR', message: 'Invalid JSON' },
    }, 400);
  }

  if (!body.patternId || !body.matchedText || !body.reason) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'patternId, matchedText, reason은 필수입니다.' },
    }, 400);
  }

  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `INSERT INTO false_positive_cases (
        id, pattern_id, pattern_name, matched_text, full_context,
        reason, reason_detail, source_url, source_type,
        status, reported_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
    ).bind(
      id,
      body.patternId,
      body.patternName || null,
      body.matchedText,
      body.fullContext || null,
      body.reason,
      body.reasonDetail || null,
      body.sourceUrl || null,
      body.sourceType || null,
      body.reportedBy || null,
      now,
      now
    ).run();

    return c.json({
      success: true,
      data: {
        id,
        patternId: body.patternId,
        matchedText: body.matchedText,
        reason: body.reason,
        status: 'pending',
        createdAt: now,
      },
    }, 201);
  } catch (error) {
    const err = error as Error;
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: err.message },
    }, 500);
  }
});

/**
 * GET /v1/false-positives/:id - 오탐 케이스 상세 조회
 */
falsePositivesRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const result = await c.env.DB.prepare(
      `SELECT
        id, pattern_id as patternId, pattern_name as patternName,
        matched_text as matchedText, full_context as fullContext,
        reason, reason_detail as reasonDetail,
        source_url as sourceUrl, source_type as sourceType,
        status, reported_by as reportedBy,
        reviewed_by as reviewedBy, reviewed_at as reviewedAt,
        review_comment as reviewComment,
        applied_to_exception as appliedToException,
        exception_id as exceptionId,
        created_at as createdAt, updated_at as updatedAt
      FROM false_positive_cases WHERE id = ?`
    ).bind(id).first();

    if (!result) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: '오탐 케이스를 찾을 수 없습니다.' },
      }, 404);
    }

    return c.json({ success: true, data: result });
  } catch (error) {
    const err = error as Error;
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: err.message },
    }, 500);
  }
});

/**
 * POST /v1/false-positives/:id/confirm - 오탐 확정
 */
falsePositivesRoutes.post('/:id/confirm', async (c) => {
  const id = c.req.param('id');

  let body: { reviewedBy?: string; reviewComment?: string; createException?: boolean } = {};
  try {
    const text = await c.req.text();
    if (text) body = JSON.parse(text);
  } catch (e) {}

  try {
    const now = new Date().toISOString();

    // 케이스 확인
    const existing = await c.env.DB.prepare(
      `SELECT id, status, pattern_id, matched_text, reason FROM false_positive_cases WHERE id = ?`
    ).bind(id).first<{ id: string; status: string; pattern_id: string; matched_text: string; reason: string }>();

    if (!existing) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: '오탐 케이스를 찾을 수 없습니다.' },
      }, 404);
    }

    let exceptionId: string | null = null;

    // 예외 규칙 자동 생성 옵션
    if (body.createException) {
      exceptionId = crypto.randomUUID();

      await c.env.DB.prepare(
        `INSERT INTO pattern_exceptions (
          id, pattern_id, exception_type, exception_value, reason,
          scope, is_active, priority, source_case_id, created_at, updated_at
        ) VALUES (?, ?, 'exact_match', ?, ?, 'global', 1, 0, ?, ?, ?)`
      ).bind(
        exceptionId,
        existing.pattern_id,
        existing.matched_text,
        existing.reason,
        id,
        now,
        now
      ).run();
    }

    // 케이스 상태 업데이트
    await c.env.DB.prepare(
      `UPDATE false_positive_cases
      SET status = 'confirmed',
          reviewed_by = ?,
          reviewed_at = ?,
          review_comment = ?,
          applied_to_exception = ?,
          exception_id = ?,
          updated_at = ?
      WHERE id = ?`
    ).bind(
      body.reviewedBy || null,
      now,
      body.reviewComment || null,
      body.createException ? 1 : 0,
      exceptionId,
      now,
      id
    ).run();

    return c.json({
      success: true,
      data: {
        id,
        status: 'confirmed',
        exceptionId,
        reviewedAt: now,
      },
    });
  } catch (error) {
    const err = error as Error;
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: err.message },
    }, 500);
  }
});

/**
 * POST /v1/false-positives/:id/reject - 오탐 거절
 */
falsePositivesRoutes.post('/:id/reject', async (c) => {
  const id = c.req.param('id');

  let body: { reviewedBy?: string; reviewComment?: string } = {};
  try {
    const text = await c.req.text();
    if (text) body = JSON.parse(text);
  } catch (e) {}

  try {
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `UPDATE false_positive_cases
      SET status = 'rejected',
          reviewed_by = ?,
          reviewed_at = ?,
          review_comment = ?,
          updated_at = ?
      WHERE id = ?`
    ).bind(
      body.reviewedBy || null,
      now,
      body.reviewComment || '거절됨',
      now,
      id
    ).run();

    return c.json({
      success: true,
      data: { id, status: 'rejected', reviewedAt: now },
    });
  } catch (error) {
    const err = error as Error;
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: err.message },
    }, 500);
  }
});

/**
 * GET /v1/false-positives/stats - 오탐 통계
 */
falsePositivesRoutes.get('/stats/summary', async (c) => {
  try {
    const stats = await c.env.DB.prepare(`
      SELECT status, COUNT(*) as count
      FROM false_positive_cases
      GROUP BY status
    `).all<{ status: string; count: number }>();

    const byReason = await c.env.DB.prepare(`
      SELECT reason, COUNT(*) as count
      FROM false_positive_cases
      GROUP BY reason
    `).all<{ reason: string; count: number }>();

    const statusMap: Record<string, number> = {};
    const reasonMap: Record<string, number> = {};

    (stats.results || []).forEach(r => { statusMap[r.status] = r.count; });
    (byReason.results || []).forEach(r => { reasonMap[r.reason] = r.count; });

    return c.json({
      success: true,
      data: {
        byStatus: statusMap,
        byReason: reasonMap,
        total: Object.values(statusMap).reduce((a, b) => a + b, 0),
      },
    });
  } catch (error) {
    const err = error as Error;
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: err.message },
    }, 500);
  }
});

// ============================================
// 패턴 예외 라우트
// ============================================

const patternExceptionsRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /v1/patterns/:patternId/exceptions - 패턴별 예외 목록
 */
patternExceptionsRoutes.get('/', async (c) => {
  const patternId = c.req.param('patternId');
  const activeOnly = c.req.query('active') !== 'false';

  try {
    let whereClause = 'WHERE pattern_id = ?';
    const params: (string | number)[] = [patternId];

    if (activeOnly) {
      whereClause += ' AND is_active = 1';
    }

    const results = await c.env.DB.prepare(
      `SELECT
        id, pattern_id as patternId,
        exception_type as exceptionType, exception_value as exceptionValue,
        context_before as contextBefore, context_after as contextAfter,
        reason, scope, scope_value as scopeValue,
        is_active as isActive, priority,
        source_case_id as sourceCaseId,
        created_by as createdBy, approved_by as approvedBy,
        approved_at as approvedAt,
        applied_count as appliedCount, last_applied_at as lastAppliedAt,
        created_at as createdAt, updated_at as updatedAt
      FROM pattern_exceptions
      ${whereClause}
      ORDER BY priority DESC, created_at DESC`
    ).bind(...params).all();

    return c.json({
      success: true,
      data: results.results || [],
    });
  } catch (error) {
    const err = error as Error;
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: err.message },
    }, 500);
  }
});

/**
 * POST /v1/patterns/:patternId/exceptions - 예외 규칙 추가
 */
patternExceptionsRoutes.post('/', async (c) => {
  const patternId = c.req.param('patternId');

  let body: {
    exceptionType: ExceptionType;
    exceptionValue: string;
    contextBefore?: string;
    contextAfter?: string;
    reason: string;
    scope?: string;
    scopeValue?: string;
    priority?: number;
    createdBy?: string;
  };

  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({
      success: false,
      error: { code: 'PARSE_ERROR', message: 'Invalid JSON' },
    }, 400);
  }

  if (!body.exceptionType || !body.exceptionValue || !body.reason) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'exceptionType, exceptionValue, reason은 필수입니다.' },
    }, 400);
  }

  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `INSERT INTO pattern_exceptions (
        id, pattern_id, exception_type, exception_value,
        context_before, context_after, reason,
        scope, scope_value, is_active, priority,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
    ).bind(
      id,
      patternId,
      body.exceptionType,
      body.exceptionValue,
      body.contextBefore || null,
      body.contextAfter || null,
      body.reason,
      body.scope || 'global',
      body.scopeValue || null,
      body.priority || 0,
      body.createdBy || null,
      now,
      now
    ).run();

    return c.json({
      success: true,
      data: {
        id,
        patternId,
        exceptionType: body.exceptionType,
        exceptionValue: body.exceptionValue,
        reason: body.reason,
        isActive: true,
        createdAt: now,
      },
    }, 201);
  } catch (error) {
    const err = error as Error;
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: err.message },
    }, 500);
  }
});

/**
 * DELETE /v1/patterns/:patternId/exceptions/:exceptionId - 예외 규칙 비활성화
 */
patternExceptionsRoutes.delete('/:exceptionId', async (c) => {
  const patternId = c.req.param('patternId');
  const exceptionId = c.req.param('exceptionId');

  try {
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `UPDATE pattern_exceptions
      SET is_active = 0, updated_at = ?
      WHERE id = ? AND pattern_id = ?`
    ).bind(now, exceptionId, patternId).run();

    return c.json({
      success: true,
      data: { id: exceptionId, isActive: false },
    });
  } catch (error) {
    const err = error as Error;
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: err.message },
    }, 500);
  }
});

/**
 * GET /v1/exceptions - 전체 예외 규칙 목록
 */
const allExceptionsRoutes = new Hono<{ Bindings: Env }>();

allExceptionsRoutes.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const activeOnly = c.req.query('active') !== 'false';
  const offset = (page - 1) * limit;

  try {
    let whereClause = 'WHERE 1=1';
    if (activeOnly) {
      whereClause += ' AND is_active = 1';
    }

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM pattern_exceptions ${whereClause}`
    ).first<{ total: number }>();

    const total = countResult?.total || 0;

    const results = await c.env.DB.prepare(
      `SELECT
        id, pattern_id as patternId,
        exception_type as exceptionType, exception_value as exceptionValue,
        reason, scope, is_active as isActive, priority,
        applied_count as appliedCount,
        created_at as createdAt
      FROM pattern_exceptions
      ${whereClause}
      ORDER BY pattern_id, priority DESC
      LIMIT ? OFFSET ?`
    ).bind(limit, offset).all();

    return c.json({
      success: true,
      data: results.results || [],
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    const err = error as Error;
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: err.message },
    }, 500);
  }
});

export { falsePositivesRoutes, patternExceptionsRoutes, allExceptionsRoutes };
