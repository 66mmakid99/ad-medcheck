// ================================================================
// MADMEDCHECK 가격 DB - Phase 1
// 단위(Unit) 관리 API
// ================================================================
// 위치: src/routes/units.ts
// ================================================================

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';

const units = new Hono<{ Bindings: Env }>();

// ================================================================
// Zod 스키마
// ================================================================

const CreateUnitSchema = z.object({
  unitType: z.string().min(1),
  unitCode: z.string().min(1).max(20).toUpperCase(),
  unitNameKo: z.string().min(1),
  unitNameEn: z.string().optional(),
  unitSymbol: z.string().optional(),
  regexPatterns: z.array(z.string()).min(1),
  baseUnitId: z.string().optional(),
  conversionRate: z.number().default(1.0),
  minTypicalValue: z.number().optional(),
  maxTypicalValue: z.number().optional(),
  applicableCategories: z.array(z.string()).optional(),
  description: z.string().optional(),
  sortOrder: z.number().default(0),
});

const UpdateUnitSchema = CreateUnitSchema.partial();

// ================================================================
// API 라우트
// ================================================================

/**
 * GET /units
 * 모든 단위 목록 조회
 */
units.get('/', async (c) => {
  const db = c.env.DB;
  const activeOnly = c.req.query('activeOnly') !== 'false';

  let sql = `
    SELECT 
      u.*,
      bu.unit_name_ko as base_unit_name
    FROM dim_units u
    LEFT JOIN dim_units bu ON u.base_unit_id = bu.id
  `;
  
  if (activeOnly) {
    sql += ` WHERE u.is_active = 1`;
  }
  
  sql += ` ORDER BY u.sort_order, u.unit_name_ko`;

  const result = await db.prepare(sql).all();

  return c.json({
    success: true,
    data: result.results?.map(unit => ({
      ...unit,
      regexPatterns: JSON.parse((unit as any).regex_patterns || '[]'),
      applicableCategories: JSON.parse((unit as any).applicable_categories || '[]'),
    })),
  });
});

/**
 * GET /units/:id
 * 단위 상세 조회
 */
units.get('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');

  const unit = await db.prepare(`
    SELECT 
      u.*,
      bu.unit_name_ko as base_unit_name,
      (SELECT COUNT(*) FROM fact_prices WHERE unit_id = u.id) as usage_count
    FROM dim_units u
    LEFT JOIN dim_units bu ON u.base_unit_id = bu.id
    WHERE u.id = ?
  `).bind(id).first();

  if (!unit) {
    return c.json({
      success: false,
      error: 'NOT_FOUND',
      message: '단위를 찾을 수 없습니다.',
    }, 404);
  }

  return c.json({
    success: true,
    data: {
      ...unit,
      regexPatterns: JSON.parse((unit as any).regex_patterns || '[]'),
      applicableCategories: JSON.parse((unit as any).applicable_categories || '[]'),
    },
  });
});

/**
 * POST /units
 * 새 단위 추가
 */
units.post(
  '/',
  zValidator('json', CreateUnitSchema),
  async (c) => {
    const db = c.env.DB;
    const body = c.req.valid('json');

    const id = `UNIT-${body.unitCode}`;

    // 중복 체크
    const existing = await db.prepare(`
      SELECT id FROM dim_units WHERE id = ? OR unit_code = ?
    `).bind(id, body.unitCode).first();

    if (existing) {
      return c.json({
        success: false,
        error: 'DUPLICATE',
        message: `이미 존재하는 단위 코드입니다: ${body.unitCode}`,
      }, 409);
    }

    try {
      await db.prepare(`
        INSERT INTO dim_units (
          id, unit_type, unit_code,
          unit_name_ko, unit_name_en, unit_symbol,
          regex_patterns, base_unit_id, conversion_rate,
          min_typical_value, max_typical_value,
          applicable_categories, description, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        body.unitType,
        body.unitCode,
        body.unitNameKo,
        body.unitNameEn ?? null,
        body.unitSymbol ?? body.unitNameKo,
        JSON.stringify(body.regexPatterns),
        body.baseUnitId ?? null,
        body.conversionRate,
        body.minTypicalValue ?? null,
        body.maxTypicalValue ?? null,
        body.applicableCategories ? JSON.stringify(body.applicableCategories) : null,
        body.description ?? null,
        body.sortOrder
      ).run();

      return c.json({
        success: true,
        data: {
          id,
          ...body,
        },
        message: '단위가 추가되었습니다.',
      }, 201);

    } catch (error) {
      console.error('Create unit error:', error);
      return c.json({
        success: false,
        error: 'CREATE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      }, 500);
    }
  }
);

/**
 * PUT /units/:id
 * 단위 수정
 */
units.put(
  '/:id',
  zValidator('json', UpdateUnitSchema),
  async (c) => {
    const db = c.env.DB;
    const id = c.req.param('id');
    const body = c.req.valid('json');

    // 존재 여부 확인
    const existing = await db.prepare(`
      SELECT id FROM dim_units WHERE id = ?
    `).bind(id).first();

    if (!existing) {
      return c.json({
        success: false,
        error: 'NOT_FOUND',
        message: '단위를 찾을 수 없습니다.',
      }, 404);
    }

    // 동적 UPDATE 쿼리 생성
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (body.unitType !== undefined) {
      updates.push('unit_type = ?');
      values.push(body.unitType);
    }
    if (body.unitNameKo !== undefined) {
      updates.push('unit_name_ko = ?');
      values.push(body.unitNameKo);
    }
    if (body.unitNameEn !== undefined) {
      updates.push('unit_name_en = ?');
      values.push(body.unitNameEn);
    }
    if (body.unitSymbol !== undefined) {
      updates.push('unit_symbol = ?');
      values.push(body.unitSymbol);
    }
    if (body.regexPatterns !== undefined) {
      updates.push('regex_patterns = ?');
      values.push(JSON.stringify(body.regexPatterns));
    }
    if (body.baseUnitId !== undefined) {
      updates.push('base_unit_id = ?');
      values.push(body.baseUnitId);
    }
    if (body.conversionRate !== undefined) {
      updates.push('conversion_rate = ?');
      values.push(body.conversionRate);
    }
    if (body.minTypicalValue !== undefined) {
      updates.push('min_typical_value = ?');
      values.push(body.minTypicalValue);
    }
    if (body.maxTypicalValue !== undefined) {
      updates.push('max_typical_value = ?');
      values.push(body.maxTypicalValue);
    }
    if (body.applicableCategories !== undefined) {
      updates.push('applicable_categories = ?');
      values.push(JSON.stringify(body.applicableCategories));
    }
    if (body.description !== undefined) {
      updates.push('description = ?');
      values.push(body.description);
    }
    if (body.sortOrder !== undefined) {
      updates.push('sort_order = ?');
      values.push(body.sortOrder);
    }

    if (updates.length === 0) {
      return c.json({
        success: false,
        error: 'NO_UPDATES',
        message: '수정할 내용이 없습니다.',
      }, 400);
    }

    updates.push('updated_at = datetime("now")');
    values.push(id);

    try {
      await db.prepare(`
        UPDATE dim_units SET ${updates.join(', ')} WHERE id = ?
      `).bind(...values).run();

      return c.json({
        success: true,
        message: '단위가 수정되었습니다.',
      });

    } catch (error) {
      console.error('Update unit error:', error);
      return c.json({
        success: false,
        error: 'UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      }, 500);
    }
  }
);

/**
 * DELETE /units/:id
 * 단위 비활성화 (soft delete)
 */
units.delete('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');

  // 사용 중인지 확인
  const usageCount = await db.prepare(`
    SELECT COUNT(*) as count FROM fact_prices WHERE unit_id = ?
  `).bind(id).first<{ count: number }>();

  if (usageCount && usageCount.count > 0) {
    return c.json({
      success: false,
      error: 'IN_USE',
      message: `이 단위는 ${usageCount.count}개의 가격 데이터에서 사용 중입니다. 비활성화만 가능합니다.`,
    }, 400);
  }

  try {
    await db.prepare(`
      UPDATE dim_units 
      SET is_active = 0, updated_at = datetime('now')
      WHERE id = ?
    `).bind(id).run();

    return c.json({
      success: true,
      message: '단위가 비활성화되었습니다.',
    });

  } catch (error) {
    console.error('Delete unit error:', error);
    return c.json({
      success: false,
      error: 'DELETE_FAILED',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * POST /units/parse-test
 * OCR 텍스트에서 단위 파싱 테스트
 */
units.post('/parse-test', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{ text: string }>();

  if (!body.text) {
    return c.json({
      success: false,
      error: 'MISSING_TEXT',
      message: 'text 필드가 필요합니다.',
    }, 400);
  }

  // 모든 활성 단위 가져오기
  const units = await db.prepare(`
    SELECT id, unit_code, unit_name_ko, regex_patterns
    FROM dim_units
    WHERE is_active = 1
    ORDER BY sort_order
  `).all<{ id: string; unit_code: string; unit_name_ko: string; regex_patterns: string }>();

  const matches: { unitId: string; unitCode: string; unitName: string; pattern: string; match: string; quantity: number }[] = [];

  for (const unit of units.results || []) {
    const patterns: string[] = JSON.parse(unit.regex_patterns || '[]');
    
    for (const pattern of patterns) {
      const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(\\d+(?:\\.\\d+)?|\\d+(?:,\\d+)*)\\s*${escapedPattern}`, 'gi');
      
      let match;
      while ((match = regex.exec(body.text)) !== null) {
        const numStr = match[1].replace(/,/g, '');
        let quantity = parseFloat(numStr);
        
        // 만줄 처리
        if (pattern.includes('만줄')) {
          quantity *= 10000;
        }
        
        matches.push({
          unitId: unit.id,
          unitCode: unit.unit_code,
          unitName: unit.unit_name_ko,
          pattern,
          match: match[0],
          quantity,
        });
      }
    }
  }

  return c.json({
    success: true,
    data: {
      input: body.text,
      matches,
      matchCount: matches.length,
    },
  });
});

/**
 * GET /units/patterns
 * 모든 단위의 파싱 패턴 조회 (OCR 모듈용)
 */
units.get('/patterns/all', async (c) => {
  const db = c.env.DB;

  const units = await db.prepare(`
    SELECT id, unit_code, unit_name_ko, regex_patterns, conversion_rate, base_unit_id
    FROM dim_units
    WHERE is_active = 1
    ORDER BY sort_order
  `).all();

  // 플랫하게 변환 (패턴 → 단위 매핑)
  const patternMap: Record<string, { unitId: string; unitCode: string; unitName: string }> = {};
  
  for (const unit of units.results || []) {
    const patterns: string[] = JSON.parse((unit as any).regex_patterns || '[]');
    for (const pattern of patterns) {
      patternMap[pattern.toLowerCase()] = {
        unitId: (unit as any).id,
        unitCode: (unit as any).unit_code,
        unitName: (unit as any).unit_name_ko,
      };
    }
  }

  return c.json({
    success: true,
    data: {
      units: units.results?.map(u => ({
        id: (u as any).id,
        unitCode: (u as any).unit_code,
        unitName: (u as any).unit_name_ko,
        patterns: JSON.parse((u as any).regex_patterns || '[]'),
        conversionRate: (u as any).conversion_rate,
        baseUnitId: (u as any).base_unit_id,
      })),
      patternMap,
    },
  });
});

export default units;
