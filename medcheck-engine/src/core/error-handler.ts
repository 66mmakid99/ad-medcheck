/**
 * 에러 핸들러 (Error Handler)
 * 커스텀 에러 클래스 및 에러 처리 시스템
 */

// ============================================
// 에러 코드 체계
// ============================================

/**
 * 에러 코드 카테고리
 * - 1xxx: 입력 관련 에러
 * - 2xxx: 파싱/정규화 에러
 * - 3xxx: 패턴 매칭 에러
 * - 4xxx: 분석 모듈 에러
 * - 5xxx: 외부 연동 에러 (SCV, OCR, DB)
 * - 6xxx: 시스템 에러
 * - 9xxx: 알 수 없는 에러
 */
export const ErrorCode = {
  // 입력 관련 (1xxx)
  INVALID_INPUT: 'E1001',
  EMPTY_CONTENT: 'E1002',
  INVALID_URL: 'E1003',
  INVALID_HTML: 'E1004',
  INPUT_TOO_LARGE: 'E1005',

  // 파싱/정규화 (2xxx)
  PARSE_ERROR: 'E2001',
  HTML_PARSE_ERROR: 'E2002',
  NORMALIZE_ERROR: 'E2003',
  ENCODING_ERROR: 'E2004',

  // 패턴 매칭 (3xxx)
  PATTERN_ERROR: 'E3001',
  INVALID_REGEX: 'E3002',
  PATTERN_NOT_FOUND: 'E3003',
  PATTERN_LOAD_ERROR: 'E3004',
  PATTERN_TIMEOUT: 'E3005',

  // 분석 모듈 (4xxx)
  ANALYSIS_ERROR: 'E4001',
  MODULE_NOT_FOUND: 'E4002',
  MODULE_TIMEOUT: 'E4003',
  MODULE_DISABLED: 'E4004',
  ANALYSIS_ABORTED: 'E4005',

  // 외부 연동 (5xxx)
  SCV_ERROR: 'E5001',
  SCV_CONNECTION_ERROR: 'E5002',
  SCV_CRAWL_ERROR: 'E5003',
  OCR_ERROR: 'E5010',
  OCR_CONNECTION_ERROR: 'E5011',
  OCR_EXTRACT_ERROR: 'E5012',
  DB_ERROR: 'E5020',
  DB_CONNECTION_ERROR: 'E5021',
  DB_QUERY_ERROR: 'E5022',
  DB_TIMEOUT: 'E5023',

  // 시스템 (6xxx)
  SYSTEM_ERROR: 'E6001',
  OUT_OF_MEMORY: 'E6002',
  RATE_LIMIT_EXCEEDED: 'E6003',
  CONFIG_ERROR: 'E6004',

  // 알 수 없음 (9xxx)
  UNKNOWN_ERROR: 'E9001',
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

/**
 * 에러 심각도
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * 에러 메타데이터
 */
export interface ErrorMetadata {
  /** 에러 발생 위치 */
  location?: string;
  /** 입력 데이터 (일부) */
  input?: string;
  /** 추가 컨텍스트 */
  context?: Record<string, unknown>;
  /** 스택 트레이스 */
  stack?: string;
  /** 발생 시간 */
  timestamp: Date;
  /** 복구 시도 횟수 */
  retryCount?: number;
  /** 복구 가능 여부 */
  recoverable: boolean;
}

// ============================================
// 기본 에러 클래스
// ============================================

/**
 * MedCheck 기본 에러 클래스
 */
export class MedCheckError extends Error {
  readonly code: ErrorCodeType;
  readonly severity: ErrorSeverity;
  readonly metadata: ErrorMetadata;
  readonly originalError?: Error;

  constructor(
    message: string,
    code: ErrorCodeType,
    severity: ErrorSeverity = 'medium',
    metadata: Partial<ErrorMetadata> = {},
    originalError?: Error
  ) {
    super(message);
    this.name = 'MedCheckError';
    this.code = code;
    this.severity = severity;
    this.originalError = originalError;
    this.metadata = {
      timestamp: new Date(),
      recoverable: false,
      ...metadata,
      stack: originalError?.stack || this.stack,
    };

    // 프로토타입 체인 유지
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * JSON 직렬화
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      metadata: this.metadata,
    };
  }

  /**
   * 로그 형식 문자열
   */
  toLogString(): string {
    return `[${this.code}] ${this.name}: ${this.message}`;
  }
}

// ============================================
// 특화 에러 클래스
// ============================================

/**
 * 입력 에러
 */
export class InputError extends MedCheckError {
  constructor(
    message: string,
    code: ErrorCodeType = ErrorCode.INVALID_INPUT,
    metadata: Partial<ErrorMetadata> = {}
  ) {
    super(message, code, 'low', { ...metadata, recoverable: false });
    this.name = 'InputError';
  }
}

/**
 * 파싱 에러
 */
export class ParseError extends MedCheckError {
  constructor(
    message: string,
    code: ErrorCodeType = ErrorCode.PARSE_ERROR,
    metadata: Partial<ErrorMetadata> = {},
    originalError?: Error
  ) {
    super(message, code, 'medium', { ...metadata, recoverable: true }, originalError);
    this.name = 'ParseError';
  }
}

/**
 * 패턴 에러
 */
export class PatternError extends MedCheckError {
  readonly patternId?: string;

  constructor(
    message: string,
    patternId?: string,
    code: ErrorCodeType = ErrorCode.PATTERN_ERROR,
    metadata: Partial<ErrorMetadata> = {},
    originalError?: Error
  ) {
    super(
      message,
      code,
      'medium',
      { ...metadata, context: { ...metadata.context, patternId }, recoverable: true },
      originalError
    );
    this.name = 'PatternError';
    this.patternId = patternId;
  }
}

/**
 * 분석 에러
 */
export class AnalysisError extends MedCheckError {
  readonly moduleName?: string;

  constructor(
    message: string,
    moduleName?: string,
    code: ErrorCodeType = ErrorCode.ANALYSIS_ERROR,
    metadata: Partial<ErrorMetadata> = {},
    originalError?: Error
  ) {
    super(
      message,
      code,
      'high',
      { ...metadata, context: { ...metadata.context, moduleName }, recoverable: true },
      originalError
    );
    this.name = 'AnalysisError';
    this.moduleName = moduleName;
  }
}

/**
 * 외부 연동 에러
 */
export class ExternalServiceError extends MedCheckError {
  readonly serviceName: string;

  constructor(
    message: string,
    serviceName: string,
    code: ErrorCodeType = ErrorCode.SYSTEM_ERROR,
    metadata: Partial<ErrorMetadata> = {},
    originalError?: Error
  ) {
    super(
      message,
      code,
      'high',
      { ...metadata, context: { ...metadata.context, serviceName }, recoverable: true },
      originalError
    );
    this.name = 'ExternalServiceError';
    this.serviceName = serviceName;
  }
}

/**
 * 데이터베이스 에러
 */
export class DatabaseError extends ExternalServiceError {
  constructor(
    message: string,
    code: ErrorCodeType = ErrorCode.DB_ERROR,
    metadata: Partial<ErrorMetadata> = {},
    originalError?: Error
  ) {
    super(message, 'database', code, metadata, originalError);
    this.name = 'DatabaseError';
  }
}

/**
 * SCV 에러
 */
export class SCVError extends ExternalServiceError {
  constructor(
    message: string,
    code: ErrorCodeType = ErrorCode.SCV_ERROR,
    metadata: Partial<ErrorMetadata> = {},
    originalError?: Error
  ) {
    super(message, 'scv', code, metadata, originalError);
    this.name = 'SCVError';
  }
}

/**
 * OCR 에러
 */
export class OCRError extends ExternalServiceError {
  constructor(
    message: string,
    code: ErrorCodeType = ErrorCode.OCR_ERROR,
    metadata: Partial<ErrorMetadata> = {},
    originalError?: Error
  ) {
    super(message, 'ocr', code, metadata, originalError);
    this.name = 'OCRError';
  }
}

// ============================================
// 에러 핸들러
// ============================================

/**
 * 에러 핸들러 옵션
 */
export interface ErrorHandlerOptions {
  /** 자동 복구 활성화 */
  autoRecover: boolean;
  /** 최대 재시도 횟수 */
  maxRetries: number;
  /** 재시도 지연 시간 (ms) */
  retryDelay: number;
  /** 에러 로깅 활성화 */
  logging: boolean;
  /** 에러 리포팅 콜백 */
  onError?: (error: MedCheckError) => void | Promise<void>;
}

/**
 * 기본 에러 핸들러 옵션
 */
const DEFAULT_OPTIONS: ErrorHandlerOptions = {
  autoRecover: true,
  maxRetries: 3,
  retryDelay: 1000,
  logging: true,
};

/**
 * 에러 핸들러 클래스
 */
export class ErrorHandler {
  private options: ErrorHandlerOptions;
  private errorHistory: MedCheckError[] = [];
  private maxHistory: number = 100;

  constructor(options: Partial<ErrorHandlerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 에러 처리
   */
  async handle(error: Error | MedCheckError): Promise<void> {
    const medCheckError = this.normalize(error);

    // 히스토리에 추가
    this.addToHistory(medCheckError);

    // 로깅
    if (this.options.logging) {
      this.log(medCheckError);
    }

    // 콜백 실행
    if (this.options.onError) {
      try {
        await this.options.onError(medCheckError);
      } catch (e) {
        console.error('Error in onError callback:', e);
      }
    }
  }

  /**
   * 에러 정규화 (일반 Error → MedCheckError)
   */
  normalize(error: Error | MedCheckError): MedCheckError {
    if (error instanceof MedCheckError) {
      return error;
    }

    // 에러 메시지 기반 분류
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('connection')) {
      return new ExternalServiceError(
        error.message,
        'network',
        ErrorCode.SYSTEM_ERROR,
        {},
        error
      );
    }

    if (message.includes('timeout')) {
      return new AnalysisError(
        error.message,
        undefined,
        ErrorCode.MODULE_TIMEOUT,
        {},
        error
      );
    }

    if (message.includes('parse') || message.includes('syntax')) {
      return new ParseError(
        error.message,
        ErrorCode.PARSE_ERROR,
        {},
        error
      );
    }

    // 기본 에러
    return new MedCheckError(
      error.message,
      ErrorCode.UNKNOWN_ERROR,
      'medium',
      {},
      error
    );
  }

  /**
   * 재시도 래퍼
   */
  async withRetry<T>(
    fn: () => Promise<T>,
    options: { maxRetries?: number; delay?: number; onRetry?: (attempt: number, error: Error) => void } = {}
  ): Promise<T> {
    const maxRetries = options.maxRetries ?? this.options.maxRetries;
    const delay = options.delay ?? this.options.retryDelay;

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (options.onRetry) {
          options.onRetry(attempt, lastError);
        }

        // 복구 불가능한 에러는 즉시 throw
        if (error instanceof MedCheckError && !error.metadata.recoverable) {
          throw error;
        }

        // 마지막 시도가 아니면 대기
        if (attempt < maxRetries) {
          await this.sleep(delay * attempt); // 지수 백오프
        }
      }
    }

    throw lastError;
  }

  /**
   * 안전 실행 (에러 발생 시 기본값 반환)
   */
  async safeExecute<T>(
    fn: () => Promise<T>,
    defaultValue: T,
    errorHandler?: (error: MedCheckError) => void
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const medCheckError = this.normalize(error as Error);
      await this.handle(medCheckError);

      if (errorHandler) {
        errorHandler(medCheckError);
      }

      return defaultValue;
    }
  }

  /**
   * 에러 히스토리에 추가
   */
  private addToHistory(error: MedCheckError): void {
    this.errorHistory.push(error);

    if (this.errorHistory.length > this.maxHistory) {
      this.errorHistory.shift();
    }
  }

  /**
   * 에러 로깅
   */
  private log(error: MedCheckError): void {
    const prefix = `[${error.severity.toUpperCase()}]`;
    const logMessage = `${prefix} ${error.toLogString()}`;

    switch (error.severity) {
      case 'critical':
      case 'high':
        console.error(logMessage, error.metadata);
        break;
      case 'medium':
        console.warn(logMessage, error.metadata);
        break;
      case 'low':
        console.info(logMessage);
        break;
    }
  }

  /**
   * 대기
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 에러 히스토리 조회
   */
  getHistory(filter?: {
    code?: ErrorCodeType;
    severity?: ErrorSeverity;
    limit?: number;
  }): MedCheckError[] {
    let errors = [...this.errorHistory];

    if (filter?.code) {
      errors = errors.filter(e => e.code === filter.code);
    }

    if (filter?.severity) {
      errors = errors.filter(e => e.severity === filter.severity);
    }

    if (filter?.limit) {
      errors = errors.slice(-filter.limit);
    }

    return errors;
  }

  /**
   * 에러 통계
   */
  getStats(): {
    total: number;
    bySeverity: Record<ErrorSeverity, number>;
    byCode: Record<string, number>;
  } {
    const stats = {
      total: this.errorHistory.length,
      bySeverity: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      } as Record<ErrorSeverity, number>,
      byCode: {} as Record<string, number>,
    };

    for (const error of this.errorHistory) {
      stats.bySeverity[error.severity]++;
      stats.byCode[error.code] = (stats.byCode[error.code] || 0) + 1;
    }

    return stats;
  }

  /**
   * 히스토리 초기화
   */
  clearHistory(): void {
    this.errorHistory = [];
  }
}

/**
 * 기본 에러 핸들러 인스턴스
 */
export const errorHandler = new ErrorHandler();
