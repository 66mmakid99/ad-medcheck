/**
 * API 모듈 엔트리 포인트
 */

// Routes (Hono)
export { analyzeRoutes, patternsRoutes, healthRoutes } from './routes';

// Legacy Health Service (Express 호환)
export {
  HealthCheckService,
  healthCheckService,
  healthHandler,
  livenessHandler,
  readinessHandler,
} from './health';

export type {
  ComponentStatus,
  ComponentHealth,
  HealthCheckResult,
  SystemMetrics,
  HealthCheckOptions,
  HttpRequest,
  HttpResponse,
} from './health';
