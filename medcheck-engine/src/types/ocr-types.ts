/**
 * OCR 관련 타입 정의
 *
 * OCR 처리는 madmedscv가 담당하지만,
 * 분석 결과 타입은 madmedcheck에서도 참조합니다.
 *
 * TODO: madmedscv와 공유 타입 패키지로 분리 검토
 */

// ============================================
// 이미지 분류 타입
// ============================================

export type ImageClassificationType =
  | 'PRICE_MENU'      // 가격표/메뉴판
  | 'EVENT'           // 이벤트/할인 배너
  | 'PROMOTION'       // 프로모션/특가
  | 'NOTICE'          // 공지사항
  | 'BEFORE_AFTER'    // 전후사진
  | 'REVIEW'          // 후기/체험기
  | 'IRRELEVANT';     // 분석 불필요 (로고, 지도 등)

export interface ImageClassification {
  type: ImageClassificationType;
  confidence: number;
  reason: string;
}

// ============================================
// 가격 추출 타입
// ============================================

export type PriceType =
  | 'FIXED'        // 고정가
  | 'FROM'         // ~부터
  | 'RANGE'        // 범위
  | 'DISCOUNTED'   // 할인가
  | 'NEGOTIABLE';  // 상담 후 결정

export interface ExtractedPrice {
  procedureName: string;
  normalizedProcedure?: string;
  price: number;
  originalPrice?: number;
  discountRate?: number;
  shots?: number;
  area?: string;
  priceType: PriceType;
  originalText: string;
  confidence: number;
  pricePerUnit?: number;
  isPromotion?: boolean;
  hasTimeLimit?: boolean;
  conditions?: string;
}

// ============================================
// 위반 탐지 타입
// ============================================

export interface ImageViolation {
  type: 'BEFORE_AFTER' | 'GUARANTEE' | 'EXAGGERATION' | 'PRICE_INDUCEMENT' | 'TESTIMONIAL' | 'OTHER';
  text: string;
  severity: 'critical' | 'major' | 'minor';
  description: string;
  legalBasis?: string;
  confidence: number;
}

// ============================================
// 시각적 강조 분석 타입
// ============================================

export interface VisualEmphasis {
  hasLargeFont: boolean;
  hasEmphasisColor: boolean;
  hasSpecialEffects: boolean;
  hasDiscountHighlight: boolean;
  hasUrgencyIndicator: boolean;
  emphasisDescription?: string;
}

// ============================================
// 가격 광고 규정 검증
// ============================================

export interface PriceAdValidation {
  isCompliant: boolean;
  violations: Array<{
    ruleCode: string;
    ruleName: string;
    description: string;
    severity: 'critical' | 'major' | 'minor';
  }>;
  summary: string;
}

// ============================================
// OCR 결과 타입
// ============================================

export interface OCRResult {
  imageUrl: string;
  text: string;
  confidence: number;
  language?: string;
  regions?: OCRTextRegion[];
  processingTime?: number;
  error?: string;
  classification?: ImageClassification;
  extractedPrices?: ExtractedPrice[];
  violations?: ImageViolation[];
  visualEmphasis?: VisualEmphasis;
  priceAdValidation?: PriceAdValidation;
}

export interface OCRTextRegion {
  text: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
}

export interface OCROptions {
  language?: string | string[];
  preprocess?: boolean;
  minConfidence?: number;
  timeout?: number;
  extractPrices?: boolean;
  detectViolations?: boolean;
  analyzeVisualEmphasis?: boolean;
  validatePriceAd?: boolean;
}

export interface IOCRClient {
  extract(imageUrl: string, options?: OCROptions): Promise<OCRResult>;
  extractBatch(imageUrls: string[], options?: OCROptions): Promise<OCRResult[]>;
  getSupportedLanguages?(): Promise<string[]>;
}

export interface OCRSummary {
  totalImages: number;
  processedImages: number;
  successfulExtractions: number;
  totalTextLength: number;
  averageConfidence: number;
  totalPricesExtected?: number;
  totalViolationsDetected?: number;
  errors: Array<{ imageUrl: string; error: string }>;
}
