/**
 * SCV 크롤러 어댑터
 * SCV(Smart Crawler for Violations) 크롤링 결과를 ModuleInput 형식으로 변환
 */

import type { ModuleInput } from '../types';

// ============================================
// SCV 크롤러 인터페이스 정의
// ============================================

/**
 * SCV 크롤링 결과 (SCV 모듈에서 제공하는 형식)
 */
export interface SCVCrawlResult {
  /** 크롤링 대상 URL */
  url: string;

  /** 크롤링된 HTML 원본 */
  html: string;

  /** 페이지 제목 */
  title?: string;

  /** 페이지 설명 (meta description) */
  description?: string;

  /** 이미지 URL 목록 */
  images?: string[];

  /** 크롤링 시간 */
  crawledAt: Date;

  /** 응답 상태 코드 */
  statusCode?: number;

  /** 추가 메타데이터 */
  metadata?: SCVMetadata;
}

/**
 * SCV 메타데이터
 */
export interface SCVMetadata {
  /** 의료기관명 (파싱된 경우) */
  hospitalName?: string;

  /** 진료과목 */
  department?: string;

  /** 주소 */
  address?: string;

  /** 전화번호 */
  phone?: string;

  /** 광고 유형 */
  adType?: 'blog' | 'sns' | 'website' | 'cafe' | 'news' | 'other';

  /** 플랫폼 */
  platform?: string;

  /** 작성자/게시자 */
  author?: string;

  /** 게시 날짜 */
  publishedAt?: Date;

  /** 기타 */
  [key: string]: unknown;
}

/**
 * SCV 크롤러 클라이언트 인터페이스
 * 실제 SCV 모듈 구현체가 이 인터페이스를 따라야 함
 */
export interface ISCVClient {
  /**
   * 단일 URL 크롤링
   */
  crawl(url: string): Promise<SCVCrawlResult>;

  /**
   * 여러 URL 일괄 크롤링
   */
  crawlBatch(urls: string[]): Promise<SCVCrawlResult[]>;

  /**
   * 검색 결과 크롤링
   */
  crawlSearch?(query: string, options?: SCVSearchOptions): Promise<SCVCrawlResult[]>;
}

/**
 * SCV 검색 옵션
 */
export interface SCVSearchOptions {
  /** 검색 엔진 */
  engine?: 'google' | 'naver' | 'daum';

  /** 최대 결과 수 */
  maxResults?: number;

  /** 날짜 필터 */
  dateRange?: {
    from?: Date;
    to?: Date;
  };
}

// ============================================
// SCV 어댑터 구현
// ============================================

/**
 * 어댑터 설정
 */
export interface SCVAdapterConfig {
  /** HTML 파서 사용 여부 */
  parseHtml?: boolean;

  /** 이미지 필터링 */
  filterImages?: boolean;

  /** 최소 이미지 크기 (bytes) */
  minImageSize?: number;

  /** 제외할 이미지 도메인 */
  excludeImageDomains?: string[];
}

/**
 * 기본 어댑터 설정
 */
const DEFAULT_CONFIG: SCVAdapterConfig = {
  parseHtml: true,
  filterImages: true,
  minImageSize: 1000,
  excludeImageDomains: [
    'googleadservices.com',
    'doubleclick.net',
    'facebook.com/tr',
    'analytics',
  ],
};

/**
 * SCV 크롤러 어댑터 클래스
 */
export class SCVAdapter {
  private client: ISCVClient | null = null;
  private config: SCVAdapterConfig;

  constructor(config: SCVAdapterConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * SCV 클라이언트 설정
   */
  setClient(client: ISCVClient): void {
    this.client = client;
  }

  /**
   * SCV 클라이언트 반환
   */
  getClient(): ISCVClient | null {
    return this.client;
  }

  /**
   * SCV 크롤링 결과 → ModuleInput 변환
   */
  toModuleInput(result: SCVCrawlResult): ModuleInput {
    // 이미지 필터링
    const images = this.config.filterImages
      ? this.filterImages(result.images || [])
      : result.images;

    // 광고 유형 매핑
    const adType = this.mapAdType(result.metadata?.adType, result.url);

    return {
      source: result.url,
      content: result.html,
      images,
      collectedAt: result.crawledAt,
      metadata: {
        hospitalName: result.metadata?.hospitalName,
        department: result.metadata?.department,
        adType,
        // SCV 메타데이터 추가
        title: result.title,
        description: result.description,
        platform: result.metadata?.platform,
        author: result.metadata?.author,
        publishedAt: result.metadata?.publishedAt,
        address: result.metadata?.address,
        phone: result.metadata?.phone,
        statusCode: result.statusCode,
      },
    };
  }

  /**
   * 여러 크롤링 결과 일괄 변환
   */
  toModuleInputBatch(results: SCVCrawlResult[]): ModuleInput[] {
    return results.map(result => this.toModuleInput(result));
  }

  /**
   * URL 크롤링 후 ModuleInput 반환
   */
  async fetch(url: string): Promise<ModuleInput> {
    if (!this.client) {
      throw new Error('SCV client not configured. Call setClient() first.');
    }

    const result = await this.client.crawl(url);
    return this.toModuleInput(result);
  }

  /**
   * 여러 URL 일괄 크롤링 후 ModuleInput 반환
   */
  async fetchBatch(urls: string[]): Promise<ModuleInput[]> {
    if (!this.client) {
      throw new Error('SCV client not configured. Call setClient() first.');
    }

    const results = await this.client.crawlBatch(urls);
    return this.toModuleInputBatch(results);
  }

  /**
   * 검색 크롤링 후 ModuleInput 반환
   */
  async search(query: string, options?: SCVSearchOptions): Promise<ModuleInput[]> {
    if (!this.client) {
      throw new Error('SCV client not configured. Call setClient() first.');
    }

    if (!this.client.crawlSearch) {
      throw new Error('SCV client does not support search crawling.');
    }

    const results = await this.client.crawlSearch(query, options);
    return this.toModuleInputBatch(results);
  }

  /**
   * 이미지 URL 필터링
   */
  private filterImages(images: string[]): string[] {
    return images.filter(url => {
      // 광고/추적 도메인 제외
      for (const domain of this.config.excludeImageDomains || []) {
        if (url.includes(domain)) {
          return false;
        }
      }

      // data URI 제외
      if (url.startsWith('data:')) {
        return false;
      }

      // 작은 아이콘 제외 (확장자로 추정)
      if (/favicon|icon|logo.*\d{1,2}x\d{1,2}/i.test(url)) {
        return false;
      }

      return true;
    });
  }

  /**
   * 광고 유형 매핑
   */
  private mapAdType(
    scvAdType?: SCVMetadata['adType'],
    url?: string
  ): string {
    if (scvAdType) {
      return scvAdType;
    }

    // URL에서 플랫폼 추론
    if (url) {
      if (url.includes('blog.naver.com')) return 'blog';
      if (url.includes('cafe.naver.com')) return 'cafe';
      if (url.includes('instagram.com')) return 'sns';
      if (url.includes('facebook.com')) return 'sns';
      if (url.includes('youtube.com')) return 'sns';
      if (url.includes('news.')) return 'news';
    }

    return 'website';
  }
}

/**
 * Mock SCV 클라이언트 (테스트/개발용)
 */
export class MockSCVClient implements ISCVClient {
  async crawl(url: string): Promise<SCVCrawlResult> {
    return {
      url,
      html: `<html><body><h1>Mock Page</h1><p>This is a mock crawl result for ${url}</p></body></html>`,
      title: 'Mock Page',
      crawledAt: new Date(),
      statusCode: 200,
      images: [],
      metadata: {
        adType: 'website',
      },
    };
  }

  async crawlBatch(urls: string[]): Promise<SCVCrawlResult[]> {
    return Promise.all(urls.map(url => this.crawl(url)));
  }
}

/**
 * 기본 SCV 어댑터 인스턴스
 */
export const scvAdapter = new SCVAdapter();
