/**
 * 오탐 관리 API 라우트 (Phase 5 확장)
 * 설계서 기반 구현
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
 * 오탐 유형
 */
export type FalsePositiveType =
  | 'context_dependent'  // 맥락 의존적
  | 'domain_specific'    // 특정 진료과 용어
  | 'quotation'          // 인용/참조 문맥
  | 'negation'           // 부정 문맥
  | 'education'          // 교육/안내 문맥
  | 'pattern_too_broad'  // 패턴이 너무 넓음
  | 'ocr_error';         // OCR 오류

/**
 * 오탐 상태
 */
export type FPStatus = 'reported' | 'reviewing' | 'resolved' | 'rejected';

/**
 * 예외 타입
 */
export type ExceptionType = 'keyword' | 'regex' | 'context' | 'domain';

// ============================================
// 오탐 케이스 라우트
// ============================================

const falsePositivesRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /v1/false-positives - 오탐 목록 조회
 */
falsePositivesRoutes.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const status = c.req.query('status') as FPStatus | undefined;
  const patternId = c.req.query('pattern_id');
  const fpType = c.req.query('type') as FalsePositiveType | undefined;
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
    if (fpType) {
      whereClause += ' AND false_positive_type = ?';
      params.push(fpType);
    }

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM false_positive_cases ${whereClause}`
    ).bind(...params).first<{ total: number }>();

    const total = countResult?.total || 0;

    const results = await c.env.DB.prepare(
      `SELECT * FROM false_positive_cases
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
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } }, 500);
  }
});

/**
 * POST /v1/false-positives - 오탐 신고
 */
falsePositivesRoutes.post('/', async (c) => {
  let body: {
    analysisId?: string;
    patternId: string;
    matchedText: string;
    fullContext?: string;
    sourceUrl?: string;
    feedbackId?: string;
    reporterType?: string;
    reportReason?: string;
    falsePositiveType?: FalsePositiveType;
    suggestedAction?: string;
  };

  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ success: false, error: { code: 'PARSE_ERROR', message: 'Invalid JSON' } }, 400);
  }

  if (!body.patternId || !body.matchedText) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'patternId, matchedText는 필수입니다.' },
    }, 400);
  }

  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `INSERT INTO false_positive_cases (
        id, analysis_id, pattern_id, matched_text, full_context, source_url,
        feedback_id, reporter_type, report_reason,
        false_positive_type, suggested_action, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reported', ?)`
    ).bind(
      id,
      body.analysisId || null,
      body.patternId,
      body.matchedText,
      body.fullContext || null,
      body.sourceUrl || null,
      body.feedbackId || null,
      body.reporterType || 'user',
      body.reportReason || null,
      body.falsePositiveType || null,
      body.suggestedAction || null,
      now
    ).run();

    return c.json({
      success: true,
      data: { id, patternId: body.patternId, status: 'reported', createdAt: now },
    }, 201);
  } catch (error) {
    const err = error as Error;
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } }, 500);
  }
});

/**
 * GET /v1/false-positives/:id - 오탐 상세 조회
 */
falsePositivesRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const result = await c.env.DB.prepare(
      `SELECT * FROM false_positive_cases WHERE id = ?`
    ).bind(id).first();

    if (!result) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: '오탐 케이스를 찾을 수 없습니다.' } }, 404);
    }

    return c.json({ success: true, data: result });
  } catch (error) {
    const err = error as Error;
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } }, 500);
  }
});

/**
 * PATCH /v1/false-positives/:id - 상태 변경
 */
falsePositivesRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id');

  let body: {
    status?: FPStatus;
    resolution?: string;
    resolutionNote?: string;
    reviewer?: string;
    falsePositiveType?: FalsePositiveType;
  };

  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ success: false, error: { code: 'PARSE_ERROR', message: 'Invalid JSON' } }, 400);
  }

  try {
    const now = new Date().toISOString();
    const updates: string[] = [];
    const params: (string | null)[] = [];

    if (body.status) {
      updates.push('status = ?');
      params.push(body.status);

      if (body.status === 'reviewing') {
        updates.push('reviewed_at = ?');
        params.push(now);
      } else if (body.status === 'resolved' || body.status === 'rejected') {
        updates.push('resolved_at = ?');
        params.push(now);
      }
    }
    if (body.resolution) {
      updates.push('resolution = ?');
      params.push(body.resolution);
    }
    if (body.resolutionNote) {
      updates.push('resolution_note = ?');
      params.push(body.resolutionNote);
    }
    if (body.reviewer) {
      updates.push('reviewer = ?');
      params.push(body.reviewer);
    }
    if (body.falsePositiveType) {
      updates.push('false_positive_type = ?');
      params.push(body.falsePositiveType);
    }

    if (updates.length === 0) {
      return c.json({ success: false, error: { code: 'INVALID_INPUT', message: '변경할 필드가 없습니다.' } }, 400);
    }

    params.push(id);

    await c.env.DB.prepare(
      `UPDATE false_positive_cases SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();

    const result = await c.env.DB.prepare(
      `SELECT * FROM false_positive_cases WHERE id = ?`
    ).bind(id).first();

    return c.json({ success: true, data: result });
  } catch (error) {
    const err = error as Error;
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } }, 500);
  }
});

// ============================================
// 예외 규칙 라우트
// ============================================

const patternExceptionsRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /v1/patterns/:patternId/exceptions - 패턴 예외 목록
 */
patternExceptionsRoutes.get('/', async (c) => {
  const patternId = c.req.param('patternId');
  const status = c.req.query('status') || 'active';

  try {
    const results = await c.env.DB.prepare(
      `SELECT * FROM pattern_exceptions
      WHERE pattern_id = ? AND status = ?
      ORDER BY created_at DESC`
    ).bind(patternId, status).all();

    return c.json({ success: true, data: results.results || [] });
  } catch (error) {
    const err = error as Error;
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } }, 500);
  }
});

/**
 * POST /v1/patterns/:patternId/exceptions - 예외 추가
 */
patternExceptionsRoutes.post('/', async (c) => {
  const patternId = c.req.param('patternId');

  let body: {
    exceptionType: ExceptionType;
    exceptionValue: string;
    sourceType?: string;
    sourceId?: string;
    createdBy?: string;
    version?: string;
  };

  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ success: false, error: { code: 'PARSE_ERROR', message: 'Invalid JSON' } }, 400);
  }

  if (!body.exceptionType || !body.exceptionValue) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'exceptionType, exceptionValue는 필수입니다.' },
    }, 400);
  }

  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `INSERT INTO pattern_exceptions (
        id, pattern_id, exception_type, exception_value,
        source_type, source_id, status, created_at, created_by, version
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
    ).bind(
      id,
      patternId,
      body.exceptionType,
      body.exceptionValue,
      body.sourceType || null,
      body.sourceId || null,
      now,
      body.createdBy || null,
      body.version || null
    ).run();

    return c.json({
      success: true,
      data: { id, patternId, exceptionType: body.exceptionType, status: 'active', createdAt: now },
    }, 201);
  } catch (error) {
    const err = error as Error;
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } }, 500);
  }
});

/**
 * DELETE /v1/patterns/:patternId/exceptions/:eid - 예외 제거 (비활성화)
 */
patternExceptionsRoutes.delete('/:eid', async (c) => {
  const patternId = c.req.param('patternId');
  const eid = c.req.param('eid');

  try {
    await c.env.DB.prepare(
      `UPDATE pattern_exceptions SET status = 'deprecated' WHERE id = ? AND pattern_id = ?`
    ).bind(eid, patternId).run();

    return c.json({ success: true, data: { id: eid, status: 'deprecated' } });
  } catch (error) {
    const err = error as Error;
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } }, 500);
  }
});

// ============================================
// 예외 제안 라우트
// ============================================

const exceptionSuggestionsRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /v1/exception-suggestions - 자동 제안 목록
 */
exceptionSuggestionsRoutes.get('/', async (c) => {
  const status = c.req.query('status') || 'suggested';
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const offset = (page - 1) * limit;

  try {
    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM exception_suggestions WHERE status = ?`
    ).bind(status).first<{ total: number }>();

    const total = countResult?.total || 0;

    const results = await c.env.DB.prepare(
      `SELECT * FROM exception_suggestions
      WHERE status = ?
      ORDER BY confidence DESC, fp_count DESC
      LIMIT ? OFFSET ?`
    ).bind(status, limit, offset).all();

    return c.json({
      success: true,
      data: results.results || [],
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    const err = error as Error;
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } }, 500);
  }
});

/**
 * POST /v1/exception-suggestions/:id/approve - 제안 승인
 */
exceptionSuggestionsRoutes.post('/:id/approve', async (c) => {
  const id = c.req.param('id');

  let body: { reviewedBy?: string; reviewComment?: string } = {};
  try {
    const text = await c.req.text();
    if (text) body = JSON.parse(text);
  } catch (e) {}

  try {
    const now = new Date().toISOString();

    // 제안 조회
    const suggestion = await c.env.DB.prepare(
      `SELECT * FROM exception_suggestions WHERE id = ?`
    ).bind(id).first<{
      id: string;
      pattern_id: string;
      exception_type: string;
      exception_value: string;
      status: string;
    }>();

    if (!suggestion) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: '제안을 찾을 수 없습니다.' } }, 404);
    }

    if (suggestion.status !== 'suggested') {
      return c.json({ success: false, error: { code: 'INVALID_STATE', message: '이미 처리된 제안입니다.' } }, 400);
    }

    // 예외 규칙 생성
    const exceptionId = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO pattern_exceptions (
        id, pattern_id, exception_type, exception_value,
        source_type, source_id, status, created_at
      ) VALUES (?, ?, ?, ?, 'auto', ?, 'active', ?)`
    ).bind(
      exceptionId,
      suggestion.pattern_id,
      suggestion.exception_type,
      suggestion.exception_value,
      id,
      now
    ).run();

    // 제안 상태 업데이트
    await c.env.DB.prepare(
      `UPDATE exception_suggestions
      SET status = 'approved',
          reviewed_by = ?,
          reviewed_at = ?,
          review_comment = ?,
          created_exception_id = ?
      WHERE id = ?`
    ).bind(body.reviewedBy || null, now, body.reviewComment || null, exceptionId, id).run();

    return c.json({
      success: true,
      data: { suggestionId: id, status: 'approved', createdExceptionId: exceptionId },
    });
  } catch (error) {
    const err = error as Error;
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } }, 500);
  }
});

/**
 * POST /v1/exception-suggestions/:id/reject - 제안 거절
 */
exceptionSuggestionsRoutes.post('/:id/reject', async (c) => {
  const id = c.req.param('id');

  let body: { reviewedBy?: string; reviewComment?: string } = {};
  try {
    const text = await c.req.text();
    if (text) body = JSON.parse(text);
  } catch (e) {}

  try {
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `UPDATE exception_suggestions
      SET status = 'rejected',
          reviewed_by = ?,
          reviewed_at = ?,
          review_comment = ?
      WHERE id = ?`
    ).bind(body.reviewedBy || null, now, body.reviewComment || '거절됨', id).run();

    return c.json({ success: true, data: { id, status: 'rejected' } });
  } catch (error) {
    const err = error as Error;
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } }, 500);
  }
});

// ============================================
// 패턴 버전 라우트
// ============================================

const patternVersionsRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /v1/patterns/:patternId/versions - 버전 이력
 */
patternVersionsRoutes.get('/', async (c) => {
  const patternId = c.req.param('patternId');

  try {
    const results = await c.env.DB.prepare(
      `SELECT * FROM pattern_versions
      WHERE pattern_id = ?
      ORDER BY created_at DESC`
    ).bind(patternId).all();

    return c.json({ success: true, data: results.results || [] });
  } catch (error) {
    const err = error as Error;
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } }, 500);
  }
});

/**
 * POST /v1/patterns/:patternId/versions - 새 버전 생성
 */
patternVersionsRoutes.post('/', async (c) => {
  const patternId = c.req.param('patternId');

  let body: {
    version: string;
    changeType: string;
    changeDescription: string;
    changeReason?: string;
    previousPattern?: string;
    newPattern?: string;
    previousThreshold?: number;
    newThreshold?: number;
    relatedFeedbackIds?: string[];
    relatedFpCaseIds?: string[];
    createdBy?: string;
  };

  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ success: false, error: { code: 'PARSE_ERROR', message: 'Invalid JSON' } }, 400);
  }

  if (!body.version || !body.changeType || !body.changeDescription) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'version, changeType, changeDescription은 필수입니다.' },
    }, 400);
  }

  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `INSERT INTO pattern_versions (
        id, pattern_id, version, change_type, change_description, change_reason,
        previous_pattern, new_pattern, previous_threshold, new_threshold,
        related_feedback_ids, related_fp_case_ids, created_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      patternId,
      body.version,
      body.changeType,
      body.changeDescription,
      body.changeReason || null,
      body.previousPattern || null,
      body.newPattern || null,
      body.previousThreshold || null,
      body.newThreshold || null,
      body.relatedFeedbackIds ? JSON.stringify(body.relatedFeedbackIds) : null,
      body.relatedFpCaseIds ? JSON.stringify(body.relatedFpCaseIds) : null,
      now,
      body.createdBy || null
    ).run();

    return c.json({
      success: true,
      data: { id, patternId, version: body.version, changeType: body.changeType, createdAt: now },
    }, 201);
  } catch (error) {
    const err = error as Error;
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } }, 500);
  }
});

/**
 * GET /v1/patterns/:patternId/versions/:version/compare - 버전 비교
 */
patternVersionsRoutes.get('/:version/compare', async (c) => {
  const patternId = c.req.param('patternId');
  const version = c.req.param('version');
  const compareWith = c.req.query('with');

  try {
    const current = await c.env.DB.prepare(
      `SELECT * FROM pattern_versions WHERE pattern_id = ? AND version = ?`
    ).bind(patternId, version).first();

    if (!current) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: '버전을 찾을 수 없습니다.' } }, 404);
    }

    let comparison = null;
    if (compareWith) {
      comparison = await c.env.DB.prepare(
        `SELECT * FROM pattern_versions WHERE pattern_id = ? AND version = ?`
      ).bind(patternId, compareWith).first();
    }

    return c.json({
      success: true,
      data: {
        current,
        comparison,
        diff: comparison ? {
          patternChanged: current.new_pattern !== comparison.new_pattern,
          thresholdChanged: current.new_threshold !== comparison.new_threshold,
        } : null,
      },
    });
  } catch (error) {
    const err = error as Error;
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } }, 500);
  }
});

/**
 * POST /v1/patterns/:patternId/rollback/:version - 롤백
 */
patternVersionsRoutes.post('/rollback/:version', async (c) => {
  const patternId = c.req.param('patternId');
  const version = c.req.param('version');

  let body: { createdBy?: string; reason?: string } = {};
  try {
    const text = await c.req.text();
    if (text) body = JSON.parse(text);
  } catch (e) {}

  try {
    // 롤백 대상 버전 조회
    const targetVersion = await c.env.DB.prepare(
      `SELECT * FROM pattern_versions WHERE pattern_id = ? AND version = ?`
    ).bind(patternId, version).first<{ new_pattern: string; new_threshold: number }>();

    if (!targetVersion) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: '버전을 찾을 수 없습니다.' } }, 404);
    }

    // 현재 최신 버전 조회
    const latestVersion = await c.env.DB.prepare(
      `SELECT version, new_pattern, new_threshold FROM pattern_versions
      WHERE pattern_id = ?
      ORDER BY created_at DESC LIMIT 1`
    ).bind(patternId).first<{ version: string; new_pattern: string; new_threshold: number }>();

    // 롤백 버전 생성
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newVersionNum = latestVersion
      ? (parseFloat(latestVersion.version) + 0.1).toFixed(1)
      : '1.0';

    await c.env.DB.prepare(
      `INSERT INTO pattern_versions (
        id, pattern_id, version, change_type, change_description, change_reason,
        previous_pattern, new_pattern, previous_threshold, new_threshold,
        created_at, created_by
      ) VALUES (?, ?, ?, 'rollback', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      patternId,
      newVersionNum,
      `버전 ${version}으로 롤백`,
      body.reason || null,
      latestVersion?.new_pattern || null,
      targetVersion.new_pattern,
      latestVersion?.new_threshold || null,
      targetVersion.new_threshold,
      now,
      body.createdBy || null
    ).run();

    return c.json({
      success: true,
      data: {
        id,
        patternId,
        newVersion: newVersionNum,
        rolledBackTo: version,
        createdAt: now,
      },
    });
  } catch (error) {
    const err = error as Error;
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } }, 500);
  }
});

// ============================================
// 전체 예외 라우트
// ============================================

const allExceptionsRoutes = new Hono<{ Bindings: Env }>();

allExceptionsRoutes.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const status = c.req.query('status') || 'active';
  const offset = (page - 1) * limit;

  try {
    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM pattern_exceptions WHERE status = ?`
    ).bind(status).first<{ total: number }>();

    const total = countResult?.total || 0;

    const results = await c.env.DB.prepare(
      `SELECT * FROM pattern_exceptions
      WHERE status = ?
      ORDER BY pattern_id, created_at DESC
      LIMIT ? OFFSET ?`
    ).bind(status, limit, offset).all();

    return c.json({
      success: true,
      data: results.results || [],
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    const err = error as Error;
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } }, 500);
  }
});

export {
  falsePositivesRoutes,
  patternExceptionsRoutes,
  exceptionSuggestionsRoutes,
  patternVersionsRoutes,
  allExceptionsRoutes,
};
