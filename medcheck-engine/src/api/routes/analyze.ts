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
import { ocrAdapter } from '../../adapters/ocr-adapter';
import type { OCRResult, ExtractedPrice, ImageViolation } from '../../adapters/ocr-adapter';
import { imageCollector, collectImagesFromUrl } from '../../modules/image-collector';
import { priceAdValidator, validatePriceAdBatch } from '../../modules/price-ad-validator';
import type { PriceAdValidationResult } from '../../modules/price-ad-validator';
import { createPriceSaver } from '../../modules/price-saver';
import { postprocessViolations } from '../../services/result-postprocessor';

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

    // 1. 패턴 매칭 분석 (URL 메타데이터로 영역 감지)
    const result = violationDetector.analyze({
      text: body.text,
      url: body.metadata?.url,
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

    // 2.5. 후처리: 네비게이션/중복/병원명 오탐 제거
    allViolations = postprocessViolations(allViolations, body.metadata?.hospitalName);

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

// NOTE: POST /v1/analyze-url은 hospitals.ts에서 Rule-First 파이프라인으로 처리됨
// (Hono 라우팅: /v1 + /analyze-url이 /v1/analyze + -url보다 우선 매칭)

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

    // 1. URL에서 HTML 가져오기 (30초 타임아웃)
    const urlController = new AbortController();
    const urlTimeoutId = setTimeout(() => urlController.abort(), 30000);

    let htmlResponse: Response;
    try {
      htmlResponse = await fetch(body.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
        },
        signal: urlController.signal,
      });
    } catch (fetchError) {
      clearTimeout(urlTimeoutId);
      const msg = fetchError instanceof Error && fetchError.name === 'AbortError'
        ? 'URL 접근 타임아웃 (30초 초과)'
        : `URL 접근 실패: ${(fetchError as Error).message}`;
      throw new Error(msg);
    }
    clearTimeout(urlTimeoutId);

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

      // 패턴 매칭 분석 (URL로 영역 감지)
      const textResult = violationDetector.analyze({ text: textContent, url: body.url });
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
            severity: imgViolation.severity === 'critical' ? 'critical' :
              imgViolation.severity === 'major' ? 'high' : 'medium',
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

// ============================================
// AI 정확도 검증 테스트
// ============================================

/**
 * 테스트 케이스: 실제 의료광고 표현 (정답 라벨 포함)
 */
const ACCURACY_TEST_CASES: Array<{
  id: string;
  text: string;
  expectedViolation: boolean;
  expectedCategory?: string;
  expectedSeverity?: string;
  description: string;
}> = [
  // === True Positives (위반이어야 함) ===
  { id: 'TP-01', text: '본원은 100% 완치를 보장합니다.', expectedViolation: true, expectedCategory: '치료효과보장', expectedSeverity: 'critical', description: '100% 완치 보장 표현' },
  { id: 'TP-02', text: '수술 후 부작용은 전혀 없습니다.', expectedViolation: true, expectedCategory: '부작용부정', expectedSeverity: 'critical', description: '부작용 완전 부정' },
  { id: 'TP-03', text: '국내 최초! 최고의 기술력으로 시술합니다.', expectedViolation: true, expectedCategory: '최상급표현', expectedSeverity: 'major', description: '최초/최고 표현' },
  { id: 'TP-04', text: '타 병원보다 50% 이상 효과적인 치료법', expectedViolation: true, expectedCategory: '비교광고', expectedSeverity: 'major', description: '타 병원 비교' },
  { id: 'TP-05', text: '지금 예약하시면 시술비 무료! 선착순 10명', expectedViolation: true, expectedCategory: '환자유인', expectedSeverity: 'major', description: '무료 시술 환자유인' },
  { id: 'TP-06', text: '수술 전후 사진을 보시면 효과를 확인하실 수 있습니다.', expectedViolation: true, expectedCategory: '치료경험담', description: '전후 사진 유도' },
  { id: 'TP-07', text: '영구적인 효과로 재수술이 필요 없습니다.', expectedViolation: true, expectedCategory: '치료효과보장', expectedSeverity: 'critical', description: '영구적 효과 + 재수술 불필요' },
  { id: 'TP-08', text: '연예인 OOO도 다녀간 병원', expectedViolation: true, expectedCategory: '환자유인', description: '유명인 이용 광고' },
  { id: 'TP-09', text: '이 시술은 통증이 전혀 없어 마취 없이도 가능합니다.', expectedViolation: true, expectedCategory: '부작용부정', description: '무통 단정' },
  { id: 'TP-10', text: '1회 시술만으로 확실한 효과를 보장합니다.', expectedViolation: true, expectedCategory: '치료효과보장', description: '1회 효과 보장' },
  { id: 'TP-11', text: '이번 달 한정 50% 할인 이벤트 진행중! 놓치지 마세요.', expectedViolation: true, expectedCategory: '환자유인', description: '한정 할인 이벤트' },
  { id: 'TP-12', text: '만족도 100%! 5000명의 환자가 선택한 시술', expectedViolation: true, expectedCategory: '치료효과보장', description: '만족도 100% 표현' },

  // === True Negatives (위반 아니어야 함) ===
  { id: 'TN-01', text: '본원은 서울특별시 강남구에 위치하고 있습니다.', expectedViolation: false, description: '단순 위치 정보' },
  { id: 'TN-02', text: '진료 시간: 월~금 09:00~18:00, 토 09:00~13:00', expectedViolation: false, description: '진료 시간 안내' },
  { id: 'TN-03', text: '해당 시술은 개인에 따라 효과가 다를 수 있습니다.', expectedViolation: false, description: '효과 차이 면책 고지' },
  { id: 'TN-04', text: '의료진 소개: 김OO 원장 - 대한피부과학회 정회원', expectedViolation: false, description: '의료진 자격 소개' },
  { id: 'TN-05', text: '100% 소독된 장비를 사용합니다.', expectedViolation: false, description: '100% 소독 (예외 표현)' },
  { id: 'TN-06', text: '시술 후 붓기, 멍 등 일시적인 부작용이 있을 수 있습니다.', expectedViolation: false, description: '부작용 고지 (적법)' },
  { id: 'TN-07', text: '건강보험심사평가원 평가 1등급 병원', expectedViolation: false, description: '공인기관 평가 결과' },
  { id: 'TN-08', text: '예약 문의는 전화 02-1234-5678로 연락주세요.', expectedViolation: false, description: '연락처 안내' },

  // === Edge Cases (경계선) ===
  { id: 'EC-01', text: '높은 만족도를 자랑하는 시술입니다.', expectedViolation: true, description: '애매한 만족도 주장' },
  { id: 'EC-02', text: '검증된 안전한 시술 방법입니다.', expectedViolation: false, description: '검증 표현 (경계선)' },
  { id: 'EC-03', text: '빠른 회복이 가능한 최신 장비를 도입하였습니다.', expectedViolation: false, description: '빠른 회복 (장비 문맥)' },
];

/**
 * POST /v1/analyze/accuracy-test - 정확도 검증 테스트
 * Pattern-only vs Hybrid 비교, 내장 테스트 케이스 + 사용자 커스텀 지원
 */
analyzeRoutes.post('/accuracy-test', async (c) => {
  const body = await c.req.json<{
    includeBuiltin?: boolean;
    customCases?: Array<{ id: string; text: string; expectedViolation: boolean; description?: string }>;
    enableAI?: boolean;
    aiProvider?: 'claude' | 'gemini';
  }>().catch(() => ({}));

  const includeBuiltin = body.includeBuiltin !== false;
  const enableAI = body.enableAI ?? false;
  const provider = body.aiProvider || 'gemini';

  // 테스트 케이스 구성
  const cases = [
    ...(includeBuiltin ? ACCURACY_TEST_CASES : []),
    ...(body.customCases || []).map(c => ({ ...c, expectedCategory: undefined, expectedSeverity: undefined, description: c.description || '' })),
  ];

  if (cases.length === 0) {
    return c.json({ success: false, error: { code: 'NO_CASES', message: '테스트 케이스가 없습니다.' } }, 400);
  }

  const startTime = Date.now();

  // Pattern-only 분석
  const patternResults: Array<{
    id: string;
    text: string;
    expected: boolean;
    patternDetected: boolean;
    patternCorrect: boolean;
    violationCount: number;
    grade: string;
    confidence: number;
    matchedCategories: string[];
  }> = [];

  for (const tc of cases) {
    const result = violationDetector.analyze({
      text: tc.text,
      enableExtendedAnalysis: false,
    });
    const detected = result.judgment.violations.length > 0;
    const matchedCategories = [...new Set(result.matches.map(m => m.category))];
    const maxConfidence = result.matches.length > 0
      ? Math.max(...result.matches.map(m => m.confidence))
      : 0;

    patternResults.push({
      id: tc.id,
      text: tc.text,
      expected: tc.expectedViolation,
      patternDetected: detected,
      patternCorrect: detected === tc.expectedViolation,
      violationCount: result.judgment.violations.length,
      grade: result.judgment.score.grade,
      confidence: maxConfidence,
      matchedCategories,
    });
  }

  // Hybrid (AI) 분석 (옵션)
  let hybridResults: typeof patternResults | null = null;
  let aiStats = { enabled: false, provider: '', callsMade: 0, processingTimeMs: 0 };

  if (enableAI) {
    const apiKey = provider === 'claude' ? c.env.CLAUDE_API_KEY : c.env.GEMINI_API_KEY;
    if (apiKey) {
      hybridResults = [];
      const aiStart = Date.now();
      let aiCalls = 0;

      contextAnalyzer.configure({
        provider,
        apiKey,
        confidenceThreshold: 0.7,
        maxAIAnalysis: 5,
      });

      for (const tc of cases) {
        const patternResult = violationDetector.analyze({
          text: tc.text,
          enableExtendedAnalysis: false,
        });

        try {
          const aiResult = await contextAnalyzer.analyze(tc.text, patternResult.matches);
          aiCalls += aiResult.aiCallCount;

          const allViolations = [...patternResult.judgment.violations, ...aiResult.additionalViolations];
          const detected = allViolations.length > 0;
          const matchedCategories = [...new Set(patternResult.matches.map(m => m.category))];

          hybridResults.push({
            id: tc.id,
            text: tc.text,
            expected: tc.expectedViolation,
            patternDetected: detected,
            patternCorrect: detected === tc.expectedViolation,
            violationCount: allViolations.length,
            grade: patternResult.judgment.score.grade,
            confidence: patternResult.matches.length > 0
              ? Math.max(...patternResult.matches.map(m => m.confidence))
              : 0,
            matchedCategories,
          });
        } catch {
          // AI 실패 시 pattern 결과 사용
          hybridResults.push(patternResults.find(r => r.id === tc.id)!);
        }
      }

      aiStats = { enabled: true, provider, callsMade: aiCalls, processingTimeMs: Date.now() - aiStart };
    }
  }

  // 메트릭 계산 함수
  const calcMetrics = (results: typeof patternResults) => {
    const tp = results.filter(r => r.expected && r.patternDetected).length;
    const tn = results.filter(r => !r.expected && !r.patternDetected).length;
    const fp = results.filter(r => !r.expected && r.patternDetected).length;
    const fn = results.filter(r => r.expected && !r.patternDetected).length;

    const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
    const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
    const accuracy = results.length > 0 ? (tp + tn) / results.length : 0;

    return { tp, tn, fp, fn, precision: +precision.toFixed(4), recall: +recall.toFixed(4), f1: +f1.toFixed(4), accuracy: +accuracy.toFixed(4) };
  };

  const patternMetrics = calcMetrics(patternResults);
  const hybridMetrics = hybridResults ? calcMetrics(hybridResults) : null;

  // 오분류 상세
  const misclassified = patternResults.filter(r => !r.patternCorrect).map(r => ({
    id: r.id,
    text: r.text.substring(0, 80),
    expected: r.expected ? 'violation' : 'clean',
    got: r.patternDetected ? 'violation' : 'clean',
    type: r.expected && !r.patternDetected ? 'false_negative' : 'false_positive',
    confidence: r.confidence,
    matchedCategories: r.matchedCategories,
  }));

  return c.json({
    success: true,
    data: {
      totalCases: cases.length,
      processingTimeMs: Date.now() - startTime,
      pattern: {
        metrics: patternMetrics,
        details: patternResults,
      },
      ...(hybridMetrics ? {
        hybrid: {
          metrics: hybridMetrics,
          ai: aiStats,
          details: hybridResults,
        },
        comparison: {
          accuracyDelta: +(hybridMetrics.accuracy - patternMetrics.accuracy).toFixed(4),
          f1Delta: +(hybridMetrics.f1 - patternMetrics.f1).toFixed(4),
          recallDelta: +(hybridMetrics.recall - patternMetrics.recall).toFixed(4),
          precisionDelta: +(hybridMetrics.precision - patternMetrics.precision).toFixed(4),
          aiCallsMade: aiStats.callsMade,
          aiProcessingTimeMs: aiStats.processingTimeMs,
        },
      } : {}),
      misclassified,
    },
  });
});

/**
 * GET /v1/analyze/accuracy-test/cases - 내장 테스트 케이스 목록
 */
analyzeRoutes.get('/accuracy-test/cases', (c) => {
  return c.json({
    success: true,
    data: {
      totalCases: ACCURACY_TEST_CASES.length,
      truePositives: ACCURACY_TEST_CASES.filter(c => c.expectedViolation).length,
      trueNegatives: ACCURACY_TEST_CASES.filter(c => !c.expectedViolation).length,
      cases: ACCURACY_TEST_CASES,
    },
  });
});

export { analyzeRoutes };
