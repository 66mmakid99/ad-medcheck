/**
 * 모듈 라우터 (Router)
 * 분석 요청을 적절한 모듈로 라우팅
 */

import type { ModuleInput, ModuleOutput, ViolationResult, PriceResult } from '../types';

/**
 * 분석 모듈 인터페이스
 */
export interface AnalysisModule {
  /** 모듈 이름 */
  name: string;

  /** 모듈 버전 */
  version: string;

  /** 모듈 활성화 여부 */
  enabled: boolean;

  /**
   * 분석 실행
   * @param input 분석 대상 입력 데이터
   * @returns 분석 결과
   */
  analyze(input: ModuleInput): Promise<ModuleResult>;
}

/**
 * 개별 모듈 분석 결과
 */
export interface ModuleResult {
  /** 모듈 이름 */
  moduleName: string;

  /** 위반 결과 목록 */
  violations?: ViolationResult[];

  /** 가격 분석 결과 목록 */
  prices?: PriceResult[];

  /** 처리 시간 (ms) */
  processingTime: number;

  /** 오류 메시지 (실패 시) */
  error?: string;
}

/**
 * 라우팅 옵션
 */
export interface RoutingOptions {
  /** 실행할 모듈 목록 (미지정 시 전체 실행) */
  modules?: string[];

  /** 병렬 실행 여부 */
  parallel?: boolean;

  /** 타임아웃 (ms) */
  timeout?: number;

  /** 실패 시 계속 진행 여부 */
  continueOnError?: boolean;
}

/**
 * 기본 라우팅 옵션
 */
const DEFAULT_OPTIONS: RoutingOptions = {
  parallel: true,
  timeout: 30000,
  continueOnError: true,
};

/**
 * 모듈 라우터 클래스
 */
export class Router {
  private modules: Map<string, AnalysisModule> = new Map();

  /**
   * 분석 모듈 등록
   */
  register(module: AnalysisModule): void {
    if (this.modules.has(module.name)) {
      throw new Error(`Module already registered: ${module.name}`);
    }
    this.modules.set(module.name, module);
  }

  /**
   * 분석 모듈 등록 해제
   */
  unregister(moduleName: string): boolean {
    return this.modules.delete(moduleName);
  }

  /**
   * 등록된 모듈 목록 조회
   */
  getModules(): AnalysisModule[] {
    return Array.from(this.modules.values());
  }

  /**
   * 특정 모듈 조회
   */
  getModule(name: string): AnalysisModule | undefined {
    return this.modules.get(name);
  }

  /**
   * 분석 요청 라우팅 및 실행
   */
  async route(input: ModuleInput, options: RoutingOptions = {}): Promise<ModuleOutput> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();

    // 실행할 모듈 결정
    const modulesToRun = this.getModulesToRun(opts.modules);

    if (modulesToRun.length === 0) {
      return this.createEmptyOutput(startTime);
    }

    // 모듈 실행
    const results = opts.parallel
      ? await this.runParallel(modulesToRun, input, opts)
      : await this.runSequential(modulesToRun, input, opts);

    // 결과 병합
    return this.mergeResults(results, startTime);
  }

  /**
   * 실행할 모듈 목록 결정
   */
  private getModulesToRun(moduleNames?: string[]): AnalysisModule[] {
    if (moduleNames && moduleNames.length > 0) {
      return moduleNames
        .map(name => this.modules.get(name))
        .filter((m): m is AnalysisModule => m !== undefined && m.enabled);
    }

    return Array.from(this.modules.values()).filter(m => m.enabled);
  }

  /**
   * 병렬 실행
   */
  private async runParallel(
    modules: AnalysisModule[],
    input: ModuleInput,
    options: RoutingOptions
  ): Promise<ModuleResult[]> {
    const timeout = options.timeout || DEFAULT_OPTIONS.timeout!;

    const promises = modules.map(module =>
      this.runWithTimeout(module, input, timeout, options.continueOnError!)
    );

    return Promise.all(promises);
  }

  /**
   * 순차 실행
   */
  private async runSequential(
    modules: AnalysisModule[],
    input: ModuleInput,
    options: RoutingOptions
  ): Promise<ModuleResult[]> {
    const timeout = options.timeout || DEFAULT_OPTIONS.timeout!;
    const results: ModuleResult[] = [];

    for (const module of modules) {
      const result = await this.runWithTimeout(
        module,
        input,
        timeout,
        options.continueOnError!
      );
      results.push(result);

      // 오류 발생 시 중단 (continueOnError가 false인 경우)
      if (result.error && !options.continueOnError) {
        break;
      }
    }

    return results;
  }

  /**
   * 타임아웃이 있는 모듈 실행
   */
  private async runWithTimeout(
    module: AnalysisModule,
    input: ModuleInput,
    timeout: number,
    continueOnError: boolean
  ): Promise<ModuleResult> {
    const startTime = Date.now();

    try {
      const result = await Promise.race([
        module.analyze(input),
        this.createTimeoutPromise(timeout, module.name),
      ]);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (!continueOnError) {
        throw error;
      }

      return {
        moduleName: module.name,
        violations: [],
        prices: [],
        processingTime: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * 타임아웃 Promise 생성
   */
  private createTimeoutPromise(timeout: number, moduleName: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Module timeout: ${moduleName} (${timeout}ms)`));
      }, timeout);
    });
  }

  /**
   * 결과 병합
   */
  private mergeResults(results: ModuleResult[], startTime: number): ModuleOutput {
    const violations: ViolationResult[] = [];
    const prices: PriceResult[] = [];
    const errors: string[] = [];

    for (const result of results) {
      if (result.violations) {
        violations.push(...result.violations);
      }
      if (result.prices) {
        prices.push(...result.prices);
      }
      if (result.error) {
        errors.push(`[${result.moduleName}] ${result.error}`);
      }
    }

    // 신뢰도 계산 (위반 결과의 평균 신뢰도)
    const confidence = violations.length > 0
      ? violations.reduce((sum, v) => sum + v.confidence, 0) / violations.length
      : 1.0;

    // 요약 생성
    const summary = this.generateSummary(violations, prices, errors);

    return {
      violations,
      prices: prices.length > 0 ? prices : undefined,
      summary,
      confidence,
      processingTime: Date.now() - startTime,
      analyzedAt: new Date(),
    };
  }

  /**
   * 빈 결과 생성
   */
  private createEmptyOutput(startTime: number): ModuleOutput {
    return {
      violations: [],
      summary: '등록된 분석 모듈이 없습니다.',
      confidence: 0,
      processingTime: Date.now() - startTime,
      analyzedAt: new Date(),
    };
  }

  /**
   * 요약 생성
   */
  private generateSummary(
    violations: ViolationResult[],
    prices: PriceResult[],
    errors: string[]
  ): string {
    const parts: string[] = [];

    if (violations.length > 0) {
      const critical = violations.filter(v => v.severity === 'high').length;
      const major = violations.filter(v => v.severity === 'medium').length;
      const minor = violations.filter(v => v.severity === 'low').length;

      parts.push(`위반 ${violations.length}건 발견`);
      if (critical > 0) parts.push(`(심각 ${critical}건)`);
      if (major > 0) parts.push(`(주요 ${major}건)`);
      if (minor > 0) parts.push(`(경미 ${minor}건)`);
    } else {
      parts.push('위반 사항 없음');
    }

    if (prices.length > 0) {
      parts.push(`가격 정보 ${prices.length}건 분석`);
    }

    if (errors.length > 0) {
      parts.push(`오류 ${errors.length}건`);
    }

    return parts.join(', ');
  }
}

/**
 * 기본 라우터 인스턴스
 */
export const router = new Router();
