/**
 * 분석 API 라우트
 * POST /v1/analyze
 */

import { Hono } from 'hono';
import { validator } from 'hono/validator';
import type { D1Database } from '../../db/d1';
import { D1Service } from '../../db/d1';
import { Parser } from '../../core/parser';
import { Normalizer } from '../../core/normalizer';
import { createTracer } from '../../core/tracer';
import { ErrorCode, AnalysisError, InputError } from '../../core/error-handler';
import type { ModuleInput, ModuleOutput, ViolationResult } from '../../types';

// ============================================
// 타입 정의
// ============================================

/**
 * 환경 바인딩
 */
export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  ENGINE_VERSION: string;
  PATTERN_VERSION: string;
}

/**
 * 분석 요청 바디
 */
export interface AnalyzeRequest {
  /** 분석할 URL */
  url?: string;
  /** 직접 제공하는 HTML 콘텐츠 */
  html?: string;
  /** 직접 제공하는 텍스트 콘텐츠 */
  text?: string;
  /** 이미지 URL 목록 */
  images?: string[];
  /** 메타데이터 */
  metadata?: {
    hospitalName?: string;
    department?: string;
    adType?: string;
  };
  /** 옵션 */
  options?: {
    /** OCR 사용 여부 */
    useOCR?: boolean;
    /** AI 리뷰 사용 여부 */
    useAI?: boolean;
    /** 상세 결과 포함 */
    detailed?: boolean;
  };
}

/**
 * 분석 응답
 */
export interface AnalyzeResponse {
  success: boolean;
  data?: {
    analysisId: string;
    url?: string;
    violationCount: number;
    violations: ViolationResult[];
    summary: string;
    confidence: number;
    processingTimeMs: number;
    analyzedAt: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

// ============================================
// 패턴 로딩 (임시 - 실제로는 DB/KV에서 로드)
// ============================================

import patternsData from '../../../patterns/patterns.json';

interface PatternData {
  id: string;
  category: string;
  subcategory: string;
  pattern: string;
  severity: string;
  legalBasis: string;
  description: string;
}

function loadPatterns(): PatternData[] {
  return (patternsData as { patterns: PatternData[] }).patterns || [];
}

// ============================================
// 분석 로직
// ============================================

/**
 * 패턴 매칭 실행
 */
function matchPatterns(text: string, patterns: PatternData[]): ViolationResult[] {
  const violations: ViolationResult[] = [];
  const normalizedText = text.toLowerCase();

  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern.pattern, 'gi');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        const matchedText = match[0];
        const matchIndex = match.index;

        // 중복 체크
        const isDuplicate = violations.some(
          (v) => v.patternId === pattern.id && v.matchedText === matchedText
        );

        if (!isDuplicate) {
          violations.push({
            type: mapCategoryToType(pattern.category),
            status: 'violation',
            severity: mapSeverity(pattern.severity),
            matchedText,
            position: matchIndex,
            description: pattern.description,
            legalBasis: [
              {
                law: '의료법',
                article: pattern.legalBasis,
                description: pattern.description,
              },
            ],
            confidence: 0.9,
            patternId: pattern.id,
          });
        }
      }
    } catch (e) {
      // 잘못된 정규식은 스킵
      console.warn(`Invalid pattern: ${pattern.id}`, e);
    }
  }

  return violations;
}

/**
 * 카테고리 → 위반 유형 매핑
 */
function mapCategoryToType(category: string): ViolationResult['type'] {
  const mapping: Record<string, ViolationResult['type']> = {
    '치료효과보장': 'guarantee',
    '부작용부정': 'false_claim',
    '최상급표현': 'exaggeration',
    '비교광고': 'comparison',
    '환자유인': 'price_inducement',
    '전후사진': 'before_after',
    '체험기': 'testimonial',
    '금지어': 'prohibited_expression',
  };
  return mapping[category] || 'other';
}

/**
 * 심각도 매핑
 */
function mapSeverity(severity: string): ViolationResult['severity'] {
  if (severity === 'critical') return 'high';
  if (severity === 'major') return 'medium';
  return 'low';
}

/**
 * 요약 생성
 */
function generateSummary(violations: ViolationResult[]): string {
  if (violations.length === 0) {
    return '위반 사항이 발견되지 않았습니다.';
  }

  const highCount = violations.filter((v) => v.severity === 'high').length;
  const mediumCount = violations.filter((v) => v.severity === 'medium').length;
  const lowCount = violations.filter((v) => v.severity === 'low').length;

  const parts: string[] = [];
  if (highCount > 0) parts.push(`심각 ${highCount}건`);
  if (mediumCount > 0) parts.push(`주요 ${mediumCount}건`);
  if (lowCount > 0) parts.push(`경미 ${lowCount}건`);

  return `총 ${violations.length}건의 위반 발견 (${parts.join(', ')})`;
}

// ============================================
// 라우트 정의
// ============================================

const analyzeRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /v1/analyze - 분석 요청
 */
analyzeRoutes.post(
  '/',
  validator('json', (value, c) => {
    const body = value as AnalyzeRequest;

    // 최소 하나의 입력 필요
    if (!body.url && !body.html && !body.text) {
      return c.json(
        {
          success: false,
          error: {
            code: ErrorCode.EMPTY_CONTENT,
            message: 'url, html, 또는 text 중 하나는 필수입니다.',
          },
        } as AnalyzeResponse,
        400
      );
    }

    return body;
  }),
  async (c) => {
    const startTime = Date.now();
    const body = c.req.valid('json');
    const env = c.env;

    // D1 서비스 설정
    const db = new D1Service();
    db.setDatabase(env.DB);

    // 트레이서 생성
    const tracer = createTracer({ persistToDb: true, consoleLog: false });

    let analysisLogId: string | null = null;

    try {
      // 1. 분석 로그 생성
      analysisLogId = await db.createAnalysisLog(body.url || 'direct-input', {
        sourceType: body.metadata?.adType || 'unknown',
        hospitalName: body.metadata?.hospitalName,
        department: body.metadata?.department,
        engineVersion: env.ENGINE_VERSION || '1.0.0',
        patternVersion: env.PATTERN_VERSION || '1.0.0',
      });

      await tracer.startSession(analysisLogId);

      // 2. 입력 데이터 준비
      await tracer.startStep('parse');
      const parser = new Parser();
      const normalizer = new Normalizer();

      let content: string;
      let images: string[] = body.images || [];

      if (body.html) {
        const moduleInput: ModuleInput = {
          source: body.url || 'direct-input',
          content: body.html,
        };
        const parseResult = parser.parse(moduleInput);
        content = parseResult.text;
        images = [...images, ...parseResult.images];
      } else if (body.text) {
        content = body.text;
      } else {
        // URL에서 콘텐츠 가져오기 (실제로는 SCV 사용)
        throw new InputError(
          'URL 분석은 SCV 모듈이 필요합니다.',
          ErrorCode.INVALID_INPUT
        );
      }

      await tracer.completeStep({
        contentLength: content.length,
        imageCount: images.length,
      });

      // 3. 텍스트 정규화
      await tracer.startStep('normalize');
      const normalizedContent = normalizer.prepareForAnalysis(content);
      await tracer.completeStep({
        originalLength: content.length,
        normalizedLength: normalizedContent.length,
      });

      // 4. 패턴 매칭
      await tracer.startStep('pattern_match');
      const patterns = loadPatterns();
      const violations = matchPatterns(normalizedContent, patterns);

      // 패턴 매칭 트레이스
      for (const v of violations) {
        tracer.tracePatternMatch({
          patternId: v.patternId || 'unknown',
          category: v.type,
          matchedText: v.matchedText,
          position: v.position || 0,
          confidence: v.confidence,
          severity: v.severity,
          source: 'text',
        });
      }

      await tracer.completeStep({
        patternsChecked: patterns.length,
        violationsFound: violations.length,
      });

      // 5. 결과 생성
      const processingTimeMs = Date.now() - startTime;
      const confidence = violations.length > 0 ? 0.85 : 0.95;
      const summary = generateSummary(violations);

      const result: ModuleOutput = {
        violations,
        summary,
        confidence,
        processingTime: processingTimeMs,
        analyzedAt: new Date(),
      };

      // 6. 결과 저장
      await db.saveAnalysisResult(analysisLogId, result, {
        contentLength: content.length,
        imageCount: images.length,
        ocrUsed: false,
      });

      // 7. 세션 종료
      const traceSummary = await tracer.endSession({
        violationCount: violations.length,
        processingTimeMs,
      });

      // 8. 응답
      const response: AnalyzeResponse = {
        success: true,
        data: {
          analysisId: analysisLogId,
          url: body.url,
          violationCount: violations.length,
          violations: body.options?.detailed ? violations : violations.slice(0, 10),
          summary,
          confidence,
          processingTimeMs,
          analyzedAt: new Date().toISOString(),
        },
      };

      return c.json(response);
    } catch (error) {
      const err = error as Error;

      // 에러 저장
      if (analysisLogId) {
        await db.saveAnalysisError(
          analysisLogId,
          (err as AnalysisError).code || ErrorCode.ANALYSIS_ERROR,
          err.message
        );
      }

      const response: AnalyzeResponse = {
        success: false,
        error: {
          code: (err as AnalysisError).code || ErrorCode.ANALYSIS_ERROR,
          message: err.message,
        },
      };

      return c.json(response, 500);
    }
  }
);

/**
 * GET /v1/analyze/:id - 분석 결과 조회
 */
analyzeRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const env = c.env;

  const db = new D1Service();
  db.setDatabase(env.DB);

  try {
    const log = await db.getAnalysisLog(id);

    if (!log) {
      return c.json(
        {
          success: false,
          error: {
            code: ErrorCode.INVALID_INPUT,
            message: '분석 결과를 찾을 수 없습니다.',
          },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: log,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: ErrorCode.DB_QUERY_ERROR,
          message: (error as Error).message,
        },
      },
      500
    );
  }
});

export { analyzeRoutes };
