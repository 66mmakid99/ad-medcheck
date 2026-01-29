/**
 * 패턴 API 라우트
 * GET /v1/patterns
 */

import { Hono } from 'hono';
import type { D1Database } from '../../db/d1';

// ============================================
// 타입 정의
// ============================================

export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  PATTERN_VERSION: string;
}

/**
 * 패턴 요약 정보
 */
export interface PatternSummary {
  id: string;
  category: string;
  subcategory: string;
  severity: string;
  description: string;
  legalBasis: string;
}

/**
 * 패턴 상세 정보
 */
export interface PatternDetail extends PatternSummary {
  pattern: string;
  patternType: string;
  keywords: string[];
  example: string;
  suggestion: string;
  exceptions: string[];
}

/**
 * 카테고리 정보
 */
export interface CategoryInfo {
  id: string;
  name: string;
  description: string;
  patternCount: number;
}

// ============================================
// 패턴 데이터 로드
// ============================================

import patternsData from '../../../patterns/patterns.json';

interface PatternsJson {
  version: string;
  source: string;
  lastUpdated: string;
  totalPatterns: number;
  categories: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  patterns: PatternDetail[];
}

const patternsJson = patternsData as PatternsJson;

// ============================================
// 라우트 정의
// ============================================

const patternsRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /v1/patterns - 패턴 목록 조회
 */
patternsRoutes.get('/', async (c) => {
  const category = c.req.query('category');
  const severity = c.req.query('severity');
  const search = c.req.query('search');
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

  let patterns = patternsJson.patterns;

  // 카테고리 필터
  if (category) {
    patterns = patterns.filter((p) => p.category === category);
  }

  // 심각도 필터
  if (severity) {
    patterns = patterns.filter((p) => p.severity === severity);
  }

  // 검색
  if (search) {
    const searchLower = search.toLowerCase();
    patterns = patterns.filter(
      (p) =>
        p.description.toLowerCase().includes(searchLower) ||
        p.category.toLowerCase().includes(searchLower) ||
        p.subcategory.toLowerCase().includes(searchLower) ||
        (p.keywords && p.keywords.some((k) => k.toLowerCase().includes(searchLower)))
    );
  }

  // 페이지네이션
  const total = patterns.length;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  const paginatedPatterns = patterns.slice(offset, offset + limit);

  // 응답 (패턴 상세는 숨김)
  const summaries: PatternSummary[] = paginatedPatterns.map((p) => ({
    id: p.id,
    category: p.category,
    subcategory: p.subcategory,
    severity: p.severity,
    description: p.description,
    legalBasis: p.legalBasis,
  }));

  return c.json({
    success: true,
    data: {
      patterns: summaries,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      meta: {
        version: patternsJson.version,
        lastUpdated: patternsJson.lastUpdated,
        totalPatterns: patternsJson.totalPatterns,
      },
    },
  });
});

/**
 * GET /v1/patterns/categories - 카테고리 목록
 */
patternsRoutes.get('/categories', async (c) => {
  // 카테고리별 패턴 수 계산
  const categoryCounts: Record<string, number> = {};
  for (const pattern of patternsJson.patterns) {
    categoryCounts[pattern.category] = (categoryCounts[pattern.category] || 0) + 1;
  }

  const categories: CategoryInfo[] = patternsJson.categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    description: cat.description,
    patternCount: categoryCounts[cat.name] || 0,
  }));

  return c.json({
    success: true,
    data: {
      categories,
      total: categories.length,
    },
  });
});

/**
 * GET /v1/patterns/:id - 패턴 상세 조회
 */
patternsRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');

  const pattern = patternsJson.patterns.find((p) => p.id === id);

  if (!pattern) {
    return c.json(
      {
        success: false,
        error: {
          code: 'PATTERN_NOT_FOUND',
          message: `패턴을 찾을 수 없습니다: ${id}`,
        },
      },
      404
    );
  }

  return c.json({
    success: true,
    data: pattern,
  });
});

/**
 * GET /v1/patterns/stats - 패턴 통계
 */
patternsRoutes.get('/stats/summary', async (c) => {
  const patterns = patternsJson.patterns;

  // 심각도별 통계
  const bySeverity = {
    critical: patterns.filter((p) => p.severity === 'critical').length,
    major: patterns.filter((p) => p.severity === 'major').length,
    minor: patterns.filter((p) => p.severity === 'minor').length,
  };

  // 카테고리별 통계
  const byCategory: Record<string, number> = {};
  for (const pattern of patterns) {
    byCategory[pattern.category] = (byCategory[pattern.category] || 0) + 1;
  }

  // 법적 근거별 통계
  const byLegalBasis: Record<string, number> = {};
  for (const pattern of patterns) {
    const basis = pattern.legalBasis.split(' ')[0]; // "의료법" 등
    byLegalBasis[basis] = (byLegalBasis[basis] || 0) + 1;
  }

  return c.json({
    success: true,
    data: {
      total: patterns.length,
      bySeverity,
      byCategory,
      byLegalBasis,
      version: patternsJson.version,
      lastUpdated: patternsJson.lastUpdated,
    },
  });
});

export { patternsRoutes };
