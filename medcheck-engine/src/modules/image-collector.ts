/**
 * 이미지 수집기
 * 웹페이지에서 분석 대상 이미지 URL 수집 및 필터링
 */

// ============================================
// 타입 정의
// ============================================

/**
 * 이미지 수집 설정
 */
export interface ImageCollectorConfig {
  /** 최소 이미지 크기 (픽셀) */
  minWidth?: number;
  minHeight?: number;
  /** 최대 수집 이미지 수 */
  maxImages?: number;
  /** 제외할 이미지 패턴 */
  excludePatterns?: RegExp[];
  /** 포함할 이미지 확장자 */
  allowedExtensions?: string[];
  /** 이미지 URL 필터 함수 */
  customFilter?: (url: string) => boolean;
  /** 타임아웃 (ms) */
  timeout?: number;
}

/**
 * 수집된 이미지 정보
 */
export interface CollectedImage {
  /** 이미지 URL */
  url: string;
  /** 추정 너비 (있는 경우) */
  width?: number;
  /** 추정 높이 (있는 경우) */
  height?: number;
  /** alt 텍스트 */
  alt?: string;
  /** 출처 (img, background, og:image 등) */
  source: 'img' | 'background' | 'meta' | 'link' | 'srcset';
  /** 상대적 중요도 점수 */
  importanceScore: number;
  /** 가격 관련 이미지 추정 여부 */
  likelyPriceImage: boolean;
}

/**
 * 이미지 수집 결과
 */
export interface ImageCollectionResult {
  /** 수집된 이미지 목록 */
  images: CollectedImage[];
  /** 전체 발견 이미지 수 */
  totalFound: number;
  /** 필터링 후 이미지 수 */
  filteredCount: number;
  /** 수집 소요 시간 (ms) */
  processingTimeMs: number;
  /** 오류 메시지 */
  errors?: string[];
}

// ============================================
// 기본 설정
// ============================================

const DEFAULT_CONFIG: Required<ImageCollectorConfig> = {
  minWidth: 100,
  minHeight: 100,
  maxImages: 20,
  excludePatterns: [
    /icon/i,
    /logo/i,
    /favicon/i,
    /avatar/i,
    /profile/i,
    /emoji/i,
    /badge/i,
    /button/i,
    /arrow/i,
    /spinner/i,
    /loading/i,
    /placeholder/i,
    /blank/i,
    /spacer/i,
    /pixel\.gif/i,
    /1x1/i,
    /tracking/i,
    /analytics/i,
    /ad_/i,
    /ads_/i,
    /banner_ad/i,
    /social-icon/i,
    /share-/i,
    /kakao.*icon/i,
    /naver.*icon/i,
    /facebook.*icon/i,
    /instagram.*icon/i,
    /youtube.*icon/i,
    /twitter.*icon/i,
  ],
  allowedExtensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'],
  customFilter: () => true,
  timeout: 10000,
};

// ============================================
// 가격 관련 이미지 감지 패턴
// ============================================

const PRICE_IMAGE_PATTERNS = [
  /price/i,
  /menu/i,
  /가격/,
  /수가/,
  /비용/,
  /이벤트/,
  /event/i,
  /할인/,
  /프로모션/,
  /promotion/i,
  /특가/,
  /sale/i,
  /discount/i,
  /시술/,
  /treatment/i,
  /패키지/,
  /package/i,
  /시술표/,
  /안내/,
];

// ============================================
// 이미지 수집기 클래스
// ============================================

/**
 * 이미지 수집기
 * HTML에서 이미지 URL 추출 및 필터링
 */
export class ImageCollector {
  private config: Required<ImageCollectorConfig>;

  constructor(config: ImageCollectorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * URL에서 이미지 수집
   */
  async collectFromUrl(pageUrl: string): Promise<ImageCollectionResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      // 페이지 HTML 가져오기
      const response = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MedCheck-ImageCollector/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(this.config.timeout),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      return this.collectFromHtml(html, pageUrl);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return {
        images: [],
        totalFound: 0,
        filteredCount: 0,
        processingTimeMs: Date.now() - startTime,
        errors,
      };
    }
  }

  /**
   * HTML 문자열에서 이미지 수집
   */
  collectFromHtml(html: string, baseUrl: string): ImageCollectionResult {
    const startTime = Date.now();
    const allImages: CollectedImage[] = [];
    const errors: string[] = [];

    try {
      // 1. <img> 태그에서 수집
      const imgImages = this.extractImgTags(html, baseUrl);
      allImages.push(...imgImages);

      // 2. background-image 스타일에서 수집
      const bgImages = this.extractBackgroundImages(html, baseUrl);
      allImages.push(...bgImages);

      // 3. Open Graph / meta 이미지에서 수집
      const metaImages = this.extractMetaImages(html, baseUrl);
      allImages.push(...metaImages);

      // 4. srcset에서 수집
      const srcsetImages = this.extractSrcsetImages(html, baseUrl);
      allImages.push(...srcsetImages);

      // 중복 제거
      const uniqueImages = this.deduplicateImages(allImages);
      const totalFound = uniqueImages.length;

      // 필터링
      const filteredImages = this.filterImages(uniqueImages);

      // 중요도순 정렬
      filteredImages.sort((a, b) => b.importanceScore - a.importanceScore);

      // 최대 수 제한
      const limitedImages = filteredImages.slice(0, this.config.maxImages);

      return {
        images: limitedImages,
        totalFound,
        filteredCount: limitedImages.length,
        processingTimeMs: Date.now() - startTime,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return {
        images: [],
        totalFound: 0,
        filteredCount: 0,
        processingTimeMs: Date.now() - startTime,
        errors,
      };
    }
  }

  /**
   * <img> 태그에서 이미지 추출
   */
  private extractImgTags(html: string, baseUrl: string): CollectedImage[] {
    const images: CollectedImage[] = [];
    const imgRegex = /<img[^>]*>/gi;
    let match: RegExpExecArray | null;

    while ((match = imgRegex.exec(html)) !== null) {
      const imgTag = match[0];

      // src 속성 추출
      const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
      if (!srcMatch) continue;

      const src = srcMatch[1];
      const url = this.resolveUrl(src, baseUrl);
      if (!url) continue;

      // 크기 추출
      const widthMatch = imgTag.match(/width=["']?(\d+)/i);
      const heightMatch = imgTag.match(/height=["']?(\d+)/i);

      // alt 추출
      const altMatch = imgTag.match(/alt=["']([^"']*)["']/i);

      // 중요도 계산
      const importanceScore = this.calculateImportance(url, imgTag, 'img');

      images.push({
        url,
        width: widthMatch ? parseInt(widthMatch[1], 10) : undefined,
        height: heightMatch ? parseInt(heightMatch[1], 10) : undefined,
        alt: altMatch ? altMatch[1] : undefined,
        source: 'img',
        importanceScore,
        likelyPriceImage: this.isPriceRelated(url, altMatch?.[1] || ''),
      });
    }

    return images;
  }

  /**
   * background-image 스타일에서 이미지 추출
   */
  private extractBackgroundImages(html: string, baseUrl: string): CollectedImage[] {
    const images: CollectedImage[] = [];
    const bgRegex = /background(?:-image)?:\s*url\(["']?([^"')]+)["']?\)/gi;
    let match: RegExpExecArray | null;

    while ((match = bgRegex.exec(html)) !== null) {
      const src = match[1];
      const url = this.resolveUrl(src, baseUrl);
      if (!url) continue;

      images.push({
        url,
        source: 'background',
        importanceScore: this.calculateImportance(url, '', 'background'),
        likelyPriceImage: this.isPriceRelated(url, ''),
      });
    }

    return images;
  }

  /**
   * meta 태그에서 이미지 추출 (Open Graph 등)
   */
  private extractMetaImages(html: string, baseUrl: string): CollectedImage[] {
    const images: CollectedImage[] = [];

    // og:image
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);

    if (ogImageMatch) {
      const url = this.resolveUrl(ogImageMatch[1], baseUrl);
      if (url) {
        images.push({
          url,
          source: 'meta',
          importanceScore: 90, // OG 이미지는 높은 중요도
          likelyPriceImage: this.isPriceRelated(url, ''),
        });
      }
    }

    // twitter:image
    const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);

    if (twitterImageMatch) {
      const url = this.resolveUrl(twitterImageMatch[1], baseUrl);
      if (url) {
        images.push({
          url,
          source: 'meta',
          importanceScore: 85,
          likelyPriceImage: this.isPriceRelated(url, ''),
        });
      }
    }

    return images;
  }

  /**
   * srcset에서 이미지 추출
   */
  private extractSrcsetImages(html: string, baseUrl: string): CollectedImage[] {
    const images: CollectedImage[] = [];
    const srcsetRegex = /srcset=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;

    while ((match = srcsetRegex.exec(html)) !== null) {
      const srcset = match[1];
      // srcset 파싱: "image1.jpg 1x, image2.jpg 2x" 또는 "image1.jpg 300w, image2.jpg 600w"
      const parts = srcset.split(',').map(s => s.trim());

      for (const part of parts) {
        const [src] = part.split(/\s+/);
        if (!src) continue;

        const url = this.resolveUrl(src, baseUrl);
        if (!url) continue;

        // 중복 체크 (이미 img로 수집되었을 수 있음)
        if (!images.some(img => img.url === url)) {
          images.push({
            url,
            source: 'srcset',
            importanceScore: this.calculateImportance(url, '', 'srcset'),
            likelyPriceImage: this.isPriceRelated(url, ''),
          });
        }
      }
    }

    return images;
  }

  /**
   * 상대 URL을 절대 URL로 변환
   */
  private resolveUrl(src: string, baseUrl: string): string | null {
    try {
      // 데이터 URL 제외
      if (src.startsWith('data:')) return null;

      // 이미 절대 URL인 경우
      if (src.startsWith('http://') || src.startsWith('https://')) {
        return src;
      }

      // 프로토콜 상대 URL
      if (src.startsWith('//')) {
        const baseProtocol = new URL(baseUrl).protocol;
        return `${baseProtocol}${src}`;
      }

      // 상대 URL 처리
      const base = new URL(baseUrl);
      return new URL(src, base).href;
    } catch {
      return null;
    }
  }

  /**
   * 이미지 중요도 계산
   */
  private calculateImportance(
    url: string,
    context: string,
    source: CollectedImage['source']
  ): number {
    let score = 50; // 기본 점수

    // 소스별 기본 점수
    switch (source) {
      case 'meta':
        score += 40;
        break;
      case 'img':
        score += 20;
        break;
      case 'srcset':
        score += 10;
        break;
      case 'background':
        score += 5;
        break;
    }

    // 가격 관련 키워드
    if (this.isPriceRelated(url, context)) {
      score += 30;
    }

    // 파일명에 숫자가 많으면 가격표일 가능성
    const numericMatches = url.match(/\d+/g);
    if (numericMatches && numericMatches.length > 2) {
      score += 5;
    }

    // 큰 이미지 선호 (URL에 크기 힌트가 있는 경우)
    if (/\d{3,4}x\d{3,4}/.test(url) || /large|full|original/i.test(url)) {
      score += 15;
    }

    // 작은 이미지 감점
    if (/thumb|small|tiny|mini/i.test(url)) {
      score -= 20;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 가격 관련 이미지인지 확인
   */
  private isPriceRelated(url: string, context: string): boolean {
    const combined = `${url} ${context}`.toLowerCase();
    return PRICE_IMAGE_PATTERNS.some(pattern => pattern.test(combined));
  }

  /**
   * 이미지 필터링
   */
  private filterImages(images: CollectedImage[]): CollectedImage[] {
    return images.filter(img => {
      // 확장자 검사
      const ext = this.getExtension(img.url);
      if (ext && !this.config.allowedExtensions.includes(ext.toLowerCase())) {
        return false;
      }

      // 크기 검사 (정보가 있는 경우)
      if (img.width && img.width < this.config.minWidth) {
        return false;
      }
      if (img.height && img.height < this.config.minHeight) {
        return false;
      }

      // 제외 패턴 검사
      for (const pattern of this.config.excludePatterns) {
        if (pattern.test(img.url) || (img.alt && pattern.test(img.alt))) {
          return false;
        }
      }

      // 커스텀 필터
      if (!this.config.customFilter(img.url)) {
        return false;
      }

      return true;
    });
  }

  /**
   * 중복 이미지 제거
   */
  private deduplicateImages(images: CollectedImage[]): CollectedImage[] {
    const seen = new Map<string, CollectedImage>();

    for (const img of images) {
      const normalizedUrl = this.normalizeUrl(img.url);
      const existing = seen.get(normalizedUrl);

      if (!existing || img.importanceScore > existing.importanceScore) {
        seen.set(normalizedUrl, img);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * URL 정규화 (중복 비교용)
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // 쿼리 파라미터 제거 (크기 변환 파라미터 등)
      parsed.search = '';
      return parsed.href.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  /**
   * 확장자 추출
   */
  private getExtension(url: string): string | null {
    try {
      const pathname = new URL(url).pathname;
      const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * 가격 관련 이미지만 추출
   */
  getPriceRelatedImages(result: ImageCollectionResult): CollectedImage[] {
    return result.images.filter(img => img.likelyPriceImage);
  }

  /**
   * 이미지 URL 목록만 추출
   */
  getImageUrls(result: ImageCollectionResult): string[] {
    return result.images.map(img => img.url);
  }

  /**
   * 설정 업데이트
   */
  updateConfig(config: Partial<ImageCollectorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================
// 편의 함수
// ============================================

/**
 * 기본 이미지 수집기 인스턴스
 */
export const imageCollector = new ImageCollector();

/**
 * URL에서 이미지 수집 (단축 함수)
 */
export async function collectImagesFromUrl(
  url: string,
  config?: ImageCollectorConfig
): Promise<ImageCollectionResult> {
  const collector = config ? new ImageCollector(config) : imageCollector;
  return collector.collectFromUrl(url);
}

/**
 * HTML에서 이미지 수집 (단축 함수)
 */
export function collectImagesFromHtml(
  html: string,
  baseUrl: string,
  config?: ImageCollectorConfig
): ImageCollectionResult {
  const collector = config ? new ImageCollector(config) : imageCollector;
  return collector.collectFromHtml(html, baseUrl);
}

/**
 * 이미지 URL 목록만 빠르게 추출
 */
export async function getImageUrlsFromPage(
  url: string,
  maxImages: number = 20
): Promise<string[]> {
  const collector = new ImageCollector({ maxImages });
  const result = await collector.collectFromUrl(url);
  return collector.getImageUrls(result);
}
