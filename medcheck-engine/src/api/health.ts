/**
 * Health Check API
 * 시스템 상태 확인 엔드포인트
 */

import { SupabaseService, supabaseService } from '../db/supabase';

// ============================================
// 타입 정의
// ============================================

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
  latency?: number;  // ms
  message?: string;
  lastCheck: Date;
}

/**
 * 전체 헬스 체크 결과
 */
export interface HealthCheckResult {
  status: ComponentStatus;
  timestamp: Date;
  version: string;
  uptime: number;  // seconds
  components: ComponentHealth[];
  metrics?: SystemMetrics;
}

/**
 * 시스템 메트릭
 */
export interface SystemMetrics {
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu?: {
    usage: number;
  };
  analysisStats?: {
    totalToday: number;
    successRate: number;
    avgProcessingTime: number;
  };
}

// ============================================
// 헬스 체크 서비스
// ============================================

/**
 * 헬스 체크 옵션
 */
export interface HealthCheckOptions {
  /** 상세 정보 포함 */
  detailed: boolean;
  /** DB 체크 포함 */
  checkDb: boolean;
  /** 외부 서비스 체크 포함 */
  checkExternalServices: boolean;
  /** 타임아웃 (ms) */
  timeout: number;
}

/**
 * 기본 옵션
 */
const DEFAULT_OPTIONS: HealthCheckOptions = {
  detailed: false,
  checkDb: true,
  checkExternalServices: false,
  timeout: 5000,
};

/**
 * 시작 시간 (uptime 계산용)
 */
const startTime = Date.now();

/**
 * 버전 정보
 */
const VERSION = '1.0.0';

/**
 * 헬스 체크 서비스 클래스
 */
export class HealthCheckService {
  private supabase: SupabaseService;

  constructor(supabase: SupabaseService = supabaseService) {
    this.supabase = supabase;
  }

  /**
   * 전체 헬스 체크 실행
   */
  async check(options: Partial<HealthCheckOptions> = {}): Promise<HealthCheckResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const components: ComponentHealth[] = [];

    // 엔진 상태 체크
    components.push(await this.checkEngine());

    // DB 체크
    if (opts.checkDb) {
      components.push(await this.checkDatabase(opts.timeout));
    }

    // 외부 서비스 체크
    if (opts.checkExternalServices) {
      components.push(await this.checkSCV(opts.timeout));
      components.push(await this.checkOCR(opts.timeout));
    }

    // 전체 상태 결정
    const overallStatus = this.determineOverallStatus(components);

    const result: HealthCheckResult = {
      status: overallStatus,
      timestamp: new Date(),
      version: VERSION,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      components,
    };

    // 상세 정보
    if (opts.detailed) {
      result.metrics = await this.getSystemMetrics();
    }

    return result;
  }

  /**
   * 간단한 헬스 체크 (liveness probe)
   */
  async liveness(): Promise<{ status: 'ok' | 'error'; timestamp: Date }> {
    return {
      status: 'ok',
      timestamp: new Date(),
    };
  }

  /**
   * 준비 상태 체크 (readiness probe)
   */
  async readiness(): Promise<{ ready: boolean; timestamp: Date; reason?: string }> {
    try {
      const dbConnected = await this.supabase.checkConnection();

      if (!dbConnected) {
        return {
          ready: false,
          timestamp: new Date(),
          reason: 'Database not connected',
        };
      }

      return {
        ready: true,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        ready: false,
        timestamp: new Date(),
        reason: (error as Error).message,
      };
    }
  }

  /**
   * 엔진 상태 체크
   */
  private async checkEngine(): Promise<ComponentHealth> {
    return {
      name: 'engine',
      status: 'healthy',
      message: 'Engine running',
      lastCheck: new Date(),
    };
  }

  /**
   * 데이터베이스 상태 체크
   */
  private async checkDatabase(timeout: number): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      const connected = await Promise.race([
        this.supabase.checkConnection(),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), timeout)
        ),
      ]);

      const latency = Date.now() - startTime;

      if (connected) {
        return {
          name: 'database',
          status: latency > 1000 ? 'degraded' : 'healthy',
          latency,
          message: latency > 1000 ? 'High latency' : 'Connected',
          lastCheck: new Date(),
        };
      } else {
        return {
          name: 'database',
          status: 'unhealthy',
          latency,
          message: 'Connection failed',
          lastCheck: new Date(),
        };
      }
    } catch (error) {
      return {
        name: 'database',
        status: 'unhealthy',
        latency: Date.now() - startTime,
        message: (error as Error).message,
        lastCheck: new Date(),
      };
    }
  }

  /**
   * SCV 서비스 상태 체크
   */
  private async checkSCV(_timeout: number): Promise<ComponentHealth> {
    // TODO: 실제 SCV 서비스 헬스 체크 구현
    return {
      name: 'scv',
      status: 'healthy',
      message: 'SCV service available (mock)',
      lastCheck: new Date(),
    };
  }

  /**
   * OCR 서비스 상태 체크
   */
  private async checkOCR(_timeout: number): Promise<ComponentHealth> {
    // TODO: 실제 OCR 서비스 (Gemini Vision) 헬스 체크 구현
    return {
      name: 'ocr',
      status: 'healthy',
      message: 'OCR service available (mock)',
      lastCheck: new Date(),
    };
  }

  /**
   * 전체 상태 결정
   */
  private determineOverallStatus(components: ComponentHealth[]): ComponentStatus {
    const hasUnhealthy = components.some(c => c.status === 'unhealthy');
    const hasDegraded = components.some(c => c.status === 'degraded');

    if (hasUnhealthy) return 'unhealthy';
    if (hasDegraded) return 'degraded';
    return 'healthy';
  }

  /**
   * 시스템 메트릭 수집
   */
  private async getSystemMetrics(): Promise<SystemMetrics> {
    const memUsage = process.memoryUsage();

    return {
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024),  // MB
        total: Math.round(memUsage.heapTotal / 1024 / 1024),  // MB
        percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
      },
      // CPU 사용량은 추가 구현 필요
      analysisStats: {
        totalToday: 0,  // TODO: DB에서 조회
        successRate: 100,
        avgProcessingTime: 0,
      },
    };
  }
}

/**
 * 기본 헬스 체크 서비스 인스턴스
 */
export const healthCheckService = new HealthCheckService();

// ============================================
// Express/HTTP 핸들러
// ============================================

/**
 * HTTP 요청/응답 인터페이스 (Express 호환)
 */
export interface HttpRequest {
  query?: Record<string, string>;
}

export interface HttpResponse {
  status(code: number): HttpResponse;
  json(data: unknown): void;
}

/**
 * /health 엔드포인트 핸들러
 */
export async function healthHandler(
  req: HttpRequest,
  res: HttpResponse
): Promise<void> {
  const detailed = req.query?.detailed === 'true';
  const checkDb = req.query?.db !== 'false';
  const checkExternal = req.query?.external === 'true';

  try {
    const result = await healthCheckService.check({
      detailed,
      checkDb,
      checkExternalServices: checkExternal,
    });

    const statusCode = result.status === 'healthy' ? 200 :
                       result.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date(),
      error: (error as Error).message,
    });
  }
}

/**
 * /health/live 엔드포인트 핸들러 (Kubernetes liveness probe)
 */
export async function livenessHandler(
  _req: HttpRequest,
  res: HttpResponse
): Promise<void> {
  const result = await healthCheckService.liveness();
  res.status(200).json(result);
}

/**
 * /health/ready 엔드포인트 핸들러 (Kubernetes readiness probe)
 */
export async function readinessHandler(
  _req: HttpRequest,
  res: HttpResponse
): Promise<void> {
  const result = await healthCheckService.readiness();
  const statusCode = result.ready ? 200 : 503;
  res.status(statusCode).json(result);
}
