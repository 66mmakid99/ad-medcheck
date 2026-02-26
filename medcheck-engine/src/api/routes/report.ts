/**
 * 맛보기 리포트 API
 * GET /v1/report/preview/:hospitalId - 병원별 분석 요약 (가입 유도용)
 */

import { Hono } from 'hono';
import type { D1Database } from '../../db/d1';

interface Env {
  DB: D1Database;
}

const reportRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /v1/report/preview/:hospitalId
 * 맛보기 리포트 - 숫자만 공개, 상세는 가림
 */
reportRoutes.get('/preview/:hospitalId', async (c) => {
  const hospitalId = c.req.param('hospitalId');

  if (!hospitalId) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'hospitalId는 필수입니다.' },
    }, 400);
  }

  try {
    // 최신 분석 결과 조회 (리모트 DB 스키마에 맞춤)
    const result = await c.env.DB.prepare(`
      SELECT
        grade,
        violation_count,
        violations,
        summary,
        analyzed_at,
        url_analyzed,
        hospital_name,
        critical_count,
        major_count,
        minor_count
      FROM hospital_analysis_results
      WHERE hospital_id = ?
      AND status = 'success'
      ORDER BY analyzed_at DESC
      LIMIT 1
    `).bind(hospitalId).first();

    if (!result) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: '분석 결과가 없습니다.' },
      }, 404);
    }

    // DB의 심각도별 카운트 사용 (major→high, minor→medium 매핑)
    const severityDistribution = {
      critical: Number(result.critical_count) || 0,
      high: Number(result.major_count) || 0,
      medium: Number(result.minor_count) || 0,
      low: 0,
    };

    return c.json({
      success: true,
      data: {
        preview: true,
        hospitalId: Number(hospitalId),
        hospitalName: result.hospital_name || null,
        grade: result.grade,
        totalViolations: result.violation_count,
        severityDistribution,
        analyzedAt: result.analyzed_at,
        detailsLocked: true,
        ctaMessage: '상세 위반 내용과 개선 가이드는 무료 회원가입 후 확인하세요.',
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

/**
 * GET /v1/report/preview-by-url
 * URL 기반 맛보기 리포트 (DB 조회 없이 실시간 분석)
 */
reportRoutes.get('/preview-by-url', async (c) => {
  const url = c.req.query('url');

  if (!url) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'url 파라미터는 필수입니다.' },
    }, 400);
  }

  try {
    // DB에서 해당 URL의 최신 분석 결과 조회 (리모트 DB 스키마에 맞춤)
    const result = await c.env.DB.prepare(`
      SELECT
        grade,
        violation_count,
        violations,
        summary,
        analyzed_at,
        url_analyzed,
        hospital_name,
        critical_count,
        major_count,
        minor_count
      FROM hospital_analysis_results
      WHERE url_analyzed LIKE ?
      AND status = 'success'
      ORDER BY analyzed_at DESC
      LIMIT 1
    `).bind(`%${url}%`).first();

    if (!result) {
      return c.json({
        success: true,
        data: {
          preview: true,
          url,
          found: false,
          ctaMessage: '아직 분석되지 않은 병원입니다. 무료 분석을 요청하세요.',
          ctaUrl: '/request-analysis',
        },
      });
    }

    const severityDistribution = {
      critical: Number(result.critical_count) || 0,
      high: Number(result.major_count) || 0,
      medium: Number(result.minor_count) || 0,
      low: 0,
    };

    return c.json({
      success: true,
      data: {
        preview: true,
        url,
        found: true,
        hospitalName: result.hospital_name || null,
        grade: result.grade,
        totalViolations: result.violation_count,
        severityDistribution,
        analyzedAt: result.analyzed_at,
        detailsLocked: true,
        ctaMessage: '상세 위반 내용과 개선 가이드는 무료 회원가입 후 확인하세요.',
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

export { reportRoutes };
