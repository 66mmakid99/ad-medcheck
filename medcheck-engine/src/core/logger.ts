/**
 * 로그 시스템 (Logger)
 * 분석 로그 기록 및 관리
 */

/**
 * 로그 레벨
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 로그 엔트리
 */
export interface LogEntry {
  /** 타임스탬프 */
  timestamp: Date;

  /** 로그 레벨 */
  level: LogLevel;

  /** 로그 메시지 */
  message: string;

  /** 컨텍스트 정보 */
  context?: Record<string, unknown>;

  /** 분석 세션 ID */
  sessionId?: string;

  /** 모듈 이름 */
  module?: string;
}

/**
 * 로거 설정
 */
export interface LoggerConfig {
  /** 최소 로그 레벨 */
  minLevel: LogLevel;

  /** 콘솔 출력 여부 */
  console: boolean;

  /** 타임스탬프 포맷 */
  timestampFormat: 'iso' | 'locale' | 'unix';

  /** 컬러 출력 여부 */
  colors: boolean;

  /** 로그 핸들러 */
  handlers: LogHandler[];
}

/**
 * 로그 핸들러 인터페이스
 */
export interface LogHandler {
  /** 핸들러 이름 */
  name: string;

  /**
   * 로그 처리
   * @param entry 로그 엔트리
   */
  handle(entry: LogEntry): void | Promise<void>;
}

/**
 * 로그 레벨 우선순위
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * 콘솔 컬러 코드
 */
const COLORS = {
  reset: '\x1b[0m',
  debug: '\x1b[36m',  // cyan
  info: '\x1b[32m',   // green
  warn: '\x1b[33m',   // yellow
  error: '\x1b[31m',  // red
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

/**
 * 기본 로거 설정
 */
const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: 'info',
  console: true,
  timestampFormat: 'iso',
  colors: true,
  handlers: [],
};

/**
 * 로거 클래스
 */
export class Logger {
  private config: LoggerConfig;
  private sessionId?: string;
  private module?: string;
  private logHistory: LogEntry[] = [];
  private maxHistory: number = 1000;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 세션 ID 설정
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * 모듈 이름 설정
   */
  setModule(module: string): void {
    this.module = module;
  }

  /**
   * 자식 로거 생성 (모듈별 로거)
   */
  child(module: string): Logger {
    const childLogger = new Logger(this.config);
    childLogger.sessionId = this.sessionId;
    childLogger.module = module;
    childLogger.logHistory = this.logHistory;
    return childLogger;
  }

  /**
   * 핸들러 추가
   */
  addHandler(handler: LogHandler): void {
    this.config.handlers.push(handler);
  }

  /**
   * 핸들러 제거
   */
  removeHandler(name: string): boolean {
    const index = this.config.handlers.findIndex(h => h.name === name);
    if (index >= 0) {
      this.config.handlers.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 디버그 로그
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  /**
   * 정보 로그
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  /**
   * 경고 로그
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  /**
   * 에러 로그
   */
  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  /**
   * 분석 시작 로그
   */
  analysisStart(source: string, context?: Record<string, unknown>): void {
    this.info(`분석 시작: ${source}`, {
      event: 'analysis_start',
      source,
      ...context,
    });
  }

  /**
   * 분석 완료 로그
   */
  analysisComplete(
    source: string,
    violationCount: number,
    processingTime: number,
    context?: Record<string, unknown>
  ): void {
    this.info(`분석 완료: ${source} (위반 ${violationCount}건, ${processingTime}ms)`, {
      event: 'analysis_complete',
      source,
      violationCount,
      processingTime,
      ...context,
    });
  }

  /**
   * 위반 발견 로그
   */
  violationFound(
    patternId: string,
    matchedText: string,
    context?: Record<string, unknown>
  ): void {
    this.debug(`위반 발견: [${patternId}] "${matchedText.substring(0, 50)}..."`, {
      event: 'violation_found',
      patternId,
      matchedText,
      ...context,
    });
  }

  /**
   * 패턴 매칭 로그
   */
  patternMatch(
    patternId: string,
    matchCount: number,
    context?: Record<string, unknown>
  ): void {
    this.debug(`패턴 매칭: [${patternId}] ${matchCount}건`, {
      event: 'pattern_match',
      patternId,
      matchCount,
      ...context,
    });
  }

  /**
   * 로그 기록
   */
  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    // 레벨 체크
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context,
      sessionId: this.sessionId,
      module: this.module,
    };

    // 히스토리에 추가
    this.addToHistory(entry);

    // 콘솔 출력
    if (this.config.console) {
      this.writeToConsole(entry);
    }

    // 핸들러 실행
    for (const handler of this.config.handlers) {
      try {
        handler.handle(entry);
      } catch (e) {
        // 핸들러 오류는 무시
        console.error(`Log handler error [${handler.name}]:`, e);
      }
    }
  }

  /**
   * 히스토리에 추가
   */
  private addToHistory(entry: LogEntry): void {
    this.logHistory.push(entry);

    // 최대 크기 초과 시 오래된 로그 삭제
    if (this.logHistory.length > this.maxHistory) {
      this.logHistory.shift();
    }
  }

  /**
   * 콘솔에 출력
   */
  private writeToConsole(entry: LogEntry): void {
    const timestamp = this.formatTimestamp(entry.timestamp);
    const level = entry.level.toUpperCase().padEnd(5);
    const module = entry.module ? `[${entry.module}]` : '';

    let output: string;

    if (this.config.colors) {
      const levelColor = COLORS[entry.level];
      output = `${COLORS.dim}${timestamp}${COLORS.reset} ${levelColor}${level}${COLORS.reset} ${module} ${entry.message}`;
    } else {
      output = `${timestamp} ${level} ${module} ${entry.message}`;
    }

    // 컨텍스트 출력
    if (entry.context && Object.keys(entry.context).length > 0) {
      const contextStr = JSON.stringify(entry.context, null, 2);
      output += `\n${this.config.colors ? COLORS.dim : ''}${contextStr}${this.config.colors ? COLORS.reset : ''}`;
    }

    // 적절한 콘솔 메서드 사용
    switch (entry.level) {
      case 'debug':
        console.debug(output);
        break;
      case 'info':
        console.info(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
        console.error(output);
        break;
    }
  }

  /**
   * 타임스탬프 포맷
   */
  private formatTimestamp(date: Date): string {
    switch (this.config.timestampFormat) {
      case 'iso':
        return date.toISOString();
      case 'locale':
        return date.toLocaleString('ko-KR');
      case 'unix':
        return String(date.getTime());
      default:
        return date.toISOString();
    }
  }

  /**
   * 로그 히스토리 조회
   */
  getHistory(filter?: { level?: LogLevel; module?: string; limit?: number }): LogEntry[] {
    let entries = [...this.logHistory];

    if (filter?.level) {
      const minPriority = LOG_LEVEL_PRIORITY[filter.level];
      entries = entries.filter(e => LOG_LEVEL_PRIORITY[e.level] >= minPriority);
    }

    if (filter?.module) {
      entries = entries.filter(e => e.module === filter.module);
    }

    if (filter?.limit) {
      entries = entries.slice(-filter.limit);
    }

    return entries;
  }

  /**
   * 로그 히스토리 초기화
   */
  clearHistory(): void {
    this.logHistory = [];
  }
}

/**
 * 기본 로거 인스턴스
 */
export const logger = new Logger();

/**
 * 파일 로그 핸들러 (예시)
 */
export class FileLogHandler implements LogHandler {
  name = 'file';
  private filePath: string;
  private buffer: string[] = [];
  private bufferSize: number;

  constructor(filePath: string, bufferSize: number = 100) {
    this.filePath = filePath;
    this.bufferSize = bufferSize;
  }

  handle(entry: LogEntry): void {
    const line = JSON.stringify({
      ...entry,
      timestamp: entry.timestamp.toISOString(),
    });

    this.buffer.push(line);

    if (this.buffer.length >= this.bufferSize) {
      this.flush();
    }
  }

  flush(): void {
    if (this.buffer.length === 0) return;

    // 실제 파일 쓰기는 Node.js fs 모듈 사용
    // 여기서는 인터페이스만 정의
    this.buffer = [];
  }
}
