/**
 * Core 모듈 엔트리 포인트
 * Engine Core 컴포넌트들을 export
 */

// Parser
export { Parser, parser } from './parser';
export type { ParseResult, ExtractedPrice } from './parser';

// Normalizer
export { Normalizer, normalizer } from './normalizer';
export type { NormalizeOptions } from './normalizer';

// Router
export { Router, router } from './router';
export type { AnalysisModule, ModuleResult, RoutingOptions } from './router';

// Logger
export { Logger, logger, FileLogHandler } from './logger';
export type { LogLevel, LogEntry, LoggerConfig, LogHandler } from './logger';

// Error Handler
export {
  MedCheckError,
  InputError,
  ParseError,
  PatternError,
  AnalysisError,
  ExternalServiceError,
  DatabaseError,
  SCVError,
  OCRError,
  ErrorHandler,
  errorHandler,
  ErrorCode,
} from './error-handler';
export type {
  ErrorCodeType,
  ErrorSeverity,
  ErrorMetadata,
  ErrorHandlerOptions,
} from './error-handler';

// Tracer
export { Tracer, tracer, createTracer } from './tracer';
export type {
  AnalysisStep,
  TraceStatus,
  StepContext,
  OCRTraceData,
  PatternMatchTraceData,
  AIDecisionTraceData,
  TracerConfig,
  TraceSummary,
} from './tracer';
