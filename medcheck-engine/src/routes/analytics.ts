// ================================================================
// MADMEDCHECK 가격 DB - Phase 3
// 가격 분석(Analytics) API - 대시보드용
// ================================================================
// 위치: src/routes/analytics.ts
// ================================================================

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';

const analytics = new Hono<{ Bindings: Env }>();

// ================================================================
// Zod 스키마
// ================================================================

const DateRangeSchema = z.object({
  startDate: z.string().optional(),  // YYYY-MM-DD
  endDate: z.string().optional(),
  days: z.coerce.number().min(1).max(365).default(30),
});

// ================================================================
// API 라우트
// ================================================================

/**
 * GET /analytics/overview
 * 전체 현황 요약 (대시보드 메인)
 */
analytics.get('/overview', async (c) => {
  const db = c.env.DB;

  // 전체 통계
  const totalStats = await db.prepare(`
    SELECT 
      COUNT(*) as total_prices,
      COUNT(DISTINCT hospital_id) as total_hospitals,
      COUNT(DISTINCT procedure_id) as total_procedures,
      COUNT(DISTINCT sigungu) as total_regions,
      SUM(CASE WHEN is_event = 1 THEN 1 ELSE 0 END) as event_prices,
      ROUND(AVG(price_per_unit)) as avg_price_per_unit
    FROM fact_prices
    WHERE is_active = 1
  `).first();

  // 오늘 수집
  const todayStats = await db.prepare(`
    SELECT COUNT(*) as count
    FROM fact_prices
    WHERE date(collected_at) = date('now')
  `).first<{ count: number }>();

  // 최근 7일 수집 추이
  const weeklyTrend = await db.prepare(`
    SELECT 
      date(collected_at) as date,
      COUNT(*) as count
    FROM fact_prices
    WHERE collected_at >= datetime('now', '-7 days')
    GROUP BY date(collected_at)
    ORDER BY date DESC
  `).all();

  // 단위별 분포
  const unitDistribution = await db.prepare(`
    SELECT 
      u.unit_name_ko as unit,
      COUNT(*) as count,
      ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM fact_prices WHERE is_active = 1), 1) as percentage
    FROM fact_prices fp
    JOIN dim_units u ON fp.unit_id = u.id
    WHERE fp.is_active = 1
    GROUP BY fp.unit_id
    ORDER BY count DESC
    LIMIT 10
  `).all();

  // 지역별 분포 (상위 10개)
  const regionDistribution = await db.prepare(`
    SELECT 
      sigungu,
      COUNT(*) as count,
      COUNT(DISTINCT hospital_id) as hospitals
    FROM fact_prices
    WHERE is_active = 1 AND sigungu IS NOT NULL
    GROUP BY sigungu
    ORDER BY count DESC
    LIMIT 10
  `).all();

  // 알림 현황
  const alertStats = await db.prepare(`
    SELECT 
      COUNT(*) as total_alerts,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_alerts,
      SUM(alert_count) as total_sent
    FROM price_alerts
  `).first();

  return c.json({
    success: true,
    data: {
      summary: totalStats,
      today: todayStats?.count ?? 0,
      weeklyTrend: weeklyTrend.results,
      unitDistribution: unitDistribution.results,
      regionDistribution: regionDistribution.results,
      alerts: alertStats,
      generatedAt: new Date().toISOString(),
    },
  });
});

/**
 * GET /analytics/procedures
 * 시술별 가격 분석
 */
analytics.get('/procedures', async (c) => {
  const db = c.env.DB;
  const sigungu = c.req.query('sigungu');

  let sql = `
    SELECT 
      procedure_id,
      procedure_name_matched as procedure_name,
      unit_id,
      COUNT(*) as sample_count,
      COUNT(DISTINCT hospital_id) as hospital_count,
      COUNT(DISTINCT sigungu) as region_count,
      ROUND(AVG(price_per_unit)) as avg_price_per_unit,
      ROUND(MIN(price_per_unit)) as min_price_per_unit,
      ROUND(MAX(price_per_unit)) as max_price_per_unit,
      ROUND(AVG(total_price)) as avg_total_price,
      ROUND(AVG(quantity), 1) as avg_quantity,
      ROUND(SUM(CASE WHEN is_event = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as event_rate
    FROM fact_prices
    WHERE is_active = 1 AND procedure_id IS NOT NULL
  `;

  const params: string[] = [];
  if (sigungu) {
    sql += ` AND sigungu = ?`;
    params.push(sigungu);
  }

  sql += `
    GROUP BY procedure_id, unit_id
    HAVING COUNT(*) >= 3
    ORDER BY sample_count DESC
  `;

  const result = await db.prepare(sql).bind(...params).all();

  // 단위명 추가
  const procedures = await Promise.all(
    (result.results || []).map(async (proc: any) => {
      const unit = await db.prepare(`
        SELECT unit_name_ko FROM dim_units WHERE id = ?
      `).bind(proc.unit_id).first<{ unit_name_ko: string }>();
      
      return {
        ...proc,
        unit_name: unit?.unit_name_ko ?? proc.unit_id,
      };
    })
  );

  return c.json({
    success: true,
    data: procedures,
    filter: { sigungu },
  });
});

/**
 * GET /analytics/regions
 * 지역별 가격 분석
 */
analytics.get('/regions', async (c) => {
  const db = c.env.DB;
  const procedureId = c.req.query('procedureId');

  let sql = `
    SELECT 
      sigungu,
      sido,
      COUNT(*) as sample_count,
      COUNT(DISTINCT hospital_id) as hospital_count,
      COUNT(DISTINCT procedure_id) as procedure_count,
      ROUND(AVG(price_per_unit)) as avg_price_per_unit,
      ROUND(MIN(price_per_unit)) as min_price_per_unit,
      ROUND(MAX(price_per_unit)) as max_price_per_unit
    FROM fact_prices
    WHERE is_active = 1 AND sigungu IS NOT NULL
  `;

  const params: string[] = [];
  if (procedureId) {
    sql += ` AND procedure_id = ?`;
    params.push(procedureId);
  }

  sql += `
    GROUP BY sigungu
    HAVING COUNT(*) >= 3
    ORDER BY avg_price_per_unit ASC
  `;

  const result = await db.prepare(sql).bind(...params).all();

  return c.json({
    success: true,
    data: result.results,
    filter: { procedureId },
  });
});

/**
 * GET /analytics/trends
 * 가격 트렌드 (시계열)
 */
analytics.get(
  '/trends',
  zValidator('query', DateRangeSchema),
  async (c) => {
    const db = c.env.DB;
    const query = c.req.valid('query');
    const procedureId = c.req.query('procedureId');
    const sigungu = c.req.query('sigungu');

    let sql = `
      SELECT 
        strftime('%Y-%m-%d', collected_at) as date,
        COUNT(*) as count,
        ROUND(AVG(price_per_unit)) as avg_price_per_unit,
        ROUND(MIN(price_per_unit)) as min_price_per_unit,
        ROUND(MAX(price_per_unit)) as max_price_per_unit
      FROM fact_prices
      WHERE is_active = 1
        AND collected_at >= datetime('now', '-' || ? || ' days')
    `;

    const params: (string | number)[] = [query.days];

    if (procedureId) {
      sql += ` AND procedure_id = ?`;
      params.push(procedureId);
    }
    if (sigungu) {
      sql += ` AND sigungu = ?`;
      params.push(sigungu);
    }

    sql += `
      GROUP BY strftime('%Y-%m-%d', collected_at)
      ORDER BY date ASC
    `;

    const result = await db.prepare(sql).bind(...params).all();

    return c.json({
      success: true,
      data: result.results,
      filter: { days: query.days, procedureId, sigungu },
    });
  }
);

/**
 * GET /analytics/fair-price
 * 적정 시세 분석
 */
analytics.get('/fair-price', async (c) => {
  const db = c.env.DB;
  const procedureId = c.req.query('procedureId');
  const sigungu = c.req.query('sigungu');

  if (!procedureId) {
    return c.json({
      success: false,
      error: 'MISSING_PROCEDURE_ID',
      message: 'procedureId가 필요합니다.',
    }, 400);
  }

  let sql = `
    SELECT 
      procedure_id,
      procedure_name_matched as procedure_name,
      sigungu,
      unit_id,
      COUNT(*) as sample_count,
      ROUND(AVG(price_per_unit)) as avg_price_per_unit,
      ROUND(MIN(price_per_unit)) as min_price_per_unit,
      ROUND(MAX(price_per_unit)) as max_price_per_unit,
      ROUND(AVG(price_per_unit) * 0.8) as fair_price_low,
      ROUND(AVG(price_per_unit)) as fair_price_mid,
      ROUND(AVG(price_per_unit) * 1.2) as fair_price_high
    FROM fact_prices
    WHERE is_active = 1 
      AND is_event = 0
      AND procedure_id = ?
  `;

  const params: string[] = [procedureId];

  if (sigungu) {
    sql += ` AND sigungu = ?`;
    params.push(sigungu);
  }

  sql += ` GROUP BY procedure_id, sigungu, unit_id HAVING COUNT(*) >= 3`;

  const result = await db.prepare(sql).bind(...params).all();

  // 단위명 추가
  const data = await Promise.all(
    (result.results || []).map(async (row: any) => {
      const unit = await db.prepare(`
        SELECT unit_name_ko FROM dim_units WHERE id = ?
      `).bind(row.unit_id).first<{ unit_name_ko: string }>();
      
      return {
        ...row,
        unit_name: unit?.unit_name_ko ?? row.unit_id,
      };
    })
  );

  return c.json({
    success: true,
    data,
    filter: { procedureId, sigungu },
  });
});

/**
 * GET /analytics/hospitals/ranking
 * 병원 가격 랭킹
 */
analytics.get('/hospitals/ranking', async (c) => {
  const db = c.env.DB;
  const procedureId = c.req.query('procedureId');
  const sigungu = c.req.query('sigungu');
  const sortBy = c.req.query('sortBy') || 'price_per_unit';
  const order = c.req.query('order') || 'asc';
  const limit = parseInt(c.req.query('limit') || '20');

  if (!procedureId) {
    return c.json({
      success: false,
      error: 'MISSING_PROCEDURE_ID',
      message: 'procedureId가 필요합니다.',
    }, 400);
  }

  let sql = `
    SELECT 
      hospital_id,
      hospital_name,
      sigungu,
      total_price,
      quantity,
      price_per_unit,
      is_event,
      event_name,
      collected_at
    FROM fact_prices
    WHERE is_active = 1 AND procedure_id = ?
  `;

  const params: (string | number)[] = [procedureId];

  if (sigungu) {
    sql += ` AND sigungu = ?`;
    params.push(sigungu);
  }

  sql += ` ORDER BY price_per_unit ${order.toUpperCase()} LIMIT ?`;
  params.push(limit);

  const result = await db.prepare(sql).bind(...params).all();

  // 지역 평균 계산
  let avgSql = `
    SELECT ROUND(AVG(price_per_unit)) as region_avg
    FROM fact_prices
    WHERE is_active = 1 AND procedure_id = ?
  `;
  const avgParams: string[] = [procedureId];
  
  if (sigungu) {
    avgSql += ` AND sigungu = ?`;
    avgParams.push(sigungu);
  }

  const avgResult = await db.prepare(avgSql).bind(...avgParams).first<{ region_avg: number }>();

  // 순위 및 평균 대비 계산
  const rankings = (result.results || []).map((row: any, index: number) => ({
    rank: index + 1,
    ...row,
    vs_avg_percent: avgResult?.region_avg 
      ? Math.round((row.price_per_unit - avgResult.region_avg) / avgResult.region_avg * 100 * 10) / 10
      : null,
    price_grade: getPriceGrade(row.price_per_unit, avgResult?.region_avg),
  }));

  return c.json({
    success: true,
    data: {
      rankings,
      regionAvg: avgResult?.region_avg,
      totalCount: rankings.length,
    },
    filter: { procedureId, sigungu, sortBy, order, limit },
  });
});

/**
 * GET /analytics/b2b/position
 * B2B: 우리 병원 포지셔닝 분석
 */
analytics.get('/b2b/position', async (c) => {
  const db = c.env.DB;
  const hospitalId = c.req.query('hospitalId');

  if (!hospitalId) {
    return c.json({
      success: false,
      error: 'MISSING_HOSPITAL_ID',
      message: 'hospitalId가 필요합니다.',
    }, 400);
  }

  // 병원 정보
  const hospitalInfo = await db.prepare(`
    SELECT DISTINCT hospital_id, hospital_name, sigungu
    FROM fact_prices
    WHERE hospital_id = ?
    LIMIT 1
  `).bind(hospitalId).first();

  if (!hospitalInfo) {
    return c.json({
      success: false,
      error: 'HOSPITAL_NOT_FOUND',
    }, 404);
  }

  // 병원의 시술별 가격
  const hospitalPrices = await db.prepare(`
    SELECT 
      fp.procedure_id,
      fp.procedure_name_matched as procedure_name,
      fp.unit_id,
      u.unit_name_ko as unit_name,
      fp.total_price,
      fp.quantity,
      fp.price_per_unit,
      fp.is_event
    FROM fact_prices fp
    JOIN dim_units u ON fp.unit_id = u.id
    WHERE fp.hospital_id = ? AND fp.is_active = 1
    ORDER BY fp.procedure_name_matched
  `).bind(hospitalId).all();

  // 각 시술별 지역 평균과 비교
  const analysis = await Promise.all(
    (hospitalPrices.results || []).map(async (price: any) => {
      const regionStats = await db.prepare(`
        SELECT 
          COUNT(*) as sample_count,
          ROUND(AVG(price_per_unit)) as region_avg,
          ROUND(MIN(price_per_unit)) as region_min,
          ROUND(MAX(price_per_unit)) as region_max
        FROM fact_prices
        WHERE procedure_id = ? 
          AND sigungu = ?
          AND is_active = 1
          AND is_event = 0
      `).bind(price.procedure_id, (hospitalInfo as any).sigungu).first<any>();

      const rank = await db.prepare(`
        SELECT COUNT(*) + 1 as rank
        FROM fact_prices
        WHERE procedure_id = ?
          AND sigungu = ?
          AND price_per_unit < ?
          AND is_active = 1
      `).bind(price.procedure_id, (hospitalInfo as any).sigungu, price.price_per_unit).first<{ rank: number }>();

      return {
        ...price,
        regionAvg: regionStats?.region_avg,
        regionMin: regionStats?.region_min,
        regionMax: regionStats?.region_max,
        sampleCount: regionStats?.sample_count,
        rank: rank?.rank,
        vsAvgPercent: regionStats?.region_avg 
          ? Math.round((price.price_per_unit - regionStats.region_avg) / regionStats.region_avg * 100 * 10) / 10
          : null,
        priceGrade: getPriceGrade(price.price_per_unit, regionStats?.region_avg),
      };
    })
  );

  return c.json({
    success: true,
    data: {
      hospital: hospitalInfo,
      procedures: analysis,
      summary: {
        totalProcedures: analysis.length,
        cheaperThanAvg: analysis.filter(a => (a.vsAvgPercent ?? 0) < 0).length,
        expensiveThanAvg: analysis.filter(a => (a.vsAvgPercent ?? 0) > 0).length,
      },
    },
  });
});

/**
 * GET /analytics/b2b/competitors
 * B2B: 경쟁 병원 분석
 */
analytics.get('/b2b/competitors', async (c) => {
  const db = c.env.DB;
  const hospitalId = c.req.query('hospitalId');
  const procedureId = c.req.query('procedureId');

  if (!hospitalId) {
    return c.json({
      success: false,
      error: 'MISSING_HOSPITAL_ID',
    }, 400);
  }

  // 우리 병원 정보
  const myHospital = await db.prepare(`
    SELECT DISTINCT hospital_id, hospital_name, sigungu
    FROM fact_prices WHERE hospital_id = ? LIMIT 1
  `).bind(hospitalId).first<any>();

  if (!myHospital) {
    return c.json({ success: false, error: 'HOSPITAL_NOT_FOUND' }, 404);
  }

  // 같은 지역 경쟁 병원
  let sql = `
    SELECT 
      hospital_id,
      hospital_name,
      procedure_id,
      procedure_name_matched as procedure_name,
      price_per_unit,
      total_price,
      quantity,
      is_event,
      collected_at
    FROM fact_prices
    WHERE sigungu = ?
      AND hospital_id != ?
      AND is_active = 1
  `;

  const params: string[] = [myHospital.sigungu, hospitalId];

  if (procedureId) {
    sql += ` AND procedure_id = ?`;
    params.push(procedureId);
  }

  sql += ` ORDER BY price_per_unit ASC LIMIT 50`;

  const competitors = await db.prepare(sql).bind(...params).all();

  return c.json({
    success: true,
    data: {
      myHospital,
      competitors: competitors.results,
      totalCompetitors: competitors.results?.length ?? 0,
    },
    filter: { hospitalId, procedureId },
  });
});

// ================================================================
// 헬퍼 함수
// ================================================================

function getPriceGrade(price: number, regionAvg: number | undefined): string {
  if (!regionAvg) return '정보없음';
  
  const ratio = price / regionAvg;
  if (ratio < 0.7) return '💰 매우 저렴';
  if (ratio < 0.85) return '😊 저렴';
  if (ratio < 1.15) return '✅ 적정';
  if (ratio < 1.3) return '⚠️ 비쌈';
  return '🚨 매우 비쌈';
}

export default analytics;
