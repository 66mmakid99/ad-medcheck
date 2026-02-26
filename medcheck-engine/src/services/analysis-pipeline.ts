/**
 * 통합 분석 파이프라인 (Analysis Pipeline) v2.1
 * 
 * [v2.1 변경] 오탐 후처리 추가
 * - 병원명 포함 키워드 오탐 제거 ("뷰티스킨피부과"에서 "피부과" 위반 제거)
 * - 같은 패턴 ID 중복 제거 (30회 반복 → 1건으로)
 * - 네비게이션 반복 텍스트 필터링
 * - 후처리 후 점수 재계산
 * 
 * 위치: src/services/analysis-pipeline.ts
 */

import { violationDetector } from '../modules/violation-detector';
import type { DetectionResponse, ScoreResult, AnalysisGrade } from '../modules/violation-detector';
import { verifyViolationsWithAI } from './hybrid-analyzer';
import type { HybridResult, ViolationItem } from './hybrid-analyzer';
import { postprocessViolations } from './result-postprocessor';
import type { ViolationResult } from '../types';
import { fetchWithEncoding } from '../utils/fetch-with-encoding';
import { collectImagesFromHtml } from '../modules/image-collector';
import { callGeminiVision, OCR_ONLY_PROMPT } from './gemini-ocr';

// Phase 3: Gemini 파이프라인 통합
import { loadPatternsForPrompt } from './pattern-loader';
import { buildViolationPrompt } from './gemini-violation-prompt';
import { callGeminiForViolation } from './gemini-client';
import { GeminiAuditor } from './gemini-auditor';
import type { AuditResult } from '../types/violation-types';

// Phase 4: 크로스 인텔리전스
import { syncSalesDataForMedcheck, syncMedcheckDataForSales, getCachedCrawl } from './cross-intelligence';

// Phase 6: Flywheel 자동 고도화
import { FlywheelCollector } from './flywheel-collector';

// Phase 7: Gray Zone 사례집
import { GrayZoneCollector } from './gray-zone-collector';

// ============================================
// 타입 정의
// ============================================

export interface PipelineInput {
  url: string;
  hospitalId?: number;
  hospitalName?: string;
  enableAI?: boolean;
  batchId?: string;
  timeout?: number;
}

export interface PipelineResult {
  success: boolean;
  analysis?: {
    cleanScore: number;
    grade: AnalysisGrade;
    gradeEmoji: string;
    gradeDescription: string;
    violationCount: number;
    criticalCount: number;
    majorCount: number;
    minorCount: number;
    violations: ViolationResult[];
    recommendations: string[];
    summary: string;
    /** 원본 위반 수 (후처리 전) */
    rawViolationCount?: number;
    /** 후처리로 제거된 오탐 수 */
    filteredCount?: number;
    aiVerification?: {
      verified: boolean;
      confirmedCount: number;
      falsePositiveCount: number;
      processingTimeMs: number;
    };
  };
  meta: {
    url: string;
    hospitalId?: number;
    textLength: number;
    analysisTimeMs: number;
    fetchTimeMs: number;
    timestamp: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

const GRADE_EMOJI: Record<string, string> = {
  S: '☀️', A: '🌤️', B: '⛅', C: '🌥️', D: '🌧️', F: '⛈️',
};

const GRADE_DESCRIPTION: Record<string, string> = {
  S: '쾌적 - 위반 없음',
  A: '화창 - 경미한 이슈',
  B: '맑음 - 일부 개선 필요',
  C: '흐림 - 개선 권고',
  D: '주의 - 시정 필요',
  F: '경고 - 즉시 시정 필요',
};

// ============================================
// HTML → 텍스트 추출
// ============================================

function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|h[1-6]|li|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/^\s+|\s+$/gm, '')
    .trim()
    .substring(0, 15000);
}

// ============================================
// 등급 재계산 (후처리 후)
// ============================================

function recalculateGrade(violations: any[]): {
  cleanScore: number;
  grade: string;
  gradeEmoji: string;
  gradeDescription: string;
  criticalCount: number;
  majorCount: number;
  minorCount: number;
} {
  const criticalCount = violations.filter((v: any) => v.severity === 'high' || v.severity === 'critical').length;
  const majorCount = violations.filter((v: any) => v.severity === 'medium' || v.severity === 'major').length;
  const minorCount = violations.filter((v: any) => v.severity === 'low' || v.severity === 'minor').length;

  const deduction = (criticalCount * 25) + (majorCount * 12) + (minorCount * 5);
  const cleanScore = Math.max(0, 100 - deduction);

  let grade: string;
  if (cleanScore >= 100) grade = 'S';
  else if (cleanScore >= 90) grade = 'A';
  else if (cleanScore >= 70) grade = 'B';
  else if (cleanScore >= 50) grade = 'C';
  else if (cleanScore >= 30) grade = 'D';
  else grade = 'F';

  return {
    cleanScore,
    grade,
    gradeEmoji: GRADE_EMOJI[grade] || '❓',
    gradeDescription: GRADE_DESCRIPTION[grade] || '',
    criticalCount,
    majorCount,
    minorCount,
  };
}

// ============================================
// 메인 파이프라인
// ============================================

export async function runAnalysisPipeline(
  input: PipelineInput,
  geminiApiKey?: string,
): Promise<PipelineResult> {
  const startTime = Date.now();
  const timeout = input.timeout || 25000;

  const meta: PipelineResult['meta'] = {
    url: input.url,
    hospitalId: input.hospitalId,
    textLength: 0,
    analysisTimeMs: 0,
    fetchTimeMs: 0,
    timestamp: new Date().toISOString(),
  };

  try {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Step 1: HTML 가져오기 (인코딩 자동 감지)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const fetchStart = Date.now();
    let html: string;
    try {
      const fetchResult = await fetchWithEncoding(input.url, 25000);
      html = fetchResult.html;
      meta.fetchTimeMs = Date.now() - fetchStart;

      if (fetchResult.statusCode && fetchResult.statusCode >= 400) {
        return {
          success: false,
          meta,
          error: {
            code: 'HTTP_ERROR',
            message: `HTTP ${fetchResult.statusCode}`,
          },
        };
      }
    } catch (fetchError) {
      meta.fetchTimeMs = Date.now() - fetchStart;
      const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError';
      return {
        success: false,
        meta,
        error: {
          code: isTimeout ? 'FETCH_TIMEOUT' : 'FETCH_ERROR',
          message: isTimeout
            ? `URL 접근 타임아웃 (25초 초과)`
            : `URL 접근 실패: ${(fetchError as Error).message}`,
        },
      };
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Step 2: 텍스트 추출
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const text = extractTextFromHtml(html);
    meta.textLength = text.length;

    if (text.length < 50) {
      const htmlSample = html.substring(0, 5000);
      const isSPA = /<div\s+id=["'](app|root|__next|__nuxt)["']/.test(html)
        || /react|vue|angular|next|nuxt/i.test(htmlSample)
        || html.includes('__NEXT_DATA__')
        || html.includes('window.__NUXT__')
        || html.includes('_app.js')
        || html.includes('chunk.js');

      return {
        success: false,
        meta,
        error: {
          code: isSPA ? 'SPA_SITE' : 'NO_CONTENT',
          message: isSPA
            ? `SPA 사이트입니다 (JavaScript 렌더링 필요).`
            : `추출된 텍스트가 너무 짧습니다 (${text.length}자).`,
        },
      };
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Step 3: 패턴 매칭 + 규칙 엔진
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const analysisStart = Date.now();
    const detectionResult: DetectionResponse = violationDetector.analyze({
      text,
      enableExtendedAnalysis: true,
      enableCompoundDetection: true,
      enableDepartmentRules: true,
      enableImpressionAnalysis: true,
      enableMandatoryCheck: true,
    });

    const rawViolations = detectionResult.judgment.violations;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Step 3.2: 이미지 OCR
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let ocrViolations: any[] = [];
    if (geminiApiKey && html) {
      try {
        const images = collectImagesFromHtml(html, {
          maxImages: 5, minWidth: 200, minHeight: 100,
          excludePatterns: [/logo/i, /icon/i, /favicon/i, /avatar/i],
        });
        if (images.length > 0) {
          console.log(`[Pipeline] OCR: ${images.length}개 이미지 발견`);
          for (const img of images.slice(0, 5)) {
            try {
              const ocrResult = await callGeminiVision(geminiApiKey, { url: img.url }, OCR_ONLY_PROMPT);
              if (ocrResult.text && ocrResult.text.length > 20) {
                const ocrDetection = violationDetector.analyze({
                  text: ocrResult.text,
                  enableExtendedAnalysis: false, enableCompoundDetection: false,
                  enableDepartmentRules: false, enableImpressionAnalysis: false,
                  enableMandatoryCheck: false,
                });
                for (const v of ocrDetection.judgment.violations) {
                  (v as any).source = 'ocr';
                  (v as any).imageUrl = img.url;
                }
                ocrViolations.push(...ocrDetection.judgment.violations);
              }
            } catch (ocrError) {
              console.warn(`[Pipeline] OCR failed for ${img.url}:`, ocrError);
            }
          }
        }
      } catch (imgError) {
        console.warn('[Pipeline] Image collection failed:', imgError);
      }
    }
    const allRawViolations = [...rawViolations, ...ocrViolations];

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Step 3.5: [v2.1 신규] 오탐 후처리
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const violations = postprocessViolations(allRawViolations, input.hospitalName);
    const filteredCount = allRawViolations.length - violations.length;

    // 후처리 후 등급 재계산
    const gradeResult = recalculateGrade(violations);

    let aiVerification: PipelineResult['analysis'] extends { aiVerification?: infer T } ? T : never;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Step 4: (선택) AI 하이브리드 검증
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (input.enableAI && geminiApiKey && violations.length > 0) {
      try {
        const violationItems: ViolationItem[] = violations.map((v: any) => ({
          patternId: v.patternId || 'unknown',
          category: v.type,
          severity: v.severity,
          matchedText: v.matchedText,
          description: v.description,
          legalBasis: v.legalBasis?.[0]?.article || '',
          confidence: v.confidence,
        }));

        const hybridResult: HybridResult = await verifyViolationsWithAI(
          geminiApiKey,
          text.substring(0, 5000),
          violationItems,
        );

        aiVerification = {
          verified: true,
          confirmedCount: hybridResult.confirmedViolations.length,
          falsePositiveCount: hybridResult.falsePositiveCandidates.length,
          processingTimeMs: hybridResult.aiProcessingTimeMs,
        };
      } catch (aiError) {
        console.warn('[Pipeline] AI verification failed:', aiError);
        aiVerification = {
          verified: false,
          confirmedCount: 0,
          falsePositiveCount: 0,
          processingTimeMs: 0,
        };
      }
    }

    meta.analysisTimeMs = Date.now() - analysisStart;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Step 5: 결과 반환
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    return {
      success: true,
      analysis: {
        cleanScore: gradeResult.cleanScore,
        grade: gradeResult.grade as AnalysisGrade,
        gradeEmoji: gradeResult.gradeEmoji,
        gradeDescription: gradeResult.gradeDescription,
        violationCount: violations.length,
        criticalCount: gradeResult.criticalCount,
        majorCount: gradeResult.majorCount,
        minorCount: gradeResult.minorCount,
        violations,
        recommendations: detectionResult.judgment.recommendations,
        summary: detectionResult.judgment.summary,
        rawViolationCount: rawViolations.length,
        filteredCount,
        aiVerification,
      },
      meta,
    };

  } catch (error) {
    return {
      success: false,
      meta: { ...meta, analysisTimeMs: Date.now() - startTime },
      error: {
        code: 'PIPELINE_ERROR',
        message: `분석 파이프라인 오류: ${(error as Error).message}`,
      },
    };
  }
}

// ============================================
// DB 저장 헬퍼
// ============================================

export async function savePipelineResult(
  db: any,
  input: PipelineInput,
  result: PipelineResult,
): Promise<void> {
  if (result.success && result.analysis) {
    const a = result.analysis;

    await db.prepare(`
      INSERT INTO analysis_history (
        batch_id, hospital_id, hospital_name, url_analyzed,
        clean_score, grade, grade_emoji,
        violation_count, critical_count, major_count, minor_count,
        violations_json, recommendations_json,
        ai_verified, ai_confirmed_count, ai_fp_count,
        text_length, analysis_time_ms, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success')
    `).bind(
      input.batchId || null,
      input.hospitalId || null,
      input.hospitalName || null,
      input.url,
      a.cleanScore,
      a.grade,
      a.gradeEmoji,
      a.violationCount,
      a.criticalCount,
      a.majorCount,
      a.minorCount,
      JSON.stringify(a.violations.map((v: any) => ({
        type: v.type,
        severity: v.severity,
        matchedText: v.matchedText,
        description: v.description,
        confidence: v.confidence,
      }))),
      JSON.stringify(a.recommendations),
      a.aiVerification?.verified ? 1 : 0,
      a.aiVerification?.confirmedCount || 0,
      a.aiVerification?.falsePositiveCount || 0,
      result.meta.textLength,
      result.meta.analysisTimeMs,
    ).run();

    if (input.hospitalId) {
      await db.prepare(`
        UPDATE crawl_queue
        SET status = 'completed',
            last_analyzed_at = datetime('now'),
            next_analyze_after = datetime('now', '+7 days'),
            retry_count = 0,
            error_message = NULL,
            updated_at = datetime('now')
        WHERE hospital_id = ?
      `).bind(input.hospitalId).run();
    }

  } else {
    await db.prepare(`
      INSERT INTO analysis_history (
        batch_id, hospital_id, hospital_name, url_analyzed,
        status, error_message
      ) VALUES (?, ?, ?, ?, 'error', ?)
    `).bind(
      input.batchId || null,
      input.hospitalId || null,
      input.hospitalName || null,
      input.url,
      result.error?.message || 'Unknown error',
    ).run();

    if (input.hospitalId) {
      await db.prepare(`
        UPDATE crawl_queue
        SET status = CASE
              WHEN retry_count >= max_retries THEN 'failed'
              ELSE 'pending'
            END,
            retry_count = retry_count + 1,
            error_message = ?,
            updated_at = datetime('now')
        WHERE hospital_id = ?
      `).bind(
        result.error?.message || 'Unknown error',
        input.hospitalId,
      ).run();
    }
  }
}

// ============================================
// Phase 3: Gemini 위반 분석 파이프라인
// ============================================

export interface GeminiPipelineInput {
  url: string;
  hospitalId?: string;
  hospitalName?: string;
  /** 이미 크롤링한 데이터가 있으면 재사용 (Firecrawl/MADMEDSALES 캐시) */
  crawlData?: { text: string; images?: { base64: string; mimeType: string }[] };
  /** MADMEDSALES 확정 장비명 (동적 네거티브) */
  confirmedDevices?: string[];
  /** MADMEDSALES 확정 시술명 (동적 네거티브) */
  confirmedTreatments?: string[];
  /** Gray Zone 사례 (Phase 7에서 추가) */
  grayZoneExamples?: any[];
  /** Supabase URL (Phase 4: 크로스 인텔리전스) */
  supabaseUrl?: string;
  /** Supabase Anon Key */
  supabaseKey?: string;
  /** D1 DB (Phase 6: Flywheel 수집) */
  db?: any;
  /** Firecrawl Self-hosted URL (SPA fallback) */
  firecrawlUrl?: string;
  /** Firecrawl API Key */
  firecrawlApiKey?: string;
}

export interface GeminiPipelineResult {
  success: boolean;
  audit?: AuditResult;
  meta: {
    url: string;
    hospitalId?: string;
    textLength: number;
    fetchTimeMs: number;
    geminiTimeMs: number;
    auditTimeMs: number;
    totalTimeMs: number;
    timestamp: string;
    mode: 'gemini';
    /** 크롤링 방법: fetch | firecrawl | crawlData | supabase_cache */
    crawlMethod?: string;
    /** Phase 4: 크로스 인텔리전스 결과 */
    crossIntel?: {
      salesSyncDone: boolean;
      dynamicNegatives: number;
      medcheckSyncDone: boolean;
      cachedCrawlUsed: boolean;
    };
  };
  error?: { code: string; message: string };
}

/**
 * Gemini 위반 분석 파이프라인
 * URL → HTML 크롤링 → Gemini 분석 → GeminiAuditor 검증 → 결과
 */
export async function runGeminiPipeline(
  input: GeminiPipelineInput,
  geminiApiKey: string,
): Promise<GeminiPipelineResult> {
  const startTime = Date.now();
  const meta: GeminiPipelineResult['meta'] = {
    url: input.url,
    hospitalId: input.hospitalId,
    textLength: 0,
    fetchTimeMs: 0,
    geminiTimeMs: 0,
    auditTimeMs: 0,
    totalTimeMs: 0,
    timestamp: new Date().toISOString(),
    mode: 'gemini',
  };

  // Phase 4: 크로스 인텔리전스 추적
  const crossIntelMeta = {
    salesSyncDone: false,
    dynamicNegatives: 0,
    medcheckSyncDone: false,
    cachedCrawlUsed: false,
  };

  try {
    // ━━━━ Step 0: MADMEDSALES → 동적 네거티브 리스트 (Phase 4) ━━━━
    let dynamicDevices = input.confirmedDevices || [];
    let dynamicTreatments = input.confirmedTreatments || [];

    if (input.supabaseUrl && input.supabaseKey && input.hospitalId) {
      try {
        const salesData = await syncSalesDataForMedcheck(
          input.hospitalId,
          input.supabaseUrl,
          input.supabaseKey,
        );
        dynamicDevices = [...dynamicDevices, ...salesData.confirmedDevices];
        dynamicTreatments = [...dynamicTreatments, ...salesData.confirmedTreatments];
        crossIntelMeta.salesSyncDone = true;
        crossIntelMeta.dynamicNegatives = salesData.confirmedDevices.length + salesData.confirmedTreatments.length;
        console.log(`[GeminiPipeline] CrossIntel: +${crossIntelMeta.dynamicNegatives} dynamic negatives from MADMEDSALES`);
      } catch (e) {
        console.warn(`[GeminiPipeline] CrossIntel sales sync skipped:`, (e as Error).message);
      }
    }

    // ━━━━ Step 1: 텍스트 가져오기 (crawlData → Supabase 캐시 → fetch → Firecrawl fallback) ━━━━
    let text: string;
    let images: { base64: string; mimeType: string }[] | undefined;
    let crawlMethod: string = 'fetch';
    let firecrawlDebug = '';

    if (input.crawlData) {
      text = input.crawlData.text;
      images = input.crawlData.images;
      meta.fetchTimeMs = 0;
      crawlMethod = 'crawlData';
    } else {
      // Phase 4: MADMEDSALES 크롤링 캐시 확인
      let cachedText: string | null = null;
      if (input.supabaseUrl && input.supabaseKey) {
        try {
          const cached = await getCachedCrawl(input.url, input.supabaseUrl, input.supabaseKey);
          if (cached) {
            cachedText = cached.text;
            crossIntelMeta.cachedCrawlUsed = true;
            crawlMethod = 'supabase_cache';
            console.log(`[GeminiPipeline] CrossIntel: using cached crawl (${cachedText.length} chars)`);
          }
        } catch {
          // 캐시 없으면 직접 크롤링
        }
      }

      if (cachedText) {
        text = cachedText;
        meta.fetchTimeMs = 0;
      } else {
        // 1차: 기본 fetch
        const fetchStart = Date.now();
        try {
          const fetchResult = await fetchWithEncoding(input.url, input.firecrawlUrl ? 10000 : 25000);
          text = extractTextFromHtml(fetchResult.html);
          meta.fetchTimeMs = Date.now() - fetchStart;
          crawlMethod = 'fetch';
        } catch (fetchError) {
          meta.fetchTimeMs = Date.now() - fetchStart;
          // fetch 자체가 실패해도 Firecrawl fallback 시도
          text = '';
          crawlMethod = 'fetch_failed';
          console.warn(`[GeminiPipeline] Basic fetch failed: ${(fetchError as Error).message}`);
        }

        // 2차: Firecrawl fallback (텍스트 200자 미만이면 SPA 가능성)
        if (text.length < 200 && input.firecrawlUrl && input.firecrawlApiKey) {
          console.log(`[GeminiPipeline] Basic fetch got ${text.length} chars, falling back to Firecrawl`);
          firecrawlDebug = `firecrawlUrl=${input.firecrawlUrl}`;
          const fcStart = Date.now();
          try {
            const fcResponse = await fetch(`${input.firecrawlUrl}/v1/scrape`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${input.firecrawlApiKey}`,
              },
              body: JSON.stringify({
                url: input.url,
                formats: ['markdown'],
                waitFor: 3000,
              }),
              signal: AbortSignal.timeout(25000),
            });

            firecrawlDebug += `, status=${fcResponse.status}`;

            if (fcResponse.ok) {
              const fcData: any = await fcResponse.json();
              const fcMarkdown = fcData?.data?.markdown || '';
              const fcHtml = fcData?.data?.html || '';

              firecrawlDebug += `, markdown=${fcMarkdown.length}chars, html=${fcHtml.length}chars`;

              // markdown에서 이미지 URL, 링크 구문 등 불필요한 요소 제거 → 순수 텍스트 추출
              const cleanedMarkdown = fcMarkdown
                .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')   // ![alt](url) → alt만 남김
                .replace(/\[([^\]]*)\]\([^)]+\)/g, '$1')    // [text](url) → text만 남김
                .replace(/https?:\/\/[^\s)]+/g, '')          // 남은 URL 제거
                .replace(/\n{3,}/g, '\n\n')                  // 과도한 줄바꿈 정리
                .trim();

              if (cleanedMarkdown.length >= 50) {
                text = cleanedMarkdown.substring(0, 15000);
                crawlMethod = 'firecrawl';
              } else if (fcHtml.length >= 50) {
                text = extractTextFromHtml(fcHtml);
                crawlMethod = 'firecrawl';
              }

              console.log(`[GeminiPipeline] Firecrawl got ${text.length} chars (method: ${crawlMethod})`);
            } else {
              const errBody = await fcResponse.text().catch(() => '');
              firecrawlDebug += `, errBody=${errBody.substring(0, 200)}`;
              console.warn(`[GeminiPipeline] Firecrawl returned HTTP ${fcResponse.status}: ${errBody.substring(0, 200)}`);
            }

            meta.fetchTimeMs += Date.now() - fcStart;
          } catch (fcError) {
            meta.fetchTimeMs += Date.now() - fcStart;
            firecrawlDebug += `, error=${(fcError as Error).message}`;
            console.warn(`[GeminiPipeline] Firecrawl fallback failed: ${(fcError as Error).message}`);
          }
        } else if (text.length < 200) {
          firecrawlDebug = `firecrawlUrl=${input.firecrawlUrl ? 'set' : 'NOT_SET'}, apiKey=${input.firecrawlApiKey ? 'set' : 'NOT_SET'}`;
        }

        // fetch도 Firecrawl도 실패한 경우
        if (text.length < 200 && crawlMethod !== 'firecrawl') {
          // Firecrawl 미설정인데 SPA인 경우 안내
          if (!input.firecrawlUrl && text.length < 50) {
            meta.totalTimeMs = Date.now() - startTime;
            meta.crawlMethod = 'fetch_only';
            return {
              success: false,
              meta,
              error: {
                code: 'SPA_NO_FIRECRAWL',
                message: `텍스트가 ${text.length}자만 추출됨 (SPA 사이트 가능성). Firecrawl 설정이 없어 fallback 불가.`,
              },
            };
          }
        }
      }
    }

    meta.textLength = text.length;
    meta.crawlMethod = crawlMethod;

    if (text.length < 50) {
      meta.totalTimeMs = Date.now() - startTime;
      return {
        success: false,
        meta,
        error: { code: 'NO_CONTENT', message: `텍스트가 너무 짧습니다 (${text.length}자). crawlMethod: ${crawlMethod}`, firecrawlDebug },
      };
    }

    // ━━━━ Step 2: 프롬프트 빌드 (사전 주입 + 동적 네거티브) ━━━━
    const config = loadPatternsForPrompt({
      confirmedDevices: dynamicDevices,
      confirmedTreatments: dynamicTreatments,
      grayZoneExamples: input.grayZoneExamples,
    });
    const prompt = buildViolationPrompt(config);

    // ━━━━ Step 3: Gemini 2.5 Flash 호출 ━━━━
    const geminiStart = Date.now();
    const geminiResult = await callGeminiForViolation(
      prompt,
      { text, images },
      geminiApiKey,
    );
    meta.geminiTimeMs = Date.now() - geminiStart;

    // ━━━━ Step 4: GeminiAuditor 사후 검증 ━━━━
    const auditStart = Date.now();
    const auditor = new GeminiAuditor(config.patterns, config.negativeList, config.disclaimerRules);
    const auditResult = auditor.audit(geminiResult, text);
    meta.auditTimeMs = Date.now() - auditStart;

    // ━━━━ Step 5: MADMEDCHECK → MADMEDSALES 결과 동기화 (Phase 4) ━━━━
    if (input.supabaseUrl && input.supabaseKey && input.hospitalId) {
      try {
        await syncMedcheckDataForSales(
          input.hospitalId,
          input.hospitalName || '',
          auditResult,
          input.supabaseUrl,
          input.supabaseKey,
        );
        crossIntelMeta.medcheckSyncDone = true;
        console.log(`[GeminiPipeline] CrossIntel: synced grade ${auditResult.grade.grade} to MADMEDSALES`);
      } catch (e) {
        console.warn(`[GeminiPipeline] CrossIntel medcheck sync skipped:`, (e as Error).message);
      }
    }

    // ━━━━ Step 6: Flywheel 자동 수집 (Phase 6) ━━━━
    if (input.db) {
      try {
        const collector = new FlywheelCollector(input.db);
        const flyResult = await collector.collect(geminiResult, auditResult, {
          hospitalId: input.hospitalId,
          hospitalName: input.hospitalName,
          url: input.url,
        });
        console.log(`[GeminiPipeline] Flywheel: archived=${flyResult.archived}, candidates=${flyResult.candidatesAdded}`);
      } catch (e) {
        console.warn(`[GeminiPipeline] Flywheel collect skipped:`, (e as Error).message);
      }

      // ━━━━ Step 7: Gray Zone 사례 수집 (Phase 7) ━━━━
      if (auditResult.grayZones && auditResult.grayZones.length > 0) {
        try {
          const gzCollector = new GrayZoneCollector(input.db);
          const gzResult = await gzCollector.collectFromAnalysis(
            auditResult.grayZones,
            auditResult.id,
            input.hospitalId || '',
            input.hospitalName || '',
            input.url,
          );
          console.log(`[GeminiPipeline] GrayZone: new=${gzResult.newCases}, updated=${gzResult.updatedCases}`);
        } catch (e) {
          console.warn(`[GeminiPipeline] GrayZone collect skipped:`, (e as Error).message);
        }
      }
    }

    meta.totalTimeMs = Date.now() - startTime;
    meta.crossIntel = crossIntelMeta;

    return {
      success: true,
      audit: auditResult,
      meta,
    };

  } catch (error) {
    meta.totalTimeMs = Date.now() - startTime;
    return {
      success: false,
      meta,
      error: {
        code: 'GEMINI_PIPELINE_ERROR',
        message: `Gemini 파이프라인 오류: ${(error as Error).message}`,
      },
    };
  }
}
