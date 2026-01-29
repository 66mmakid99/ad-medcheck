/**
 * 입력 파서 (Parser)
 * HTML/텍스트에서 분석에 필요한 데이터를 추출
 */

import type { ModuleInput } from '../types';

/**
 * 파싱 결과
 */
export interface ParseResult {
  /** 추출된 텍스트 */
  text: string;

  /** 추출된 이미지 URL 목록 */
  images: string[];

  /** 추출된 가격 정보 */
  prices: ExtractedPrice[];

  /** 원본 HTML 여부 */
  wasHtml: boolean;
}

/**
 * 추출된 가격 정보
 */
export interface ExtractedPrice {
  /** 원본 텍스트 */
  original: string;

  /** 파싱된 금액 (원) */
  amount: number;

  /** 텍스트 내 위치 */
  position: number;

  /** 관련 컨텍스트 (주변 텍스트) */
  context?: string;
}

/**
 * HTML 태그 제거 패턴
 */
const HTML_TAG_PATTERN = /<[^>]*>/g;

/**
 * 스크립트/스타일 태그 패턴
 */
const SCRIPT_STYLE_PATTERN = /<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * HTML 엔티티 매핑
 */
const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&copy;': '©',
  '&reg;': '®',
  '&trade;': '™',
  '&ndash;': '–',
  '&mdash;': '—',
  '&lsquo;': '\u2018',
  '&rsquo;': '\u2019',
  '&ldquo;': '\u201C',
  '&rdquo;': '\u201D',
  '&bull;': '•',
  '&middot;': '·',
  '&hellip;': '…',
};

/**
 * 이미지 URL 추출 패턴
 */
const IMG_SRC_PATTERN = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

/**
 * 배경 이미지 URL 추출 패턴
 */
const BG_IMAGE_PATTERN = /url\(["']?([^"')]+)["']?\)/gi;

/**
 * 가격 패턴 (한국 원화)
 */
const PRICE_PATTERNS = [
  // 숫자 + 원/만원/천원
  /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(원|만\s*원|천\s*원)/g,
  // 숫자만 + 원 (100000원)
  /(\d{4,})\s*원/g,
  // ~만원, ~천원 형식
  /(\d+(?:\.\d+)?)\s*(만|천)\s*원/g,
  // 가격: 숫자 형식
  /(?:가격|비용|요금|금액)\s*[:\s]\s*(\d{1,3}(?:,\d{3})*)/g,
];

/**
 * 입력 파서 클래스
 */
export class Parser {
  /**
   * ModuleInput에서 텍스트와 메타데이터 파싱
   */
  parse(input: ModuleInput): ParseResult {
    const content = input.content || '';
    const wasHtml = this.isHtml(content);

    // 텍스트 추출
    const text = wasHtml ? this.extractTextFromHtml(content) : content;

    // 이미지 URL 추출
    const htmlImages = wasHtml ? this.extractImagesFromHtml(content) : [];
    const inputImages = input.images || [];
    const images = [...new Set([...inputImages, ...htmlImages])];

    // 가격 정보 추출
    const prices = this.extractPrices(text);

    return {
      text,
      images,
      prices,
      wasHtml,
    };
  }

  /**
   * HTML 여부 판단
   */
  private isHtml(content: string): boolean {
    // 기본 HTML 태그 존재 여부 확인
    return /<[a-z][\s\S]*>/i.test(content);
  }

  /**
   * HTML에서 텍스트 추출
   */
  extractTextFromHtml(html: string): string {
    let text = html;

    // 1. 스크립트, 스타일 태그 제거
    text = text.replace(SCRIPT_STYLE_PATTERN, '');

    // 2. 주석 제거
    text = text.replace(/<!--[\s\S]*?-->/g, '');

    // 3. 블록 요소는 줄바꿈으로 변환
    text = text.replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, '\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');

    // 4. 나머지 태그 제거
    text = text.replace(HTML_TAG_PATTERN, '');

    // 5. HTML 엔티티 디코딩
    text = this.decodeHtmlEntities(text);

    // 6. 숫자 코드 엔티티 디코딩
    text = text.replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(parseInt(code, 10))
    );
    text = text.replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    );

    // 7. 연속 공백/줄바꿈 정리
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n\s*\n/g, '\n\n');
    text = text.trim();

    return text;
  }

  /**
   * HTML 엔티티 디코딩
   */
  private decodeHtmlEntities(text: string): string {
    let result = text;
    for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
      result = result.replace(new RegExp(entity, 'gi'), char);
    }
    return result;
  }

  /**
   * HTML에서 이미지 URL 추출
   */
  extractImagesFromHtml(html: string): string[] {
    const images: string[] = [];

    // img 태그에서 src 추출
    let match: RegExpExecArray | null;
    const imgPattern = new RegExp(IMG_SRC_PATTERN.source, 'gi');
    while ((match = imgPattern.exec(html)) !== null) {
      if (match[1] && this.isValidImageUrl(match[1])) {
        images.push(match[1]);
      }
    }

    // CSS background-image에서 URL 추출
    const bgPattern = new RegExp(BG_IMAGE_PATTERN.source, 'gi');
    while ((match = bgPattern.exec(html)) !== null) {
      if (match[1] && this.isValidImageUrl(match[1])) {
        images.push(match[1]);
      }
    }

    // 중복 제거
    return [...new Set(images)];
  }

  /**
   * 유효한 이미지 URL인지 확인
   */
  private isValidImageUrl(url: string): boolean {
    // data URI 제외
    if (url.startsWith('data:')) return false;

    // 빈 URL 제외
    if (!url.trim()) return false;

    // 이미지 확장자 또는 이미지 서비스 URL 확인
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i;
    const imageServices = /(cloudinary|imgur|unsplash|pexels)/i;

    return imageExtensions.test(url) || imageServices.test(url) || url.includes('/image');
  }

  /**
   * 텍스트에서 가격 정보 추출
   */
  extractPrices(text: string): ExtractedPrice[] {
    const prices: ExtractedPrice[] = [];
    const seen = new Set<string>();

    for (const pattern of PRICE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        const original = match[0];

        // 중복 체크
        const key = `${original}-${match.index}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // 금액 파싱
        const amount = this.parseAmount(match);
        if (amount === null || amount <= 0) continue;

        // 컨텍스트 추출 (앞뒤 30자)
        const start = Math.max(0, match.index - 30);
        const end = Math.min(text.length, match.index + original.length + 30);
        const context = text.slice(start, end).trim();

        prices.push({
          original,
          amount,
          position: match.index,
          context,
        });
      }
    }

    // 위치순 정렬
    return prices.sort((a, b) => a.position - b.position);
  }

  /**
   * 매치 결과에서 금액 파싱
   */
  private parseAmount(match: RegExpExecArray): number | null {
    const fullMatch = match[0];
    const numStr = match[1]?.replace(/,/g, '') || '';

    if (!numStr) return null;

    let amount = parseFloat(numStr);

    // 단위 처리
    if (/만\s*원/.test(fullMatch)) {
      amount *= 10000;
    } else if (/천\s*원/.test(fullMatch)) {
      amount *= 1000;
    }

    return isNaN(amount) ? null : amount;
  }
}

/**
 * 기본 파서 인스턴스
 */
export const parser = new Parser();
