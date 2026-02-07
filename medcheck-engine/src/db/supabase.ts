/**
 * Supabase 클라이언트 및 데이터베이스 연동
 */

import { ModuleOutput, ViolationResult, PriceResult } from '../types';
import { DatabaseError, ErrorCode } from '../core/error-handler';

// ============================================
// 환경변수 설정
// ============================================

/**
 * Supabase 설정
 */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

/**
 * 환경변수에서 설정 로드
 */
function loadConfig(): SupabaseConfig {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    console.warn('[Supabase] 환경변수 미설정: SUPABASE_URL, SUPABASE_ANON_KEY');
  }

  return {
    url: url || '',
    anonKey: anonKey || '',
    serviceRoleKey,
  };
}

// ============================================
// 타입 정의
// ============================================

/**
 * 분석 로그 DB 레코드
 */
export interface AnalysisLogRecord {
  id?: string;
  source_url: string;
  source_type?: string;
  hospital_name?: string;
  department?: string;
  violation_count: number;
  severity_critical: number;
  severity_major: number;
  severity_minor: number;
  confidence: number;
  processing_time_ms?: number;
  content_length?: number;
  image_count?: number;
  ocr_used?: boolean;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_code?: string;
  error_message?: string;
  analyzed_at?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * 위반 DB 레코드
 */
export interface ViolationRecord {
  id?: string;
  analysis_log_id: string;
  pattern_id: string;
  violation_type: string;
  category?: string;
  subcategory?: string;
  matched_text: string;
  text_position?: number;
  context_before?: string;
  context_after?: string;
  severity: string;
  status: string;
  confidence: number;
  legal_basis?: string;
  legal_description?: string;
  created_at?: string;
}

/**
 * 가격 분석 DB 레코드
 */
export interface PriceAnalysisRecord {
  id?: string;
  analysis_log_id: string;
  item_name: string;
  advertised_price?: number;
  original_text?: string;
  coverage_type?: string;
  price_status?: string;
  reference_min?: number;
  reference_max?: number;
  confidence: number;
  comment?: string;
  created_at?: string;
}

/**
 * 시스템 상태 레코드
 */
export interface SystemHealthRecord {
  id?: string;
  component: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  metrics?: Record<string, unknown>;
  checked_at?: string;
}

/**
 * 쿼리 결과
 */
export interface QueryResult<T> {
  data: T | null;
  error: Error | null;
  count?: number;
}

// ============================================
// Supabase 클라이언트 인터페이스
// ============================================

/**
 * Supabase 클라이언트 인터페이스 (실제 클라이언트 또는 Mock)
 */
export interface ISupabaseClient {
  from(table: string): IQueryBuilder;
  rpc(fn: string, params?: Record<string, unknown>): Promise<QueryResult<unknown>>;
}

/**
 * 쿼리 빌더 인터페이스
 */
export interface IQueryBuilder {
  select(columns?: string): IQueryBuilder;
  insert(data: Record<string, unknown> | Record<string, unknown>[]): IQueryBuilder;
  update(data: Record<string, unknown>): IQueryBuilder;
  delete(): IQueryBuilder;
  eq(column: string, value: unknown): IQueryBuilder;
  neq(column: string, value: unknown): IQueryBuilder;
  gt(column: string, value: unknown): IQueryBuilder;
  gte(column: string, value: unknown): IQueryBuilder;
  lt(column: string, value: unknown): IQueryBuilder;
  lte(column: string, value: unknown): IQueryBuilder;
  like(column: string, pattern: string): IQueryBuilder;
  ilike(column: string, pattern: string): IQueryBuilder;
  in(column: string, values: unknown[]): IQueryBuilder;
  order(column: string, options?: { ascending?: boolean }): IQueryBuilder;
  limit(count: number): IQueryBuilder;
  offset(count: number): IQueryBuilder;
  single(): IQueryBuilder;
  maybeSingle(): IQueryBuilder;
  then<T>(resolve: (result: QueryResult<T>) => void): Promise<void>;
  execute<T>(): Promise<QueryResult<T>>;
}

// ============================================
// Mock Supabase 클라이언트 (테스트/개발용)
// ============================================

/**
 * Mock 쿼리 빌더
 */
class MockQueryBuilder implements IQueryBuilder {
  private tableName: string;
  private operation: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private data: Record<string, unknown>[] = [];

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(_columns?: string): IQueryBuilder {
    this.operation = 'select';
    return this;
  }

  insert(data: Record<string, unknown> | Record<string, unknown>[]): IQueryBuilder {
    this.operation = 'insert';
    this.data = Array.isArray(data) ? data : [data];
    return this;
  }

  update(_data: Record<string, unknown>): IQueryBuilder {
    this.operation = 'update';
    return this;
  }

  delete(): IQueryBuilder {
    this.operation = 'delete';
    return this;
  }

  eq(_column: string, _value: unknown): IQueryBuilder { return this; }
  neq(_column: string, _value: unknown): IQueryBuilder { return this; }
  gt(_column: string, _value: unknown): IQueryBuilder { return this; }
  gte(_column: string, _value: unknown): IQueryBuilder { return this; }
  lt(_column: string, _value: unknown): IQueryBuilder { return this; }
  lte(_column: string, _value: unknown): IQueryBuilder { return this; }
  like(_column: string, _pattern: string): IQueryBuilder { return this; }
  ilike(_column: string, _pattern: string): IQueryBuilder { return this; }
  in(_column: string, _values: unknown[]): IQueryBuilder { return this; }
  order(_column: string, _options?: { ascending?: boolean }): IQueryBuilder { return this; }
  limit(_count: number): IQueryBuilder { return this; }
  offset(_count: number): IQueryBuilder { return this; }
  single(): IQueryBuilder { return this; }
  maybeSingle(): IQueryBuilder { return this; }

  then<T>(resolve: (result: QueryResult<T>) => void): Promise<void> {
    return this.execute<T>().then(resolve);
  }

  async execute<T>(): Promise<QueryResult<T>> {
    if (this.operation === 'insert') {
      // Mock: ID 생성하여 반환
      const result = this.data.map(d => ({
        ...d,
        id: `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        created_at: new Date().toISOString(),
      }));
      return { data: result as unknown as T, error: null };
    }

    return { data: null, error: null };
  }
}

/**
 * Mock Supabase 클라이언트
 */
export class MockSupabaseClient implements ISupabaseClient {
  from(table: string): IQueryBuilder {
    return new MockQueryBuilder(table);
  }

  async rpc(_fn: string, _params?: Record<string, unknown>): Promise<QueryResult<unknown>> {
    return { data: null, error: null };
  }
}

// ============================================
// Supabase 서비스 클래스
// ============================================

/**
 * Supabase 데이터베이스 서비스
 */
export class SupabaseService {
  private client: ISupabaseClient;
  private config: SupabaseConfig;
  private connected: boolean = false;

  constructor(client?: ISupabaseClient) {
    this.config = loadConfig();
    this.client = client || new MockSupabaseClient();

    if (!this.config.url) {
      console.warn('[SupabaseService] Mock 모드로 실행 중 (환경변수 미설정)');
    }
  }

  /**
   * 실제 Supabase 클라이언트 설정
   */
  setClient(client: ISupabaseClient): void {
    this.client = client;
  }

  /**
   * 연결 상태 확인
   */
  async checkConnection(): Promise<boolean> {
    try {
      const result = await this.client
        .from('system_health')
        .select('id')
        .limit(1)
        .execute();

      this.connected = !result.error;
      return this.connected;
    } catch (error) {
      this.connected = false;
      return false;
    }
  }

  /**
   * 연결 상태
   */
  isConnected(): boolean {
    return this.connected;
  }

  // ============================================
  // 분석 로그 CRUD
  // ============================================

  /**
   * 분석 로그 생성
   */
  async createAnalysisLog(
    sourceUrl: string,
    options: {
      sourceType?: string;
      hospitalName?: string;
      department?: string;
      contentLength?: number;
      imageCount?: number;
    } = {}
  ): Promise<string | null> {
    try {
      const record: Partial<AnalysisLogRecord> = {
        source_url: sourceUrl,
        source_type: options.sourceType,
        hospital_name: options.hospitalName,
        department: options.department,
        content_length: options.contentLength,
        image_count: options.imageCount,
        violation_count: 0,
        severity_critical: 0,
        severity_major: 0,
        severity_minor: 0,
        confidence: 0,
        status: 'pending',
      };

      const result = await this.client
        .from('analysis_logs')
        .insert(record)
        .select('id')
        .single()
        .execute<{ id: string }>();

      if (result.error) {
        throw new DatabaseError(
          `분석 로그 생성 실패: ${result.error.message}`,
          ErrorCode.DB_QUERY_ERROR
        );
      }

      return result.data?.id || null;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(
        `분석 로그 생성 실패: ${(error as Error).message}`,
        ErrorCode.DB_ERROR,
        {},
        error as Error
      );
    }
  }

  /**
   * 분석 결과 저장
   */
  async saveAnalysisResult(
    logId: string,
    result: ModuleOutput,
    options: { ocrUsed?: boolean } = {}
  ): Promise<void> {
    try {
      // 심각도별 카운트
      const severityCounts = {
        critical: 0,
        major: 0,
        minor: 0,
      };

      for (const v of result.violations) {
        if (v.severity === 'high') severityCounts.critical++;
        else if (v.severity === 'medium') severityCounts.major++;
        else severityCounts.minor++;
      }

      // 분석 로그 업데이트
      await this.client
        .from('analysis_logs')
        .update({
          violation_count: result.violations.length,
          severity_critical: severityCounts.critical,
          severity_major: severityCounts.major,
          severity_minor: severityCounts.minor,
          confidence: result.confidence,
          processing_time_ms: result.processingTime,
          ocr_used: options.ocrUsed || false,
          status: 'completed',
          analyzed_at: result.analyzedAt.toISOString(),
        })
        .eq('id', logId)
        .execute();

      // 위반 상세 저장
      if (result.violations.length > 0) {
        await this.saveViolations(logId, result.violations);
      }

      // 가격 분석 저장
      if (result.prices && result.prices.length > 0) {
        await this.savePriceAnalyses(logId, result.prices);
      }
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(
        `분석 결과 저장 실패: ${(error as Error).message}`,
        ErrorCode.DB_ERROR,
        {},
        error as Error
      );
    }
  }

  /**
   * 위반 상세 저장
   */
  private async saveViolations(logId: string, violations: ViolationResult[]): Promise<void> {
    const records: Partial<ViolationRecord>[] = violations.map(v => ({
      analysis_log_id: logId,
      pattern_id: v.patternId || 'unknown',
      violation_type: v.type,
      matched_text: v.matchedText,
      text_position: v.position,
      severity: v.severity,
      status: v.status,
      confidence: v.confidence,
      legal_basis: v.legalBasis[0]?.law,
      legal_description: v.legalBasis[0]?.description,
    }));

    await this.client
      .from('violations')
      .insert(records)
      .execute();
  }

  /**
   * 가격 분석 저장
   */
  private async savePriceAnalyses(logId: string, prices: PriceResult[]): Promise<void> {
    const records: Partial<PriceAnalysisRecord>[] = prices.map(p => ({
      analysis_log_id: logId,
      item_name: p.itemName,
      advertised_price: p.advertisedPrice,
      coverage_type: p.coverageType,
      price_status: p.priceStatus,
      reference_min: p.referenceMin,
      reference_max: p.referenceMax,
      confidence: p.confidence,
      comment: p.comment,
    }));

    await this.client
      .from('price_analyses')
      .insert(records)
      .execute();
  }

  /**
   * 분석 실패 기록
   */
  async recordFailure(
    logId: string,
    errorCode: string,
    errorMessage: string
  ): Promise<void> {
    await this.client
      .from('analysis_logs')
      .update({
        status: 'failed',
        error_code: errorCode,
        error_message: errorMessage,
      })
      .eq('id', logId)
      .execute();
  }

  /**
   * 분석 로그 조회
   */
  async getAnalysisLog(logId: string): Promise<AnalysisLogRecord | null> {
    const result = await this.client
      .from('analysis_logs')
      .select('*')
      .eq('id', logId)
      .single()
      .execute<AnalysisLogRecord>();

    return result.data;
  }

  /**
   * 최근 분석 로그 목록 조회
   */
  async getRecentAnalysisLogs(
    limit: number = 20,
    offset: number = 0
  ): Promise<AnalysisLogRecord[]> {
    const result = await this.client
      .from('analysis_logs')
      .select('*')
      .order('analyzed_at', { ascending: false })
      .limit(limit)
      .offset(offset)
      .execute<AnalysisLogRecord[]>();

    return result.data || [];
  }

  // ============================================
  // 시스템 상태
  // ============================================

  /**
   * 시스템 상태 업데이트
   */
  async updateSystemHealth(
    component: string,
    status: 'healthy' | 'degraded' | 'unhealthy',
    message?: string,
    metrics?: Record<string, unknown>
  ): Promise<void> {
    await this.client
      .from('system_health')
      .insert({
        component,
        status,
        message,
        metrics,
        checked_at: new Date().toISOString(),
      })
      .execute();
  }

  /**
   * 시스템 상태 조회
   */
  async getSystemHealth(): Promise<SystemHealthRecord[]> {
    // 각 컴포넌트의 최신 상태 조회
    const result = await this.client
      .from('system_health')
      .select('*')
      .order('checked_at', { ascending: false })
      .limit(10)
      .execute<SystemHealthRecord[]>();

    return result.data || [];
  }

  // ============================================
  // 통계
  // ============================================

  /**
   * 일별 분석 통계
   */
  async getDailyStats(days: number = 7): Promise<{
    date: string;
    totalAnalyses: number;
    totalViolations: number;
  }[]> {
    // 실제 구현 시 Supabase RPC 또는 복잡한 쿼리 필요
    return [];
  }

  /**
   * 패턴별 통계
   */
  async getPatternStats(limit: number = 10): Promise<{
    patternId: string;
    matchCount: number;
  }[]> {
    const result = await this.client
      .from('pattern_stats')
      .select('pattern_id, match_count')
      .order('match_count', { ascending: false })
      .limit(limit)
      .execute<{ pattern_id: string; match_count: number }[]>();

    return (result.data || []).map(r => ({
      patternId: r.pattern_id,
      matchCount: r.match_count,
    }));
  }
}

/**
 * 기본 Supabase 서비스 인스턴스
 */
export const supabaseService = new SupabaseService();
