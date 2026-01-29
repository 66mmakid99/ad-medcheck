/**
 * Database 모듈 엔트리 포인트
 */

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
