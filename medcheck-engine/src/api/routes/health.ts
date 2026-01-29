/**
 * Health Check API 라우트
 * GET /v1/health - 시스템 상태 확인
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
 * 컴포넌트 상태
 */
export type ComponentStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * 컴포넌트 헬스 체크 결과
 */
export interface ComponentHealth {
  name: string;
  status: ComponentStatus;
  latency?: number;
  message?: string;
  lastCheck: string;
}

/**
 * 전체 헬스 체크 결과
 */
export interface HealthCheckResult {
  status: ComponentStatus;
  timestamp: string;
  version: string;
  environment: string;
  uptime: number;
  components: ComponentHealth[];
  metrics?: SystemMetrics;
}

/**
 * 시스템 메트릭
 */
export interface SystemMetrics {
  analysisStats?: {
    totalToday: number;
    successRate: number;
    avgProcessingTime: number;
  };
}

// ============================================
// 상수
// ============================================

const VERSION = '1.0.0';
const startTime = Date.now();

// ============================================
// 헬스 체크 함수들
// ============================================

/**
 * D1 데이터베이스 체크
 */
async function checkD1(db: D1Database, timeout: number): Promise<ComponentHealth> {
  const checkStart = Date.now();

  try {
    const result = await Promise.race([
      db.prepare('SELECT 1 as check_value').first<{ check_value: number }>(),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      ),
    ]);

    const latency = Date.now() - checkStart;

    if (result && result.check_value === 1) {
      return {
        name: 'd1_database',
        status: latency > 1000 ? 'degraded' : 'healthy',
        latency,
        message: latency > 1000 ? 'High latency' : 'Connected',
        lastCheck: new Date().toISOString(),
      };
    }

    return {
      name: 'd1_database',
      status: 'unhealthy',
      latency,
      message: 'Query failed',
      lastCheck: new Date().toISOString(),
    };
  } catch (error) {
    return {
      name: 'd1_database',
      status: 'unhealthy',
      latency: Date.now() - checkStart,
      message: (error as Error).message,
      lastCheck: new Date().toISOString(),
    };
  }
}

/**
 * 패턴 데이터 체크
 */
async function checkPatterns(): Promise<ComponentHealth> {
  try {
    const patternsData = await import('../../../patterns/patterns.json');
    const patternCount = patternsData.patterns?.length || 0;

    return {
      name: 'patterns',
      status: patternCount > 0 ? 'healthy' : 'unhealthy',
      message: `${patternCount} patterns loaded`,
      lastCheck: new Date().toISOString(),
    };
  } catch (error) {
    return {
      name: 'patterns',
      status: 'unhealthy',
      message: (error as Error).message,
      lastCheck: new Date().toISOString(),
    };
  }
}

/**
 * 전체 상태 결정
 */
function determineOverallStatus(components: ComponentHealth[]): ComponentStatus {
  const hasUnhealthy = components.some((c) => c.status === 'unhealthy');
  const hasDegraded = components.some((c) => c.status === 'degraded');

  if (hasUnhealthy) return 'unhealthy';
  if (hasDegraded) return 'degraded';
  return 'healthy';
}

/**
 * 오늘 분석 통계 가져오기
 */
async function getAnalysisStats(db: D1Database): Promise<SystemMetrics['analysisStats']> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const stats = await db
      .prepare(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          AVG(processing_time_ms) as avg_time
        FROM analysis_logs
        WHERE DATE(created_at) = ?`
      )
      .bind(today)
      .first<{ total: number; completed: number; avg_time: number }>();

    if (!stats) {
      return { totalToday: 0, successRate: 100, avgProcessingTime: 0 };
    }

    return {
      totalToday: stats.total || 0,
      successRate: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 100,
      avgProcessingTime: Math.round(stats.avg_time || 0),
    };
  } catch {
    return { totalToday: 0, successRate: 100, avgProcessingTime: 0 };
  }
}

// ============================================
// 라우트 정의
// ============================================

const healthRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /v1/health - 전체 헬스 체크
 */
healthRoutes.get('/', async (c) => {
  const detailed = c.req.query('detailed') === 'true';
  const checkDb = c.req.query('db') !== 'false';
  const timeout = parseInt(c.req.query('timeout') || '5000');

  const components: ComponentHealth[] = [];

  // 엔진 상태
  components.push({
    name: 'engine',
    status: 'healthy',
    message: 'Engine running',
    lastCheck: new Date().toISOString(),
  });

  // 패턴 데이터 체크
  components.push(await checkPatterns());

  // D1 데이터베이스 체크
  if (checkDb && c.env.DB) {
    components.push(await checkD1(c.env.DB, timeout));
  }

  const overallStatus = determineOverallStatus(components);

  const result: HealthCheckResult = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: VERSION,
    environment: c.env.ENVIRONMENT || 'development',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    components,
  };

  // 상세 정보
  if (detailed && c.env.DB) {
    result.metrics = {
      analysisStats: await getAnalysisStats(c.env.DB),
    };
  }

  const statusCode = overallStatus === 'unhealthy' ? 503 : 200;

  return c.json(
    {
      success: overallStatus !== 'unhealthy',
      data: result,
    },
    statusCode
  );
});

/**
 * GET /v1/health/live - Liveness Probe (Kubernetes)
 */
healthRoutes.get('/live', async (c) => {
  return c.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * GET /v1/health/ready - Readiness Probe (Kubernetes)
 */
healthRoutes.get('/ready', async (c) => {
  let ready = true;
  let reason: string | undefined;

  // D1 연결 체크
  if (c.env.DB) {
    try {
      const result = await c.env.DB.prepare('SELECT 1 as check_value').first<{
        check_value: number;
      }>();
      if (!result || result.check_value !== 1) {
        ready = false;
        reason = 'Database check failed';
      }
    } catch (error) {
      ready = false;
      reason = (error as Error).message;
    }
  }

  const statusCode = ready ? 200 : 503;

  return c.json(
    {
      success: ready,
      data: {
        ready,
        timestamp: new Date().toISOString(),
        ...(reason && { reason }),
      },
    },
    statusCode
  );
});

/**
 * GET /v1/health/version - 버전 정보
 */
healthRoutes.get('/version', async (c) => {
  return c.json({
    success: true,
    data: {
      version: VERSION,
      patternVersion: c.env.PATTERN_VERSION || '1.0.0',
      environment: c.env.ENVIRONMENT || 'development',
      timestamp: new Date().toISOString(),
    },
  });
});

export { healthRoutes };
