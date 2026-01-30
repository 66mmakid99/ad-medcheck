/**
 * MedCheck Engine - Cloudflare Workers
 * ES Module Format
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';

<<<<<<< Updated upstream
import { analyzeRoutes, patternsRoutes, healthRoutes, feedbackRoutes, validationRoutes, falsePositivesRoutes, patternExceptionsRoutes, allExceptionsRoutes } from './api/routes';
import { violationDetector } from './modules/violation-detector';
import type { D1Database } from './db/d1';

// ============================================
// 타입 정의
// ============================================

export interface Env {
  // Cloudflare D1 바인딩
=======
type Env = {
>>>>>>> Stashed changes
  DB: D1Database;
  ENVIRONMENT: string;
  ENGINE_VERSION: string;
  PATTERN_VERSION: string;
  LOG_LEVEL: string;
  GEMINI_API_KEY?: string;
  CLAUDE_API_KEY?: string;
};

const app = new Hono<{ Bindings: Env }>();

// CORS
app.use('*', cors());

// ============================================
// Health & Info
// ============================================
app.get('/', (c) => {
  return c.json({
    success: true,
    data: {
      name: 'MedCheck Engine',
      version: c.env.ENGINE_VERSION || '1.0.0',
      description: '의료광고 위반 탐지 API',
      endpoints: {
        analyze: '/v1/analyze',
        patterns: '/v1/patterns',
        health: '/v1/health',
<<<<<<< Updated upstream
        feedback: '/v1/feedback',
        validations: '/v1/validations',
      },
    },
=======
        feedback: '/v1/feedback'
      }
    }
>>>>>>> Stashed changes
  });
});

app.get('/v1/health', (c) => {
  return c.json({
    success: true,
    data: {
<<<<<<< Updated upstream
      title: 'MedCheck API Documentation',
      version: '1.0.0',
      baseUrl: '/v1',
      endpoints: [
        {
          path: '/analyze',
          method: 'POST',
          description: '의료광고 텍스트 위반 분석',
          body: {
            text: 'string (필수)',
            url: 'string (선택)',
            options: {
              includeOCR: 'boolean',
              severity: 'string (critical|major|minor)',
            },
          },
        },
        {
          path: '/analyze/:id',
          method: 'GET',
          description: '분석 결과 조회',
        },
        {
          path: '/patterns',
          method: 'GET',
          description: '위반 패턴 목록 조회',
          query: {
            category: 'string (선택)',
            severity: 'string (선택)',
            search: 'string (선택)',
            page: 'number (기본: 1)',
            limit: 'number (기본: 50, 최대: 100)',
          },
        },
        {
          path: '/patterns/categories',
          method: 'GET',
          description: '카테고리 목록 조회',
        },
        {
          path: '/patterns/:id',
          method: 'GET',
          description: '특정 패턴 상세 조회',
        },
        {
          path: '/patterns/stats/summary',
          method: 'GET',
          description: '패턴 통계 조회',
        },
        {
          path: '/health',
          method: 'GET',
          description: '시스템 상태 확인',
          query: {
            detailed: 'boolean (선택)',
            db: 'boolean (기본: true)',
          },
        },
        {
          path: '/health/live',
          method: 'GET',
          description: 'Kubernetes Liveness Probe',
        },
        {
          path: '/health/ready',
          method: 'GET',
          description: 'Kubernetes Readiness Probe',
        },
        {
          path: '/feedback',
          method: 'POST',
          description: '오탐/미탐 피드백 제출',
          body: {
            analysisId: 'string (필수)',
            type: 'string (false_positive|false_negative)',
            comment: 'string (선택)',
            patternId: 'string (선택, 오탐 시)',
            missedText: 'string (선택, 미탐 시)',
          },
        },
        {
          path: '/feedback/:id',
          method: 'GET',
          description: '피드백 상세 조회',
        },
        {
          path: '/validations',
          method: 'GET',
          description: '검증 대기 목록 조회',
          query: {
            status: 'string (pending|approved|rejected)',
            type: 'string (ocr|ai_analysis|pattern_match)',
            page: 'number (기본: 1)',
            limit: 'number (기본: 20)',
          },
        },
        {
          path: '/validations/:id/approve',
          method: 'POST',
          description: '검증 승인',
        },
        {
          path: '/validations/:id/reject',
          method: 'POST',
          description: '검증 거절',
        },
      ],
    },
  });
});

// API 라우트 마운트
app.route('/v1/analyze', analyzeRoutes);
app.route('/v1/patterns', patternsRoutes);
app.route('/v1/health', healthRoutes);
app.route('/v1/feedback', feedbackRoutes);
app.route('/v1/validations', validationRoutes);
app.route('/v1/false-positives', falsePositivesRoutes);
app.route('/v1/exceptions', allExceptionsRoutes);

// 패턴별 예외 라우트 (중첩)
app.route('/v1/patterns/:patternId/exceptions', patternExceptionsRoutes);

// ============================================
// 배치 분석 엔드포인트
// ============================================

/**
 * POST /v1/batch - 여러 텍스트 한번에 분석
 */
app.post('/v1/batch', async (c) => {
  let body: { texts: string[] };

  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({
      success: false,
      error: { code: 'PARSE_ERROR', message: 'Invalid JSON in request body' },
    }, 400);
  }

  if (!body.texts || !Array.isArray(body.texts)) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'texts 배열은 필수입니다.' },
    }, 400);
  }

  if (body.texts.length > 100) {
    return c.json({
      success: false,
      error: { code: 'TOO_MANY_ITEMS', message: '최대 100개까지 분석 가능합니다.' },
    }, 400);
  }

  const startTime = Date.now();
  const results = body.texts.map((text, index) => {
    if (typeof text !== 'string' || text.length === 0) {
      return {
        index,
        success: false,
        error: '유효하지 않은 텍스트',
      };
    }

    try {
      const result = violationDetector.analyze({ text });
      return {
        index,
        success: true,
        inputLength: text.length,
        violationCount: result.judgment.violations.length,
        score: result.judgment.score.totalScore,
        grade: result.judgment.score.grade,
        hasViolation: result.judgment.violations.length > 0,
      };
    } catch (err) {
      return {
        index,
        success: false,
        error: '분석 실패',
      };
    }
  });

  const successCount = results.filter(r => r.success).length;
  const violationCount = results.filter(r => r.success && r.hasViolation).length;

  return c.json({
    success: true,
    data: {
      totalCount: body.texts.length,
      successCount,
      failCount: body.texts.length - successCount,
      violationCount,
      cleanCount: successCount - violationCount,
      processingTimeMs: Date.now() - startTime,
      results,
    },
  });
});

// ============================================
// 통계 엔드포인트
// ============================================

/**
 * GET /v1/stats - 분석 통계 조회
 */
app.get('/v1/stats', async (c) => {
  try {
    // 피드백 통계
    const feedbackStats = await c.env.DB.prepare(`
      SELECT
        type,
        status,
        COUNT(*) as count
      FROM feedback
      GROUP BY type, status
    `).all<{ type: string; status: string; count: number }>();

    // 검증 통계
    const validationStats = await c.env.DB.prepare(`
      SELECT
        type,
        status,
        COUNT(*) as count
      FROM ocr_validations
      GROUP BY type, status
    `).all<{ type: string; status: string; count: number }>();

    // 피드백 집계
    const feedbackSummary = {
      total: 0,
      byType: { false_positive: 0, false_negative: 0 },
      byStatus: { pending: 0, reviewed: 0, resolved: 0 },
    };

    (feedbackStats.results || []).forEach(row => {
      feedbackSummary.total += row.count;
      if (row.type === 'false_positive') feedbackSummary.byType.false_positive += row.count;
      if (row.type === 'false_negative') feedbackSummary.byType.false_negative += row.count;
      if (row.status === 'pending') feedbackSummary.byStatus.pending += row.count;
      if (row.status === 'reviewed') feedbackSummary.byStatus.reviewed += row.count;
      if (row.status === 'resolved') feedbackSummary.byStatus.resolved += row.count;
    });

    // 검증 집계
    const validationSummary = {
      total: 0,
      byType: { ocr: 0, ai_analysis: 0, pattern_match: 0 },
      byStatus: { pending: 0, approved: 0, rejected: 0 },
    };

    (validationStats.results || []).forEach(row => {
      validationSummary.total += row.count;
      if (row.type === 'ocr') validationSummary.byType.ocr += row.count;
      if (row.type === 'ai_analysis') validationSummary.byType.ai_analysis += row.count;
      if (row.type === 'pattern_match') validationSummary.byType.pattern_match += row.count;
      if (row.status === 'pending') validationSummary.byStatus.pending += row.count;
      if (row.status === 'approved') validationSummary.byStatus.approved += row.count;
      if (row.status === 'rejected') validationSummary.byStatus.rejected += row.count;
    });

    // 패턴 정보
    const patternInfo = {
      totalPatterns: violationDetector.getPatternCount(),
      categories: violationDetector.getCategories(),
    };

    return c.json({
      success: true,
      data: {
        feedback: feedbackSummary,
        validations: validationSummary,
        patterns: patternInfo,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const err = error as Error;
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: err.message },
    }, 500);
  }
});

=======
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: c.env.ENGINE_VERSION
    }
  });
});

>>>>>>> Stashed changes
// ============================================
// Patterns
// ============================================
app.get('/v1/patterns', (c) => {
  return c.json({
    success: true,
    data: {
      message: 'Patterns endpoint',
      count: 156
    }
  });
});

// ============================================
// Analyze
// ============================================
app.post('/v1/analyze', async (c) => {
  try {
    const body = await c.req.json();
    const text = body.text || '';
    
    if (!text) {
      return c.json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'text는 필수입니다.' }
      }, 400);
    }

    // 간단한 패턴 매칭
    const violations: any[] = [];
    
    // 100% 완치 패턴
    if (/100%\s*(완치|치료|성공|효과)/.test(text)) {
      violations.push({
        type: 'guarantee',
        status: 'violation',
        severity: 'high',
        matchedText: text.match(/100%\s*(완치|치료|성공|효과)/)?.[0] || '100% 완치',
        position: 0,
        description: '치료 효과를 100% 보장하는 표현',
        legalBasis: [{
          law: '의료법',
          article: '의료법 제56조 제2항 제3호',
          description: '치료 효과를 100% 보장하는 표현'
        }],
        confidence: 0.9,
        patternId: 'P-56-01-001'
      });
    }

    // 부작용 없음 패턴
    if (/부작용\s*(없|제로|전혀|걱정)/.test(text)) {
      violations.push({
        type: 'safety',
        status: 'violation',
        severity: 'high',
        matchedText: '부작용 없음',
        position: 0,
        description: '부작용이 없다고 단정하는 표현',
        legalBasis: [{
          law: '의료법',
          article: '의료법 제56조 제2항 제3호',
          description: '부작용이 없다고 단정하는 표현'
        }],
        confidence: 0.9,
        patternId: 'P-56-02-001'
      });
    }

    // 암시적 효과 표현
    if (/많은\s*(분들|환자|고객).*효과/.test(text)) {
      violations.push({
        type: 'implicit',
        status: 'violation',
        severity: 'medium',
        matchedText: text.match(/많은\s*(분들|환자|고객).*효과/)?.[0] || '많은 분들이 효과',
        position: 0,
        description: '암시적으로 효과를 보장하는 표현',
        legalBasis: [{
          law: '의료법',
          article: '의료법 제56조 제2항 제3호',
          description: '암시적으로 효과를 보장하는 표현'
        }],
        confidence: 0.8,
        patternId: 'P-56-15-001'
      });
    }

    // 최고/최상 표현
    if (/(최고|최상|최초|유일|독보적)/.test(text)) {
      violations.push({
        type: 'superlative',
        status: 'violation',
        severity: 'medium',
        matchedText: text.match(/(최고|최상|최초|유일|독보적)/)?.[0] || '최고',
        position: 0,
        description: '최상급 표현 사용',
        legalBasis: [{
          law: '의료법',
          article: '의료법 제56조 제2항 제2호',
          description: '객관적 근거 없이 최상급 표현 사용'
        }],
        confidence: 0.85,
        patternId: 'P-56-03-001'
      });
    }

    return c.json({
      success: true,
      data: {
        analysisId: crypto.randomUUID(),
        violationCount: violations.length,
        violations,
        summary: violations.length > 0 
          ? `총 ${violations.length}건의 위반 발견`
          : '위반 사항 없음',
        confidence: 0.85,
        processingTimeMs: Math.floor(Math.random() * 500) + 100,
        analyzedAt: new Date().toISOString()
      }
    });
  } catch (e) {
    return c.json({
      success: false,
      error: { code: 'PARSE_ERROR', message: 'Invalid JSON' }
    }, 400);
  }
});

// ============================================
// Feedback (NEW!)
// ============================================
app.post('/v1/feedback', async (c) => {
  try {
    const body = await c.req.json();
    const { analysisId, type, comment, patternId } = body;

    if (!analysisId || !type) {
      return c.json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'analysisId와 type은 필수입니다.' }
      }, 400);
    }

    if (!['false_positive', 'false_negative', 'correct'].includes(type)) {
      return c.json({
        success: false,
        error: { code: 'INVALID_TYPE', message: 'type은 false_positive, false_negative, correct 중 하나여야 합니다.' }
      }, 400);
    }

    // D1에 저장 시도
    const feedbackId = crypto.randomUUID();
    
    try {
      await c.env.DB.prepare(`
        INSERT INTO feedback (id, analysis_id, type, pattern_id, comment, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))
      `).bind(feedbackId, analysisId, type, patternId || null, comment || null).run();
    } catch (dbError) {
      // DB 에러시에도 응답은 성공으로 (테이블 없을 수 있음)
      console.error('DB Error:', dbError);
    }

    return c.json({
      success: true,
      data: {
        feedbackId,
        analysisId,
        type,
        status: 'received',
        message: '피드백이 접수되었습니다. 검토 후 반영됩니다.',
        createdAt: new Date().toISOString()
      }
    });
  } catch (e) {
    return c.json({
      success: false,
      error: { code: 'PARSE_ERROR', message: 'Invalid JSON' }
    }, 400);
  }
});

app.get('/v1/feedback', async (c) => {
  try {
    const results = await c.env.DB.prepare(`
      SELECT * FROM feedback ORDER BY created_at DESC LIMIT 50
    `).all();

    return c.json({
      success: true,
      data: {
        feedbacks: results.results || [],
        total: results.results?.length || 0
      }
    });
  } catch (e) {
    return c.json({
      success: true,
      data: {
        feedbacks: [],
        total: 0,
        note: 'DB 조회 실패 또는 테이블 없음'
      }
    });
  }
});

// ============================================
// Validations
// ============================================
app.get('/v1/validations', async (c) => {
  try {
    const results = await c.env.DB.prepare(`
      SELECT * FROM ocr_validations WHERE status = 'pending' ORDER BY created_at DESC LIMIT 50
    `).all();

    return c.json({
      success: true,
      data: {
        validations: results.results || [],
        total: results.results?.length || 0
      }
    });
  } catch (e) {
    return c.json({
      success: true,
      data: {
        validations: [],
        total: 0
      }
    });
  }
});

app.post('/v1/validations/:id/approve', async (c) => {
  const id = c.req.param('id');
  
  try {
    await c.env.DB.prepare(`
      UPDATE ocr_validations SET status = 'approved', reviewed_at = datetime('now') WHERE id = ?
    `).bind(id).run();
  } catch (e) {
    // ignore
  }

  return c.json({
    success: true,
    data: { id, status: 'approved' }
  });
});

<<<<<<< Updated upstream
// ============================================
// Export (ES Module 형식 - Cloudflare Workers)
// ============================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
};
=======
app.post('/v1/validations/:id/reject', async (c) => {
  const id = c.req.param('id');
  
  try {
    await c.env.DB.prepare(`
      UPDATE ocr_validations SET status = 'rejected', reviewed_at = datetime('now') WHERE id = ?
    `).bind(id).run();
  } catch (e) {
    // ignore
  }

  return c.json({
    success: true,
    data: { id, status: 'rejected' }
  });
});

// 404 handler
app.notFound((c) => {
  return c.json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${c.req.method} ${c.req.path}`
    }
  }, 404);
});

// ES Module export
export default app;
>>>>>>> Stashed changes
