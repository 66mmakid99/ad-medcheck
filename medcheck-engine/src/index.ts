/**
 * MedCheck Engine - Cloudflare Workers
 * v2.0.0 - 클라우드 크롤러 + 통합 분석 파이프라인
 * 
 * [변경사항]
 * - Cron Trigger 핸들러 등록 (scheduled export 추가)
 * - 수동 분석 API에 파이프라인 연결
 * - 대시보드 요약 API 추가
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import ocr from './routes/ocr';
import prices from './routes/prices';
import units from './routes/units';
import regions from './routes/regions';
import aliases from './routes/aliases';
import alerts from './routes/alerts';
import analytics from './routes/analytics';
import {
  analyzeRoutes,
  patternsRoutes,
  healthRoutes,
  feedbackRoutes,
  validationRoutes,
  falsePositivesRoutes,
  patternExceptionsRoutes,
  exceptionSuggestionsRoutes,
  patternVersionsRoutes,
  allExceptionsRoutes,
  crawlRoutes,
  hospitalRoutes,
  pricingRoutes,
  screenshotRoutes,
  mappingRoutes,
  analysisResultsRoutes,
  performanceRoutes,
  learningRoutes,
  exceptionCandidatesRoutes,
  priceAlertsRoutes,
  competitorRoutes,
  priceHistoryRoutes,
  coldcallRoutes,
  ocrPipelineRoutes,
  crawlerRoutes,
  reportRoutes,
  aeoRoutes,
  viralRoutes,
  authRoutes,
  coldmailGenRoutes,
} from './api/routes';
import type { AppBindings, Env } from './types/env';

// [신규] 클라우드 크롤러 + 파이프라인
import { handleScheduled, handleManualTriggers } from './scheduled/crawler-handler';
import { runAnalysisPipeline, savePipelineResult, runGeminiPipeline } from './services/analysis-pipeline';

const app = new Hono<AppBindings>();

app.use('*', cors());

// ============================================
// Health & Info
// ============================================

app.get('/', (c) => {
  return c.json({
    name: 'MedCheck Engine',
    version: '2.0.0',
    status: 'running',
    features: [
      'analyze', 'patterns', 'false-positives', 'exceptions', 
      'pricing-v2', 'screenshots', 'mapping', 'alerts',
      'cloud-crawler', 'analysis-pipeline', 'hybrid-ai',
    ]
  });
});

app.get('/v1/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    cronEnabled: true,
  });
});

// ============================================
// [Phase 1] Gemini 위반 분석 테스트 API
// ============================================

import { loadPatternsForPrompt } from './services/pattern-loader';
import { buildViolationPrompt, estimateTokenCount } from './services/gemini-violation-prompt';
import { callGeminiForViolation } from './services/gemini-client';
import { GeminiAuditor } from './services/gemini-auditor';
import { syncSalesDataForMedcheck, syncMedcheckDataForSales } from './services/cross-intelligence';
import { PatternTuner } from './services/pattern-tuner';
import { GrayZoneCollector } from './services/gray-zone-collector';
import { generatePreviewReport, generateFullReport, generateColdEmail } from './services/report-generator';

/**
 * GET /v1/gemini/prompt-info
 * 생성된 프롬프트 정보 (토큰 수, 구조)
 */
app.get('/v1/gemini/prompt-info', (c) => {
  const config = loadPatternsForPrompt();
  const prompt = buildViolationPrompt(config);
  const tokens = estimateTokenCount(prompt);
  return c.json({
    promptCharCount: prompt.length,
    estimatedTokens: tokens,
    tokenTarget: 30000,
    underTarget: tokens < 30000,
    dictionaries: {
      patterns: config.patterns.length,
      negativeList: config.negativeList.length,
      disclaimerRules: config.disclaimerRules.length,
      departmentRules: config.departmentRules.length,
      contextExceptions: config.contextExceptions.length,
      sectionWeights: config.sectionWeights.length,
    },
  });
});

/**
 * POST /v1/gemini/analyze
 * Gemini 위반 분석 직접 호출 (Phase 1 테스트용)
 */
app.post('/v1/gemini/analyze', async (c) => {
  try {
    const apiKey = c.env.GEMINI_API_KEY;
    if (!apiKey) {
      return c.json({ success: false, error: 'GEMINI_API_KEY not configured' }, 500);
    }

    const rawBuffer = await c.req.arrayBuffer();
    let bodyText = new TextDecoder('utf-8').decode(rawBuffer);
    if (bodyText.includes('\uFFFD')) {
      bodyText = new TextDecoder('euc-kr', { fatal: false }).decode(rawBuffer);
    }
    const body = JSON.parse(bodyText) as { text: string };

    if (!body.text) {
      return c.json({ success: false, error: 'text는 필수입니다' }, 400);
    }

    const config = loadPatternsForPrompt();
    const prompt = buildViolationPrompt(config);
    const startTime = Date.now();
    const result = await callGeminiForViolation(prompt, { text: body.text }, apiKey);
    const elapsed = Date.now() - startTime;

    return c.json({
      success: true,
      elapsed_ms: elapsed,
      prompt_tokens: estimateTokenCount(prompt),
      result,
    });
  } catch (error) {
    return c.json({
      success: false,
      error: (error as Error).message,
    }, 500);
  }
});

/**
 * POST /v1/gemini/analyze-full
 * Gemini 분석 + GeminiAuditor 사후 검증 전체 파이프라인 (Phase 2 테스트용)
 */
app.post('/v1/gemini/analyze-full', async (c) => {
  try {
    const apiKey = c.env.GEMINI_API_KEY;
    if (!apiKey) {
      return c.json({ success: false, error: 'GEMINI_API_KEY not configured' }, 500);
    }

    const rawBuffer = await c.req.arrayBuffer();
    let bodyText = new TextDecoder('utf-8').decode(rawBuffer);
    if (bodyText.includes('\uFFFD')) {
      bodyText = new TextDecoder('euc-kr', { fatal: false }).decode(rawBuffer);
    }
    const body = JSON.parse(bodyText) as { text: string };

    if (!body.text) {
      return c.json({ success: false, error: 'text는 필수입니다' }, 400);
    }

    const config = loadPatternsForPrompt();
    const prompt = buildViolationPrompt(config);
    const startTime = Date.now();

    // Step 1: Gemini 호출
    const geminiResult = await callGeminiForViolation(prompt, { text: body.text }, apiKey);
    const geminiElapsed = Date.now() - startTime;

    // Step 2: GeminiAuditor 사후 검증
    const auditor = new GeminiAuditor(config.patterns, config.negativeList, config.disclaimerRules);
    const auditResult = auditor.audit(geminiResult, body.text);
    const totalElapsed = Date.now() - startTime;

    return c.json({
      success: true,
      gemini_elapsed_ms: geminiElapsed,
      total_elapsed_ms: totalElapsed,
      audit: {
        geminiOriginalCount: auditResult.geminiOriginalCount,
        finalCount: auditResult.finalCount,
        auditDelta: auditResult.auditDelta,
        issues: auditResult.auditIssues,
      },
      grade: auditResult.grade,
      violations: auditResult.finalViolations.map(v => ({
        patternId: v.patternId,
        category: v.category,
        severity: v.severity,
        adjustedSeverity: v.adjustedSeverity,
        originalText: v.originalText,
        confidence: v.confidence,
        reasoning: v.reasoning,
        disclaimerPresent: v.disclaimerPresent,
        source: v.source,
      })),
      grayZones: auditResult.grayZones,
      mandatoryItems: auditResult.mandatoryItems,
    });
  } catch (error) {
    return c.json({
      success: false,
      error: (error as Error).message,
    }, 500);
  }
});

// ============================================
// [Phase 4] 크로스 인텔리전스 API
// ============================================

/**
 * GET /v1/cross-intel/sales-data/:hospitalId
 * MADMEDSALES에서 확정 장비/시술 가져오기 (테스트용)
 */
app.get('/v1/cross-intel/sales-data/:hospitalId', async (c) => {
  try {
    const supabaseUrl = c.env.SUPABASE_URL;
    const supabaseKey = c.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return c.json({ success: false, error: 'Supabase 환경변수 미설정 (SUPABASE_URL, SUPABASE_ANON_KEY)' }, 500);
    }

    const hospitalId = c.req.param('hospitalId');
    const salesData = await syncSalesDataForMedcheck(hospitalId, supabaseUrl, supabaseKey);

    return c.json({
      success: true,
      hospitalId,
      confirmedDevices: salesData.confirmedDevices,
      confirmedTreatments: salesData.confirmedTreatments,
      dynamicNegativeCount: salesData.confirmedDevices.length + salesData.confirmedTreatments.length,
    });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

/**
 * POST /v1/cross-intel/sync-medcheck
 * MADMEDCHECK 결과를 MADMEDSALES에 동기화 (테스트용)
 */
app.post('/v1/cross-intel/sync-medcheck', async (c) => {
  try {
    const supabaseUrl = c.env.SUPABASE_URL;
    const supabaseKey = c.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return c.json({ success: false, error: 'Supabase 환경변수 미설정' }, 500);
    }

    const apiKey = c.env.GEMINI_API_KEY;
    if (!apiKey) {
      return c.json({ success: false, error: 'GEMINI_API_KEY not configured' }, 500);
    }

    const rawBuffer = await c.req.arrayBuffer();
    let bodyText = new TextDecoder('utf-8').decode(rawBuffer);
    if (bodyText.includes('\uFFFD')) {
      bodyText = new TextDecoder('euc-kr', { fatal: false }).decode(rawBuffer);
    }
    const body = JSON.parse(bodyText) as {
      url: string;
      hospitalId: string;
      hospitalName: string;
    };

    if (!body.url || !body.hospitalId) {
      return c.json({ success: false, error: 'url, hospitalId 필수' }, 400);
    }

    // Gemini 파이프라인 실행 (크로스 인텔리전스 + Flywheel + Firecrawl fallback 포함)
    const result = await runGeminiPipeline(
      {
        url: body.url,
        hospitalId: body.hospitalId,
        hospitalName: body.hospitalName,
        supabaseUrl,
        supabaseKey,
        db: c.env.DB,
        firecrawlUrl: c.env.FIRECRAWL_URL,
        firecrawlApiKey: c.env.FIRECRAWL_API_KEY,
      },
      apiKey,
    );

    return c.json({
      success: result.success,
      grade: result.audit?.grade,
      crossIntel: result.meta.crossIntel,
      crawlMethod: result.meta.crawlMethod,
      error: result.error,
    });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

// ============================================
// [Phase 6] Flywheel 피드백 API
// ============================================

/**
 * POST /v1/flywheel/false-positive
 * 오탐 신고
 */
app.post('/v1/flywheel/false-positive', async (c) => {
  try {
    const body = await c.req.json<{ analysisId: string; patternId: string; reason?: string }>();
    if (!body.analysisId || !body.patternId) {
      return c.json({ success: false, error: 'analysisId, patternId 필수' }, 400);
    }
    const tuner = new PatternTuner(c.env.DB);
    const result = await tuner.reportFalsePositive(body.analysisId, body.patternId, body.reason);
    return c.json({ success: true, ...result });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

/**
 * POST /v1/flywheel/false-negative
 * 미탐 신고
 */
app.post('/v1/flywheel/false-negative', async (c) => {
  try {
    const body = await c.req.json<{ analysisId: string; description: string; category?: string }>();
    if (!body.analysisId || !body.description) {
      return c.json({ success: false, error: 'analysisId, description 필수' }, 400);
    }
    const tuner = new PatternTuner(c.env.DB);
    const result = await tuner.reportFalseNegative(body.analysisId, body.description, body.category);
    return c.json({ success: true, ...result });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

/**
 * GET /v1/flywheel/pattern-candidates
 * 신규 패턴 후보 목록
 */
app.get('/v1/flywheel/pattern-candidates', async (c) => {
  try {
    const status = c.req.query('status') || 'pending';
    const tuner = new PatternTuner(c.env.DB);
    const candidates = await tuner.getPatternCandidates(status);
    return c.json({ success: true, data: candidates });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

/**
 * POST /v1/flywheel/pattern-candidates/:id/approve
 */
app.post('/v1/flywheel/pattern-candidates/:id/approve', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json<{ patternId: string }>();
    const tuner = new PatternTuner(c.env.DB);
    await tuner.approvePatternCandidate(id, body.patternId);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

/**
 * POST /v1/flywheel/pattern-candidates/:id/reject
 */
app.post('/v1/flywheel/pattern-candidates/:id/reject', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const tuner = new PatternTuner(c.env.DB);
    await tuner.rejectPatternCandidate(id);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

/**
 * GET /v1/flywheel/weak-patterns
 * 저성능 패턴 목록
 */
app.get('/v1/flywheel/weak-patterns', async (c) => {
  try {
    const tuner = new PatternTuner(c.env.DB);
    const patterns = await tuner.getWeakPatterns();
    return c.json({ success: true, data: patterns });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

// ============================================
// [Phase 7] Gray Zone 관리 API
// ============================================

/**
 * GET /v1/gray-zones
 * Gray Zone 사례 목록
 */
app.get('/v1/gray-zones', async (c) => {
  try {
    const status = c.req.query('status') || 'pending';
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
    const collector = new GrayZoneCollector(c.env.DB);
    const cases = await collector.list(status, limit);
    return c.json({ success: true, data: cases });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

/**
 * POST /v1/gray-zones/:id/verdict
 * Gray Zone 사례 판정
 */
app.post('/v1/gray-zones/:id/verdict', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json<{
      verdict: 'violation' | 'borderline' | 'legal';
      reasoning: string;
      addToPrompt?: boolean;
    }>();
    if (!body.verdict || !body.reasoning) {
      return c.json({ success: false, error: 'verdict, reasoning 필수' }, 400);
    }
    const collector = new GrayZoneCollector(c.env.DB);
    await collector.verdict(id, body.verdict, body.reasoning, body.addToPrompt ?? false);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

/**
 * GET /v1/gray-zones/trends
 * Gray Zone 트렌드 통계
 */
app.get('/v1/gray-zones/trends', async (c) => {
  try {
    const collector = new GrayZoneCollector(c.env.DB);
    const trends = await collector.getTrends();
    return c.json({ success: true, data: trends });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

/**
 * GET /v1/gray-zones/prompt-examples
 * Gemini 프롬프트에 주입할 승인된 사례 목록
 */
app.get('/v1/gray-zones/prompt-examples', async (c) => {
  try {
    const collector = new GrayZoneCollector(c.env.DB);
    const examples = await collector.getApprovedExamples();
    return c.json({ success: true, data: examples, count: examples.length });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

// ============================================
// [Phase 8] 리포트 + 콜드메일 API
// ============================================

/**
 * POST /v1/report/generate
 * 분석 결과 기반 리포트 생성
 */
app.post('/v1/report/generate', async (c) => {
  try {
    const apiKey = c.env.GEMINI_API_KEY;
    if (!apiKey) return c.json({ success: false, error: 'GEMINI_API_KEY not configured' }, 500);

    const rawBuffer = await c.req.arrayBuffer();
    let bodyText = new TextDecoder('utf-8').decode(rawBuffer);
    if (bodyText.includes('\uFFFD')) {
      bodyText = new TextDecoder('euc-kr', { fatal: false }).decode(rawBuffer);
    }
    const body = JSON.parse(bodyText) as {
      url: string;
      hospitalName?: string;
      hospitalId?: string;
      type?: 'preview' | 'full';
    };

    if (!body.url) return c.json({ success: false, error: 'url 필수' }, 400);

    const result = await runGeminiPipeline(
      {
        url: body.url,
        hospitalId: body.hospitalId,
        hospitalName: body.hospitalName,
        supabaseUrl: c.env.SUPABASE_URL,
        supabaseKey: c.env.SUPABASE_ANON_KEY,
        db: c.env.DB,
        firecrawlUrl: c.env.FIRECRAWL_URL,
        firecrawlApiKey: c.env.FIRECRAWL_API_KEY,
      },
      apiKey,
    );

    if (!result.success || !result.audit) {
      return c.json({ success: false, error: result.error });
    }

    const report = body.type === 'full'
      ? generateFullReport(result.audit, body.hospitalName || '병원')
      : generatePreviewReport(result.audit, body.hospitalName || '병원');

    return c.json({ success: true, report, meta: result.meta });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

/**
 * POST /v1/cold-email/generate
 * 콜드메일 자동 생성
 */
app.post('/v1/cold-email/generate', async (c) => {
  try {
    const apiKey = c.env.GEMINI_API_KEY;
    if (!apiKey) return c.json({ success: false, error: 'GEMINI_API_KEY not configured' }, 500);

    const rawBuffer = await c.req.arrayBuffer();
    let bodyText = new TextDecoder('utf-8').decode(rawBuffer);
    if (bodyText.includes('\uFFFD')) {
      bodyText = new TextDecoder('euc-kr', { fatal: false }).decode(rawBuffer);
    }
    const body = JSON.parse(bodyText) as {
      url: string;
      hospitalName?: string;
      hospitalId?: string;
    };

    if (!body.url) return c.json({ success: false, error: 'url 필수' }, 400);

    const result = await runGeminiPipeline(
      {
        url: body.url,
        hospitalId: body.hospitalId,
        hospitalName: body.hospitalName,
        supabaseUrl: c.env.SUPABASE_URL,
        supabaseKey: c.env.SUPABASE_ANON_KEY,
        db: c.env.DB,
        firecrawlUrl: c.env.FIRECRAWL_URL,
        firecrawlApiKey: c.env.FIRECRAWL_API_KEY,
      },
      apiKey,
    );

    if (!result.success || !result.audit) {
      return c.json({ success: false, error: result.error });
    }

    const email = generateColdEmail(result.audit, body.hospitalName || '병원');

    return c.json({ success: true, email, meta: result.meta });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

// ============================================
// [신규] 통합 분석 API (파이프라인 사용)
// ============================================

/**
 * POST /v1/pipeline/analyze
 * URL을 넣으면 전체 분석 파이프라인 실행 + DB 저장
 *
 * mode: 'gemini' → Gemini 2.5 Flash 파이프라인 (Phase 3)
 * mode: 'legacy' 또는 생략 → 기존 규칙엔진 파이프라인
 */
app.post('/v1/pipeline/analyze', async (c) => {
  try {
    // 인코딩 안전 JSON 파싱 (Windows 터미널 CP949 대응)
    const rawBuffer = await c.req.arrayBuffer();
    let bodyText = new TextDecoder('utf-8').decode(rawBuffer);
    if (bodyText.includes('\uFFFD')) {
      bodyText = new TextDecoder('euc-kr', { fatal: false }).decode(rawBuffer);
    }
    const body = JSON.parse(bodyText) as {
      url: string;
      hospitalId?: number | string;
      hospitalName?: string;
      enableAI?: boolean;
      mode?: 'gemini' | 'legacy';
      confirmedDevices?: string[];
      confirmedTreatments?: string[];
    };

    if (!body.url) {
      return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'url은 필수입니다' } }, 400);
    }

    // ━━━━ Gemini 모드 ━━━━
    if (body.mode === 'gemini') {
      const apiKey = c.env.GEMINI_API_KEY;
      if (!apiKey) {
        return c.json({ success: false, error: { code: 'NO_API_KEY', message: 'GEMINI_API_KEY not configured' } }, 500);
      }

      const geminiResult = await runGeminiPipeline(
        {
          url: body.url,
          hospitalId: typeof body.hospitalId === 'number' ? String(body.hospitalId) : body.hospitalId,
          hospitalName: body.hospitalName,
          confirmedDevices: body.confirmedDevices,
          confirmedTreatments: body.confirmedTreatments,
          supabaseUrl: c.env.SUPABASE_URL,
          supabaseKey: c.env.SUPABASE_ANON_KEY,
          db: c.env.DB,
          firecrawlUrl: c.env.FIRECRAWL_URL,
          firecrawlApiKey: c.env.FIRECRAWL_API_KEY,
        },
        apiKey,
      );

      // Gemini 결과를 D1에 저장 (비동기, 실패해도 응답은 반환)
      if (geminiResult.success && geminiResult.audit) {
        try {
          const a = geminiResult.audit;
          const g = a.grade || {};
          await c.env.DB.prepare(`
            INSERT INTO gemini_analysis_results (
              hospital_name, url, success, crawl_method, text_length,
              grade, clean_score, violation_count, gray_zone_count,
              critical_count, major_count, minor_count,
              violations_json, gray_zones_json, mandatory_items_json, audit_issues_json,
              fetch_time_ms, gemini_time_ms, total_time_ms
            ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            body.hospitalName || '',
            body.url,
            geminiResult.meta?.crawlMethod || 'unknown',
            geminiResult.meta?.textLength || 0,
            g.grade || '-',
            g.cleanScore || 0,
            g.violationCount || 0,
            (a.grayZones || []).length,
            (a.finalViolations || []).filter((v: any) => v.severity === 'critical' || v.adjustedSeverity === 'critical').length,
            (a.finalViolations || []).filter((v: any) => (v.adjustedSeverity || v.severity) === 'major').length,
            (a.finalViolations || []).filter((v: any) => (v.adjustedSeverity || v.severity) === 'minor').length,
            JSON.stringify(a.finalViolations || []),
            JSON.stringify(a.grayZones || []),
            JSON.stringify(a.mandatoryItems || {}),
            JSON.stringify(a.auditIssues || []),
            geminiResult.meta?.fetchTimeMs || 0,
            geminiResult.meta?.geminiTimeMs || 0,
            geminiResult.meta?.totalTimeMs || 0,
          ).run();
        } catch (saveErr) {
          console.error('[GeminiPipeline] D1 save failed:', (saveErr as Error).message);
        }
      }

      return c.json(geminiResult);
    }

    // ━━━━ Legacy 모드 (기존) ━━━━
    const result = await runAnalysisPipeline(
      {
        url: body.url,
        hospitalId: typeof body.hospitalId === 'number' ? body.hospitalId : undefined,
        hospitalName: body.hospitalName,
        enableAI: body.enableAI ?? !!c.env.GEMINI_API_KEY,
      },
      c.env.GEMINI_API_KEY,
    );

    // DB 저장
    await savePipelineResult(c.env.DB, {
      url: body.url,
      hospitalId: typeof body.hospitalId === 'number' ? body.hospitalId : undefined,
      hospitalName: body.hospitalName,
      enableAI: body.enableAI,
    }, result);

    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: { code: 'SERVER_ERROR', message: (error as Error).message },
    }, 500);
  }
});

// ============================================
// [신규] 대시보드 요약 API
// ============================================

/**
 * GET /v1/dashboard/summary
 * 대시보드 홈에서 보여줄 전체 요약 정보
 */
app.get('/v1/dashboard/summary', async (c) => {
  try {
    const db = c.env.DB;

    // 오늘 분석 요약
    const todayStats = await db.prepare(`
      SELECT 
        COUNT(*) as total_analyzed,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
        SUM(violation_count) as total_violations,
        ROUND(AVG(clean_score), 1) as avg_score
      FROM analysis_history
      WHERE analyzed_at >= date('now')
    `).first();

    // 등급 분포 (최신 분석 기준)
    let gradeDistribution: any[] = [];
    try {
      const grades = await db.prepare(`
        SELECT grade, grade_emoji, COUNT(*) as count
        FROM v_latest_analysis
        GROUP BY grade
        ORDER BY count DESC
      `).all();
      gradeDistribution = grades.results || [];
    } catch {
      // 뷰가 없으면 직접 쿼리
      const grades = await db.prepare(`
        SELECT grade, grade_emoji, COUNT(*) as count
        FROM analysis_history ah
        INNER JOIN (
          SELECT hospital_id, MAX(analyzed_at) as latest
          FROM analysis_history WHERE status = 'success'
          GROUP BY hospital_id
        ) l ON ah.hospital_id = l.hospital_id AND ah.analyzed_at = l.latest
        GROUP BY grade
      `).all();
      gradeDistribution = grades.results || [];
    }

    // 크롤러 상태
    const scheduler = await db.prepare(`
      SELECT * FROM crawler_scheduler_status WHERE id = 'singleton'
    `).first();

    const isOnline = scheduler?.is_online === 1 &&
      scheduler?.last_heartbeat &&
      (Date.now() - new Date(scheduler.last_heartbeat as string).getTime()) < 300000; // 5분 이내

    // 최근 배치
    const recentBatch = await db.prepare(`
      SELECT * FROM crawl_batches ORDER BY started_at DESC LIMIT 1
    `).first();

    // 큐 상태
    const queueStats = await db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM crawl_queue
    `).first();

    // 최근 분석 결과 10건
    const recentResults = await db.prepare(`
      SELECT 
        hospital_name, url_analyzed, grade, grade_emoji, 
        clean_score, violation_count, analyzed_at
      FROM analysis_history
      WHERE status = 'success'
      ORDER BY analyzed_at DESC
      LIMIT 10
    `).all();

    return c.json({
      success: true,
      data: {
        today: {
          analyzed: todayStats?.total_analyzed || 0,
          success: todayStats?.success_count || 0,
          violations: todayStats?.total_violations || 0,
          avgScore: todayStats?.avg_score || 0,
        },
        gradeDistribution,
        crawler: {
          online: isOnline,
          lastHeartbeat: scheduler?.last_heartbeat || null,
          mode: 'cloud', // 'cloud' = Cron Trigger, 'local' = 로컬 스케줄러
        },
        queue: {
          total: queueStats?.total || 0,
          pending: queueStats?.pending || 0,
          completed: queueStats?.completed || 0,
          failed: queueStats?.failed || 0,
        },
        recentBatch: recentBatch || null,
        recentResults: recentResults.results || [],
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: { code: 'SUMMARY_ERROR', message: (error as Error).message },
    }, 500);
  }
});

/**
 * GET /v1/dashboard/hospitals
 * 병원 목록 + 최신 분석 결과
 */
app.get('/v1/dashboard/hospitals', async (c) => {
  try {
    const db = c.env.DB;
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
    const grade = c.req.query('grade'); // 등급 필터
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        ah.hospital_id, ah.hospital_name, ah.url_analyzed,
        ah.grade, ah.grade_emoji, ah.clean_score,
        ah.violation_count, ah.critical_count, ah.major_count, ah.minor_count,
        ah.ai_verified, ah.analyzed_at,
        ch.address, ch.phone, ch.category, ch.region
      FROM analysis_history ah
      INNER JOIN (
        SELECT hospital_id, MAX(analyzed_at) as latest
        FROM analysis_history WHERE status = 'success'
        GROUP BY hospital_id
      ) l ON ah.hospital_id = l.hospital_id AND ah.analyzed_at = l.latest
      LEFT JOIN collected_hospitals ch ON ah.hospital_id = ch.id
    `;

    const params: any[] = [];
    if (grade) {
      query += ` WHERE ah.grade = ?`;
      params.push(grade);
    }
    query += ` ORDER BY ah.analyzed_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const results = await db.prepare(query).bind(...params).all();

    // 전체 수
    const countResult = await db.prepare(`
      SELECT COUNT(DISTINCT hospital_id) as total
      FROM analysis_history WHERE status = 'success'
    `).first();

    return c.json({
      success: true,
      data: {
        hospitals: results.results || [],
        pagination: {
          page,
          limit,
          total: countResult?.total || 0,
          totalPages: Math.ceil((countResult?.total as number || 0) / limit),
        },
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: { code: 'QUERY_ERROR', message: (error as Error).message },
    }, 500);
  }
});

/**
 * POST /v1/dashboard/trigger-crawl
 * 대시보드에서 수동 크롤링 실행
 */
app.post('/v1/dashboard/trigger-crawl', async (c) => {
  try {
    // 수동 트리거 실행
    await handleManualTriggers(c.env);
    return c.json({ success: true, message: '크롤링이 시작되었습니다' });
  } catch (error) {
    return c.json({
      success: false,
      error: { code: 'TRIGGER_ERROR', message: (error as Error).message },
    }, 500);
  }
});

/**
 * POST /v1/crawl-queue/add
 * 크롤링 큐에 병원 추가
 */
app.post('/v1/crawl-queue/add', async (c) => {
  try {
    const body = await c.req.json<{
      hospitalId: number;
      hospitalName: string;
      homepageUrl: string;
      priority?: number;
    }>();

    if (!body.hospitalId || !body.homepageUrl) {
      return c.json({ success: false, error: 'hospitalId, homepageUrl 필수' }, 400);
    }

    await c.env.DB.prepare(`
      INSERT OR REPLACE INTO crawl_queue (hospital_id, hospital_name, homepage_url, priority, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).bind(
      body.hospitalId,
      body.hospitalName,
      body.homepageUrl,
      body.priority || 5,
    ).run();

    return c.json({ success: true });
  } catch (error) {
    return c.json({
      success: false,
      error: { code: 'ADD_ERROR', message: (error as Error).message },
    }, 500);
  }
});

/**
 * GET /v1/crawl-queue
 * 크롤링 큐 조회
 */
app.get('/v1/crawl-queue', async (c) => {
  try {
    const status = c.req.query('status');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);

    let query = `SELECT * FROM crawl_queue`;
    const params: any[] = [];

    if (status) {
      query += ` WHERE status = ?`;
      params.push(status);
    }
    query += ` ORDER BY priority ASC, created_at ASC LIMIT ?`;
    params.push(limit);

    const results = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ success: true, data: results.results || [] });
  } catch (error) {
    return c.json({
      success: false,
      error: { code: 'QUERY_ERROR', message: (error as Error).message },
    }, 500);
  }
});

/**
 * GET /v1/crawl-batches
 * 크롤링 배치 이력
 */
app.get('/v1/crawl-batches', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
    const results = await c.env.DB.prepare(`
      SELECT * FROM crawl_batches ORDER BY started_at DESC LIMIT ?
    `).bind(limit).all();
    return c.json({ success: true, data: results.results || [] });
  } catch (error) {
    return c.json({
      success: false,
      error: { code: 'QUERY_ERROR', message: (error as Error).message },
    }, 500);
  }
});

/**
 * GET /v1/analysis-history/:hospitalId
 * 특정 병원의 분석 이력
 */
app.get('/v1/analysis-history/:hospitalId', async (c) => {
  try {
    const hospitalId = c.req.param('hospitalId');
    const results = await c.env.DB.prepare(`
      SELECT * FROM analysis_history 
      WHERE hospital_id = ? 
      ORDER BY analyzed_at DESC 
      LIMIT 20
    `).bind(hospitalId).all();
    return c.json({ success: true, data: results.results || [] });
  } catch (error) {
    return c.json({
      success: false,
      error: { code: 'QUERY_ERROR', message: (error as Error).message },
    }, 500);
  }
});

// ============================================
// [Gemini Dashboard] 대시보드용 Gemini 분석 결과 API
// ============================================

/**
 * GET /v1/dashboard/gemini-summary
 * Gemini 분석 결과 전체 요약 (대시보드 Overview)
 */
app.get('/v1/dashboard/gemini-summary', async (c) => {
  try {
    const db = c.env.DB;

    // 전체 통계
    const stats = await db.prepare(`
      SELECT
        COUNT(*) as total_hospitals,
        ROUND(AVG(clean_score), 1) as avg_clean_score,
        SUM(violation_count) as total_violations,
        SUM(gray_zone_count) as total_gray_zones,
        MAX(analyzed_at) as last_batch_at
      FROM gemini_analysis_results
      WHERE success = 1
    `).first();

    // 등급 분포 (최신 분석만 — URL별 최신 1건)
    const grades = await db.prepare(`
      SELECT grade, COUNT(*) as count
      FROM gemini_analysis_results g
      INNER JOIN (
        SELECT url, MAX(analyzed_at) as latest
        FROM gemini_analysis_results WHERE success = 1
        GROUP BY url
      ) l ON g.url = l.url AND g.analyzed_at = l.latest
      WHERE g.success = 1
      GROUP BY grade
      ORDER BY CASE grade
        WHEN 'S' THEN 1 WHEN 'A' THEN 2 WHEN 'B' THEN 3
        WHEN 'C' THEN 4 WHEN 'D' THEN 5 WHEN 'F' THEN 6
        ELSE 7 END
    `).all();

    const gradeDistribution: Record<string, number> = {};
    for (const row of (grades.results || [])) {
      gradeDistribution[row.grade as string] = row.count as number;
    }

    // 위반 카테고리 Top 10
    const topCategories = await db.prepare(`
      SELECT json_extract(v.value, '$.category') as category,
             COUNT(*) as count
      FROM gemini_analysis_results g,
           json_each(g.violations_json) v
      WHERE g.success = 1
        AND json_extract(v.value, '$.category') IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
      LIMIT 10
    `).all();

    return c.json({
      success: true,
      data: {
        totalHospitals: stats?.total_hospitals || 0,
        gradeDistribution,
        avgCleanScore: stats?.avg_clean_score || 0,
        totalViolations: stats?.total_violations || 0,
        totalGrayZones: stats?.total_gray_zones || 0,
        lastBatchAt: stats?.last_batch_at || null,
        topViolationCategories: (topCategories.results || []).map((r: any) => ({
          category: r.category,
          count: r.count,
        })),
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: { code: 'SUMMARY_ERROR', message: (error as Error).message },
    }, 500);
  }
});

/**
 * GET /v1/dashboard/gemini-hospitals
 * 병원 목록 (정렬, 필터, 페이지네이션)
 */
app.get('/v1/dashboard/gemini-hospitals', async (c) => {
  try {
    const db = c.env.DB;
    const sort = c.req.query('sort') || 'clean_score';
    const order = c.req.query('order') || 'asc';
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
    const page = parseInt(c.req.query('page') || '1');
    const gradeFilter = c.req.query('grade');
    const offset = (page - 1) * limit;

    // 허용된 정렬 컬럼
    const allowedSorts: Record<string, string> = {
      clean_score: 'g.clean_score',
      grade: "CASE g.grade WHEN 'S' THEN 1 WHEN 'A' THEN 2 WHEN 'B' THEN 3 WHEN 'C' THEN 4 WHEN 'D' THEN 5 WHEN 'F' THEN 6 ELSE 7 END",
      violation_count: 'g.violation_count',
      analyzed_at: 'g.analyzed_at',
      hospital_name: 'g.hospital_name',
    };
    const sortCol = allowedSorts[sort] || 'g.clean_score';
    const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    let whereClause = 'WHERE g.success = 1';
    const params: any[] = [];
    if (gradeFilter) {
      whereClause += ' AND g.grade = ?';
      params.push(gradeFilter);
    }

    const query = `
      SELECT g.id, g.hospital_name, g.url, g.grade, g.clean_score,
             g.violation_count, g.gray_zone_count, g.crawl_method,
             g.critical_count, g.major_count, g.minor_count,
             g.violations_json, g.analyzed_at, g.total_time_ms
      FROM gemini_analysis_results g
      INNER JOIN (
        SELECT url, MAX(analyzed_at) as latest
        FROM gemini_analysis_results WHERE success = 1
        GROUP BY url
      ) l ON g.url = l.url AND g.analyzed_at = l.latest
      ${whereClause}
      ORDER BY ${sortCol} ${sortOrder}
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const results = await db.prepare(query).bind(...params).all();

    // 각 병원의 상위 3건 위반 추출
    const hospitals = (results.results || []).map((r: any) => {
      let topViolations: any[] = [];
      try {
        const violations = JSON.parse(r.violations_json || '[]');
        topViolations = violations.slice(0, 3).map((v: any) => ({
          patternId: v.patternId,
          category: v.category,
          severity: v.adjustedSeverity || v.severity,
          text: (v.originalText || '').substring(0, 80),
        }));
      } catch {}
      return {
        id: r.id,
        hospitalName: r.hospital_name,
        url: r.url,
        grade: r.grade,
        cleanScore: r.clean_score,
        violationCount: r.violation_count,
        grayZoneCount: r.gray_zone_count,
        crawlMethod: r.crawl_method,
        criticalCount: r.critical_count,
        majorCount: r.major_count,
        minorCount: r.minor_count,
        analyzedAt: r.analyzed_at,
        totalTimeMs: r.total_time_ms,
        topViolations,
      };
    });

    // 전체 수
    const countResult = await db.prepare(`
      SELECT COUNT(*) as total FROM (
        SELECT url FROM gemini_analysis_results
        WHERE success = 1 ${gradeFilter ? 'AND grade = ?' : ''}
        GROUP BY url
      )
    `).bind(...(gradeFilter ? [gradeFilter] : [])).first();

    return c.json({
      success: true,
      data: {
        hospitals,
        pagination: {
          page,
          limit,
          total: countResult?.total || 0,
          totalPages: Math.ceil((countResult?.total as number || 0) / limit),
        },
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: { code: 'QUERY_ERROR', message: (error as Error).message },
    }, 500);
  }
});

/**
 * GET /v1/dashboard/gemini-hospital/:id
 * 개별 병원 상세 분석 결과
 */
app.get('/v1/dashboard/gemini-hospital/:id', async (c) => {
  try {
    const db = c.env.DB;
    const id = c.req.param('id');

    const result = await db.prepare(`
      SELECT * FROM gemini_analysis_results WHERE id = ?
    `).bind(id).first();

    if (!result) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: '분석 결과를 찾을 수 없습니다' } }, 404);
    }

    let violations = [];
    let grayZones = [];
    let mandatoryItems = {};
    let auditIssues = [];
    try { violations = JSON.parse(result.violations_json as string || '[]'); } catch {}
    try { grayZones = JSON.parse(result.gray_zones_json as string || '[]'); } catch {}
    try { mandatoryItems = JSON.parse(result.mandatory_items_json as string || '{}'); } catch {}
    try { auditIssues = JSON.parse(result.audit_issues_json as string || '[]'); } catch {}

    return c.json({
      success: true,
      data: {
        id: result.id,
        hospitalName: result.hospital_name,
        url: result.url,
        grade: result.grade,
        cleanScore: result.clean_score,
        violationCount: result.violation_count,
        grayZoneCount: result.gray_zone_count,
        criticalCount: result.critical_count,
        majorCount: result.major_count,
        minorCount: result.minor_count,
        crawlMethod: result.crawl_method,
        textLength: result.text_length,
        fetchTimeMs: result.fetch_time_ms,
        geminiTimeMs: result.gemini_time_ms,
        totalTimeMs: result.total_time_ms,
        analyzedAt: result.analyzed_at,
        violations,
        grayZones,
        mandatoryItems,
        auditIssues,
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: { code: 'QUERY_ERROR', message: (error as Error).message },
    }, 500);
  }
});

/**
 * POST /v1/dashboard/gemini-import
 * 배치 분석 JSON 결과를 D1에 벌크 임포트
 */
app.post('/v1/dashboard/gemini-import', async (c) => {
  try {
    const db = c.env.DB;
    const body = await c.req.json<{
      results: any[];
      batchId?: string;
    }>();

    if (!body.results || !Array.isArray(body.results)) {
      return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'results 배열 필수' } }, 400);
    }

    const batchId = body.batchId || new Date().toISOString();
    let imported = 0;
    let skipped = 0;

    for (const r of body.results) {
      if (!r.url) { skipped++; continue; }

      try {
        await db.prepare(`
          INSERT INTO gemini_analysis_results (
            hospital_name, url, success, crawl_method, text_length,
            grade, clean_score, violation_count, gray_zone_count,
            critical_count, major_count, minor_count,
            violations_json, gray_zones_json, mandatory_items_json, audit_issues_json,
            fetch_time_ms, gemini_time_ms, total_time_ms, error_message, batch_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          r.hospitalName || r.hospital_name || '',
          r.url,
          r.success ? 1 : 0,
          r.crawlMethod || r.crawl_method || 'unknown',
          r.textLength || r.text_length || 0,
          r.grade || '-',
          r.cleanScore ?? r.clean_score ?? 0,
          r.violationCount ?? r.violation_count ?? 0,
          r.grayZones ?? r.gray_zone_count ?? 0,
          r.criticalCount ?? r.critical_count ?? 0,
          r.majorCount ?? r.major_count ?? 0,
          r.minorCount ?? r.minor_count ?? 0,
          JSON.stringify(r.violations || []),
          JSON.stringify(r.grayZones_data || r.gray_zones || []),
          JSON.stringify(r.mandatoryItems || r.mandatory_items || {}),
          JSON.stringify(r.auditIssues || r.audit_issues || []),
          r.fetchTimeMs ?? r.fetch_time_ms ?? 0,
          r.geminiTimeMs ?? r.gemini_time_ms ?? 0,
          r.totalTimeMs ?? r.total_time_ms ?? 0,
          r.error || r.error_message || null,
          batchId,
        ).run();
        imported++;
      } catch (e) {
        console.error(`Import error for ${r.url}:`, (e as Error).message);
        skipped++;
      }
    }

    return c.json({
      success: true,
      data: { imported, skipped, batchId },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: { code: 'IMPORT_ERROR', message: (error as Error).message },
    }, 500);
  }
});

// ============================================
// 기존 API 라우트 마운트 (변경 없음)
// ============================================

app.route('/v1/analyze', analyzeRoutes);
app.route('/v1/patterns', patternsRoutes);
app.route('/v1/health', healthRoutes);
app.route('/v1/ocr', ocr);
app.route('/api/prices', prices);
app.route('/api/units', units);
app.route('/api/regions', regions);
app.route('/api/aliases', aliases);
app.route('/api/alerts', alerts);
app.route('/api/analytics', analytics);
app.route('/v1/feedback', feedbackRoutes);
app.route('/v1/validations', validationRoutes);
app.route('/v1/false-positives', falsePositivesRoutes);
app.route('/v1/exceptions', allExceptionsRoutes);
app.route('/v1/exception-suggestions', exceptionSuggestionsRoutes);
app.route('/v1/patterns/:patternId/exceptions', patternExceptionsRoutes);
app.route('/v1/patterns/:patternId/versions', patternVersionsRoutes);
app.route('/v1', crawlRoutes);
app.route('/v1', hospitalRoutes);
app.route('/v1', pricingRoutes);
app.route('/v1/screenshots', screenshotRoutes);
app.route('/v1/mapping-candidates', mappingRoutes);
app.route('/v1/analysis-results', analysisResultsRoutes);
app.route('/v1/performance', performanceRoutes);
app.route('/v1/learning', learningRoutes);
app.route('/v1/exception-candidates', exceptionCandidatesRoutes);
app.route('/v1/price-alerts', priceAlertsRoutes);
app.route('/v1/competitor-settings', competitorRoutes);
app.route('/v1/price-history', priceHistoryRoutes);
app.route('/v1/coldcall', coldcallRoutes);
app.route('/api/ocr', ocrPipelineRoutes);
app.route('/api/crawler', crawlerRoutes);
app.route('/v1/report', reportRoutes);
app.route('/v1/aeo', aeoRoutes);
app.route('/v1/viral', viralRoutes);
app.route('/v1/auth', authRoutes);
app.route('/v1/coldmail', coldmailGenRoutes);

// 병원별 스크린샷
app.get('/v1/hospitals/:hospitalId/screenshots', async (c) => {
  const hospitalId = c.req.param('hospitalId');
  const results = await c.env.DB.prepare(`
    SELECT * FROM price_screenshots WHERE hospital_id = ? ORDER BY created_at DESC LIMIT 50
  `).bind(hospitalId).all();
  return c.json({ success: true, data: results.results });
});

// 404
app.notFound((c) => {
  return c.json({ success: false, error: { code: 'NOT_FOUND', message: `Route not found: ${c.req.method} ${c.req.path}` } }, 404);
});

// ============================================
// [핵심] Export - Cron Trigger 핸들러 등록
// ============================================

export default {
  // HTTP 요청 처리 (기존)
  fetch: app.fetch,

  // Cron Trigger 처리 (신규!)
  // wrangler.toml의 [triggers].crons에 설정된 시간에 자동 실행됩니다.
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // waitUntil로 비동기 작업이 완료될 때까지 Worker를 유지합니다
    ctx.waitUntil(handleScheduled(event, env));
  },
};
