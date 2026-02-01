// ================================================================
// MADMEDCHECK 가격 DB - Phase 2
// 시술명 별칭(Aliases) 관리 API
// ================================================================
// 위치: src/routes/aliases.ts
// ================================================================

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';

const aliases = new Hono<{ Bindings: Env }>();

// ================================================================
// Zod 스키마
// ================================================================

const CreateAliasSchema = z.object({
  procedureId: z.string().min(1),
  alias: z.string().min(1),
  aliasType: z.enum(['common', 'brand', 'abbreviation', 'typo', 'english', 'korean']).default('common'),
  isExactMatch: z.boolean().default(true),
  matchPriority: z.number().default(0),
  source: z.string().optional(),
  confidence: z.number().min(0).max(1).default(1.0),
});

const MatchAliasSchema = z.object({
  text: z.string().min(1),
});

// ================================================================
// API 라우트
// ================================================================

/**
 * GET /aliases
 * 모든 별칭 목록
 */
aliases.get('/', async (c) => {
  const db = c.env.DB;
  const procedureId = c.req.query('procedureId');

  let sql = `
    SELECT 
      pa.id,
      pa.procedure_id,
      pa.alias,
      pa.alias_type,
      pa.is_exact_match,
      pa.match_priority,
      pa.usage_count,
      pa.confidence,
      pa.created_at
    FROM bridge_procedure_aliases pa
    WHERE pa.is_active = 1
  `;

  const params: string[] = [];

  if (procedureId) {
    sql += ` AND pa.procedure_id = ?`;
    params.push(procedureId);
  }

  sql += ` ORDER BY pa.match_priority DESC, pa.usage_count DESC`;

  const result = await db.prepare(sql).bind(...params).all();

  return c.json({
    success: true,
    data: result.results,
    count: result.results?.length ?? 0,
  });
});

/**
 * POST /aliases/match
 * 텍스트에서 시술명 매칭 (OCR용 핵심 기능!)
 */
aliases.post(
  '/match',
  zValidator('json', MatchAliasSchema),
  async (c) => {
    const db = c.env.DB;
    const { text } = c.req.valid('json');

    // 모든 별칭 가져오기 (우선순위 순)
    const aliases = await db.prepare(`
      SELECT 
        pa.alias,
        pa.procedure_id,
        pa.alias_type,
        pa.match_priority,
        pa.is_exact_match
      FROM bridge_procedure_aliases pa
      WHERE pa.is_active = 1
      ORDER BY pa.match_priority DESC, length(pa.alias) DESC
    `).all<{
      alias: string;
      procedure_id: string;
      alias_type: string;
      match_priority: number;
      is_exact_match: number;
    }>();

    const matches: {
      alias: string;
      procedureId: string;
      aliasType: string;
      matchPriority: number;
      matchType: 'exact' | 'partial';
      position: number;
    }[] = [];

    const textLower = text.toLowerCase();

    for (const alias of aliases.results || []) {
      const aliasLower = alias.alias.toLowerCase();
      
      if (alias.is_exact_match) {
        // 완전 일치 (단어 경계 포함)
        const regex = new RegExp(`(^|\\s|[^가-힣a-zA-Z])${escapeRegex(aliasLower)}($|\\s|[^가-힣a-zA-Z])`, 'i');
        if (regex.test(text)) {
          const position = textLower.indexOf(aliasLower);
          matches.push({
            alias: alias.alias,
            procedureId: alias.procedure_id,
            aliasType: alias.alias_type,
            matchPriority: alias.match_priority,
            matchType: 'exact',
            position: position >= 0 ? position : 0,
          });
        }
      } else {
        // 부분 일치
        const position = textLower.indexOf(aliasLower);
        if (position >= 0) {
          matches.push({
            alias: alias.alias,
            procedureId: alias.procedure_id,
            aliasType: alias.alias_type,
            matchPriority: alias.match_priority,
            matchType: 'partial',
            position,
          });
        }
      }
    }

    // 중복 제거 (같은 procedure_id는 가장 높은 우선순위만)
    const uniqueMatches = matches.reduce((acc, match) => {
      const existing = acc.find(m => m.procedureId === match.procedureId);
      if (!existing || match.matchPriority > existing.matchPriority) {
        return [...acc.filter(m => m.procedureId !== match.procedureId), match];
      }
      return acc;
    }, [] as typeof matches);

    // 우선순위 정렬
    uniqueMatches.sort((a, b) => b.matchPriority - a.matchPriority);

    // 사용 횟수 증가 (매칭된 별칭들)
    for (const match of uniqueMatches) {
      await db.prepare(`
        UPDATE bridge_procedure_aliases 
        SET usage_count = usage_count + 1, updated_at = datetime('now')
        WHERE alias = ? AND procedure_id = ?
      `).bind(match.alias, match.procedureId).run();
    }

    return c.json({
      success: true,
      data: {
        input: text,
        matches: uniqueMatches,
        bestMatch: uniqueMatches[0] ?? null,
        matchCount: uniqueMatches.length,
      },
    });
  }
);

/**
 * POST /aliases
 * 새 별칭 추가
 */
aliases.post(
  '/',
  zValidator('json', CreateAliasSchema),
  async (c) => {
    const db = c.env.DB;
    const body = c.req.valid('json');

    // 중복 체크
    const existing = await db.prepare(`
      SELECT id FROM bridge_procedure_aliases
      WHERE procedure_id = ? AND lower(alias) = lower(?)
    `).bind(body.procedureId, body.alias).first();

    if (existing) {
      return c.json({
        success: false,
        error: 'DUPLICATE',
        message: '이미 등록된 별칭입니다.',
      }, 409);
    }

    const id = `ALIAS-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    try {
      await db.prepare(`
        INSERT INTO bridge_procedure_aliases (
          id, procedure_id, alias, alias_type, 
          is_exact_match, match_priority, source, confidence
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        body.procedureId,
        body.alias,
        body.aliasType,
        body.isExactMatch ? 1 : 0,
        body.matchPriority,
        body.source ?? 'manual',
        body.confidence
      ).run();

      return c.json({
        success: true,
        data: {
          id,
          ...body,
        },
        message: '별칭이 추가되었습니다.',
      }, 201);

    } catch (error) {
      console.error('Create alias error:', error);
      return c.json({
        success: false,
        error: 'CREATE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      }, 500);
    }
  }
);

/**
 * DELETE /aliases/:id
 * 별칭 삭제 (soft delete)
 */
aliases.delete('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');

  try {
    await db.prepare(`
      UPDATE bridge_procedure_aliases 
      SET is_active = 0, updated_at = datetime('now')
      WHERE id = ?
    `).bind(id).run();

    return c.json({
      success: true,
      message: '별칭이 삭제되었습니다.',
    });

  } catch (error) {
    return c.json({
      success: false,
      error: 'DELETE_FAILED',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /aliases/equipment
 * 장비-시술 매핑 목록
 */
aliases.get('/equipment', async (c) => {
  const db = c.env.DB;

  const result = await db.prepare(`
    SELECT 
      ep.id,
      ep.equipment_name,
      ep.equipment_brand,
      ep.procedure_id,
      ep.default_unit_id,
      u.unit_name_ko as default_unit_name,
      ep.equipment_aliases
    FROM bridge_equipment_procedures ep
    LEFT JOIN dim_units u ON ep.default_unit_id = u.id
    WHERE ep.is_active = 1
    ORDER BY ep.equipment_name
  `).all();

  return c.json({
    success: true,
    data: result.results?.map(r => ({
      ...r,
      equipmentAliases: JSON.parse((r as any).equipment_aliases || '[]'),
    })),
  });
});

/**
 * POST /aliases/learn
 * OCR에서 자동 학습 (새 별칭 제안)
 */
aliases.post('/learn', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{
    rawText: string;
    confirmedProcedureId: string;
  }>();

  if (!body.rawText || !body.confirmedProcedureId) {
    return c.json({
      success: false,
      error: 'MISSING_PARAMS',
      message: 'rawText와 confirmedProcedureId가 필요합니다.',
    }, 400);
  }

  // 기존 별칭에 없는 새로운 패턴인지 확인
  const existingAliases = await db.prepare(`
    SELECT alias FROM bridge_procedure_aliases
    WHERE procedure_id = ?
  `).bind(body.confirmedProcedureId).all<{ alias: string }>();

  const existingSet = new Set(
    (existingAliases.results || []).map(a => a.alias.toLowerCase())
  );

  // rawText에서 가능한 별칭 추출 (간단한 휴리스틱)
  const words = body.rawText
    .split(/[\s,./]+/)
    .filter(w => w.length >= 2 && w.length <= 20)
    .filter(w => !existingSet.has(w.toLowerCase()));

  const suggestions = words.slice(0, 5);  // 최대 5개 제안

  return c.json({
    success: true,
    data: {
      rawText: body.rawText,
      procedureId: body.confirmedProcedureId,
      suggestions,
      message: suggestions.length > 0 
        ? '새로운 별칭 후보를 찾았습니다.' 
        : '새로운 별칭 후보가 없습니다.',
    },
  });
});

/**
 * 정규표현식 특수문자 이스케이프
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default aliases;
