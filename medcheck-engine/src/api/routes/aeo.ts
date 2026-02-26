/**
 * AEO/GEO API Routes - AG MedCheck
 * AI 검색 노출 경쟁력 분석
 */

import { Hono } from 'hono';
import type { D1Database } from '../../db/d1';
import { analyzeAeo } from '../../services/aeo-analyzer';
import type { AeoAnalysisResult } from '../../services/aeo-analyzer';

interface Env {
  DB: D1Database;
}

const aeoRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /v1/aeo/analyze
 * URL 받아서 AEO 분석 실행
 */
aeoRoutes.post('/analyze', async (c) => {
  const body = await c.req.json<{ url: string; hospitalId?: string }>();
  const { url, hospitalId } = body;

  if (!url) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'url은 필수입니다.' },
    }, 400);
  }

  try {
    // 1. HTML 가져오기
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MedCheck-AEO-Analyzer/1.0',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return c.json({
        success: false,
        error: { code: 'FETCH_ERROR', message: `URL 접근 실패: ${response.status} ${response.statusText}` },
      }, 502);
    }

    const html = await response.text();

    // 2. AEO 분석 실행
    const result = await analyzeAeo(url, html);

    // 3. DB 저장
    const hid = hospitalId || url;
    const scoreId = await saveAeoScore(c.env.DB, hid, result);

    return c.json({
      success: true,
      data: {
        scoreId,
        hospitalId: hid,
        ...result,
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
 * GET /v1/aeo/scores/:hospitalId
 * 병원의 AEO 점수 이력
 */
aeoRoutes.get('/scores/:hospitalId', async (c) => {
  const hospitalId = c.req.param('hospitalId');
  const limit = Number(c.req.query('limit') || '10');

  try {
    const scores = await c.env.DB.prepare(`
      SELECT id, total_score, content_score, technical_score,
             trust_score, local_score, ai_friendly_score,
             analyzed_at
      FROM aeo_scores
      WHERE hospital_id = ?
      ORDER BY analyzed_at DESC
      LIMIT ?
    `).bind(hospitalId, limit).all();

    return c.json({
      success: true,
      data: {
        hospitalId,
        scores: scores.results,
        count: scores.results.length,
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

/**
 * GET /v1/aeo/compare
 * 복수 병원 AEO 비교
 * ?hospitalIds=id1,id2,id3
 */
aeoRoutes.get('/compare', async (c) => {
  const hospitalIdsParam = c.req.query('hospitalIds');

  if (!hospitalIdsParam) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'hospitalIds 파라미터는 필수입니다 (쉼표 구분).' },
    }, 400);
  }

  const hospitalIds = hospitalIdsParam.split(',').map(id => id.trim()).filter(Boolean);

  if (hospitalIds.length < 2) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: '최소 2개 이상의 hospitalId가 필요합니다.' },
    }, 400);
  }

  try {
    const comparisons = [];
    for (const hid of hospitalIds.slice(0, 10)) {
      const latest = await c.env.DB.prepare(`
        SELECT id, hospital_id, total_score, content_score, technical_score,
               trust_score, local_score, ai_friendly_score, details,
               analyzed_at
        FROM aeo_scores
        WHERE hospital_id = ?
        ORDER BY analyzed_at DESC
        LIMIT 1
      `).bind(hid).first();

      comparisons.push({
        hospitalId: hid,
        score: latest || null,
      });
    }

    return c.json({
      success: true,
      data: { comparisons },
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
 * GET /v1/aeo/report/preview/:hospitalId
 * AEO 맛보기 리포트
 */
aeoRoutes.get('/report/preview/:hospitalId', async (c) => {
  const hospitalId = c.req.param('hospitalId');

  try {
    const latest = await c.env.DB.prepare(`
      SELECT id, total_score, content_score, technical_score,
             trust_score, local_score, ai_friendly_score,
             details, analyzed_at
      FROM aeo_scores
      WHERE hospital_id = ?
      ORDER BY analyzed_at DESC
      LIMIT 1
    `).bind(hospitalId).first();

    if (!latest) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'AEO 분석 결과가 없습니다.' },
      }, 404);
    }

    // 맛보기: 총점과 카테고리별 점수만 공개, 상세 항목은 가림
    const grade = getAeoGrade(latest.total_score as number);

    return c.json({
      success: true,
      data: {
        preview: true,
        hospitalId,
        grade,
        totalScore: latest.total_score,
        categories: {
          content: { score: latest.content_score, maxScore: 30 },
          technical: { score: latest.technical_score, maxScore: 20 },
          trust: { score: latest.trust_score, maxScore: 20 },
          local: { score: latest.local_score, maxScore: 15 },
          aiFriendly: { score: latest.ai_friendly_score, maxScore: 15 },
        },
        analyzedAt: latest.analyzed_at,
        detailsLocked: true,
        ctaMessage: '항목별 상세 분석과 개선 가이드는 무료 회원가입 후 확인하세요.',
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

function getAeoGrade(score: number): string {
  if (score >= 90) return 'S';
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  if (score >= 45) return 'C';
  if (score >= 30) return 'D';
  return 'F';
}

async function saveAeoScore(
  db: D1Database,
  hospitalId: string,
  result: AeoAnalysisResult,
): Promise<number> {
  const { categories } = result;

  const insertResult = await db.prepare(`
    INSERT INTO aeo_scores (
      hospital_id, total_score,
      content_score, technical_score, trust_score,
      local_score, ai_friendly_score, details
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    hospitalId,
    result.totalScore,
    categories.content.score,
    categories.technical.score,
    categories.trust.score,
    categories.local.score,
    categories.aiFriendly.score,
    JSON.stringify({
      categories: result.categories,
      recommendations: result.recommendations,
    }),
  ).run();

  const scoreId = insertResult.meta?.last_row_id || 0;

  // 상세 항목 저장
  const allItems: Array<{ category: string; item: { name: string; score: number; maxScore: number; evidence: string; recommendation: string } }> = [];
  for (const [catKey, cat] of Object.entries(categories)) {
    for (const item of cat.items) {
      allItems.push({ category: catKey, item });
    }
  }

  for (const { category, item } of allItems) {
    await db.prepare(`
      INSERT INTO aeo_detail_items (
        score_id, category, item_name, item_score, max_score, evidence, recommendation
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      scoreId,
      category,
      item.name,
      item.score,
      item.maxScore,
      item.evidence,
      item.recommendation,
    ).run();
  }

  return scoreId;
}

export { aeoRoutes };
