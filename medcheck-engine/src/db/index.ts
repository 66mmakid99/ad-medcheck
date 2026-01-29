/**
 * Database 모듈 엔트리 포인트
 */

// Supabase (PostgreSQL)
export {
  SupabaseService,
  supabaseService,
  MockSupabaseClient,
} from './supabase';

export type {
  SupabaseConfig,
  AnalysisLogRecord,
  ViolationRecord,
  PriceAnalysisRecord,
  SystemHealthRecord,
  QueryResult,
  ISupabaseClient,
  IQueryBuilder,
} from './supabase';

// Cloudflare D1 (SQLite)
export { D1Service, d1Service } from './d1';

export type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  D1ExecResult,
  AnalysisLogRecord as D1AnalysisLogRecord,
  AnalysisTraceRecord,
  OCRLogRecord,
  PatternHitRecord,
  AIDecisionRecord,
} from './d1';
