/**
 * OCR 파이프라인 라우트
 * 2단계 파이프라인: Gemini Flash OCR → 패턴 매칭 (156개 패턴)
 * 3단계 파이프라인 (hybrid): Gemini OCR → 정규식 → Gemini LLM 검증
 *
 * POST /analyze        - 이미지 OCR + 패턴 매칭 분석 (regex only)
 * POST /analyze-hybrid - 이미지 OCR + 패턴 매칭 + AI 검증 (hybrid)
 * GET  /results        - OCR 분석 결과 목록
 * GET  /results/:id    - OCR 분석 결과 상세
 */

import { Hono } from 'hono';
import { callGeminiVision, OCR_ONLY_PROMPT } from '../../services/gemini-ocr';
import { violationDetector } from '../../modules/violation-detector';
import { verifyViolationsWithAI } from '../../services/hybrid-analyzer';
import type { ViolationItem } from '../../services/hybrid-analyzer';
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

    // 4. D1에 결과 저장 (analysis_mode = 'regex')
    try {
      await c.env.DB.prepare(`
        INSERT INTO ocr_results (
          id, image_url, extracted_text, ocr_confidence, gemini_model,
          violation_count, violations_json, score_json, grade, total_score,
          compound_violations_json, department_violations_json, options_json,
          analysis_mode, processing_time_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
        'regex',
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
        analysisMode: 'regex',
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
 * POST /api/ocr/analyze-hybrid - OCR + 패턴 매칭 + AI 검증 하이브리드 파이프라인
 *
 * 3단계: Gemini OCR → 1차 정규식 필터 → 2차 Gemini LLM 검증 → 최종 결과
 * - confirmed (aiConfidence >= 70): 정탐 확정
 * - falsePositiveCandidate (aiConfidence < 70): 오탐 후보
 */
ocrPipelineRoutes.post('/analyze-hybrid', async (c) => {
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
          analysisMode: 'hybrid',
          hybridAnalysis: {
            totalPatternMatches: 0,
            confirmedCount: 0,
            falsePositiveCandidateCount: 0,
            verifications: [],
            falsePositiveCandidates: [],
            aiProcessingTimeMs: 0,
          },
          processingTimeMs: Date.now() - startTime,
        }
      });
    }

    // 3. 1차 패턴 매칭 분석 (기존 156개 패턴 + 규칙엔진)
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

    const patternViolations = detectionResult.judgment.violations as ViolationItem[];

    // 4. 2차 AI 검증
    const hybridResult = await verifyViolationsWithAI(
      apiKey,
      extractedText,
      patternViolations
    );

    const resultId = generateId();
    const processingTimeMs = Date.now() - startTime;

    // 5. D1에 결과 저장 (analysis_mode = 'hybrid')
    try {
      await c.env.DB.prepare(`
        INSERT INTO ocr_results (
          id, image_url, extracted_text, ocr_confidence, gemini_model,
          violation_count, violations_json, score_json, grade, total_score,
          compound_violations_json, department_violations_json, options_json,
          analysis_mode, hybrid_verifications_json, false_positive_candidates_json,
          ai_processing_time_ms, processing_time_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        resultId,
        imageUrl || 'base64',
        extractedText.slice(0, 10000),
        ocrResult.confidence,
        'gemini-2.0-flash',
        hybridResult.confirmedViolations.length,
        JSON.stringify(hybridResult.confirmedViolations),
        JSON.stringify(detectionResult.judgment.score),
        detectionResult.judgment.score.grade,
        detectionResult.judgment.score.totalScore,
        detectionResult.compoundViolations ? JSON.stringify(detectionResult.compoundViolations) : null,
        detectionResult.departmentViolations ? JSON.stringify(detectionResult.departmentViolations) : null,
        options ? JSON.stringify(options) : null,
        'hybrid',
        JSON.stringify(hybridResult.verifications),
        JSON.stringify(hybridResult.falsePositiveCandidates),
        hybridResult.aiProcessingTimeMs,
        processingTimeMs
      ).run();
    } catch (dbError) {
      console.warn('[OCR Pipeline] Hybrid DB 저장 실패:', dbError);
    }

    // 6. 응답 반환
    return c.json({
      success: true,
      data: {
        id: resultId,
        imageUrl: imageUrl || 'base64',
        extractedText,
        ocrConfidence: ocrResult.confidence,
        violationCount: hybridResult.confirmedViolations.length,
        violations: hybridResult.confirmedViolations,
        score: detectionResult.judgment.score,
        grade: detectionResult.judgment.score.grade,
        compoundViolations: detectionResult.compoundViolations,
        departmentViolations: detectionResult.departmentViolations,
        analysisMode: 'hybrid',
        hybridAnalysis: {
          totalPatternMatches: patternViolations.length,
          confirmedCount: hybridResult.confirmedViolations.length,
          falsePositiveCandidateCount: hybridResult.falsePositiveCandidates.length,
          verifications: hybridResult.verifications,
          falsePositiveCandidates: hybridResult.falsePositiveCandidates,
          aiProcessingTimeMs: hybridResult.aiProcessingTimeMs,
        },
        processingTimeMs,
      }
    });

  } catch (error: unknown) {
    console.error('[OCR Pipeline] Hybrid 분석 오류:', error);
    return c.json({
      success: false,
      error: {
        code: 'HYBRID_PIPELINE_ERROR',
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
    const analysisMode = c.req.query('analysisMode');

    let query = 'SELECT id, image_url, ocr_confidence, violation_count, grade, total_score, analysis_mode, processing_time_ms, created_at FROM ocr_results';
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

    if (analysisMode) {
      conditions.push('analysis_mode = ?');
      params.push(analysisMode);
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
    if (data.hybrid_verifications_json) {
      try { data.hybridVerifications = JSON.parse(data.hybrid_verifications_json); } catch { data.hybridVerifications = []; }
    }
    if (data.false_positive_candidates_json) {
      try { data.falsePositiveCandidates = JSON.parse(data.false_positive_candidates_json); } catch { data.falsePositiveCandidates = []; }
    }

    // raw JSON 필드 제거
    delete data.violations_json;
    delete data.score_json;
    delete data.compound_violations_json;
    delete data.department_violations_json;
    delete data.options_json;
    delete data.hybrid_verifications_json;
    delete data.false_positive_candidates_json;

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
// 피드백 & 정확도 API
// ============================================

/**
 * POST /api/ocr/results/:id/feedback - 위반 항목 피드백
 * 한 위반 항목당 하나의 피드백만 허용 (중복 시 업데이트)
 */
ocrPipelineRoutes.post('/results/:id/feedback', async (c) => {
  try {
    const ocrResultId = c.req.param('id');
    const body = await c.req.json() as {
      violationIndex: number;
      humanJudgment: 'correct' | 'false_positive' | 'missed';
      comment?: string;
    };

    const { violationIndex, humanJudgment, comment } = body;

    if (violationIndex === undefined || !humanJudgment) {
      return c.json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'violationIndex와 humanJudgment가 필요합니다' }
      }, 400);
    }

    if (!['correct', 'false_positive', 'missed'].includes(humanJudgment)) {
      return c.json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'humanJudgment는 correct, false_positive, missed 중 하나여야 합니다' }
      }, 400);
    }

    // OCR 결과 조회 (위반 항목 정보 추출)
    const ocrResult = await c.env.DB.prepare(
      'SELECT violations_json, analysis_mode FROM ocr_results WHERE id = ?'
    ).bind(ocrResultId).first<{ violations_json: string; analysis_mode: string }>();

    if (!ocrResult) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'OCR 결과를 찾을 수 없습니다' }
      }, 404);
    }

    let patternId = '';
    let matchedText = '';
    let category = '';
    try {
      const violations = JSON.parse(ocrResult.violations_json || '[]');
      const v = violations[violationIndex];
      if (v) {
        patternId = v.patternId || '';
        matchedText = v.matchedText || '';
        category = v.category || '';
      }
    } catch { /* ignore parse error */ }

    const feedbackId = generateId().replace('ocr_', 'fb_');

    // UPSERT: 중복 시 업데이트
    await c.env.DB.prepare(`
      INSERT INTO ocr_feedback (
        id, ocr_result_id, violation_index, pattern_id, matched_text,
        category, analysis_mode, human_judgment, comment, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(ocr_result_id, violation_index) DO UPDATE SET
        human_judgment = excluded.human_judgment,
        comment = excluded.comment,
        updated_at = datetime('now')
    `).bind(
      feedbackId,
      ocrResultId,
      violationIndex,
      patternId,
      matchedText,
      category,
      ocrResult.analysis_mode || 'regex',
      humanJudgment,
      comment || null
    ).run();

    return c.json({ success: true, data: { id: feedbackId, ocrResultId, violationIndex, humanJudgment } });
  } catch (error: unknown) {
    return c.json({
      success: false,
      error: { code: 'FEEDBACK_ERROR', message: error instanceof Error ? error.message : String(error) }
    }, 500);
  }
});

/**
 * GET /api/ocr/results/:id/feedback - 특정 OCR 결과의 피드백 목록
 */
ocrPipelineRoutes.get('/results/:id/feedback', async (c) => {
  try {
    const ocrResultId = c.req.param('id');
    const result = await c.env.DB.prepare(
      'SELECT * FROM ocr_feedback WHERE ocr_result_id = ? ORDER BY violation_index'
    ).bind(ocrResultId).all();

    return c.json({ success: true, data: result.results || [] });
  } catch (error: unknown) {
    return c.json({
      success: false,
      error: { code: 'DB_ERROR', message: error instanceof Error ? error.message : String(error) }
    }, 500);
  }
});

/**
 * GET /api/ocr/accuracy/stats - AI 정확도 통계
 * ?period=7d|30d|all (기본: all)
 */
ocrPipelineRoutes.get('/accuracy/stats', async (c) => {
  try {
    const period = c.req.query('period') || 'all';
    let dateFilter = '';
    if (period === '7d') {
      dateFilter = "AND f.created_at >= datetime('now', '-7 days')";
    } else if (period === '30d') {
      dateFilter = "AND f.created_at >= datetime('now', '-30 days')";
    }

    // 전체 정확도
    const totalRes = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN human_judgment = 'correct' THEN 1 ELSE 0 END) as correct_count,
        SUM(CASE WHEN human_judgment = 'false_positive' THEN 1 ELSE 0 END) as false_positive_count,
        SUM(CASE WHEN human_judgment = 'missed' THEN 1 ELSE 0 END) as missed_count
      FROM ocr_feedback f
      WHERE 1=1 ${dateFilter}
    `).first<{ total: number; correct_count: number; false_positive_count: number; missed_count: number }>();

    const total = totalRes?.total || 0;
    const correctCount = totalRes?.correct_count || 0;
    const overallAccuracy = total > 0 ? Math.round((correctCount / total) * 10000) / 100 : 0;

    // 모드별 정확도 (regex vs hybrid)
    const modeRes = await c.env.DB.prepare(`
      SELECT
        analysis_mode,
        COUNT(*) as total,
        SUM(CASE WHEN human_judgment = 'correct' THEN 1 ELSE 0 END) as correct_count,
        SUM(CASE WHEN human_judgment = 'false_positive' THEN 1 ELSE 0 END) as false_positive_count
      FROM ocr_feedback f
      WHERE 1=1 ${dateFilter}
      GROUP BY analysis_mode
    `).all();

    const byMode = (modeRes.results || []).map((row: any) => ({
      mode: row.analysis_mode,
      total: row.total,
      correctCount: row.correct_count,
      falsePositiveCount: row.false_positive_count,
      accuracy: row.total > 0 ? Math.round((row.correct_count / row.total) * 10000) / 100 : 0,
    }));

    // 카테고리별 정확도
    const categoryRes = await c.env.DB.prepare(`
      SELECT
        category,
        COUNT(*) as total,
        SUM(CASE WHEN human_judgment = 'correct' THEN 1 ELSE 0 END) as correct_count,
        SUM(CASE WHEN human_judgment = 'false_positive' THEN 1 ELSE 0 END) as false_positive_count
      FROM ocr_feedback f
      WHERE category != '' AND category IS NOT NULL ${dateFilter}
      GROUP BY category
      ORDER BY total DESC
    `).all();

    const byCategory = (categoryRes.results || []).map((row: any) => ({
      category: row.category,
      total: row.total,
      correctCount: row.correct_count,
      falsePositiveCount: row.false_positive_count,
      accuracy: row.total > 0 ? Math.round((row.correct_count / row.total) * 10000) / 100 : 0,
    }));

    return c.json({
      success: true,
      data: {
        period,
        overall: {
          total,
          correctCount,
          falsePositiveCount: totalRes?.false_positive_count || 0,
          missedCount: totalRes?.missed_count || 0,
          accuracy: overallAccuracy,
        },
        byMode,
        byCategory,
      }
    });
  } catch (error: unknown) {
    return c.json({
      success: false,
      error: { code: 'STATS_ERROR', message: error instanceof Error ? error.message : String(error) }
    }, 500);
  }
});

/**
 * GET /api/ocr/accuracy/false-positives - 오탐 판정 항목 목록
 * 패턴별 false positive 빈도 순 정렬
 */
ocrPipelineRoutes.get('/accuracy/false-positives', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

    // 패턴별 FP 빈도
    const fpByPattern = await c.env.DB.prepare(`
      SELECT
        pattern_id,
        category,
        COUNT(*) as fp_count,
        GROUP_CONCAT(matched_text, ' | ') as sample_texts
      FROM ocr_feedback
      WHERE human_judgment = 'false_positive' AND pattern_id != '' AND pattern_id IS NOT NULL
      GROUP BY pattern_id
      ORDER BY fp_count DESC
      LIMIT ?
    `).bind(limit).all();

    // 개별 FP 항목
    const fpItems = await c.env.DB.prepare(`
      SELECT f.*, r.image_url, r.analysis_mode as result_mode
      FROM ocr_feedback f
      LEFT JOIN ocr_results r ON f.ocr_result_id = r.id
      WHERE f.human_judgment = 'false_positive'
      ORDER BY f.created_at DESC
      LIMIT ?
    `).bind(limit).all();

    return c.json({
      success: true,
      data: {
        byPattern: fpByPattern.results || [],
        items: fpItems.results || [],
      }
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
