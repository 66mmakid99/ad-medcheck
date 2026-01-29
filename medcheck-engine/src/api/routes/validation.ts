/**
 * 검증 API 라우트
 * GET /v1/validations - 검증 대기 목록
 * POST /v1/validations/:id/approve - 검증 승인
 * POST /v1/validations/:id/reject - 검증 거절
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
 * 검증 상태
 */
export type ValidationStatus = 'pending' | 'approved' | 'rejected';

/**
 * 검증 타입
 */
export type ValidationType = 'ocr' | 'ai_analysis' | 'pattern_match';

/**
 * 검증 레코드
 */
export interface ValidationRecord {
  id: string;
  type: ValidationType;
  status: ValidationStatus;
  analysisId: string | null;
  originalText: string | null;
  extractedText: string | null;
  correctedText: string | null;
  confidence: number | null;
  validatedBy: string | null;
  validationComment: string | null;
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 검증 응답
 */
export interface ValidationResponse {
  success: boolean;
  data?: ValidationRecord | ValidationRecord[];
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

/**
 * 승인/거절 요청
 */
export interface ValidationActionRequest {
  validatedBy?: string;
  comment?: string;
  correctedText?: string;
}

// ============================================
// 라우트 정의
// ============================================

const validationRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /v1/validations - 검증 대기 목록 조회
 */
validationRoutes.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const status = c.req.query('status') as ValidationStatus | undefined;
  const type = c.req.query('type') as ValidationType | undefined;
  const offset = (page - 1) * limit;

  try {
    // 조건 쿼리 구성
    let whereClause = 'WHERE 1=1';
    const params: (string | number)[] = [];

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    if (type && ['ocr', 'ai_analysis', 'pattern_match'].includes(type)) {
      whereClause += ' AND type = ?';
      params.push(type);
    }

    // 전체 개수 조회
    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM ocr_validations ${whereClause}`
    )
      .bind(...params)
      .first<{ total: number }>();

    const total = countResult?.total || 0;

    // 데이터 조회
    const results = await c.env.DB.prepare(
      `SELECT
        id, type, status, analysis_id as analysisId,
        original_text as originalText, extracted_text as extractedText,
        corrected_text as correctedText, confidence,
        validated_by as validatedBy, validation_comment as validationComment,
        metadata, created_at as createdAt, updated_at as updatedAt
      FROM ocr_validations
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?`
    )
      .bind(...params, limit, offset)
      .all<ValidationRecord>();

    return c.json({
      success: true,
      data: results.results || [],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    } as ValidationResponse);
  } catch (error) {
    const err = error as Error;
    console.error('Failed to fetch validations:', err);

    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: '검증 목록 조회에 실패했습니다.',
        },
      } as ValidationResponse,
      500
    );
  }
});

/**
 * GET /v1/validations/pending - 검증 대기 목록 (바로가기)
 */
validationRoutes.get('/pending', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const offset = (page - 1) * limit;

  try {
    // 전체 개수 조회
    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM ocr_validations WHERE status = 'pending'`
    ).first<{ total: number }>();

    const total = countResult?.total || 0;

    // 데이터 조회
    const results = await c.env.DB.prepare(
      `SELECT
        id, type, status, analysis_id as analysisId,
        original_text as originalText, extracted_text as extractedText,
        corrected_text as correctedText, confidence,
        validated_by as validatedBy, validation_comment as validationComment,
        metadata, created_at as createdAt, updated_at as updatedAt
      FROM ocr_validations
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT ? OFFSET ?`
    )
      .bind(limit, offset)
      .all<ValidationRecord>();

    return c.json({
      success: true,
      data: results.results || [],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    } as ValidationResponse);
  } catch (error) {
    const err = error as Error;
    console.error('Failed to fetch pending validations:', err);

    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: '대기 중인 검증 목록 조회에 실패했습니다.',
        },
      } as ValidationResponse,
      500
    );
  }
});

/**
 * GET /v1/validations/:id - 검증 상세 조회
 */
validationRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const result = await c.env.DB.prepare(
      `SELECT
        id, type, status, analysis_id as analysisId,
        original_text as originalText, extracted_text as extractedText,
        corrected_text as correctedText, confidence,
        validated_by as validatedBy, validation_comment as validationComment,
        metadata, created_at as createdAt, updated_at as updatedAt
      FROM ocr_validations
      WHERE id = ?`
    )
      .bind(id)
      .first<ValidationRecord>();

    if (!result) {
      return c.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: '검증 항목을 찾을 수 없습니다.',
          },
        } as ValidationResponse,
        404
      );
    }

    return c.json({
      success: true,
      data: result,
    } as ValidationResponse);
  } catch (error) {
    const err = error as Error;
    console.error('Failed to fetch validation:', err);

    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: '검증 항목 조회에 실패했습니다.',
        },
      } as ValidationResponse,
      500
    );
  }
});

/**
 * POST /v1/validations/:id/approve - 검증 승인
 */
validationRoutes.post('/:id/approve', async (c) => {
  const id = c.req.param('id');

  let body: ValidationActionRequest = {};

  try {
    const text = await c.req.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch (e) {
    // 빈 body 허용
  }

  try {
    const now = new Date().toISOString();

    // 검증 항목 존재 확인
    const existing = await c.env.DB.prepare(
      `SELECT id, status FROM ocr_validations WHERE id = ?`
    )
      .bind(id)
      .first<{ id: string; status: string }>();

    if (!existing) {
      return c.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: '검증 항목을 찾을 수 없습니다.',
          },
        } as ValidationResponse,
        404
      );
    }

    if (existing.status !== 'pending') {
      return c.json(
        {
          success: false,
          error: {
            code: 'INVALID_STATE',
            message: '이미 처리된 검증 항목입니다.',
          },
        } as ValidationResponse,
        400
      );
    }

    // 승인 처리
    await c.env.DB.prepare(
      `UPDATE ocr_validations
      SET status = 'approved',
          validated_by = ?,
          validation_comment = ?,
          corrected_text = COALESCE(?, corrected_text),
          updated_at = ?
      WHERE id = ?`
    )
      .bind(
        body.validatedBy || null,
        body.comment || null,
        body.correctedText || null,
        now,
        id
      )
      .run();

    // 업데이트된 레코드 조회
    const result = await c.env.DB.prepare(
      `SELECT
        id, type, status, analysis_id as analysisId,
        original_text as originalText, extracted_text as extractedText,
        corrected_text as correctedText, confidence,
        validated_by as validatedBy, validation_comment as validationComment,
        metadata, created_at as createdAt, updated_at as updatedAt
      FROM ocr_validations
      WHERE id = ?`
    )
      .bind(id)
      .first<ValidationRecord>();

    return c.json({
      success: true,
      data: result,
    } as ValidationResponse);
  } catch (error) {
    const err = error as Error;
    console.error('Failed to approve validation:', err);

    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: '검증 승인에 실패했습니다.',
        },
      } as ValidationResponse,
      500
    );
  }
});

/**
 * POST /v1/validations/:id/reject - 검증 거절
 */
validationRoutes.post('/:id/reject', async (c) => {
  const id = c.req.param('id');

  let body: ValidationActionRequest = {};

  try {
    const text = await c.req.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch (e) {
    // 빈 body 허용
  }

  try {
    const now = new Date().toISOString();

    // 검증 항목 존재 확인
    const existing = await c.env.DB.prepare(
      `SELECT id, status FROM ocr_validations WHERE id = ?`
    )
      .bind(id)
      .first<{ id: string; status: string }>();

    if (!existing) {
      return c.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: '검증 항목을 찾을 수 없습니다.',
          },
        } as ValidationResponse,
        404
      );
    }

    if (existing.status !== 'pending') {
      return c.json(
        {
          success: false,
          error: {
            code: 'INVALID_STATE',
            message: '이미 처리된 검증 항목입니다.',
          },
        } as ValidationResponse,
        400
      );
    }

    // 거절 처리
    await c.env.DB.prepare(
      `UPDATE ocr_validations
      SET status = 'rejected',
          validated_by = ?,
          validation_comment = ?,
          corrected_text = ?,
          updated_at = ?
      WHERE id = ?`
    )
      .bind(
        body.validatedBy || null,
        body.comment || '거절됨',
        body.correctedText || null,
        now,
        id
      )
      .run();

    // 업데이트된 레코드 조회
    const result = await c.env.DB.prepare(
      `SELECT
        id, type, status, analysis_id as analysisId,
        original_text as originalText, extracted_text as extractedText,
        corrected_text as correctedText, confidence,
        validated_by as validatedBy, validation_comment as validationComment,
        metadata, created_at as createdAt, updated_at as updatedAt
      FROM ocr_validations
      WHERE id = ?`
    )
      .bind(id)
      .first<ValidationRecord>();

    return c.json({
      success: true,
      data: result,
    } as ValidationResponse);
  } catch (error) {
    const err = error as Error;
    console.error('Failed to reject validation:', err);

    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: '검증 거절에 실패했습니다.',
        },
      } as ValidationResponse,
      500
    );
  }
});

/**
 * POST /v1/validations - 새 검증 항목 생성
 */
validationRoutes.post('/', async (c) => {
  let body: {
    type: ValidationType;
    analysisId?: string;
    originalText?: string;
    extractedText?: string;
    confidence?: number;
    metadata?: Record<string, unknown>;
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
      } as ValidationResponse,
      400
    );
  }

  if (!body.type || !['ocr', 'ai_analysis', 'pattern_match'].includes(body.type)) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'type은 ocr, ai_analysis, pattern_match 중 하나여야 합니다.',
        },
      } as ValidationResponse,
      400
    );
  }

  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `INSERT INTO ocr_validations (
        id, type, status, analysis_id, original_text, extracted_text,
        confidence, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        body.type,
        'pending',
        body.analysisId || null,
        body.originalText || null,
        body.extractedText || null,
        body.confidence || null,
        body.metadata ? JSON.stringify(body.metadata) : null,
        now,
        now
      )
      .run();

    const record: ValidationRecord = {
      id,
      type: body.type,
      status: 'pending',
      analysisId: body.analysisId || null,
      originalText: body.originalText || null,
      extractedText: body.extractedText || null,
      correctedText: null,
      confidence: body.confidence || null,
      validatedBy: null,
      validationComment: null,
      metadata: body.metadata ? JSON.stringify(body.metadata) : null,
      createdAt: now,
      updatedAt: now,
    };

    return c.json(
      {
        success: true,
        data: record,
      } as ValidationResponse,
      201
    );
  } catch (error) {
    const err = error as Error;
    console.error('Failed to create validation:', err);

    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: '검증 항목 생성에 실패했습니다.',
        },
      } as ValidationResponse,
      500
    );
  }
});

/**
 * GET /v1/validations/stats - 검증 통계
 */
validationRoutes.get('/stats/summary', async (c) => {
  try {
    const stats = await c.env.DB.prepare(
      `SELECT
        status,
        COUNT(*) as count
      FROM ocr_validations
      GROUP BY status`
    ).all<{ status: string; count: number }>();

    const byType = await c.env.DB.prepare(
      `SELECT
        type,
        COUNT(*) as count
      FROM ocr_validations
      GROUP BY type`
    ).all<{ type: string; count: number }>();

    const statusMap: Record<string, number> = {};
    const typeMap: Record<string, number> = {};

    (stats.results || []).forEach((row) => {
      statusMap[row.status] = row.count;
    });

    (byType.results || []).forEach((row) => {
      typeMap[row.type] = row.count;
    });

    return c.json({
      success: true,
      data: {
        byStatus: {
          pending: statusMap['pending'] || 0,
          approved: statusMap['approved'] || 0,
          rejected: statusMap['rejected'] || 0,
        },
        byType: {
          ocr: typeMap['ocr'] || 0,
          ai_analysis: typeMap['ai_analysis'] || 0,
          pattern_match: typeMap['pattern_match'] || 0,
        },
        total: Object.values(statusMap).reduce((a, b) => a + b, 0),
      },
    });
  } catch (error) {
    const err = error as Error;
    console.error('Failed to fetch validation stats:', err);

    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: '검증 통계 조회에 실패했습니다.',
        },
      },
      500
    );
  }
});

export { validationRoutes };
