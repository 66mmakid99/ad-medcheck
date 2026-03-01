/**
 * 크로스 인텔리전스 API 라우트
 */
import { Hono } from 'hono';
import type { AppBindings } from '../../types/env';
import { syncSalesDataForMedcheck } from '../../services/cross-intelligence';
import { runGeminiPipeline } from '../../services/analysis-pipeline';

export const crossIntelRoutes = new Hono<AppBindings>();

/**
 * GET /sales-data/:hospitalId
 * MADMEDSALES에서 확정 장비/시술 가져오기
 */
crossIntelRoutes.get('/sales-data/:hospitalId', async (c) => {
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
 * POST /sync-medcheck
 * MADMEDCHECK 결과를 MADMEDSALES에 동기화
 */
crossIntelRoutes.post('/sync-medcheck', async (c) => {
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

    const result = await runGeminiPipeline(
      {
        url: body.url,
        hospitalId: body.hospitalId,
        hospitalName: body.hospitalName,
        supabaseUrl,
        supabaseKey,
        db: c.env.DB,
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
