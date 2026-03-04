import { Hono } from 'hono';
import type { AppBindings } from '../../types/env';
import { handleApiError } from '../../utils/error-handler';
import { violationDetector } from '../../modules/violation-detector';
import { contextAnalyzer } from '../../modules/ai-analyzer';
import { runGeminiPipeline } from '../../services/analysis-pipeline';
import type { GeminiPipelineResult } from '../../services/analysis-pipeline';
import { saveCheckViolationResult } from '../../services/supabase-saver';
import {
  classifyAnalysisResults,
  mergeRuleAndAIResults,
  calculateCompositeConfidence,
} from '../../services/result-classifier';
import type { ViolationResult, Determination, DetectionSource } from '../../types';

// 안내 사항(가격 · 제품/기술 최상급)은 등급에서 제외, 실제 위반만 등급 계산
// 최상급 표현은 수식 대상에 따라 분리 판단:
//   병원/의사 수식 → 위반 (등급 반영)
//   제품/기술/성분 수식 → 안내 (근거 확인 권고)
type AnalysisGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
const PRICE_ADVISORY_IDS = new Set([
  'P-56-05-001', 'P-56-05-002', 'P-56-05-003',
  'P-56-09-001', 'P-56-09-002', 'P-56-09-003',
]);
const SUPERLATIVE_IDS = new Set([
  'P-56-03-001', 'P-56-03-002', 'P-56-03-003', 'P-56-03-004', 'P-56-03-005',
]);
const PRICE_ADVISORY_CATS = ['환자유인', '비급여', '할인'];

// 최상급 표현이 병원/의사를 수식하는지 판별
const HOSPITAL_MODIFIERS = /(?:병원|의원|클리닉|피부과|성형외과|치과|의사|원장|대표원장|전문의|진료|센터|한의원)/;
const PRODUCT_MODIFIERS = /(?:톡신|필러|레이저|장비|기기|성분|약물|제품|기술|FDA|KFDA|식약처|CE|특허|승인|인증)/;

function isSuperlativeAdvisory(v: { patternId?: string; context?: string; matchedText?: string }): boolean {
  if (!v.patternId || !SUPERLATIVE_IDS.has(v.patternId)) return false;
  const ctx = (v.context || '').replace(/\s+/g, ' ');
  const matched = v.matchedText || '';
  // 매칭 텍스트 주변 ±60자 확인
  const idx = ctx.indexOf(matched);
  const nearby = idx >= 0
    ? ctx.slice(Math.max(0, idx - 60), Math.min(ctx.length, idx + matched.length + 60))
    : ctx.slice(0, 200);
  // 병원/의사 수식이면 위반 → advisory 아님
  if (HOSPITAL_MODIFIERS.test(nearby)) return false;
  // 제품/기술 수식이면 안내 → advisory
  if (PRODUCT_MODIFIERS.test(nearby)) return true;
  // 판별 불가 → 보수적으로 위반 처리
  return false;
}

function isAdvisory(v: { patternId?: string; category?: string; type?: string; context?: string; matchedText?: string }): boolean {
  // 가격 관련 → 항상 안내
  if (v.patternId && PRICE_ADVISORY_IDS.has(v.patternId)) return true;
  const cat = v.category || v.type || '';
  if (PRICE_ADVISORY_CATS.some(k => cat.includes(k))) return true;
  // 최상급 → 맥락 판별
  if (v.patternId && SUPERLATIVE_IDS.has(v.patternId)) return isSuperlativeAdvisory(v);
  if (cat.includes('최상급') || cat.includes('비교광고')) return isSuperlativeAdvisory(v);
  return false;
}

function recalcGrade(violations: { severity: string; patternId?: string; category?: string; type?: string }[]): {
  grade: AnalysisGrade; cleanScore: number; gradeDescription: string;
  advisoryCount: number; scoredViolationCount: number;
} {
  const scored = violations.filter(v => !isAdvisory(v));
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  let deduction = 0;
  const deductionMap: Record<string, number> = { critical: 30, high: 20, medium: 10, low: 5 };
  for (const v of scored) {
    const sev = v.severity as keyof typeof counts;
    if (sev in counts) counts[sev]++;
    deduction += deductionMap[sev] || 5;
  }
  deduction = Math.min(100, deduction);
  const cleanScore = Math.max(0, 100 - deduction);
  let grade: AnalysisGrade;
  if (counts.critical === 0 && counts.high === 0 && counts.medium === 0 && counts.low === 0) grade = 'S';
  else if (counts.critical === 0 && counts.high === 0 && counts.medium <= 2) grade = 'A';
  else if (counts.critical === 0 && counts.high <= 1) grade = 'B';
  else if (counts.critical === 0) grade = 'C';
  else if (counts.critical <= 2) grade = 'D';
  else grade = 'F';
  const descMap: Record<AnalysisGrade, string> = {
    S: '위반 없음', A: '양호', B: '경미한 위반', C: '주의 필요', D: '다수 위반', F: '심각한 위반',
  };
  return { grade, cleanScore, gradeDescription: descMap[grade], advisoryCount: violations.length - scored.length, scoredViolationCount: scored.length };
}

const hospitalRoutes = new Hono<AppBindings>();

// POST - 병원 데이터 일괄 저장
hospitalRoutes.post('/collected-hospitals', async (c) => {
  try {
    const { crawlSessionId, hospitals } = await c.req.json();

    for (const hospital of hospitals) {
      await c.env.DB.prepare(`
        INSERT INTO collected_hospitals
        (crawl_session_id, name, address, phone, homepage_url, sido, region,
         department, category, filtering_status, source, crawl_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crawlSessionId, hospital.name, hospital.address, hospital.phone, hospital.homepage_url,
        hospital.sido, hospital.region, hospital.department, hospital.category,
        hospital.filtering_status, hospital.source || 'public_api', hospital.crawl_order || 0
      ).run();
    }

    return c.json({ success: true, count: hospitals.length });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// GET - 병원 목록 조회
hospitalRoutes.get('/collected-hospitals', async (c) => {
  try {
    const crawlSessionId = c.req.query('crawlSessionId');
    const status = c.req.query('status');
    const hasUrl = c.req.query('hasUrl');
    const category = c.req.query('category');
    const region = c.req.query('region');
    const limit = parseInt(c.req.query('limit') || '100');
    const offset = parseInt(c.req.query('offset') || '0');

    let query = 'SELECT * FROM collected_hospitals WHERE 1=1';
    const params: (string | number)[] = [];

    if (crawlSessionId) { query += ' AND crawl_session_id = ?'; params.push(crawlSessionId); }
    if (status) { query += ' AND filtering_status = ?'; params.push(status); }
    if (hasUrl === 'true') { query += ' AND homepage_url IS NOT NULL'; }
    if (category) { query += ' AND category = ?'; params.push(category); }
    if (region) { query += ' AND region LIKE ?'; params.push(`%${region}%`); }

    query += ' ORDER BY crawl_order ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const results = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ success: true, data: results.results, offset, limit });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

// POST /v1/analyze-url - URL 기반 텍스트 분석 (Rule-First 파이프라인)
//
// Step 1: URL fetch → 텍스트 추출
// Step 2: violationDetector.analyze() — Rule Engine 실행 (항상)
// Step 3: classifyAnalysisResults() — CONFIRMED/SAFE/AMBIGUOUS 분류
// Step 4: AMBIGUOUS + Gemini 키 있음 → runGeminiPipeline() (조건부)
// Step 5: mergeRuleAndAIResults() — 결과 병합
// Step 6: 응답 반환
hospitalRoutes.post('/analyze-url', async (c) => {
  try {
    const { url, hospitalId, hospitalName, enableExtendedAnalysis, enableAI, metadata } = await c.req.json();

    if (!url) {
      return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'url 필드는 필수입니다.' } }, 400);
    }

    // URL 정규화: http(s):// 없으면 자동 추가
    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'http://' + targetUrl;
    }

    const startTime = Date.now();
    const geminiApiKey = c.env.GEMINI_API_KEY;

    // ━━━━ Step 1: URL fetch → 텍스트 추출 ━━━━
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let htmlResponse: Response;
    try {
      htmlResponse = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
        },
        signal: controller.signal,
      });
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      const msg = fetchError instanceof Error && fetchError.name === 'AbortError'
        ? 'URL 접근 타임아웃 (30초 초과)'
        : `URL 접근 실패: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`;
      return c.json({ success: false, error: { code: 'FETCH_ERROR', message: msg } }, 400);
    }
    clearTimeout(timeoutId);

    if (!htmlResponse.ok) {
      return c.json({ success: false, error: { code: 'FETCH_ERROR', message: `URL 접근 실패: ${htmlResponse.status}` } }, 400);
    }

    const html = await htmlResponse.text();
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 50000);

    if (textContent.length < 10) {
      return c.json({ success: false, error: { code: 'EMPTY_CONTENT', message: '분석할 텍스트가 부족합니다.' } }, 400);
    }

    const fetchTimeMs = Date.now() - startTime;

    // ━━━━ Step 2: Rule Engine 실행 (항상) ━━━━
    const ruleResult = violationDetector.analyze({
      text: textContent,
      url: targetUrl,
      enableExtendedAnalysis: enableExtendedAnalysis !== false, // default true
      department: metadata?.department,
    });
    const ruleTimeMs = Date.now() - startTime - fetchTimeMs;

    // ━━━━ Step 2.5: ContextAnalyzer 맥락 검증 ━━━━
    let contextFilteredViolations = ruleResult.judgment.violations;
    let contextAnalyzerRan = false;

    if (geminiApiKey && ruleResult.matches && ruleResult.matches.length > 0) {
      try {
        contextAnalyzer.configure({
          provider: 'gemini',
          apiKey: geminiApiKey,
          confidenceThreshold: 0.6,
          maxAIAnalysis: 10,
        });

        const ctxResult = await contextAnalyzer.analyze(
          textContent,
          ruleResult.matches,
        );
        contextAnalyzerRan = true;

        // validateContext 결과로 오탐 제거
        if (ctxResult.contextValidations) {
          const invalidMatchIndices = new Set(
            ctxResult.contextValidations
              .map((cv, i) => ({ cv, i }))
              .filter(({ cv }) => !cv.isLikelyViolation)
              .map(({ i }) => i)
          );
          contextFilteredViolations = contextFilteredViolations.filter(
            (_, i) => !invalidMatchIndices.has(i)
          );
        }

        // intentAnalysis: 광고 의도가 낮으면 전체 confidence 감소
        if (ctxResult.intentAnalysis && ctxResult.intentAnalysis.advertisingIntentProbability < 0.3) {
          contextFilteredViolations = contextFilteredViolations.map(v => ({
            ...v,
            confidence: v.confidence * 0.6,
          }));
        }
      } catch (ctxError: unknown) {
        console.warn(`[analyze-url] ContextAnalyzer 실패: ${ctxError instanceof Error ? ctxError.message : String(ctxError)}`);
      }
    }

    // ━━━━ Step 3: 분류 (CONFIRMED / SAFE / AMBIGUOUS) ━━━━
    const classification = classifyAnalysisResults(contextFilteredViolations);

    // ━━━━ Step 4: AMBIGUOUS + Gemini 키 → AI 보강 ━━━━
    let finalViolations = classification.violations;
    let determination: Determination = classification.determination;
    let analysisMode: DetectionSource = 'rule_only';
    let geminiMeta: {
      geminiTimeMs?: number;
      auditTimeMs?: number;
      grayZones?: unknown[];
      auditIssues?: unknown[];
      geminiOriginalCount?: number;
      auditDelta?: number;
      crawlMethod?: string;
      crossIntel?: unknown;
    } = {};

    const shouldRunAI = (classification.needsAI || enableAI === true) && geminiApiKey && !contextAnalyzerRan;
    if (shouldRunAI) {
      try {
        const geminiResult: GeminiPipelineResult = await runGeminiPipeline(
          {
            url: targetUrl,
            hospitalId: hospitalId ? String(hospitalId) : undefined,
            hospitalName,
            db: c.env.DB,
            supabaseUrl: c.env.SUPABASE_URL,
            supabaseKey: c.env.SUPABASE_ANON_KEY,
          },
          geminiApiKey,
        );

        if (geminiResult.success && geminiResult.audit) {
          const audit = geminiResult.audit;

          // AI 위반 결과를 ViolationResult 형태로 변환
          const aiViolations: ViolationResult[] = audit.finalViolations.map((v) => ({
            type: v.category as ViolationResult['type'],
            status: (v.confidence >= 0.8 ? 'likely' : 'possible') as ViolationResult['status'],
            severity: (v.adjustedSeverity || v.severity) as ViolationResult['severity'],
            matchedText: v.originalText,
            description: v.category,
            legalBasis: v.patternId ? [{ law: '의료법', article: v.patternId, description: v.reasoning || v.category }] : [],
            confidence: v.confidence,
            patternId: v.patternId,
          }));

          // ━━━━ Step 5: 결과 병합 ━━━━
          const merged = mergeRuleAndAIResults(
            classification.violations,
            aiViolations,
            classification.determination,
          );

          finalViolations = merged.violations;
          determination = merged.determination;
          analysisMode = 'rule_and_ai';

          geminiMeta = {
            geminiTimeMs: geminiResult.meta.geminiTimeMs,
            auditTimeMs: geminiResult.meta.auditTimeMs,
            grayZones: audit.grayZones,
            auditIssues: audit.auditIssues,
            geminiOriginalCount: audit.geminiOriginalCount,
            auditDelta: audit.auditDelta,
            crawlMethod: geminiResult.meta.crawlMethod,
            crossIntel: geminiResult.meta.crossIntel,
          };
        } else {
          console.warn(`[analyze-url] Gemini pipeline no audit: success=${geminiResult.success}, error=${geminiResult.error?.code}`);
        }
      } catch (geminiError: unknown) {
        const errMsg = geminiError instanceof Error ? geminiError.message : String(geminiError);
        console.warn(`[analyze-url] Gemini AI 보강 실패 (Rule 결과 유지): ${errMsg}`);
      }
    }

    // ━━━━ Step 6: 응답 반환 ━━━━
    const processingTimeMs = Date.now() - startTime;

    const avgCompositeConfidence =
      finalViolations.length > 0
        ? finalViolations.reduce(
            (sum, v) => sum + (v.compositeConfidence ?? v.confidence),
            0,
          ) / finalViolations.length
        : classification.avgConfidence;

    // finalViolations 기반 등급 재계산
    const finalGrade = recalcGrade(finalViolations);

    // Supabase 저장 (best-effort) — 등급에 반영되는 위반만 severity 카운트
    let saved = false;
    if (c.env.SUPABASE_URL && c.env.SUPABASE_ANON_KEY) {
      const scoredViols = finalViolations.filter((v: any) => !isAdvisory(v));
      const severities = scoredViols.reduce(
        (acc: { critical: number; major: number; minor: number }, v: { severity: string }) => {
          if (v.severity === 'critical' || v.severity === 'high') acc.critical++;
          else if (v.severity === 'medium' || v.severity === 'major') acc.major++;
          else acc.minor++;
          return acc;
        },
        { critical: 0, major: 0, minor: 0 },
      );
      const saveResult = await saveCheckViolationResult(
        c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY,
        {
          hospital_id: hospitalId ? String(hospitalId) : undefined,
          hospital_name: hospitalName,
          url: targetUrl,
          grade: finalGrade.grade,
          clean_score: finalGrade.cleanScore,
          violation_count: finalGrade.scoredViolationCount,
          critical_count: severities.critical,
          major_count: severities.major,
          minor_count: severities.minor,
          violations: finalViolations,
          analysis_mode: analysisMode,
          processing_time_ms: processingTimeMs,
        },
      );
      saved = saveResult.saved;
    }

    // Extended analysis data (from ViolationDetector)
    const extendedData: Record<string, unknown> = {};
    if (ruleResult.mandatoryCheck) {
      extendedData.mandatoryCheck = ruleResult.mandatoryCheck;
    }
    if (ruleResult.impressionAnalysis) {
      const ia = ruleResult.impressionAnalysis;
      extendedData.impression = {
        toneType: ia.toneAnalysis?.primaryTone ?? 'NEUTRAL',
        aggressivenessScore: ia.toneAnalysis?.aggressiveness ?? 0,
        credibilityScore: ia.credibilityAnalysis?.score ?? 50,
        riskLevel: ia.riskLevel ?? 'LOW',
        riskScore: ia.riskScore ?? 0,
        complianceScore: ia.complianceScore ?? 100,
      };
    }
    if (ruleResult.compoundViolations && ruleResult.compoundViolations.length > 0) {
      extendedData.compoundViolations = ruleResult.compoundViolations;
    }

    return c.json({
      success: true,
      data: {
        analysisId: ruleResult.id,
        url: targetUrl,
        hospitalId,
        hospitalName,
        inputLength: textContent.length,
        violationCount: finalGrade.scoredViolationCount,
        advisoryCount: finalGrade.advisoryCount,
        violations: finalViolations,
        score: { ...ruleResult.judgment.score, ...finalGrade },
        grade: finalGrade.grade,
        gradeDescription: finalGrade.gradeDescription,
        summary: ruleResult.judgment.summary,
        recommendations: ruleResult.judgment.recommendations,
        // Extended analysis (mandatoryCheck, impression, compoundViolations)
        ...extendedData,
        // AI metadata
        ai: analysisMode === 'rule_and_ai' ? {
          enabled: true,
          provider: 'gemini',
          additionalViolations: geminiMeta.geminiOriginalCount ?? 0,
          processingTimeMs: geminiMeta.geminiTimeMs ?? 0,
        } : { enabled: false },
        // 기존 호환 필드
        analysisMode,
        processingTimeMs,
        analyzedAt: ruleResult.judgment.analyzedAt.toISOString(),
        saved,
        // Rule-First 신규 필드 (additive)
        determination,
        compositeConfidence: avgCompositeConfidence,
        ruleClassification: classification.determination,
        aiInvoked: analysisMode === 'rule_and_ai',
        // Gemini 메타 (AI 호출 시에만)
        ...(analysisMode === 'rule_and_ai'
          ? {
              grayZones: geminiMeta.grayZones,
              auditIssues: geminiMeta.auditIssues,
              geminiOriginalCount: geminiMeta.geminiOriginalCount,
              auditDelta: geminiMeta.auditDelta,
            }
          : {}),
        meta: {
          fetchTimeMs,
          ruleTimeMs,
          ...(geminiMeta.geminiTimeMs !== undefined
            ? {
                geminiTimeMs: geminiMeta.geminiTimeMs,
                auditTimeMs: geminiMeta.auditTimeMs,
                crawlMethod: geminiMeta.crawlMethod,
                crossIntel: geminiMeta.crossIntel,
              }
            : {}),
        },
      },
    });
  } catch (error: unknown) {
    return c.json({ success: false, error: { code: 'ANALYSIS_ERROR', message: error instanceof Error ? error.message : String(error) } }, 500);
  }
});

// POST /v1/analyze-from-scv - scv_crawl_pages 기반 분석 (Phase 2-B)
//
// madmedscv가 크롤링한 데이터(scv_crawl_pages)를 읽어서
// URL 재방문 없이 Rule-First 파이프라인을 실행합니다.
//
// Request: { hospitalId: string, hospitalName?: string }
// → Supabase scv_crawl_pages에서 해당 hospital_id의 모든 페이지 markdown을 조합
// → violationDetector.analyze() 실행
// → classifyAnalysisResults() → 필요시 AI 보강
hospitalRoutes.post('/analyze-from-scv', async (c) => {
  try {
    const { hospitalId, hospitalName } = await c.req.json();

    if (!hospitalId) {
      return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'hospitalId 필드는 필수입니다.' } }, 400);
    }

    const supabaseUrl = c.env.SUPABASE_URL;
    const supabaseKey = c.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return c.json({ success: false, error: { code: 'CONFIG_ERROR', message: 'Supabase 설정이 없습니다.' } }, 500);
    }

    const startTime = Date.now();
    const geminiApiKey = c.env.GEMINI_API_KEY;

    // ━━━━ Step 1: scv_crawl_pages에서 크롤링 데이터 로드 ━━━━
    const pagesRes = await fetch(
      `${supabaseUrl}/rest/v1/scv_crawl_pages?hospital_id=eq.${encodeURIComponent(hospitalId)}&select=url,page_type,markdown,char_count,crawled_at&order=char_count.desc`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      },
    );

    if (!pagesRes.ok) {
      return c.json({ success: false, error: { code: 'SCV_FETCH_ERROR', message: `scv_crawl_pages 조회 실패: ${pagesRes.status}` } }, 500);
    }

    const pages = (await pagesRes.json()) as Array<{
      url: string;
      page_type: string;
      markdown: string;
      char_count: number;
      crawled_at: string;
    }>;

    if (!pages.length) {
      return c.json({
        success: false,
        error: { code: 'NO_SCV_DATA', message: `hospital_id=${hospitalId}에 대한 크롤링 데이터가 없습니다. madmedscv로 먼저 크롤링하세요.` },
      }, 404);
    }

    // 모든 페이지 markdown 결합 (50,000자 제한)
    let combinedText = '';
    const pagesSummary: Array<{ url: string; pageType: string; chars: number }> = [];
    for (const page of pages) {
      if (!page.markdown) continue;
      const remaining = 50000 - combinedText.length;
      if (remaining <= 0) break;
      const chunk = page.markdown.substring(0, remaining);
      combinedText += chunk + '\n\n';
      pagesSummary.push({ url: page.url, pageType: page.page_type, chars: chunk.length });
    }

    combinedText = combinedText.trim();
    if (combinedText.length < 10) {
      return c.json({ success: false, error: { code: 'EMPTY_CONTENT', message: '크롤링된 텍스트가 부족합니다.' } }, 400);
    }

    const fetchTimeMs = Date.now() - startTime;
    const primaryUrl = pages[0]?.url || '';

    // ━━━━ Step 2: Rule Engine 실행 ━━━━
    const ruleResult = violationDetector.analyze({ text: combinedText, url: primaryUrl });
    const ruleTimeMs = Date.now() - startTime - fetchTimeMs;

    // ━━━━ Step 2.5: ContextAnalyzer 맥락 검증 ━━━━
    let contextFilteredViolations = ruleResult.judgment.violations;
    let contextAnalyzerRan = false;

    if (geminiApiKey && ruleResult.matches && ruleResult.matches.length > 0) {
      try {
        contextAnalyzer.configure({
          provider: 'gemini',
          apiKey: geminiApiKey,
          confidenceThreshold: 0.6,
          maxAIAnalysis: 10,
        });

        const ctxResult = await contextAnalyzer.analyze(
          combinedText,
          ruleResult.matches,
        );
        contextAnalyzerRan = true;

        // validateContext 결과로 오탐 제거
        if (ctxResult.contextValidations) {
          const invalidMatchIndices = new Set(
            ctxResult.contextValidations
              .map((cv, i) => ({ cv, i }))
              .filter(({ cv }) => !cv.isLikelyViolation)
              .map(({ i }) => i)
          );
          contextFilteredViolations = contextFilteredViolations.filter(
            (_, i) => !invalidMatchIndices.has(i)
          );
        }

        // intentAnalysis: 광고 의도가 낮으면 전체 confidence 감소
        if (ctxResult.intentAnalysis && ctxResult.intentAnalysis.advertisingIntentProbability < 0.3) {
          contextFilteredViolations = contextFilteredViolations.map(v => ({
            ...v,
            confidence: v.confidence * 0.6,
          }));
        }
      } catch (ctxError: unknown) {
        console.warn(`[analyze-from-scv] ContextAnalyzer 실패: ${ctxError instanceof Error ? ctxError.message : String(ctxError)}`);
      }
    }

    // ━━━━ Step 3: 분류 ━━━━
    const classification = classifyAnalysisResults(contextFilteredViolations);

    // ━━━━ Step 4: AMBIGUOUS + Gemini → AI 보강 ━━━━
    let finalViolations = classification.violations;
    let determination: Determination = classification.determination;
    let analysisMode: DetectionSource = 'rule_only';
    let geminiMeta: Record<string, unknown> = {};

    if (classification.needsAI && geminiApiKey && !contextAnalyzerRan) {
      try {
        const geminiResult: GeminiPipelineResult = await runGeminiPipeline(
          {
            url: primaryUrl,
            hospitalId: String(hospitalId),
            hospitalName,
            db: c.env.DB,
            supabaseUrl,
            supabaseKey,
          },
          geminiApiKey,
        );

        if (geminiResult.success && geminiResult.audit) {
          const audit = geminiResult.audit;
          const aiViolations: ViolationResult[] = audit.finalViolations.map((v) => ({
            type: v.category as ViolationResult['type'],
            status: (v.confidence >= 0.8 ? 'likely' : 'possible') as ViolationResult['status'],
            severity: (v.adjustedSeverity || v.severity) as ViolationResult['severity'],
            matchedText: v.originalText,
            description: v.category,
            legalBasis: v.patternId ? [{ law: '의료법', article: v.patternId, description: v.reasoning || v.category }] : [],
            confidence: v.confidence,
            patternId: v.patternId,
          }));

          const merged = mergeRuleAndAIResults(classification.violations, aiViolations, classification.determination);
          finalViolations = merged.violations;
          determination = merged.determination;
          analysisMode = 'rule_and_ai';
          geminiMeta = {
            geminiTimeMs: geminiResult.meta.geminiTimeMs,
            auditTimeMs: geminiResult.meta.auditTimeMs,
            crawlMethod: geminiResult.meta.crawlMethod,
          };
        }
      } catch (geminiError: unknown) {
        console.warn(`[analyze-from-scv] Gemini 보강 실패: ${geminiError instanceof Error ? geminiError.message : String(geminiError)}`);
      }
    }

    // ━━━━ Step 5: Supabase 저장 ━━━━
    const processingTimeMs = Date.now() - startTime;
    const avgCompositeConfidence =
      finalViolations.length > 0
        ? finalViolations.reduce((sum, v) => sum + (v.compositeConfidence ?? v.confidence), 0) / finalViolations.length
        : classification.avgConfidence;

    // finalViolations 기반 등급 재계산
    const finalGrade2 = recalcGrade(finalViolations);

    let saved = false;
    const scoredViols2 = finalViolations.filter((v: any) => !isAdvisory(v));
    const severities = scoredViols2.reduce(
      (acc: { critical: number; major: number; minor: number }, v: { severity: string }) => {
        if (v.severity === 'critical' || v.severity === 'high') acc.critical++;
        else if (v.severity === 'medium' || v.severity === 'major') acc.major++;
        else acc.minor++;
        return acc;
      },
      { critical: 0, major: 0, minor: 0 },
    );
    const saveResult = await saveCheckViolationResult(
      supabaseUrl, supabaseKey,
      {
        hospital_id: String(hospitalId),
        hospital_name: hospitalName,
        url: primaryUrl,
        grade: finalGrade2.grade,
        clean_score: finalGrade2.cleanScore,
        violation_count: finalGrade2.scoredViolationCount,
        critical_count: severities.critical,
        major_count: severities.major,
        minor_count: severities.minor,
        violations: finalViolations,
        analysis_mode: analysisMode,
        processing_time_ms: processingTimeMs,
      },
    );
    saved = saveResult.saved;

    // ━━━━ Step 6: 응답 ━━━━
    return c.json({
      success: true,
      data: {
        analysisId: ruleResult.id,
        source: 'scv_crawl_pages',
        hospitalId,
        hospitalName,
        pagesAnalyzed: pagesSummary.length,
        pagesSummary,
        inputLength: combinedText.length,
        violationCount: finalGrade2.scoredViolationCount,
        advisoryCount: finalGrade2.advisoryCount,
        violations: finalViolations,
        score: { ...ruleResult.judgment.score, ...finalGrade2 },
        grade: finalGrade2.grade,
        gradeDescription: finalGrade2.gradeDescription,
        summary: ruleResult.judgment.summary,
        recommendations: ruleResult.judgment.recommendations,
        analysisMode,
        processingTimeMs,
        analyzedAt: ruleResult.judgment.analyzedAt.toISOString(),
        saved,
        determination,
        compositeConfidence: avgCompositeConfidence,
        ruleClassification: classification.determination,
        aiInvoked: analysisMode === 'rule_and_ai',
        ...(analysisMode === 'rule_and_ai' ? geminiMeta : {}),
        meta: {
          fetchTimeMs,
          ruleTimeMs,
          ...(geminiMeta.geminiTimeMs !== undefined ? geminiMeta : {}),
        },
      },
    });
  } catch (error: unknown) {
    return c.json({ success: false, error: { code: 'ANALYSIS_ERROR', message: error instanceof Error ? error.message : String(error) } }, 500);
  }
});

// POST - 병원 배치 분석
hospitalRoutes.post('/collected-hospitals/analyze', async (c) => {
  try {
    const { crawlSessionId, hospitalIds, enableAI } = await c.req.json();

    const hospitals = await c.env.DB.prepare(`
      SELECT * FROM collected_hospitals
      WHERE id IN (${hospitalIds.map(() => '?').join(',')}) AND homepage_url IS NOT NULL
    `).bind(...hospitalIds).all();

    const results = [];

    for (const hospital of hospitals.results as Array<Record<string, unknown>>) {
      const res = await fetch('https://medcheck-engine.mmakid.workers.dev/v1/analyze-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: hospital.homepage_url, enableAI })
      });
      const data = await res.json() as Record<string, unknown>;
      const dataInner = data.data as Record<string, unknown> | undefined;

      await c.env.DB.prepare(`
        INSERT INTO hospital_analysis_results
        (crawl_session_id, hospital_id, url_analyzed, grade, violation_count, summary, violations, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crawlSessionId, hospital.id, hospital.homepage_url,
        dataInner?.grade || '-', dataInner?.violationCount || 0,
        dataInner?.summary || '', JSON.stringify(dataInner?.violations || []),
        data.success ? 'success' : 'error'
      ).run();

      results.push({ hospitalId: hospital.id, ...dataInner });
    }

    return c.json({ success: true, data: results });
  } catch (e: unknown) {
    return handleApiError(c, e);
  }
});

export { hospitalRoutes };
