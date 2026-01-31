/**
 * OCR 어댑터
 * Gemini Flash 기반 이미지 텍스트 추출 및 의료광고 분석
 */

import type { ModuleInput } from '../types';

// ============================================
// 이미지 분류 타입 정의
// ============================================

/**
 * 이미지 분류 타입
 */
export type ImageClassificationType =
  | 'PRICE_MENU'      // 가격표/메뉴판
  | 'EVENT'           // 이벤트/할인 배너
  | 'PROMOTION'       // 프로모션/특가
  | 'NOTICE'          // 공지사항
  | 'BEFORE_AFTER'    // 전후사진
  | 'REVIEW'          // 후기/체험기
  | 'IRRELEVANT';     // 분석 불필요 (로고, 지도 등)

/**
 * 이미지 분류 결과
 */
export interface ImageClassification {
  /** 분류 타입 */
  type: ImageClassificationType;
  /** 분류 신뢰도 (0-1) */
  confidence: number;
  /** 분류 사유 */
  reason: string;
}

// ============================================
// 가격 추출 타입 정의
// ============================================

/**
 * 가격 유형
 */
export type PriceType =
  | 'FIXED'        // 고정가 (예: 100,000원)
  | 'FROM'         // ~부터 (예: 50,000원~)
  | 'RANGE'        // 범위 (예: 50,000~100,000원)
  | 'DISCOUNTED'   // 할인가 (정가 대비)
  | 'NEGOTIABLE';  // 상담 후 결정

/**
 * 추출된 가격 정보
 */
export interface ExtractedPrice {
  /** 시술명 (원본) */
  procedureName: string;
  /** 정규화된 시술명 */
  normalizedProcedure?: string;
  /** 가격 (원) */
  price: number;
  /** 원가격 (할인 전, 있는 경우) */
  originalPrice?: number;
  /** 할인율 (%) */
  discountRate?: number;
  /** 샷/회 수 (해당시) */
  shots?: number;
  /** 부위 (해당시) */
  area?: string;
  /** 가격 유형 */
  priceType: PriceType;
  /** 원본 텍스트 */
  originalText: string;
  /** 추출 신뢰도 (0-1) */
  confidence: number;
  /** 단위당 가격 계산값 */
  pricePerUnit?: number;
  /** 이벤트/프로모션 여부 */
  isPromotion?: boolean;
  /** 기간 한정 여부 */
  hasTimeLimit?: boolean;
  /** 조건 텍스트 (예: "첫 방문 한정") */
  conditions?: string;
}

// ============================================
// 위반 탐지 타입 정의
// ============================================

/**
 * 이미지에서 탐지된 위반
 */
export interface ImageViolation {
  /** 위반 유형 */
  type: 'BEFORE_AFTER' | 'GUARANTEE' | 'EXAGGERATION' | 'PRICE_INDUCEMENT' | 'TESTIMONIAL' | 'OTHER';
  /** 관련 텍스트 */
  text: string;
  /** 심각도 */
  severity: 'critical' | 'major' | 'minor';
  /** 위반 설명 */
  description: string;
  /** 법적 근거 */
  legalBasis?: string;
  /** 신뢰도 */
  confidence: number;
}

// ============================================
// 시각적 강조 분석 타입
// ============================================

/**
 * 시각적 강조 요소 분석
 */
export interface VisualEmphasis {
  /** 큰 폰트 사용 여부 */
  hasLargeFont: boolean;
  /** 강조 색상 사용 여부 (빨강, 노랑 등) */
  hasEmphasisColor: boolean;
  /** 특수 효과 사용 여부 (번쩍임, 폭발 효과 등) */
  hasSpecialEffects: boolean;
  /** 할인 강조 표시 여부 */
  hasDiscountHighlight: boolean;
  /** 긴급성 표시 여부 ("한정", "마감임박" 등) */
  hasUrgencyIndicator: boolean;
  /** 강조 요소 설명 */
  emphasisDescription?: string;
}

// ============================================
// 가격 광고 규정 검증 결과
// ============================================

/**
 * 가격 광고 규정 검증 결과
 */
export interface PriceAdValidation {
  /** 규정 준수 여부 */
  isCompliant: boolean;
  /** 위반 항목들 */
  violations: Array<{
    /** 규정 코드 */
    ruleCode: string;
    /** 규정 설명 */
    ruleName: string;
    /** 위반 내용 */
    description: string;
    /** 심각도 */
    severity: 'critical' | 'major' | 'minor';
  }>;
  /** 검증 요약 */
  summary: string;
}

// ============================================
// OCR 기본 인터페이스
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
  /** 이미지 분류 결과 */
  classification?: ImageClassification;
  /** 추출된 가격 정보 */
  extractedPrices?: ExtractedPrice[];
  /** 탐지된 위반 */
  violations?: ImageViolation[];
  /** 시각적 강조 분석 */
  visualEmphasis?: VisualEmphasis;
  /** 가격 광고 규정 검증 */
  priceAdValidation?: PriceAdValidation;
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
  /** 가격 추출 활성화 */
  extractPrices?: boolean;
  /** 위반 탐지 활성화 */
  detectViolations?: boolean;
  /** 시각적 강조 분석 활성화 */
  analyzeVisualEmphasis?: boolean;
  /** 가격 광고 규정 검증 활성화 */
  validatePriceAd?: boolean;
}

/**
 * OCR 클라이언트 인터페이스
 */
export interface IOCRClient {
  /** 단일 이미지 OCR */
  extract(imageUrl: string, options?: OCROptions): Promise<OCRResult>;
  /** 여러 이미지 일괄 OCR */
  extractBatch(imageUrls: string[], options?: OCROptions): Promise<OCRResult[]>;
  /** 지원 언어 목록 */
  getSupportedLanguages?(): Promise<string[]>;
}

// ============================================
// Gemini Flash OCR 클라이언트
// ============================================

/**
 * Gemini Flash API 응답 타입
 */
interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

/**
 * Gemini Flash 분석 결과 (파싱된 JSON)
 */
interface GeminiAnalysisResult {
  classification: {
    type: ImageClassificationType;
    confidence: number;
    reason: string;
  };
  extractedText: string;
  textConfidence: number;
  prices?: Array<{
    procedureName: string;
    price: number;
    originalPrice?: number;
    discountRate?: number;
    shots?: number;
    area?: string;
    priceType: string;
    originalText: string;
    confidence: number;
    isPromotion?: boolean;
    hasTimeLimit?: boolean;
    conditions?: string;
  }>;
  violations?: Array<{
    type: string;
    text: string;
    severity: string;
    description: string;
    legalBasis?: string;
    confidence: number;
  }>;
  visualEmphasis?: {
    hasLargeFont: boolean;
    hasEmphasisColor: boolean;
    hasSpecialEffects: boolean;
    hasDiscountHighlight: boolean;
    hasUrgencyIndicator: boolean;
    emphasisDescription?: string;
  };
}

/**
 * Gemini Flash OCR 클라이언트 설정
 */
export interface GeminiFlashConfig {
  /** API 키 */
  apiKey: string;
  /** 모델 이름 (기본: gemini-1.5-flash) */
  model?: string;
  /** 최대 출력 토큰 */
  maxOutputTokens?: number;
  /** Temperature */
  temperature?: number;
}

/**
 * Gemini Flash 기반 OCR 클라이언트
 * Vision + LLM 통합으로 텍스트 추출, 분류, 가격 파싱, 위반 탐지 수행
 */
export class GeminiFlashOCRClient implements IOCRClient {
  private apiKey: string;
  private model: string;
  private maxOutputTokens: number;
  private temperature: number;
  private baseUrl: string;

  constructor(config: GeminiFlashConfig) {
    if (!config.apiKey) {
      throw new Error('Gemini API key is required');
    }
    this.apiKey = config.apiKey;
    this.model = config.model || 'gemini-1.5-flash';
    this.maxOutputTokens = config.maxOutputTokens || 2048;
    this.temperature = config.temperature || 0.1;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
  }

  /**
   * 이미지를 Base64로 변환 (URL에서 가져오기)
   */
  private async fetchImageAsBase64(imageUrl: string): Promise<{ data: string; mimeType: string }> {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Base64 인코딩
      let binary = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64 = btoa(binary);

      return {
        data: base64,
        mimeType: contentType,
      };
    } catch (error) {
      throw new Error(`Image fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 분석용 프롬프트 생성
   */
  private buildPrompt(options?: OCROptions): string {
    const extractPrices = options?.extractPrices !== false;
    const detectViolations = options?.detectViolations !== false;
    const analyzeVisual = options?.analyzeVisualEmphasis !== false;

    return `당신은 한국 의료광고 분석 전문가입니다. 이 이미지를 분석하고 다음 JSON 형식으로 정확히 응답하세요.

## 분석 지침

### 1. 이미지 분류 (classification)
다음 중 하나로 분류:
- PRICE_MENU: 시술 가격표, 메뉴판, 가격 리스트
- EVENT: 이벤트, 할인 배너, 기간 한정 행사
- PROMOTION: 프로모션, 특가, 패키지 상품
- NOTICE: 공지사항, 안내문
- BEFORE_AFTER: 시술 전후 비교 사진
- REVIEW: 환자 후기, 체험담
- IRRELEVANT: 분석 불필요 (로고, 지도, 의료진 사진만 있는 경우)

### 2. 텍스트 추출 (extractedText)
- 이미지에서 모든 텍스트를 추출
- 작은 글씨, 조건 텍스트도 반드시 포함
- 줄바꿈은 \\n으로 표시

### 3. 가격 정보 추출 (prices) ${extractPrices ? '- 필수' : '- 생략'}
${extractPrices ? `가격 관련 정보가 있으면 추출:
- procedureName: 시술명 (원본 그대로)
- price: 가격 (숫자만, 원 단위)
- originalPrice: 할인 전 원가 (있는 경우)
- discountRate: 할인율 % (있는 경우)
- shots: 샷/회 수 (예: 100샷 → 100)
- area: 부위 (예: 전체얼굴, 팔자, 눈가)
- priceType: FIXED(고정가), FROM(~부터), RANGE(범위), DISCOUNTED(할인가), NEGOTIABLE(상담)
- originalText: 원본 가격 텍스트
- confidence: 추출 신뢰도 (0-1)
- isPromotion: 프로모션 여부
- hasTimeLimit: 기간 한정 여부
- conditions: 조건 텍스트 (예: "첫 방문 한정", "VAT 별도")` : ''}

### 4. 위반 탐지 (violations) ${detectViolations ? '- 필수' : '- 생략'}
${detectViolations ? `의료광고 위반 사항 탐지:
- type: BEFORE_AFTER(전후사진), GUARANTEE(효과보장), EXAGGERATION(과장), PRICE_INDUCEMENT(환자유인), TESTIMONIAL(체험기), OTHER
- text: 위반 관련 텍스트
- severity: critical(심각), major(중요), minor(경미)
- description: 위반 설명
- legalBasis: 관련 법조항 (예: 의료법 제56조)
- confidence: 탐지 신뢰도 (0-1)

주요 위반 기준:
- 전후사진: 시술 전후 비교 사진 게시 (의료법 제56조 제2항 제5호)
- 효과보장: "100% 완치", "반드시 효과" 등 (의료법 제56조 제2항 제3호)
- 과장광고: "최고", "최초", "유일" 등 최상급 표현 (의료법 제56조 제2항 제1호)
- 환자유인: 과도한 할인, 무료 시술 등 (의료법 제27조 제3항)
- 체험기: 환자 후기, 체험담 게시 (의료법 제56조 제2항 제6호)` : ''}

### 5. 시각적 강조 분석 (visualEmphasis) ${analyzeVisual ? '- 필수' : '- 생략'}
${analyzeVisual ? `광고의 시각적 강조 요소 분석:
- hasLargeFont: 큰 폰트로 가격/할인 강조
- hasEmphasisColor: 빨강, 노랑 등 강조 색상 사용
- hasSpecialEffects: 번쩍임, 폭발 효과 등
- hasDiscountHighlight: 할인율/할인가 특별 강조
- hasUrgencyIndicator: "한정", "마감임박", "오늘만" 등 긴급성 표시
- emphasisDescription: 강조 요소 설명` : ''}

## 응답 형식 (반드시 이 JSON 형식으로만 응답)
\`\`\`json
{
  "classification": {
    "type": "PRICE_MENU",
    "confidence": 0.95,
    "reason": "시술별 가격이 나열된 가격표 형태"
  },
  "extractedText": "추출된 텍스트...",
  "textConfidence": 0.9,
  "prices": [...],
  "violations": [...],
  "visualEmphasis": {...}
}
\`\`\`

이미지에 해당 정보가 없으면 빈 배열 [] 또는 null로 응답하세요.
JSON만 응답하고 다른 설명은 하지 마세요.`;
  }

  /**
   * Gemini API 호출
   */
  private async callGeminiAPI(
    imageBase64: string,
    mimeType: string,
    options?: OCROptions
  ): Promise<GeminiAnalysisResult> {
    const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: this.buildPrompt(options),
            },
            {
              inline_data: {
                mime_type: mimeType,
                data: imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: this.temperature,
        maxOutputTokens: this.maxOutputTokens,
        responseMimeType: 'application/json',
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data: GeminiResponse = await response.json();

    if (data.error) {
      throw new Error(`Gemini API error: ${data.error.message}`);
    }

    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) {
      throw new Error('No response content from Gemini API');
    }

    // JSON 파싱 (```json ... ``` 형태 처리)
    let jsonStr = textContent.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    }
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    try {
      return JSON.parse(jsonStr);
    } catch (parseError) {
      throw new Error(`Failed to parse Gemini response as JSON: ${jsonStr.substring(0, 200)}`);
    }
  }

  /**
   * 단일 이미지 OCR 및 분석
   */
  async extract(imageUrl: string, options?: OCROptions): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      // 이미지 가져오기 및 Base64 변환
      const { data: imageBase64, mimeType } = await this.fetchImageAsBase64(imageUrl);

      // Gemini API 호출
      const analysis = await this.callGeminiAPI(imageBase64, mimeType, options);

      // 결과 변환
      const result: OCRResult = {
        imageUrl,
        text: analysis.extractedText || '',
        confidence: analysis.textConfidence || 0.8,
        language: 'ko',
        processingTime: Date.now() - startTime,
        classification: analysis.classification ? {
          type: analysis.classification.type,
          confidence: analysis.classification.confidence,
          reason: analysis.classification.reason,
        } : undefined,
        extractedPrices: analysis.prices?.map(p => ({
          procedureName: p.procedureName,
          price: p.price,
          originalPrice: p.originalPrice,
          discountRate: p.discountRate,
          shots: p.shots,
          area: p.area,
          priceType: p.priceType as PriceType,
          originalText: p.originalText,
          confidence: p.confidence,
          isPromotion: p.isPromotion,
          hasTimeLimit: p.hasTimeLimit,
          conditions: p.conditions,
          pricePerUnit: p.shots && p.shots > 0 ? Math.round(p.price / p.shots) : undefined,
        })),
        violations: analysis.violations?.map(v => ({
          type: v.type as ImageViolation['type'],
          text: v.text,
          severity: v.severity as ImageViolation['severity'],
          description: v.description,
          legalBasis: v.legalBasis,
          confidence: v.confidence,
        })),
        visualEmphasis: analysis.visualEmphasis,
      };

      return result;
    } catch (error) {
      return {
        imageUrl,
        text: '',
        confidence: 0,
        processingTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 여러 이미지 일괄 OCR
   */
  async extractBatch(imageUrls: string[], options?: OCROptions): Promise<OCRResult[]> {
    // 순차 처리 (API 속도 제한 고려)
    const results: OCRResult[] = [];
    for (const url of imageUrls) {
      const result = await this.extract(url, options);
      results.push(result);
      // API 호출 간 짧은 딜레이
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return results;
  }

  /**
   * 지원 언어 목록
   */
  async getSupportedLanguages(): Promise<string[]> {
    return ['ko', 'en', 'ja', 'zh'];
  }
}

// ============================================
// OCR 어댑터 설정
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

// ============================================
// OCR 어댑터 클래스
// ============================================

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
   * Gemini Flash 클라이언트 설정 (편의 메서드)
   */
  configureGeminiFlash(apiKey: string, options?: Partial<GeminiFlashConfig>): void {
    this.client = new GeminiFlashOCRClient({
      apiKey,
      ...options,
    });
  }

  /**
   * 단일 이미지 OCR 수행
   */
  async extractText(imageUrl: string, options?: OCROptions): Promise<OCRResult> {
    if (!this.client) {
      throw new Error('OCR client not configured. Call setClient() or configureGeminiFlash() first.');
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
      throw new Error('OCR client not configured. Call setClient() or configureGeminiFlash() first.');
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
   * 분석 대상 이미지만 필터링 (IRRELEVANT 제외)
   */
  filterRelevantImages(results: OCRResult[]): OCRResult[] {
    return results.filter(
      r => !r.error && r.classification?.type !== 'IRRELEVANT'
    );
  }

  /**
   * 가격 포함 이미지만 필터링
   */
  filterPriceImages(results: OCRResult[]): OCRResult[] {
    return results.filter(
      r => !r.error &&
           (r.classification?.type === 'PRICE_MENU' ||
            r.classification?.type === 'EVENT' ||
            r.classification?.type === 'PROMOTION') &&
           r.extractedPrices &&
           r.extractedPrices.length > 0
    );
  }

  /**
   * 위반 탐지된 이미지만 필터링
   */
  filterViolationImages(results: OCRResult[]): OCRResult[] {
    return results.filter(
      r => !r.error && r.violations && r.violations.length > 0
    );
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

    // 추출된 가격 정보 수집
    const allPrices: ExtractedPrice[] = [];
    const allViolations: ImageViolation[] = [];

    for (const result of successfulResults) {
      if (result.extractedPrices) {
        allPrices.push(...result.extractedPrices);
      }
      if (result.violations) {
        allViolations.push(...result.violations);
      }
    }

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
        extractedPrices: allPrices.length > 0 ? allPrices : undefined,
        imageViolations: allViolations.length > 0 ? allViolations : undefined,
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

    // 분류별 집계
    const classificationCounts: Record<string, number> = {};
    let totalPrices = 0;
    let totalViolations = 0;

    for (const result of successful) {
      if (result.classification) {
        const type = result.classification.type;
        classificationCounts[type] = (classificationCounts[type] || 0) + 1;
      }
      if (result.extractedPrices) {
        totalPrices += result.extractedPrices.length;
      }
      if (result.violations) {
        totalViolations += result.violations.length;
      }
    }

    return {
      totalImages: results.length,
      successCount: successful.length,
      failedCount: failed.length,
      totalCharacters: totalText.length,
      averageConfidence: avgConfidence,
      classificationCounts,
      totalPricesExtracted: totalPrices,
      totalViolationsDetected: totalViolations,
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
  classificationCounts?: Record<string, number>;
  totalPricesExtracted?: number;
  totalViolationsDetected?: number;
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
      classification: {
        type: 'PRICE_MENU',
        confidence: 0.9,
        reason: 'Mock classification',
      },
      extractedPrices: [
        {
          procedureName: '울쎄라 리프팅',
          price: 500000,
          shots: 300,
          priceType: 'FIXED',
          originalText: '울쎄라 300샷 50만원',
          confidence: 0.9,
          pricePerUnit: 1667,
        },
      ],
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

/**
 * Gemini Flash OCR 클라이언트 팩토리
 */
export function createGeminiFlashClient(apiKey: string, options?: Partial<GeminiFlashConfig>): GeminiFlashOCRClient {
  return new GeminiFlashOCRClient({
    apiKey,
    ...options,
  });
}
