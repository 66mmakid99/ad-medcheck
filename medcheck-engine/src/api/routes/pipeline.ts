/**
 * 통합 분석 파이프라인 API 라우트
 */
import { Hono } from 'hono';
import type { AppBindings } from '../../types/env';
import { runAnalysisPipeline, savePipelineResult, runGeminiPipeline } from '../../modules/pipeline';
import { generatePreviewReport, generateFullReport, generateColdEmail } from '../../services/report-generator';

export const pipelineRoutes = new Hono<AppBindings>();

/**
 * POST /analyze
 * URL을 넣으면 전체 분석 파이프라인 실행 + DB 저장
 */
pipelineRoutes.post('/analyze', async (c) => {
  try {
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

    // Gemini 모드
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
        },
        apiKey,
      );

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

    // Legacy 모드
    const result = await runAnalysisPipeline(
      {
        url: body.url,
        hospitalId: typeof body.hospitalId === 'number' ? body.hospitalId : undefined,
        hospitalName: body.hospitalName,
        enableAI: body.enableAI ?? !!c.env.GEMINI_API_KEY,
      },
      c.env.GEMINI_API_KEY,
    );

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

/**
 * POST /report/generate
 * 분석 결과 기반 리포트 생성
 */
pipelineRoutes.post('/report/generate', async (c) => {
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
 * POST /cold-email/generate
 * 콜드메일 자동 생성
 */
pipelineRoutes.post('/cold-email/generate', async (c) => {
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
