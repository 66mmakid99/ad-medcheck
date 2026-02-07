/**
 * OCR 파이프라인 라우트
 * 2단계 파이프라인: Gemini Flash OCR → 패턴 매칭 (156개 패턴)
 *
 * POST /analyze - 이미지 OCR + 패턴 매칭 분석
 * GET  /results - OCR 분석 결과 목록
 * GET  /results/:id - OCR 분석 결과 상세
 */

import { Hono } from 'hono';
import { callGeminiVision, OCR_ONLY_PROMPT } from '../../services/gemini-ocr';
import { violationDetector } from '../../modules/violation-detector';
import type { D1Database } from '../../db/d1';

// ============================================
// 타입 정의
// ============================================

interface Env {
  DB: D1Database;
  GEMINI_API_KEY: string;
}

interface OcrPipelineRequest {
  imageUrl?: string;
  imageBase64?: string;
  options?: {
    categories?: string[];
    minSeverity?: 'critical' | 'major' | 'minor';
    enableCompoundDetection?: boolean;
    enableDepartmentRules?: boolean;
    department?: string;
  };
}

// ============================================
// 라우트 정의
// ============================================

const ocrPipelineRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /api/ocr/analyze - OCR + 패턴 매칭 파이프라인
 */
ocrPipelineRoutes.post('/analyze', async (c) => {
  const startTime = Date.now();

  try {
    const body = await c.req.json() as OcrPipelineRequest;
    const { imageUrl, imageBase64, options } = body;

    // 1. 입력 검증
    if (!imageUrl && !imageBase64) {
      return c.json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'imageUrl 또는 imageBase64가 필요합니다' }
      }, 400);
    }

    const apiKey = c.env.GEMINI_API_KEY;
    if (!apiKey) {
      return c.json({
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Gemini API 키가 설정되지 않았습니다' }
      }, 500);
    }

    // 2. Gemini Vision OCR - 텍스트만 추출
    const ocrResult = await callGeminiVision(
      apiKey,
      { url: imageUrl, base64: imageBase64 },
      OCR_ONLY_PROMPT
    );

    const extractedText = ocrResult.text.trim();

    if (!extractedText) {
      return c.json({
        success: true,
        data: {
          id: generateId(),
          imageUrl: imageUrl || 'base64',
          extractedText: '',
          ocrConfidence: ocrResult.confidence,
          violationCount: 0,
          violations: [],
          score: { totalScore: 0, grade: 'A', gradeDescription: '위반 없음', complianceRate: 100, details: [] },
          grade: 'A',
          processingTimeMs: Date.now() - startTime
        }
      });
    }

    // 3. 패턴 매칭 분석 (기존 156개 패턴 + 규칙엔진)
    const detectionResult = violationDetector.analyze({
      text: extractedText,
      options: {
        categories: options?.categories,
        minSeverity: options?.minSeverity,
      },
      enableCompoundDetection: options?.enableCompoundDetection ?? true,
      enableDepartmentRules: options?.enableDepartmentRules ?? true,
      department: options?.department as any,
    });

    const resultId = generateId();
    const processingTimeMs = Date.now() - startTime;

    // 4. D1에 결과 저장
    try {
      await c.env.DB.prepare(`
        INSERT INTO ocr_results (
          id, image_url, extracted_text, ocr_confidence, gemini_model,
          violation_count, violations_json, score_json, grade, total_score,
          compound_violations_json, department_violations_json, options_json,
          processing_time_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        resultId,
        imageUrl || 'base64',
        extractedText.slice(0, 10000),
        ocrResult.confidence,
        'gemini-2.0-flash',
        detectionResult.matches.length,
        JSON.stringify(detectionResult.judgment.violations),
        JSON.stringify(detectionResult.judgment.score),
        detectionResult.judgment.score.grade,
        detectionResult.judgment.score.totalScore,
        detectionResult.compoundViolations ? JSON.stringify(detectionResult.compoundViolations) : null,
        detectionResult.departmentViolations ? JSON.stringify(detectionResult.departmentViolations) : null,
        options ? JSON.stringify(options) : null,
        processingTimeMs
      ).run();
    } catch (dbError) {
      console.warn('[OCR Pipeline] DB 저장 실패:', dbError);
    }

    // 5. 응답 반환
    return c.json({
      success: true,
      data: {
        id: resultId,
        imageUrl: imageUrl || 'base64',
        extractedText,
        ocrConfidence: ocrResult.confidence,
        violationCount: detectionResult.matches.length,
        violations: detectionResult.judgment.violations,
        score: detectionResult.judgment.score,
        grade: detectionResult.judgment.score.grade,
        compoundViolations: detectionResult.compoundViolations,
        departmentViolations: detectionResult.departmentViolations,
        processingTimeMs,
      }
    });

  } catch (error: unknown) {
    console.error('[OCR Pipeline] 분석 오류:', error);
    return c.json({
      success: false,
      error: {
        code: 'OCR_PIPELINE_ERROR',
        message: error instanceof Error ? error.message : String(error)
      }
    }, 500);
  }
});

/**
 * GET /api/ocr/results - OCR 분석 결과 목록
 */
ocrPipelineRoutes.get('/results', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const offset = parseInt(c.req.query('offset') || '0');
    const grade = c.req.query('grade');
    const minViolations = c.req.query('minViolations');

    let query = 'SELECT id, image_url, ocr_confidence, violation_count, grade, total_score, processing_time_ms, created_at FROM ocr_results';
    const conditions: string[] = [];
    const params: any[] = [];

    if (grade) {
      conditions.push('grade = ?');
      params.push(grade);
    }

    if (minViolations) {
      conditions.push('violation_count >= ?');
      params.push(parseInt(minViolations));
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const results = await c.env.DB.prepare(query).bind(...params).all();

    // 전체 건수 조회
    let countQuery = 'SELECT COUNT(*) as total FROM ocr_results';
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }
    const countParams = params.slice(0, -2); // limit, offset 제외
    const countResult = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ total: number }>();

    return c.json({
      success: true,
      data: {
        results: results.results,
        pagination: {
          total: countResult?.total || 0,
          limit,
          offset,
          hasMore: (countResult?.total || 0) > offset + limit
        }
      }
    });
  } catch (error: unknown) {
    return c.json({
      success: false,
      error: { code: 'DB_ERROR', message: error instanceof Error ? error.message : String(error) }
    }, 500);
  }
});

/**
 * GET /api/ocr/results/:id - OCR 분석 결과 상세
 */
ocrPipelineRoutes.get('/results/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const result = await c.env.DB.prepare(
      'SELECT * FROM ocr_results WHERE id = ?'
    ).bind(id).first();

    if (!result) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: '결과를 찾을 수 없습니다' }
      }, 404);
    }

    // JSON 필드 파싱
    const data: any = { ...result };
    if (data.violations_json) {
      try { data.violations = JSON.parse(data.violations_json); } catch { data.violations = []; }
    }
    if (data.score_json) {
      try { data.score = JSON.parse(data.score_json); } catch { data.score = null; }
    }
    if (data.compound_violations_json) {
      try { data.compoundViolations = JSON.parse(data.compound_violations_json); } catch { data.compoundViolations = []; }
    }
    if (data.department_violations_json) {
      try { data.departmentViolations = JSON.parse(data.department_violations_json); } catch { data.departmentViolations = []; }
    }
    if (data.options_json) {
      try { data.options = JSON.parse(data.options_json); } catch { data.options = null; }
    }

    // raw JSON 필드 제거
    delete data.violations_json;
    delete data.score_json;
    delete data.compound_violations_json;
    delete data.department_violations_json;
    delete data.options_json;

    return c.json({
      success: true,
      data
    });
  } catch (error: unknown) {
    return c.json({
      success: false,
      error: { code: 'DB_ERROR', message: error instanceof Error ? error.message : String(error) }
    }, 500);
  }
});

// ============================================
// 유틸리티
// ============================================

function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ocr_${timestamp}_${random}`;
}

export { ocrPipelineRoutes };
