// ================================================================
// MADMEDCHECK 가격 DB - Phase 2
// 지역(Regions) 관리 API
// ================================================================
// 위치: src/routes/regions.ts
// ================================================================

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';

const regions = new Hono<{ Bindings: Env }>();

// ================================================================
// Zod 스키마
// ================================================================

const RegionQuerySchema = z.object({
  level: z.coerce.number().min(1).max(3).optional(),  // 1: 시도, 2: 시군구, 3: 읍면동
  sido: z.string().optional(),
  sigungu: z.string().optional(),
  parentId: z.string().optional(),
});

// ================================================================
// API 라우트
// ================================================================

/**
 * GET /regions
 * 지역 목록 조회
 */
regions.get(
  '/',
  zValidator('query', RegionQuerySchema),
  async (c) => {
    const db = c.env.DB;
    const query = c.req.valid('query');

    let sql = `
      SELECT 
        r.id,
        r.region_level,
        r.sido_code,
        r.sido_name,
        r.sigungu_code,
        r.sigungu_name,
        r.dong_code,
        r.dong_name,
        r.full_address,
        r.short_address,
        r.parent_id,
        r.hospital_count,
        r.price_count
      FROM dim_regions r
      WHERE r.is_active = 1
    `;
    
    const params: (string | number)[] = [];

    if (query.level) {
      sql += ` AND r.region_level = ?`;
      params.push(query.level);
    }

    if (query.sido) {
      sql += ` AND r.sido_name = ?`;
      params.push(query.sido);
    }

    if (query.sigungu) {
      sql += ` AND r.sigungu_name = ?`;
      params.push(query.sigungu);
    }

    if (query.parentId) {
      sql += ` AND r.parent_id = ?`;
      params.push(query.parentId);
    }

    sql += ` ORDER BY r.sido_code, r.sigungu_code, r.dong_code`;

    const result = await db.prepare(sql).bind(...params).all();

    return c.json({
      success: true,
      data: result.results,
      count: result.results?.length ?? 0,
    });
  }
);

/**
 * GET /regions/sido
 * 시/도 목록
 */
regions.get('/sido', async (c) => {
  const db = c.env.DB;

  const result = await db.prepare(`
    SELECT id, sido_code, sido_name, short_address, hospital_count, price_count
    FROM dim_regions
    WHERE region_level = 1 AND is_active = 1
    ORDER BY sido_code
  `).all();

  return c.json({
    success: true,
    data: result.results,
  });
});

/**
 * GET /regions/sigungu
 * 시/군/구 목록 (시도 필터 가능)
 */
regions.get('/sigungu', async (c) => {
  const db = c.env.DB;
  const sido = c.req.query('sido');

  let sql = `
    SELECT id, sido_name, sigungu_code, sigungu_name, full_address, short_address, hospital_count, price_count
    FROM dim_regions
    WHERE region_level = 2 AND is_active = 1
  `;
  
  const params: string[] = [];
  
  if (sido) {
    sql += ` AND sido_name = ?`;
    params.push(sido);
  }
  
  sql += ` ORDER BY sido_name, sigungu_name`;

  const result = await db.prepare(sql).bind(...params).all();

  return c.json({
    success: true,
    data: result.results,
  });
});

/**
 * GET /regions/dong
 * 읍/면/동 목록 (시군구 필터 가능)
 */
regions.get('/dong', async (c) => {
  const db = c.env.DB;
  const sigungu = c.req.query('sigungu');

  let sql = `
    SELECT id, sido_name, sigungu_name, dong_code, dong_name, full_address, short_address, hospital_count, price_count
    FROM dim_regions
    WHERE region_level = 3 AND is_active = 1
  `;
  
  const params: string[] = [];
  
  if (sigungu) {
    sql += ` AND sigungu_name = ?`;
    params.push(sigungu);
  }
  
  sql += ` ORDER BY sido_name, sigungu_name, dong_name`;

  const result = await db.prepare(sql).bind(...params).all();

  return c.json({
    success: true,
    data: result.results,
  });
});

/**
 * GET /regions/:id
 * 지역 상세 조회 (하위 지역 포함)
 */
regions.get('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');

  // 해당 지역 정보
  const region = await db.prepare(`
    SELECT * FROM dim_regions WHERE id = ?
  `).bind(id).first();

  if (!region) {
    return c.json({
      success: false,
      error: 'NOT_FOUND',
      message: '지역을 찾을 수 없습니다.',
    }, 404);
  }

  // 하위 지역 목록
  const children = await db.prepare(`
    SELECT id, region_level, sigungu_name, dong_name, short_address, hospital_count, price_count
    FROM dim_regions
    WHERE parent_id = ? AND is_active = 1
    ORDER BY sigungu_code, dong_code
  `).bind(id).all();

  return c.json({
    success: true,
    data: {
      ...region,
      children: children.results,
    },
  });
});

/**
 * GET /regions/search
 * 지역명 검색
 */
regions.get('/search/query', async (c) => {
  const db = c.env.DB;
  const q = c.req.query('q');

  if (!q || q.length < 2) {
    return c.json({
      success: false,
      error: 'INVALID_QUERY',
      message: '검색어는 2자 이상이어야 합니다.',
    }, 400);
  }

  const result = await db.prepare(`
    SELECT id, region_level, sido_name, sigungu_name, dong_name, full_address, short_address
    FROM dim_regions
    WHERE is_active = 1
      AND (
        sido_name LIKE ? OR
        sigungu_name LIKE ? OR
        dong_name LIKE ? OR
        full_address LIKE ?
      )
    ORDER BY region_level, sido_name, sigungu_name
    LIMIT 20
  `).bind(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`).all();

  return c.json({
    success: true,
    data: result.results,
    query: q,
  });
});

/**
 * GET /regions/prices/:sigungu
 * 특정 지역의 가격 통계
 */
regions.get('/prices/:sigungu', async (c) => {
  const db = c.env.DB;
  const sigungu = c.req.param('sigungu');

  // 지역별 시술 가격 통계
  const stats = await db.prepare(`
    SELECT 
      procedure_id,
      procedure_name_matched as procedure_name,
      unit_id,
      COUNT(*) as sample_count,
      ROUND(AVG(price_per_unit)) as avg_price_per_unit,
      ROUND(MIN(price_per_unit)) as min_price_per_unit,
      ROUND(MAX(price_per_unit)) as max_price_per_unit,
      COUNT(DISTINCT hospital_id) as hospital_count
    FROM fact_prices
    WHERE sigungu = ? AND is_active = 1
    GROUP BY procedure_id, unit_id
    HAVING COUNT(*) >= 2
    ORDER BY sample_count DESC
  `).bind(sigungu).all();

  // 해당 지역 병원 목록
  const hospitals = await db.prepare(`
    SELECT DISTINCT 
      hospital_id,
      hospital_name,
      COUNT(*) as price_count
    FROM fact_prices
    WHERE sigungu = ? AND is_active = 1
    GROUP BY hospital_id
    ORDER BY price_count DESC
    LIMIT 20
  `).bind(sigungu).all();

  return c.json({
    success: true,
    data: {
      sigungu,
      procedureStats: stats.results,
      hospitals: hospitals.results,
    },
  });
});

export default regions;
