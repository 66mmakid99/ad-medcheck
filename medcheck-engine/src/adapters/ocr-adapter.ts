/**
 * OCR 어댑터
 * 이미지에서 텍스트 추출 및 분석 데이터 병합
 */

import type { ModuleInput } from '../types';

// ============================================
// OCR 모듈 인터페이스 정의
// ============================================

/**
 * OCR 추출 결과
 */
export interface OCRResult {
  /** 원본 이미지 URL */
  imageUrl: string;

  /** 추출된 텍스트 */
  text: string;

  /** 신뢰도 (0-1) */
  confidence: number;

  /** 언어 */
  language?: string;

  /** 텍스트 영역 목록 */
  regions?: OCRTextRegion[];

  /** 처리 시간 (ms) */
  processingTime?: number;

  /** 오류 메시지 */
  error?: string;
}

/**
 * OCR 텍스트 영역
 */
export interface OCRTextRegion {
  /** 텍스트 */
  text: string;

  /** 영역 좌표 */
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  /** 신뢰도 */
  confidence: number;
}

/**
 * OCR 옵션
 */
export interface OCROptions {
  /** 언어 힌트 */
  language?: string | string[];

  /** 이미지 전처리 */
  preprocess?: boolean;

  /** 최소 신뢰도 임계값 */
  minConfidence?: number;

  /** 타임아웃 (ms) */
  timeout?: number;
}

/**
 * OCR 클라이언트 인터페이스
 * 실제 OCR 모듈 구현체가 이 인터페이스를 따라야 함
 */
export interface IOCRClient {
  /**
   * 단일 이미지 OCR
   */
  extract(imageUrl: string, options?: OCROptions): Promise<OCRResult>;

  /**
   * 여러 이미지 일괄 OCR
   */
  extractBatch(imageUrls: string[], options?: OCROptions): Promise<OCRResult[]>;

  /**
   * 지원 언어 목록
   */
  getSupportedLanguages?(): Promise<string[]>;
}

// ============================================
// OCR 어댑터 구현
// ============================================

/**
 * 어댑터 설정
 */
export interface OCRAdapterConfig {
  /** 기본 언어 */
  defaultLanguage?: string;

  /** 최소 신뢰도 */
  minConfidence?: number;

  /** 병렬 처리 수 */
  concurrency?: number;

  /** 타임아웃 (ms) */
  timeout?: number;

  /** 재시도 횟수 */
  retries?: number;

  /** 캐시 사용 여부 */
  useCache?: boolean;
}

/**
 * 기본 어댑터 설정
 */
const DEFAULT_CONFIG: OCRAdapterConfig = {
  defaultLanguage: 'ko',
  minConfidence: 0.5,
  concurrency: 3,
  timeout: 30000,
  retries: 2,
  useCache: true,
};

/**
 * OCR 캐시 엔트리
 */
interface CacheEntry {
  result: OCRResult;
  timestamp: number;
}

/**
 * OCR 어댑터 클래스
 */
export class OCRAdapter {
  private client: IOCRClient | null = null;
  private config: OCRAdapterConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private cacheMaxAge: number = 1000 * 60 * 60; // 1시간

  constructor(config: OCRAdapterConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * OCR 클라이언트 설정
   */
  setClient(client: IOCRClient): void {
    this.client = client;
  }

  /**
   * OCR 클라이언트 반환
   */
  getClient(): IOCRClient | null {
    return this.client;
  }

  /**
   * 단일 이미지 OCR 수행
   */
  async extractText(imageUrl: string, options?: OCROptions): Promise<OCRResult> {
    if (!this.client) {
      throw new Error('OCR client not configured. Call setClient() first.');
    }

    // 캐시 확인
    if (this.config.useCache) {
      const cached = this.getFromCache(imageUrl);
      if (cached) {
        return cached;
      }
    }

    const opts: OCROptions = {
      language: options?.language || this.config.defaultLanguage,
      minConfidence: options?.minConfidence || this.config.minConfidence,
      timeout: options?.timeout || this.config.timeout,
      ...options,
    };

    // 재시도 로직
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= (this.config.retries || 0); attempt++) {
      try {
        const result = await this.client.extract(imageUrl, opts);

        // 캐시 저장
        if (this.config.useCache && !result.error) {
          this.saveToCache(imageUrl, result);
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < (this.config.retries || 0)) {
          await this.delay(1000 * (attempt + 1)); // 점진적 대기
        }
      }
    }

    return {
      imageUrl,
      text: '',
      confidence: 0,
      error: lastError?.message || 'OCR extraction failed',
    };
  }

  /**
   * 여러 이미지 일괄 OCR 수행
   */
  async extractTextBatch(
    imageUrls: string[],
    options?: OCROptions
  ): Promise<OCRResult[]> {
    if (!this.client) {
      throw new Error('OCR client not configured. Call setClient() first.');
    }

    // 동시성 제한 적용
    const concurrency = this.config.concurrency || 3;
    const results: OCRResult[] = [];

    for (let i = 0; i < imageUrls.length; i += concurrency) {
      const batch = imageUrls.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(url => this.extractText(url, options))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * ModuleInput에 OCR 텍스트 병합
   */
  async enrichWithOCR(input: ModuleInput, options?: OCROptions): Promise<ModuleInput> {
    if (!input.images || input.images.length === 0) {
      return input;
    }

    // 이미지들에서 OCR 수행
    const ocrResults = await this.extractTextBatch(input.images, options);

    // 성공한 OCR 결과만 필터링
    const successfulResults = ocrResults.filter(
      r => !r.error && r.text && r.confidence >= (this.config.minConfidence || 0)
    );

    if (successfulResults.length === 0) {
      return input;
    }

    // OCR 텍스트 병합
    const ocrTexts = successfulResults.map(r => r.text);
    const combinedOcrText = ocrTexts.join('\n\n');

    // 원본 콘텐츠와 OCR 텍스트 결합
    const enrichedContent = input.content
      ? `${input.content}\n\n[이미지 텍스트]\n${combinedOcrText}`
      : combinedOcrText;

    return {
      ...input,
      content: enrichedContent,
      metadata: {
        ...input.metadata,
        ocrExtracted: true,
        ocrImageCount: successfulResults.length,
        ocrTotalImages: input.images.length,
        ocrAverageConfidence:
          successfulResults.reduce((sum, r) => sum + r.confidence, 0) /
          successfulResults.length,
      },
    };
  }

  /**
   * 여러 ModuleInput에 OCR 텍스트 일괄 병합
   */
  async enrichWithOCRBatch(
    inputs: ModuleInput[],
    options?: OCROptions
  ): Promise<ModuleInput[]> {
    return Promise.all(inputs.map(input => this.enrichWithOCR(input, options)));
  }

  /**
   * OCR 결과 요약 생성
   */
  summarizeOCRResults(results: OCRResult[]): OCRSummary {
    const successful = results.filter(r => !r.error && r.text);
    const failed = results.filter(r => r.error);

    const totalText = successful.map(r => r.text).join(' ');
    const avgConfidence =
      successful.length > 0
        ? successful.reduce((sum, r) => sum + r.confidence, 0) / successful.length
        : 0;

    return {
      totalImages: results.length,
      successCount: successful.length,
      failedCount: failed.length,
      totalCharacters: totalText.length,
      averageConfidence: avgConfidence,
      errors: failed.map(r => ({ imageUrl: r.imageUrl, error: r.error || 'Unknown' })),
    };
  }

  /**
   * 캐시에서 조회
   */
  private getFromCache(imageUrl: string): OCRResult | null {
    const entry = this.cache.get(imageUrl);
    if (!entry) return null;

    // 만료 확인
    if (Date.now() - entry.timestamp > this.cacheMaxAge) {
      this.cache.delete(imageUrl);
      return null;
    }

    return entry.result;
  }

  /**
   * 캐시에 저장
   */
  private saveToCache(imageUrl: string, result: OCRResult): void {
    this.cache.set(imageUrl, {
      result,
      timestamp: Date.now(),
    });

    // 캐시 크기 제한 (최대 1000개)
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
  }

  /**
   * 캐시 초기화
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 지연 유틸리티
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * OCR 요약 정보
 */
export interface OCRSummary {
  totalImages: number;
  successCount: number;
  failedCount: number;
  totalCharacters: number;
  averageConfidence: number;
  errors: Array<{ imageUrl: string; error: string }>;
}

/**
 * Mock OCR 클라이언트 (테스트/개발용)
 */
export class MockOCRClient implements IOCRClient {
  async extract(imageUrl: string): Promise<OCRResult> {
    // 시뮬레이션 지연
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      imageUrl,
      text: `[Mock OCR] 이미지에서 추출된 텍스트입니다. URL: ${imageUrl}`,
      confidence: 0.95,
      language: 'ko',
      processingTime: 100,
    };
  }

  async extractBatch(imageUrls: string[]): Promise<OCRResult[]> {
    return Promise.all(imageUrls.map(url => this.extract(url)));
  }

  async getSupportedLanguages(): Promise<string[]> {
    return ['ko', 'en', 'ja', 'zh'];
  }
}

/**
 * 기본 OCR 어댑터 인스턴스
 */
export const ocrAdapter = new OCRAdapter();
