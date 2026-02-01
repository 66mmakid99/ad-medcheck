// ================================================================
// MADMEDCHECK 가격 DB - Phase 1
// OCR 결과 → fact_prices 저장 API
// ================================================================
// 위치: src/routes/prices.ts
// 기술스택: Hono + TypeScript + Cloudflare D1
// ================================================================

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';

const prices = new Hono<{ Bindings: Env }>();

// ================================================================
// 타입 정의
// ================================================================

// 단위 정보 타입
interface UnitInfo {
  id: string;
  unit_code: string;
  unit_name_ko: string;
  base_unit_id: string | null;
  conversion_rate: number;
}

// 파싱된 가격 정보
interface ParsedPrice {
  totalPrice: number;        // 원 단위 총 가격
  quantity: number;          // 수량
  unitId: string;            // 매칭된 단위 ID
  unitCode: string;          // 단위 코드
  rawQuantityText: string;   // 원본 수량 텍스트
  rawUnitText: string;       // 원본 단위 텍스트
  confidence: number;        // 파싱 신뢰도
}

// ================================================================
// Zod 스키마: 요청 검증
// ================================================================

// OCR 결과에서 가격 저장 요청
const SavePriceFromOCRSchema = z.object({
  // OCR 원본 데이터
  rawPriceText: z.string().min(1),                    // "300샷 79만원"
  
  // 병원 정보 (필수)
  hospitalId: z.string().optional(),
  hospitalName: z.string().min(1),
  
  // 지역 정보
  sido: z.string().optional(),                         // "서울특별시"
  sigungu: z.string().optional(),                      // "강남구"
  dong: z.string().optional(),                         // "역삼동"
  
  // 시술 정보
  procedureId: z.string().optional(),
  procedureNameRaw: z.string().optional(),             // OCR에서 읽은 시술명
  equipmentName: z.string().optional(),                // 장비명
  
  // 가격 유형
  priceType: z.enum(['regular', 'event', 'package', 'membership']).default('regular'),
  isEvent: z.boolean().default(false),
  eventName: z.string().optional(),
  
  // 패키지 정보
  isPackage: z.boolean().default(false),
  packageSessions: z.number().optional(),
  
  // 데이터 출처
  sourceType: z.enum(['ocr', 'crawl', 'manual', 'api']).default('ocr'),
  sourceUrl: z.string().optional(),
  sourcePlatform: z.string().optional(),
  ocrResultId: z.string().optional(),
  ocrConfidence: z.number().min(0).max(1).optional(),
  originalImageUrl: z.string().optional(),
});

// 배치 저장 요청
const BatchSavePricesSchema = z.object({
  prices: z.array(SavePriceFromOCRSchema).min(1).max(100),
});

// 가격 조회 쿼리
const PriceQuerySchema = z.object({
  sigungu: z.string().optional(),
  procedureId: z.string().optional(),
  unitId: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  isEvent: z.coerce.boolean().optional(),
  sortBy: z.enum(['price_per_unit', 'total_price', 'collected_at']).default('price_per_unit'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

// ================================================================
// 헬퍼 함수: 가격 텍스트 파싱
// ================================================================

/**
 * OCR 텍스트에서 가격 정보를 파싱합니다.
 * 예시 입력:
 * - "300샷 79만원" → { totalPrice: 790000, quantity: 300, unitId: 'UNIT-SHOT' }
 * - "리쥬란 4cc 49만원" → { totalPrice: 490000, quantity: 4, unitId: 'UNIT-CC' }
 * - "보톡스 100유닛 15만원" → { totalPrice: 150000, quantity: 100, unitId: 'UNIT-UNIT' }
 */
async function parsePriceText(
  db: D1Database,
  rawText: string
): Promise<ParsedPrice | null> {
  // 1. 모든 단위 정보 가져오기 (캐싱 가능)
  const units = await db.prepare(`
    SELECT id, unit_code, unit_name_ko, regex_patterns, base_unit_id, conversion_rate
    FROM dim_units 
    WHERE is_active = 1
    ORDER BY sort_order
  `).all<UnitInfo & { regex_patterns: string }>();

  if (!units.results?.length) {
    console.error('No units found in dim_units table');
    return null;
  }

  // 2. 가격 파싱 (만원, 천원 등 처리)
  const pricePatterns = [
    { pattern: /(\d+(?:,\d+)?)\s*만\s*원/i, multiplier: 10000 },
    { pattern: /(\d+(?:,\d+)?)\s*천\s*원/i, multiplier: 1000 },
    { pattern: /(\d+(?:,\d+)?)\s*원/i, multiplier: 1 },
    { pattern: /(\d+(?:\.\d+)?)\s*만/i, multiplier: 10000 },  // "79만" 형식
    { pattern: /₩\s*(\d+(?:,\d+)*)/i, multiplier: 1 },       // "₩790,000" 형식
  ];

  let totalPrice: number | null = null;
  for (const { pattern, multiplier } of pricePatterns) {
    const match = rawText.match(pattern);
    if (match) {
      const numStr = match[1].replace(/,/g, '');
      totalPrice = Math.round(parseFloat(numStr) * multiplier);
      break;
    }
  }

  if (totalPrice === null) {
    console.warn(`Could not parse price from: ${rawText}`);
    return null;
  }

  // 3. 수량과 단위 파싱
  let quantity: number | null = null;
  let matchedUnit: (UnitInfo & { regex_patterns: string }) | null = null;
  let rawQuantityText = '';
  let rawUnitText = '';

  for (const unit of units.results) {
    const patterns: string[] = JSON.parse(unit.regex_patterns || '[]');
    
    for (const pattern of patterns) {
      // 수량 + 단위 패턴 (예: "300샷", "4cc", "100유닛")
      const regex = new RegExp(`(\\d+(?:\\.\\d+)?|\\d+(?:,\\d+)*)\\s*${escapeRegex(pattern)}`, 'i');
      const match = rawText.match(regex);
      
      if (match) {
        const numStr = match[1].replace(/,/g, '');
        quantity = parseFloat(numStr);
        
        // 만줄 단위 처리 (6만줄 → 60000줄 = 60kJ)
        // ⚠️ 줄(Joule)은 ONDA 전용 단위이며, 샷과 환산 불가!
        if (pattern.includes('만줄') || pattern.includes('만 줄')) {
          quantity = quantity * 10000;
        }
        
        matchedUnit = unit;
        rawQuantityText = match[0];
        rawUnitText = pattern;
        break;
      }
    }
    
    if (matchedUnit) break;
  }

  // 단위를 찾지 못한 경우 기본값
  if (!matchedUnit || quantity === null) {
    // 숫자만 있는 경우 (예: "300 79만원")
    const numMatch = rawText.match(/(\d+(?:,\d+)*)\s+\d+/);
    if (numMatch) {
      quantity = parseFloat(numMatch[1].replace(/,/g, ''));
      // 기본 단위: 회(session)
      matchedUnit = units.results.find(u => u.unit_code === 'SESSION') || units.results[0];
      rawQuantityText = numMatch[1];
      rawUnitText = '회';
    } else {
      console.warn(`Could not parse quantity/unit from: ${rawText}`);
      return null;
    }
  }

  // 4. 신뢰도 계산
  let confidence = 1.0;
  if (!matchedUnit) confidence -= 0.3;
  if (quantity <= 0) confidence -= 0.3;
  if (totalPrice <= 0) confidence -= 0.3;

  return {
    totalPrice,
    quantity,
    unitId: matchedUnit.id,
    unitCode: matchedUnit.unit_code,
    rawQuantityText,
    rawUnitText,
    confidence: Math.max(0, confidence),
  };
}

/**
 * 정규표현식 특수문자 이스케이프
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 단위 변환 (동일 카테고리 내에서만!)
 * 
 * ⚠️ 중요: 다른 시술 간 단위 환산은 불가능합니다!
 * - 샷(Shot): HIFU, 고주파 전용 → 다른 단위로 환산 불가
 * - 줄(Joule): ONDA 전용 → 다른 단위로 환산 불가
 * - cc: 필러/주사 전용
 * - 유닛: 보톡스 전용
 * 
 * 환산은 동일 단위 체계 내에서만 가능 (예: mg ↔ g)
 */
async function normalizeUnit(
  db: D1Database,
  unitId: string,
  quantity: number,
  pricePerUnit: number
): Promise<{ normalizedUnitId: string; normalizedQuantity: number; normalizedPricePerUnit: number } | null> {
  const unit = await db.prepare(`
    SELECT id, base_unit_id, conversion_rate
    FROM dim_units
    WHERE id = ?
  `).bind(unitId).first<UnitInfo>();

  if (!unit) return null;

  // 대부분의 미용 시술 단위는 고유 단위이므로
  // 기준 단위가 없으면 (base_unit_id = NULL) 그대로 사용
  // ⚠️ 샷↔줄 같은 다른 시술 간 환산은 의미 없음!
  if (!unit.base_unit_id) {
    return {
      normalizedUnitId: unitId,
      normalizedQuantity: quantity,
      normalizedPricePerUnit: pricePerUnit,
    };
  }

  // 동일 단위 체계 내 환산만 수행 (예: mg→g)
  const rate = unit.conversion_rate || 1;
  return {
    normalizedUnitId: unit.base_unit_id,
    normalizedQuantity: quantity * rate,
    normalizedPricePerUnit: pricePerUnit / rate,
  };
}

/**
 * 고유 ID 생성
 */
function generatePriceId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `PRICE-${date}-${random}`;
}

// ================================================================
// API 라우트
// ================================================================

/**
 * POST /prices/from-ocr
 * OCR 결과에서 가격 정보를 파싱하여 저장
 */
prices.post(
  '/from-ocr',
  zValidator('json', SavePriceFromOCRSchema),
  async (c) => {
    const db = c.env.DB;
    const body = c.req.valid('json');

    try {
      // 1. 가격 텍스트 파싱
      const parsed = await parsePriceText(db, body.rawPriceText);
      
      if (!parsed) {
        return c.json({
          success: false,
          error: 'PARSE_FAILED',
          message: `가격 정보를 파싱할 수 없습니다: "${body.rawPriceText}"`,
          suggestion: '형식: "300샷 79만원", "4cc 49만원", "100유닛 15만원"'
        }, 400);
      }

      // 2. 단위 정규화
      const normalized = await normalizeUnit(
        db,
        parsed.unitId,
        parsed.quantity,
        parsed.totalPrice / parsed.quantity
      );

      // 3. 시술명 매칭 (있으면)
      let procedureMatched: string | null = null;
      if (body.procedureNameRaw) {
        const procedure = await db.prepare(`
          SELECT id, name FROM procedures 
          WHERE name LIKE ? OR aliases LIKE ?
          LIMIT 1
        `).bind(`%${body.procedureNameRaw}%`, `%${body.procedureNameRaw}%`).first<{ id: string; name: string }>();
        
        if (procedure) {
          procedureMatched = procedure.name;
          if (!body.procedureId) {
            body.procedureId = procedure.id;
          }
        }
      }

      // 4. fact_prices에 저장
      const priceId = generatePriceId();
      
      await db.prepare(`
        INSERT INTO fact_prices (
          id,
          raw_price_text,
          raw_quantity_text,
          raw_unit_text,
          total_price,
          quantity,
          unit_id,
          normalized_quantity,
          normalized_unit_id,
          normalized_price_per_unit,
          procedure_id,
          procedure_name_raw,
          procedure_name_matched,
          equipment_name,
          hospital_id,
          hospital_name,
          sido,
          sigungu,
          dong,
          price_type,
          is_event,
          event_name,
          is_package,
          package_sessions,
          price_per_session,
          source_type,
          source_url,
          source_platform,
          ocr_result_id,
          ocr_confidence,
          original_image_url,
          data_quality_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        priceId,
        body.rawPriceText,
        parsed.rawQuantityText,
        parsed.rawUnitText,
        parsed.totalPrice,
        parsed.quantity,
        parsed.unitId,
        normalized?.normalizedQuantity ?? null,
        normalized?.normalizedUnitId ?? null,
        normalized?.normalizedPricePerUnit ?? null,
        body.procedureId ?? null,
        body.procedureNameRaw ?? null,
        procedureMatched,
        body.equipmentName ?? null,
        body.hospitalId ?? null,
        body.hospitalName,
        body.sido ?? null,
        body.sigungu ?? null,
        body.dong ?? null,
        body.priceType,
        body.isEvent ? 1 : 0,
        body.eventName ?? null,
        body.isPackage ? 1 : 0,
        body.packageSessions ?? null,
        body.isPackage && body.packageSessions 
          ? Math.round(parsed.totalPrice / body.packageSessions) 
          : null,
        body.sourceType,
        body.sourceUrl ?? null,
        body.sourcePlatform ?? null,
        body.ocrResultId ?? null,
        body.ocrConfidence ?? parsed.confidence,
        body.originalImageUrl ?? null,
        parsed.confidence * 100  // 품질 점수
      ).run();

      // 5. 응답
      return c.json({
        success: true,
        data: {
          id: priceId,
          parsed: {
            totalPrice: parsed.totalPrice,
            quantity: parsed.quantity,
            unit: parsed.unitCode,
            pricePerUnit: Math.round(parsed.totalPrice / parsed.quantity),
          },
          normalized: normalized ? {
            quantity: normalized.normalizedQuantity,
            unitId: normalized.normalizedUnitId,
            pricePerUnit: Math.round(normalized.normalizedPricePerUnit),
          } : null,
          hospitalName: body.hospitalName,
          procedureMatched,
          confidence: parsed.confidence,
        }
      }, 201);

    } catch (error) {
      console.error('Save price error:', error);
      return c.json({
        success: false,
        error: 'SAVE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      }, 500);
    }
  }
);

/**
 * POST /prices/batch
 * 여러 가격 정보를 한번에 저장 (배치 처리)
 */
prices.post(
  '/batch',
  zValidator('json', BatchSavePricesSchema),
  async (c) => {
    const db = c.env.DB;
    const { prices: priceList } = c.req.valid('json');

    const results: { success: boolean; id?: string; error?: string; raw: string }[] = [];

    for (const priceData of priceList) {
      try {
        // 개별 저장 로직 재사용
        const parsed = await parsePriceText(db, priceData.rawPriceText);
        
        if (!parsed) {
          results.push({
            success: false,
            error: 'PARSE_FAILED',
            raw: priceData.rawPriceText,
          });
          continue;
        }

        const normalized = await normalizeUnit(
          db,
          parsed.unitId,
          parsed.quantity,
          parsed.totalPrice / parsed.quantity
        );

        const priceId = generatePriceId();

        await db.prepare(`
          INSERT INTO fact_prices (
            id, raw_price_text, raw_quantity_text, raw_unit_text,
            total_price, quantity, unit_id,
            normalized_quantity, normalized_unit_id, normalized_price_per_unit,
            hospital_id, hospital_name, sido, sigungu, dong,
            procedure_name_raw, equipment_name,
            price_type, is_event, event_name,
            source_type, source_url, source_platform,
            ocr_confidence, data_quality_score
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          priceId,
          priceData.rawPriceText,
          parsed.rawQuantityText,
          parsed.rawUnitText,
          parsed.totalPrice,
          parsed.quantity,
          parsed.unitId,
          normalized?.normalizedQuantity ?? null,
          normalized?.normalizedUnitId ?? null,
          normalized?.normalizedPricePerUnit ?? null,
          priceData.hospitalId ?? null,
          priceData.hospitalName,
          priceData.sido ?? null,
          priceData.sigungu ?? null,
          priceData.dong ?? null,
          priceData.procedureNameRaw ?? null,
          priceData.equipmentName ?? null,
          priceData.priceType,
          priceData.isEvent ? 1 : 0,
          priceData.eventName ?? null,
          priceData.sourceType,
          priceData.sourceUrl ?? null,
          priceData.sourcePlatform ?? null,
          priceData.ocrConfidence ?? parsed.confidence,
          parsed.confidence * 100
        ).run();

        results.push({
          success: true,
          id: priceId,
          raw: priceData.rawPriceText,
        });

      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          raw: priceData.rawPriceText,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    
    return c.json({
      success: true,
      summary: {
        total: priceList.length,
        success: successCount,
        failed: priceList.length - successCount,
      },
      results,
    });
  }
);

/**
 * GET /prices
 * 가격 목록 조회 (필터링, 정렬, 페이지네이션)
 */
prices.get(
  '/',
  zValidator('query', PriceQuerySchema),
  async (c) => {
    const db = c.env.DB;
    const query = c.req.valid('query');

    // 동적 쿼리 빌드
    let sql = `
      SELECT 
        fp.id,
        fp.hospital_name,
        fp.procedure_name_raw,
        fp.procedure_name_matched,
        fp.equipment_name,
        fp.sigungu,
        fp.dong,
        fp.total_price,
        fp.quantity,
        u.unit_name_ko AS unit,
        fp.price_per_unit,
        fp.normalized_price_per_unit,
        fp.is_event,
        fp.event_name,
        fp.price_type,
        fp.ocr_confidence,
        fp.collected_at
      FROM fact_prices fp
      JOIN dim_units u ON fp.unit_id = u.id
      WHERE fp.is_active = 1
    `;

    const params: (string | number | boolean)[] = [];

    // 필터 조건 추가
    if (query.sigungu) {
      sql += ` AND fp.sigungu = ?`;
      params.push(query.sigungu);
    }
    if (query.procedureId) {
      sql += ` AND fp.procedure_id = ?`;
      params.push(query.procedureId);
    }
    if (query.unitId) {
      sql += ` AND fp.unit_id = ?`;
      params.push(query.unitId);
    }
    if (query.minPrice !== undefined) {
      sql += ` AND fp.price_per_unit >= ?`;
      params.push(query.minPrice);
    }
    if (query.maxPrice !== undefined) {
      sql += ` AND fp.price_per_unit <= ?`;
      params.push(query.maxPrice);
    }
    if (query.isEvent !== undefined) {
      sql += ` AND fp.is_event = ?`;
      params.push(query.isEvent ? 1 : 0);
    }

    // 정렬
    const sortColumn = query.sortBy === 'price_per_unit' ? 'fp.price_per_unit'
                     : query.sortBy === 'total_price' ? 'fp.total_price'
                     : 'fp.collected_at';
    sql += ` ORDER BY ${sortColumn} ${query.sortOrder.toUpperCase()}`;

    // 페이지네이션
    sql += ` LIMIT ? OFFSET ?`;
    params.push(query.limit, query.offset);

    const result = await db.prepare(sql).bind(...params).all();

    // 전체 개수 조회
    let countSql = `SELECT COUNT(*) as total FROM fact_prices fp WHERE fp.is_active = 1`;
    const countParams: (string | number | boolean)[] = [];
    
    if (query.sigungu) {
      countSql += ` AND fp.sigungu = ?`;
      countParams.push(query.sigungu);
    }
    if (query.procedureId) {
      countSql += ` AND fp.procedure_id = ?`;
      countParams.push(query.procedureId);
    }

    const countResult = await db.prepare(countSql).bind(...countParams).first<{ total: number }>();

    return c.json({
      success: true,
      data: result.results,
      pagination: {
        total: countResult?.total ?? 0,
        limit: query.limit,
        offset: query.offset,
        hasMore: (query.offset + query.limit) < (countResult?.total ?? 0),
      },
    });
  }
);

/**
 * GET /prices/:id
 * 가격 상세 조회
 */
prices.get('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');

  const price = await db.prepare(`
    SELECT 
      fp.*,
      u.unit_name_ko AS unit_name,
      u.unit_code,
      nu.unit_name_ko AS normalized_unit_name
    FROM fact_prices fp
    JOIN dim_units u ON fp.unit_id = u.id
    LEFT JOIN dim_units nu ON fp.normalized_unit_id = nu.id
    WHERE fp.id = ?
  `).bind(id).first();

  if (!price) {
    return c.json({
      success: false,
      error: 'NOT_FOUND',
      message: '가격 정보를 찾을 수 없습니다.',
    }, 404);
  }

  return c.json({
    success: true,
    data: price,
  });
});

/**
 * GET /prices/compare
 * 가격 비교 (동일 시술, 지역별)
 */
prices.get('/compare', async (c) => {
  const db = c.env.DB;
  const procedureId = c.req.query('procedureId');
  const sigungu = c.req.query('sigungu');

  if (!procedureId) {
    return c.json({
      success: false,
      error: 'MISSING_PARAM',
      message: 'procedureId가 필요합니다.',
    }, 400);
  }

  // 해당 시술의 지역별 평균 가격
  const regionStats = await db.prepare(`
    SELECT 
      sigungu,
      COUNT(*) as sample_count,
      ROUND(AVG(price_per_unit)) as avg_price_per_unit,
      ROUND(MIN(price_per_unit)) as min_price_per_unit,
      ROUND(MAX(price_per_unit)) as max_price_per_unit,
      ROUND(AVG(total_price)) as avg_total_price
    FROM fact_prices
    WHERE procedure_id = ?
      AND is_active = 1
      AND is_event = 0
    GROUP BY sigungu
    ORDER BY avg_price_per_unit ASC
  `).bind(procedureId).all();

  // 특정 지역의 병원별 가격
  let hospitalPrices = null;
  if (sigungu) {
    hospitalPrices = await db.prepare(`
      SELECT 
        hospital_name,
        total_price,
        quantity,
        price_per_unit,
        is_event,
        event_name,
        collected_at
      FROM fact_prices
      WHERE procedure_id = ?
        AND sigungu = ?
        AND is_active = 1
      ORDER BY price_per_unit ASC
      LIMIT 20
    `).bind(procedureId, sigungu).all();
  }

  return c.json({
    success: true,
    data: {
      procedureId,
      regionStats: regionStats.results,
      hospitalPrices: hospitalPrices?.results ?? null,
    },
  });
});

/**
 * GET /prices/stats
 * 가격 통계 요약
 */
prices.get('/stats/summary', async (c) => {
  const db = c.env.DB;

  const stats = await db.prepare(`
    SELECT 
      COUNT(*) as total_prices,
      COUNT(DISTINCT hospital_id) as unique_hospitals,
      COUNT(DISTINCT procedure_id) as unique_procedures,
      COUNT(DISTINCT sigungu) as unique_regions,
      ROUND(AVG(price_per_unit)) as avg_price_per_unit,
      ROUND(AVG(ocr_confidence), 2) as avg_confidence,
      SUM(CASE WHEN is_event = 1 THEN 1 ELSE 0 END) as event_prices,
      SUM(CASE WHEN is_verified = 1 THEN 1 ELSE 0 END) as verified_prices
    FROM fact_prices
    WHERE is_active = 1
  `).first();

  // 최근 수집 현황
  const recentActivity = await db.prepare(`
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
  `).all();

  return c.json({
    success: true,
    data: {
      summary: stats,
      recentActivity: recentActivity.results,
      unitDistribution: unitDistribution.results,
    },
  });
});

export default prices;
