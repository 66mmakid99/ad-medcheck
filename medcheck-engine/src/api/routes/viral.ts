/**
 * Viral MedCheck API Routes
 * 온라인 마케팅 현황 분석
 */

import { Hono } from 'hono';
import type { D1Database } from '../../db/d1';
import { analyzeViral } from '../../services/viral-analyzer';
import type { ViralAnalysisResult } from '../../services/viral-analyzer';

interface Env {
  DB: D1Database;
}

const viralRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /v1/viral/analyze
 */
viralRoutes.post('/analyze', async (c) => {
  const body = await c.req.json<{ url: string; hospitalId?: string; hospitalName?: string }>();
  const { url, hospitalId, hospitalName } = body;

  if (!url) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'url은 필수입니다.' },
    }, 400);
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MedCheck-Viral-Analyzer/1.0',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return c.json({
        success: false,
        error: { code: 'FETCH_ERROR', message: `URL 접근 실패: ${response.status}` },
      }, 502);
    }

    const html = await response.text();
    const name = hospitalName || new URL(url).hostname;
    const result = await analyzeViral(name, url, html);

    const hid = hospitalId || url;
    const scoreId = await saveViralScore(c.env.DB, hid, result);

    return c.json({
      success: true,
      data: { scoreId, hospitalId: hid, ...result },
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
 * GET /v1/viral/scores/:hospitalId
 */
viralRoutes.get('/scores/:hospitalId', async (c) => {
  const hospitalId = c.req.param('hospitalId');
  const limit = Number(c.req.query('limit') || '10');

  try {
    const scores = await c.env.DB.prepare(`
      SELECT id, total_score, blog_count, cafe_count,
             sponsored_ratio, estimated_ad_spend, sns_channels,
             analyzed_at
      FROM viral_scores
      WHERE hospital_id = ?
      ORDER BY analyzed_at DESC
      LIMIT ?
    `).bind(hospitalId, limit).all();

    return c.json({
      success: true,
      data: { hospitalId, scores: scores.results, count: scores.results.length },
    });
  } catch (error) {
    const err = error as Error;
    return c.json({
      success: false,
      error: { code: 'DB_ERROR', message: err.message },
    }, 500);
  }
});

/**
 * GET /v1/viral/compare
 */
viralRoutes.get('/compare', async (c) => {
  const hospitalIdsParam = c.req.query('hospitalIds');
  if (!hospitalIdsParam) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'hospitalIds 파라미터 필수 (쉼표 구분)' },
    }, 400);
  }

  const hospitalIds = hospitalIdsParam.split(',').map(id => id.trim()).filter(Boolean);
  try {
    const comparisons = [];
    for (const hid of hospitalIds.slice(0, 10)) {
      const latest = await c.env.DB.prepare(`
        SELECT id, hospital_id, total_score, blog_count, cafe_count,
               sponsored_ratio, estimated_ad_spend, sns_channels, analyzed_at
        FROM viral_scores
        WHERE hospital_id = ?
        ORDER BY analyzed_at DESC
        LIMIT 1
      `).bind(hid).first();
      comparisons.push({ hospitalId: hid, score: latest || null });
    }
    return c.json({ success: true, data: { comparisons } });
  } catch (error) {
    const err = error as Error;
    return c.json({
      success: false,
      error: { code: 'DB_ERROR', message: err.message },
    }, 500);
  }
});

/**
 * GET /v1/viral/report/preview/:hospitalId
 */
viralRoutes.get('/report/preview/:hospitalId', async (c) => {
  const hospitalId = c.req.param('hospitalId');

  try {
    const latest = await c.env.DB.prepare(`
      SELECT id, total_score, blog_count, cafe_count,
             sponsored_ratio, estimated_ad_spend, sns_channels,
             analyzed_at
      FROM viral_scores
      WHERE hospital_id = ?
      ORDER BY analyzed_at DESC
      LIMIT 1
    `).bind(hospitalId).first();

    if (!latest) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Viral 분석 결과가 없습니다.' },
      }, 404);
    }

    const grade = getViralGrade(latest.total_score as number);

    return c.json({
      success: true,
      data: {
        preview: true,
        hospitalId,
        grade,
        totalScore: latest.total_score,
        blogCount: latest.blog_count,
        estimatedAdSpend: latest.estimated_ad_spend,
        snsChannels: JSON.parse((latest.sns_channels as string) || '[]').filter((c: { detected: boolean }) => c.detected).length,
        analyzedAt: latest.analyzed_at,
        detailsLocked: true,
        ctaMessage: '상세 마케팅 분석과 경쟁사 비교는 무료 회원가입 후 확인하세요.',
        ctaUrl: '/signup',
      },
    });
  } catch (error) {
    const err = error as Error;
    return c.json({
      success: false,
      error: { code: 'DB_ERROR', message: err.message },
    }, 500);
  }
});

// ─── Helpers ───

function getViralGrade(score: number): string {
  if (score >= 85) return 'S';
  if (score >= 70) return 'A';
  if (score >= 55) return 'B';
  if (score >= 40) return 'C';
  if (score >= 25) return 'D';
  return 'F';
}

async function saveViralScore(
  db: D1Database,
  hospitalId: string,
  result: ViralAnalysisResult,
): Promise<number> {
  const insertResult = await db.prepare(`
    INSERT INTO viral_scores (
      hospital_id, total_score, blog_count, cafe_count,
      sponsored_ratio, estimated_ad_spend, sns_channels
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    hospitalId,
    result.totalScore,
    result.blogCount,
    result.cafeCount,
    result.sponsoredRatio,
    result.estimatedAdSpend,
    JSON.stringify(result.snsChannels),
  ).run();

  return insertResult.meta?.last_row_id || 0;
}

export { viralRoutes };
