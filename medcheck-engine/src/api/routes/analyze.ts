/**
 * 분석 API 라우트
 * POST /v1/analyze - 의료광고 위반 분석
 * POST /v1/analyze/images - 이미지 OCR 분석
 * POST /v1/analyze/url-with-images - URL 및 이미지 통합 분석
 */

import { Hono } from 'hono';
import type { D1Database } from '../../db/d1';
import { violationDetector, GRADE_DESCRIPTIONS } from '../../modules/violation-detector';
import { patternMatcher } from '../../modules/violation-detector';
import { contextAnalyzer } from '../../modules/ai-analyzer';
import type { AnalysisGrade, ScoreResult } from '../../modules/violation-detector';
import type { ViolationResult } from '../../types';
import { ocrAdapter, createGeminiFlashClient } from '../../adapters/ocr-adapter';
import type { OCRResult, ExtractedPrice, ImageViolation } from '../../adapters/ocr-adapter';
import { imageCollector, collectImagesFromUrl } from '../../modules/image-collector';
import { priceAdValidator, validatePriceAdBatch } from '../../modules/price-ad-validator';
import type { PriceAdValidationResult } from '../../modules/price-ad-validator';
import { createPriceSaver } from '../../modules/price-saver';

// ============================================
// 타입 정의
// ============================================

export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  ENGINE_VERSION: string;
  PATTERN_VERSION: string;
  CLAUDE_API_KEY?: string;
  GEMINI_API_KEY?: string;
}

/**
 * 분석 요청
 */
export interface AnalyzeRequest {
  /** 분석할 텍스트 (필수) */
  text: string;
  /** AI 분석 활성화 */
  enableAI?: boolean;
  /** 분석 옵션 */
  options?: {
    /** 특정 카테고리만 검사 */
    categories?: string[];
    /** 최소 심각도 */
    minSeverity?: 'critical' | 'major' | 'minor';
    /** 상세 결과 포함 */
    detailed?: boolean;
    /** AI 제공자 (claude/gemini) */
    aiProvider?: 'claude' | 'gemini';
  };
  /** 메타데이터 */
  metadata?: {
    hospitalName?: string;
    department?: string;
    adType?: string;
    url?: string;
  };
}

/**
 * AI 분석 정보
 */
interface AIAnalysisInfo {
  enabled: boolean;
  provider?: string;
  itemsAnalyzed: number;
  additionalViolations: number;
  processingTimeMs: number;
  reasoning?: Array<{
    text: string;
    isViolation: boolean;
    confidence: number;
    reasoning: string;
  }>;
}

/**
 * 분석 응답
 */
export interface AnalyzeResponse {
  success: boolean;
  data?: {
    analysisId: string;
    inputLength: number;
    violationCount: number;
    violations: ViolationResult[];
    score: ScoreResult;
    grade: AnalysisGrade;
    gradeDescription: string;
    summary: string;
    recommendations: string[];
    processingTimeMs: number;
    analyzedAt: string;
    ai?: AIAnalysisInfo;
  };
  error?: {
    code: string;
    message: string;
  };
}

// ============================================
// 라우트 정의
// ============================================

const analyzeRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /v1/analyze - 텍스트 위반 분석
 */
analyzeRoutes.post('/', async (c) => {
  let body: AnalyzeRequest;

  // JSON 파싱
  try {
    body = await c.req.json<AnalyzeRequest>();
  } catch (e) {
    return c.json(
      {
        success: false,
        error: {
          code: 'PARSE_ERROR',
          message: 'Invalid JSON in request body',
        },
      } as AnalyzeResponse,
      400
    );
  }

  // text 필수 검증
  if (!body.text || typeof body.text !== 'string') {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'text 필드는 필수입니다.',
        },
      } as AnalyzeResponse,
      400
    );
  }

  // 텍스트 길이 검증
  if (body.text.length < 1) {
    return c.json(
      {
        success: false,
        error: {
          code: 'EMPTY_CONTENT',
          message: '분석할 텍스트가 비어있습니다.',
        },
      } as AnalyzeResponse,
      400
    );
  }

  if (body.text.length > 100000) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INPUT_TOO_LARGE',
          message: '텍스트가 너무 깁니다. (최대 100,000자)',
        },
      } as AnalyzeResponse,
      400
    );
  }

  try {
    const startTime = Date.now();

    // 1. 패턴 매칭 분석
    const result = violationDetector.analyze({
      text: body.text,
      options: {
        categories: body.options?.categories,
        minSeverity: body.options?.minSeverity,
      },
    });

    let allViolations = [...result.judgment.violations];
    let aiInfo: AIAnalysisInfo = {
      enabled: false,
      itemsAnalyzed: 0,
      additionalViolations: 0,
      processingTimeMs: 0,
    };

    // 2. AI 분석 (enableAI가 true인 경우)
    if (body.enableAI) {
      const provider = body.options?.aiProvider || 'gemini';
      const apiKey = provider === 'claude'
        ? c.env.CLAUDE_API_KEY
        : c.env.GEMINI_API_KEY;

      if (apiKey) {
        try {
          // AI 분석기 설정
          contextAnalyzer.configure({
            provider,
            apiKey,
            confidenceThreshold: 0.7,
            maxAIAnalysis: 5,
          });

          // AI 분석 수행
          const aiResult = await contextAnalyzer.analyze(
            body.text,
            result.matches
          );

          // AI가 추가로 발견한 위반 추가
          allViolations = [...allViolations, ...aiResult.additionalViolations];

          // AI 분석 정보
          aiInfo = {
            enabled: true,
            provider,
            itemsAnalyzed: aiResult.aiCallCount,
            additionalViolations: aiResult.additionalViolations.length,
            processingTimeMs: aiResult.aiProcessingTimeMs,
            reasoning: body.options?.detailed
              ? aiResult.aiAnalyzedItems.map(item => ({
                text: item.target.text,
                isViolation: item.result.isViolation,
                confidence: item.result.confidence,
                reasoning: item.result.reasoning,
              }))
              : undefined,
          };
        } catch (aiError) {
          // AI 분석 실패 시에도 패턴 매칭 결과는 반환
          aiInfo = {
            enabled: true,
            provider,
            itemsAnalyzed: 0,
            additionalViolations: 0,
            processingTimeMs: 0,
          };
          console.warn('AI analysis failed:', aiError);
        }
      } else {
        aiInfo = {
          enabled: false,
          itemsAnalyzed: 0,
          additionalViolations: 0,
          processingTimeMs: 0,
        };
      }
    }

    // 3. 점수 재계산 (AI 추가 위반 포함)
    const finalScore = result.judgment.score;
    if (aiInfo.additionalViolations > 0) {
      // AI가 추가로 발견한 위반에 대한 점수 추가
      finalScore.totalScore = Math.min(100, finalScore.totalScore + (aiInfo.additionalViolations * 10));

      // 등급 재계산
      if (finalScore.totalScore === 0) finalScore.grade = 'A';
      else if (finalScore.totalScore <= 10) finalScore.grade = 'B';
      else if (finalScore.totalScore <= 30) finalScore.grade = 'C';
      else if (finalScore.totalScore <= 60) finalScore.grade = 'D';
      else finalScore.grade = 'F';

      finalScore.gradeDescription = GRADE_DESCRIPTIONS[finalScore.grade];
      finalScore.complianceRate = 100 - finalScore.totalScore;
    }

    // 4. 요약 업데이트
    let summary = result.judgment.summary;
    if (aiInfo.additionalViolations > 0) {
      summary += ` AI가 ${aiInfo.additionalViolations}건의 추가 위반을 발견했습니다.`;
    }

    const totalProcessingTime = Date.now() - startTime;

    // 응답 생성
    const response: AnalyzeResponse = {
      success: true,
      data: {
        analysisId: result.id,
        inputLength: result.inputLength,
        violationCount: allViolations.length,
        violations: body.options?.detailed
          ? allViolations
          : allViolations.slice(0, 10),
        score: finalScore,
        grade: finalScore.grade,
        gradeDescription: finalScore.gradeDescription,
        summary,
        recommendations: result.judgment.recommendations,
        processingTimeMs: totalProcessingTime,
        analyzedAt: result.judgment.analyzedAt.toISOString(),
        ai: body.enableAI ? aiInfo : undefined,
      },
    };

    return c.json(response);
  } catch (error) {
    const err = error as Error;

    return c.json(
      {
        success: false,
        error: {
          code: 'ANALYSIS_ERROR',
          message: err.message,
        },
      } as AnalyzeResponse,
      500
    );
  }
});
/**
 * POST /v1/analyze-url - URL 기반 텍스트 분석
 * 대시보드 배치 분석용
 */
analyzeRoutes.post('-url', async (c) => {
  let body: { url: string; hospitalId?: number; hospitalName?: string };

  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({
      success: false,
      error: { code: 'PARSE_ERROR', message: 'Invalid JSON in request body' },
    }, 400);
  }

  if (!body.url) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'url 필드는 필수입니다.' },
    }, 400);
  }

  try {
    const startTime = Date.now();

    // 1. URL에서 HTML 가져오기
    const htmlResponse = await fetch(body.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MedCheck-Analyzer/1.0)',
        'Accept': 'text/html',
      },
    });

    if (!htmlResponse.ok) {
      return c.json({
        success: false,
        error: {
          code: 'FETCH_ERROR',
          message: `URL 접근 실패: ${htmlResponse.status} ${htmlResponse.statusText}`
        },
      }, 400);
    }

    const html = await htmlResponse.text();

    // 2. 텍스트 추출 (HTML 태그 제거)
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 50000);

    if (textContent.length < 10) {
      return c.json({
        success: false,
        error: { code: 'EMPTY_CONTENT', message: '분석할 텍스트가 부족합니다.' },
      }, 400);
    }

    // 3. 패턴 매칭 분석
    const result = violationDetector.analyze({ text: textContent });

    const totalProcessingTime = Date.now() - startTime;

    // 4. 응답 생성
    return c.json({
      success: true,
      data: {
        analysisId: result.id,
        url: body.url,
        hospitalId: body.hospitalId,
        hospitalName: body.hospitalName,
        inputLength: textContent.length,
        violationCount: result.judgment.violations.length,
        violations: result.judgment.violations,
        score: result.judgment.score,
        grade: result.judgment.score.grade,
        gradeDescription: result.judgment.score.gradeDescription,
        summary: result.judgment.summary,
        recommendations: result.judgment.recommendations,
        processingTimeMs: totalProcessingTime,
        analyzedAt: result.judgment.analyzedAt.toISOString(),
      },
    });
  } catch (error) {
    const err = error as Error;
    return c.json({
      success: false,
      error: { code: 'ANALYSIS_ERROR', message: err.message },
    }, 500);
  }
});

/**
 * POST /v1/analyze/quick - 빠른 점수 조회
 */
analyzeRoutes.post('/quick', async (c) => {
  try {
    const body = await c.req.json<{ text: string }>();

    if (!body.text) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_INPUT', message: 'text 필드는 필수입니다.' },
        },
        400
      );
    }

    const score = violationDetector.quickScore(body.text);

    return c.json({
      success: true,
      data: {
        score: score.totalScore,
        grade: score.grade,
        gradeDescription: score.gradeDescription,
        complianceRate: score.complianceRate,
      },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: { code: 'PARSE_ERROR', message: 'Invalid JSON in request body' },
      },
      400
    );
  }
});

/**
 * POST /v1/analyze/check - 위반 여부만 확인
 */
analyzeRoutes.post('/check', async (c) => {
  try {
    const body = await c.req.json<{ text: string }>();

    if (!body.text) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_INPUT', message: 'text 필드는 필수입니다.' },
        },
        400
      );
    }

    const hasViolation = violationDetector.hasViolation(body.text);

    return c.json({
      success: true,
      data: {
        hasViolation,
        message: hasViolation
          ? '위반 사항이 발견되었습니다.'
          : '위반 사항이 없습니다.',
      },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: { code: 'PARSE_ERROR', message: 'Invalid JSON in request body' },
      },
      400
    );
  }
});

/**
 * GET /v1/analyze/info - 분석 엔진 정보
 */
analyzeRoutes.get('/info', (c) => {
  const hasClaudeKey = !!c.env.CLAUDE_API_KEY;
  const hasGeminiKey = !!c.env.GEMINI_API_KEY;

  return c.json({
    success: true,
    data: {
      patternCount: violationDetector.getPatternCount(),
      categories: violationDetector.getCategories(),
      grades: GRADE_DESCRIPTIONS,
      version: c.env.ENGINE_VERSION || '1.0.0',
      patternVersion: c.env.PATTERN_VERSION || '1.0.0',
      aiAvailable: {
        claude: hasClaudeKey,
        gemini: hasGeminiKey,
      },
      ocrAvailable: hasGeminiKey, // OCR은 Gemini Flash 사용
    },
  });
});

// ============================================
// OCR 분석 엔드포인트
// ============================================

/**
 * 이미지 분석 요청 타입
 */
interface ImageAnalyzeRequest {
  /** 이미지 URL 목록 */
  imageUrls: string[];
  /** 병원 ID (DB 저장 시) */
  hospitalId?: number;
  /** 출처 URL */
  sourceUrl?: string;
  /** 옵션 */
  options?: {
    /** 가격 추출 활성화 (기본: true) */
    extractPrices?: boolean;
    /** 위반 탐지 활성화 (기본: true) */
    detectViolations?: boolean;
    /** 시각적 강조 분석 (기본: true) */
    analyzeVisualEmphasis?: boolean;
    /** 가격 광고 규정 검증 (기본: true) */
    validatePriceAd?: boolean;
    /** DB 저장 (기본: true) */
    saveToDb?: boolean;
  };
}

/**
 * 이미지 분석 응답 타입
 */
interface ImageAnalyzeResponse {
  success: boolean;
  data?: {
    totalImages: number;
    processedImages: number;
    failedImages: number;
    ocrResults: Array<{
      imageUrl: string;
      classificationType?: string;
      extractedText: string;
      textConfidence: number;
      pricesCount: number;
      violationsCount: number;
      processingTimeMs: number;
      error?: string;
    }>;
    extractedPrices: ExtractedPrice[];
    priceValidations?: PriceAdValidationResult[];
    imageViolations: ImageViolation[];
    totalProcessingTimeMs: number;
    savedToDb?: {
      ocrResultIds: number[];
      priceIds: number[];
      violationIds: number[];
    };
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * POST /v1/analyze/images - 이미지 OCR 분석
 */
analyzeRoutes.post('/images', async (c) => {
  let body: ImageAnalyzeRequest;

  try {
    body = await c.req.json<ImageAnalyzeRequest>();
  } catch (e) {
    return c.json({
      success: false,
      error: { code: 'PARSE_ERROR', message: 'Invalid JSON in request body' },
    } as ImageAnalyzeResponse, 400);
  }

  // 이미지 URL 검증
  if (!body.imageUrls || !Array.isArray(body.imageUrls) || body.imageUrls.length === 0) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'imageUrls 배열은 필수입니다.' },
    } as ImageAnalyzeResponse, 400);
  }

  if (body.imageUrls.length > 20) {
    return c.json({
      success: false,
      error: { code: 'TOO_MANY_IMAGES', message: '이미지는 최대 20개까지 분석 가능합니다.' },
    } as ImageAnalyzeResponse, 400);
  }

  // Gemini API 키 확인
  if (!c.env.GEMINI_API_KEY) {
    return c.json({
      success: false,
      error: { code: 'OCR_NOT_CONFIGURED', message: 'Gemini API 키가 설정되지 않았습니다.' },
    } as ImageAnalyzeResponse, 503);
  }

  try {
    const startTime = Date.now();

    // OCR 클라이언트 설정
    ocrAdapter.configureGeminiFlash(c.env.GEMINI_API_KEY);

    // OCR 옵션
    const ocrOptions = {
      extractPrices: body.options?.extractPrices !== false,
      detectViolations: body.options?.detectViolations !== false,
      analyzeVisualEmphasis: body.options?.analyzeVisualEmphasis !== false,
    };

    // 이미지 일괄 OCR 수행
    const ocrResults = await ocrAdapter.extractTextBatch(body.imageUrls, ocrOptions);

    // 결과 집계
    const successfulResults = ocrResults.filter(r => !r.error);
    const failedResults = ocrResults.filter(r => r.error);

    // 추출된 가격 수집
    const allPrices: ExtractedPrice[] = [];
    const allViolations: ImageViolation[] = [];

    for (const result of successfulResults) {
      if (result.extractedPrices) {
        allPrices.push(...result.extractedPrices);
      }
      if (result.violations) {
        allViolations.push(...result.violations);
      }
    }

    // 가격 광고 규정 검증
    let priceValidations: PriceAdValidationResult[] | undefined;
    if (body.options?.validatePriceAd !== false && allPrices.length > 0) {
      priceValidations = validatePriceAdBatch(
        allPrices,
        successfulResults[0]?.visualEmphasis
      );
    }

    // DB 저장 (옵션)
    let savedToDb: { ocrResultIds: number[]; priceIds: number[]; violationIds: number[] } | undefined;
    if (body.options?.saveToDb !== false && c.env.DB) {
      const priceSaver = createPriceSaver(c.env.DB);
      const ocrResultIds: number[] = [];
      const priceIds: number[] = [];
      const violationIds: number[] = [];

      for (let i = 0; i < ocrResults.length; i++) {
        const ocrResult = ocrResults[i];
        const priceValidationsForResult = priceValidations?.filter(
          pv => ocrResult.extractedPrices?.some(ep => ep.procedureName === pv.price.procedureName)
        );

        const saveResult = await priceSaver.saveOCRResultWithPrices(
          {
            ocrResult,
            hospitalId: body.hospitalId,
            sourceUrl: body.sourceUrl,
          },
          priceValidationsForResult
        );

        ocrResultIds.push(saveResult.ocrResultId);
        priceIds.push(...saveResult.priceIds);
        violationIds.push(...saveResult.violationIds);
      }

      savedToDb = { ocrResultIds, priceIds, violationIds };
    }

    const totalProcessingTime = Date.now() - startTime;

    return c.json({
      success: true,
      data: {
        totalImages: body.imageUrls.length,
        processedImages: successfulResults.length,
        failedImages: failedResults.length,
        ocrResults: ocrResults.map(r => ({
          imageUrl: r.imageUrl,
          classificationType: r.classification?.type,
          extractedText: r.text.substring(0, 500) + (r.text.length > 500 ? '...' : ''),
          textConfidence: r.confidence,
          pricesCount: r.extractedPrices?.length || 0,
          violationsCount: r.violations?.length || 0,
          processingTimeMs: r.processingTime || 0,
          error: r.error,
        })),
        extractedPrices: allPrices,
        priceValidations,
        imageViolations: allViolations,
        totalProcessingTimeMs: totalProcessingTime,
        savedToDb,
      },
    } as ImageAnalyzeResponse);
  } catch (error) {
    const err = error as Error;
    return c.json({
      success: false,
      error: { code: 'OCR_ERROR', message: err.message },
    } as ImageAnalyzeResponse, 500);
  }
});

/**
 * URL + 이미지 통합 분석 요청 타입
 */
interface UrlWithImagesAnalyzeRequest {
  /** 분석할 URL */
  url: string;
  /** 병원 ID */
  hospitalId?: number;
  /** 옵션 */
  options?: {
    /** 텍스트 위반 분석 활성화 (기본: true) */
    analyzeText?: boolean;
    /** AI 분석 활성화 */
    enableAI?: boolean;
    /** 이미지 OCR 활성화 (기본: true) */
    analyzeImages?: boolean;
    /** 최대 이미지 수 (기본: 10) */
    maxImages?: number;
    /** 가격 광고 규정 검증 */
    validatePriceAd?: boolean;
    /** DB 저장 */
    saveToDb?: boolean;
  };
}

/**
 * POST /v1/analyze/url-with-images - URL 및 이미지 통합 분석
 */
analyzeRoutes.post('/url-with-images', async (c) => {
  let body: UrlWithImagesAnalyzeRequest;

  try {
    body = await c.req.json<UrlWithImagesAnalyzeRequest>();
  } catch (e) {
    return c.json({
      success: false,
      error: { code: 'PARSE_ERROR', message: 'Invalid JSON in request body' },
    }, 400);
  }

  if (!body.url) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'url 필드는 필수입니다.' },
    }, 400);
  }

  try {
    const startTime = Date.now();
    const results: {
      textAnalysis?: AnalyzeResponse['data'];
      imageAnalysis?: ImageAnalyzeResponse['data'];
      combinedViolations: ViolationResult[];
      totalProcessingTimeMs: number;
    } = {
      combinedViolations: [],
      totalProcessingTimeMs: 0,
    };

    // 1. URL에서 HTML 가져오기
    const htmlResponse = await fetch(body.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MedCheck-Analyzer/1.0)',
        'Accept': 'text/html',
      },
    });

    if (!htmlResponse.ok) {
      throw new Error(`URL 접근 실패: ${htmlResponse.status} ${htmlResponse.statusText}`);
    }

    const html = await htmlResponse.text();

    // 2. 텍스트 분석
    if (body.options?.analyzeText !== false) {
      // 텍스트 추출 (간단한 HTML 태그 제거)
      const textContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 50000);

      // 패턴 매칭 분석
      const textResult = violationDetector.analyze({ text: textContent });
      results.textAnalysis = {
        analysisId: textResult.id,
        inputLength: textResult.inputLength,
        violationCount: textResult.judgment.violations.length,
        violations: textResult.judgment.violations,
        score: textResult.judgment.score,
        grade: textResult.judgment.score.grade,
        gradeDescription: textResult.judgment.score.gradeDescription,
        summary: textResult.judgment.summary,
        recommendations: textResult.judgment.recommendations,
        processingTimeMs: Date.now() - startTime,
        analyzedAt: textResult.judgment.analyzedAt.toISOString(),
      };

      results.combinedViolations.push(...textResult.judgment.violations);
    }

    // 3. 이미지 수집 및 OCR 분석
    if (body.options?.analyzeImages !== false && c.env.GEMINI_API_KEY) {
      const maxImages = body.options?.maxImages || 10;

      // 이미지 수집
      const imageCollection = imageCollector.collectFromHtml(html, body.url);
      const imageUrls = imageCollector.getImageUrls(imageCollection).slice(0, maxImages);

      if (imageUrls.length > 0) {
        // OCR 클라이언트 설정
        ocrAdapter.configureGeminiFlash(c.env.GEMINI_API_KEY);

        // OCR 수행
        const ocrResults = await ocrAdapter.extractTextBatch(imageUrls);
        const successfulResults = ocrResults.filter(r => !r.error);

        // 가격 및 위반 수집
        const allPrices: ExtractedPrice[] = [];
        const allViolations: ImageViolation[] = [];

        for (const result of successfulResults) {
          if (result.extractedPrices) {
            allPrices.push(...result.extractedPrices);
          }
          if (result.violations) {
            allViolations.push(...result.violations);
          }
        }

        // 가격 광고 규정 검증
        let priceValidations: PriceAdValidationResult[] | undefined;
        if (body.options?.validatePriceAd !== false && allPrices.length > 0) {
          priceValidations = validatePriceAdBatch(allPrices);
        }

        // 이미지 위반을 ViolationResult로 변환하여 추가
        for (const imgViolation of allViolations) {
          results.combinedViolations.push({
            type: imgViolation.type === 'BEFORE_AFTER' ? 'before_after' :
              imgViolation.type === 'GUARANTEE' ? 'guarantee' :
                imgViolation.type === 'EXAGGERATION' ? 'exaggeration' :
                  imgViolation.type === 'PRICE_INDUCEMENT' ? 'price_inducement' :
                    imgViolation.type === 'TESTIMONIAL' ? 'testimonial' : 'other',
            status: imgViolation.confidence >= 0.85 ? 'violation' :
              imgViolation.confidence >= 0.7 ? 'likely' : 'possible',
            severity: imgViolation.severity === 'critical' ? 'high' :
              imgViolation.severity === 'major' ? 'medium' : 'low',
            matchedText: imgViolation.text,
            description: imgViolation.description,
            legalBasis: imgViolation.legalBasis ? [{
              law: '의료법',
              article: imgViolation.legalBasis,
              description: imgViolation.description,
            }] : [],
            confidence: imgViolation.confidence,
          });
        }

        results.imageAnalysis = {
          totalImages: imageUrls.length,
          processedImages: successfulResults.length,
          failedImages: ocrResults.filter(r => r.error).length,
          ocrResults: ocrResults.map(r => ({
            imageUrl: r.imageUrl,
            classificationType: r.classification?.type,
            extractedText: r.text.substring(0, 200) + (r.text.length > 200 ? '...' : ''),
            textConfidence: r.confidence,
            pricesCount: r.extractedPrices?.length || 0,
            violationsCount: r.violations?.length || 0,
            processingTimeMs: r.processingTime || 0,
            error: r.error,
          })),
          extractedPrices: allPrices,
          priceValidations,
          imageViolations: allViolations,
          totalProcessingTimeMs: Date.now() - startTime,
        };
      }
    }

    results.totalProcessingTimeMs = Date.now() - startTime;

    return c.json({
      success: true,
      data: results,
    });
  } catch (error) {
    const err = error as Error;
    return c.json({
      success: false,
      error: { code: 'ANALYSIS_ERROR', message: err.message },
    }, 500);
  }
});

/**
 * GET /v1/analyze/price-rules - 가격 광고 규정 목록
 */
analyzeRoutes.get('/price-rules', (c) => {
  return c.json({
    success: true,
    data: {
      rules: priceAdValidator.getRules(),
    },
  });
});

export { analyzeRoutes };
