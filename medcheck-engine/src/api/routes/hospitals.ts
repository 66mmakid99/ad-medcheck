import { Hono } from 'hono';
import type { AppBindings } from '../../types/env';
import { handleApiError } from '../../utils/error-handler';
import { violationDetector } from '../../modules/violation-detector';
import { runGeminiPipeline } from '../../services/analysis-pipeline';
import type { GeminiPipelineResult } from '../../services/analysis-pipeline';
import { saveCheckViolationResult } from '../../services/supabase-saver';
import {
  classifyAnalysisResults,
  mergeRuleAndAIResults,
  calculateCompositeConfidence,
} from '../../services/result-classifier';
import type { ViolationResult, Determination, DetectionSource } from '../../types';

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
    const { url, hospitalId, hospitalName } = await c.req.json();

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
    const ruleResult = violationDetector.analyze({ text: textContent, url: targetUrl });
    const ruleTimeMs = Date.now() - startTime - fetchTimeMs;

    // ━━━━ Step 3: 분류 (CONFIRMED / SAFE / AMBIGUOUS) ━━━━
    const classification = classifyAnalysisResults(ruleResult.judgment.violations);

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

    if (classification.needsAI && geminiApiKey) {
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

    // Supabase 저장 (best-effort)
    let saved = false;
    if (c.env.SUPABASE_URL && c.env.SUPABASE_ANON_KEY) {
      const severities = finalViolations.reduce(
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
          grade: ruleResult.judgment.score.grade,
          clean_score: ruleResult.judgment.score.cleanScore ?? ruleResult.judgment.score.complianceRate ?? 0,
          violation_count: finalViolations.length,
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

    return c.json({
      success: true,
      data: {
        analysisId: ruleResult.id,
        url: targetUrl,
        hospitalId,
        hospitalName,
        inputLength: textContent.length,
        violationCount: finalViolations.length,
        violations: finalViolations,
        score: ruleResult.judgment.score,
        grade: ruleResult.judgment.score.grade,
        gradeDescription: ruleResult.judgment.score.gradeDescription,
        summary: ruleResult.judgment.summary,
        recommendations: ruleResult.judgment.recommendations,
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
