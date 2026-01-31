/**
 * 가격 광고 규정 검증기
 * 의료광고 가격 표시 규정 준수 여부 검증
 */

import type { ExtractedPrice, VisualEmphasis, PriceAdValidation } from '../adapters/ocr-adapter';

// ============================================
// 규정 코드 및 정의
// ============================================

/**
 * 가격 광고 규정 코드
 */
export type PriceAdRuleCode =
  | 'PAR-001'  // 과도한 할인율 (50% 초과)
  | 'PAR-002'  // 미끼 상품 의심 (시장가 대비 70% 이하)
  | 'PAR-003'  // 조건 미표시 (할인 조건 누락)
  | 'PAR-004'  // 허위 원가 표시 (비정상적 할인)
  | 'PAR-005'  // 긴급성 과장 (과도한 시간 압박)
  | 'PAR-006'; // 시각적 과장 (가격 강조 과도)

/**
 * 규정 정의
 */
interface PriceAdRule {
  code: PriceAdRuleCode;
  name: string;
  description: string;
  legalBasis: string;
  severity: 'critical' | 'major' | 'minor';
  checkFn: (context: ValidationContext) => RuleCheckResult | null;
}

/**
 * 규정 검사 결과
 */
interface RuleCheckResult {
  violated: boolean;
  description: string;
  details?: string;
}

/**
 * 검증 컨텍스트
 */
interface ValidationContext {
  price: ExtractedPrice;
  allPrices: ExtractedPrice[];
  visualEmphasis?: VisualEmphasis;
  marketPrices?: MarketPriceReference;
}

/**
 * 시장 가격 참조 정보
 */
export interface MarketPriceReference {
  procedureName: string;
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  sampleCount: number;
}

/**
 * 가격 광고 검증 결과
 */
export interface PriceAdValidationResult extends PriceAdValidation {
  /** 검증된 가격 정보 */
  price: ExtractedPrice;
  /** 위험 점수 (0-100) */
  riskScore: number;
  /** 검증 시간 */
  validatedAt: Date;
}

// ============================================
// 시장 가격 기준 (참조용)
// ============================================

/**
 * 주요 시술 시장 가격 참조 데이터
 * 실제 운영 시 DB에서 조회하거나 외부 데이터 연동
 */
const MARKET_PRICE_REFERENCES: Record<string, MarketPriceReference> = {
  // 피부과 시술
  '울쎄라': { procedureName: '울쎄라', averagePrice: 2500000, minPrice: 1500000, maxPrice: 4000000, sampleCount: 100 },
  '슈링크': { procedureName: '슈링크', averagePrice: 300000, minPrice: 150000, maxPrice: 500000, sampleCount: 150 },
  '인모드': { procedureName: '인모드', averagePrice: 400000, minPrice: 200000, maxPrice: 700000, sampleCount: 80 },
  '보톡스': { procedureName: '보톡스', averagePrice: 150000, minPrice: 50000, maxPrice: 300000, sampleCount: 200 },
  '필러': { procedureName: '필러', averagePrice: 300000, minPrice: 100000, maxPrice: 600000, sampleCount: 180 },
  '레이저토닝': { procedureName: '레이저토닝', averagePrice: 80000, minPrice: 30000, maxPrice: 150000, sampleCount: 120 },
  '피코토닝': { procedureName: '피코토닝', averagePrice: 100000, minPrice: 50000, maxPrice: 200000, sampleCount: 100 },
  '써마지': { procedureName: '써마지', averagePrice: 1500000, minPrice: 800000, maxPrice: 2500000, sampleCount: 90 },
  '리프팅': { procedureName: '리프팅', averagePrice: 500000, minPrice: 200000, maxPrice: 1000000, sampleCount: 110 },
  '스킨보톡스': { procedureName: '스킨보톡스', averagePrice: 200000, minPrice: 100000, maxPrice: 400000, sampleCount: 95 },
};

// ============================================
// 규정 정의
// ============================================

const PRICE_AD_RULES: PriceAdRule[] = [
  {
    code: 'PAR-001',
    name: '과도한 할인율',
    description: '50%를 초과하는 과도한 할인율 표시',
    legalBasis: '의료법 제27조 제3항 (환자 유인 행위)',
    severity: 'major',
    checkFn: (ctx) => {
      const { price } = ctx;

      // 할인율이 명시된 경우
      if (price.discountRate && price.discountRate > 50) {
        return {
          violated: true,
          description: `${price.discountRate}% 할인율은 환자 유인으로 의심됨`,
          details: `할인율: ${price.discountRate}%, 원가: ${price.originalPrice?.toLocaleString()}원, 할인가: ${price.price.toLocaleString()}원`,
        };
      }

      // 원가와 현재가로 할인율 계산
      if (price.originalPrice && price.price) {
        const calculatedDiscount = ((price.originalPrice - price.price) / price.originalPrice) * 100;
        if (calculatedDiscount > 50) {
          return {
            violated: true,
            description: `계산된 할인율 ${calculatedDiscount.toFixed(0)}%는 환자 유인으로 의심됨`,
            details: `원가: ${price.originalPrice.toLocaleString()}원, 할인가: ${price.price.toLocaleString()}원`,
          };
        }
      }

      return null;
    },
  },
  {
    code: 'PAR-002',
    name: '미끼 상품 의심',
    description: '시장 평균가 대비 70% 이하의 비정상적 저가',
    legalBasis: '의료법 제27조 제3항, 의료광고 심의기준',
    severity: 'major',
    checkFn: (ctx) => {
      const { price, marketPrices } = ctx;

      if (!marketPrices) {
        // 내장 시장가 참조
        const reference = findMarketReference(price.procedureName);
        if (reference) {
          const ratio = price.price / reference.averagePrice;
          if (ratio < 0.3) { // 30% 이하
            return {
              violated: true,
              description: `시장 평균가(${reference.averagePrice.toLocaleString()}원) 대비 ${(ratio * 100).toFixed(0)}% 수준으로 미끼 상품 의심`,
              details: `표시가: ${price.price.toLocaleString()}원, 시장 평균: ${reference.averagePrice.toLocaleString()}원`,
            };
          }
        }
        return null;
      }

      const ratio = price.price / marketPrices.averagePrice;
      if (ratio < 0.3) {
        return {
          violated: true,
          description: `시장 평균가 대비 ${(ratio * 100).toFixed(0)}% 수준으로 미끼 상품 의심`,
          details: `표시가: ${price.price.toLocaleString()}원, 시장 평균: ${marketPrices.averagePrice.toLocaleString()}원`,
        };
      }

      return null;
    },
  },
  {
    code: 'PAR-003',
    name: '조건 미표시',
    description: '할인/이벤트 가격의 적용 조건 미표시',
    legalBasis: '표시·광고의 공정화에 관한 법률',
    severity: 'minor',
    checkFn: (ctx) => {
      const { price } = ctx;

      // 할인가인데 조건이 없는 경우
      if (price.priceType === 'DISCOUNTED' || price.isPromotion) {
        if (!price.conditions && !price.hasTimeLimit) {
          return {
            violated: true,
            description: '할인/이벤트 가격이지만 적용 조건이 표시되지 않음',
            details: `시술: ${price.procedureName}, 가격: ${price.price.toLocaleString()}원`,
          };
        }
      }

      // 50% 이상 할인인데 조건 없음
      if (price.discountRate && price.discountRate >= 30 && !price.conditions) {
        return {
          violated: true,
          description: `${price.discountRate}% 할인이지만 적용 조건이 명시되지 않음`,
          details: `시술: ${price.procedureName}, 할인율: ${price.discountRate}%`,
        };
      }

      return null;
    },
  },
  {
    code: 'PAR-004',
    name: '허위 원가 표시',
    description: '비정상적으로 높은 원가 표시 (허위 할인 유도)',
    legalBasis: '표시·광고의 공정화에 관한 법률 제3조',
    severity: 'critical',
    checkFn: (ctx) => {
      const { price } = ctx;

      if (!price.originalPrice) return null;

      // 시장가 참조
      const reference = findMarketReference(price.procedureName);
      if (reference) {
        // 원가가 시장 최고가의 2배 이상이면 허위 의심
        if (price.originalPrice > reference.maxPrice * 2) {
          return {
            violated: true,
            description: '원가가 시장 최고가의 2배를 초과하여 허위 원가 표시 의심',
            details: `표시 원가: ${price.originalPrice.toLocaleString()}원, 시장 최고가: ${reference.maxPrice.toLocaleString()}원`,
          };
        }
      }

      // 할인 후 가격이 원가의 20% 이하면 의심
      const ratio = price.price / price.originalPrice;
      if (ratio < 0.2) {
        return {
          violated: true,
          description: '할인 후 가격이 원가의 20% 미만으로 허위 원가 표시 의심',
          details: `원가: ${price.originalPrice.toLocaleString()}원, 할인가: ${price.price.toLocaleString()}원 (${(ratio * 100).toFixed(0)}%)`,
        };
      }

      return null;
    },
  },
  {
    code: 'PAR-005',
    name: '긴급성 과장',
    description: '과도한 시간 압박을 통한 구매 유도',
    legalBasis: '의료광고 심의기준, 소비자기본법',
    severity: 'minor',
    checkFn: (ctx) => {
      const { price, visualEmphasis } = ctx;

      // 조건 텍스트에서 긴급성 표현 검사
      const urgencyPatterns = [
        /오늘\s*만/,
        /지금\s*만/,
        /단\s*\d+\s*(명|분)/,
        /선착순/,
        /마감\s*임박/,
        /한정\s*\d+/,
        /딱\s*\d+/,
        /마지막/,
        /놓치면/,
        /기회/,
        /서두르/,
      ];

      const textToCheck = `${price.conditions || ''} ${price.originalText}`;

      for (const pattern of urgencyPatterns) {
        if (pattern.test(textToCheck)) {
          return {
            violated: true,
            description: '과도한 시간 압박 표현으로 긴급성 과장',
            details: `관련 텍스트: "${textToCheck.substring(0, 50)}..."`,
          };
        }
      }

      // 시각적 긴급성 표시
      if (visualEmphasis?.hasUrgencyIndicator) {
        return {
          violated: true,
          description: '시각적으로 긴급성을 과장하여 표시',
          details: visualEmphasis.emphasisDescription || '긴급성 표시 감지',
        };
      }

      return null;
    },
  },
  {
    code: 'PAR-006',
    name: '시각적 과장',
    description: '가격/할인 정보의 과도한 시각적 강조',
    legalBasis: '의료광고 심의기준',
    severity: 'minor',
    checkFn: (ctx) => {
      const { visualEmphasis } = ctx;

      if (!visualEmphasis) return null;

      // 과도한 시각적 강조 요소 카운트
      let emphasisCount = 0;
      const emphasisDetails: string[] = [];

      if (visualEmphasis.hasLargeFont) {
        emphasisCount++;
        emphasisDetails.push('큰 폰트');
      }
      if (visualEmphasis.hasEmphasisColor) {
        emphasisCount++;
        emphasisDetails.push('강조 색상');
      }
      if (visualEmphasis.hasSpecialEffects) {
        emphasisCount++;
        emphasisDetails.push('특수 효과');
      }
      if (visualEmphasis.hasDiscountHighlight) {
        emphasisCount++;
        emphasisDetails.push('할인 강조');
      }

      // 3개 이상의 시각적 강조 요소가 동시에 사용되면 과장
      if (emphasisCount >= 3) {
        return {
          violated: true,
          description: '다수의 시각적 강조 요소를 사용하여 가격 정보 과장',
          details: `강조 요소: ${emphasisDetails.join(', ')}`,
        };
      }

      return null;
    },
  },
];

// ============================================
// 헬퍼 함수
// ============================================

/**
 * 시술명으로 시장가 참조 찾기
 */
function findMarketReference(procedureName: string): MarketPriceReference | null {
  const normalizedName = procedureName.toLowerCase().replace(/\s+/g, '');

  // 정확한 매칭 시도
  for (const [key, ref] of Object.entries(MARKET_PRICE_REFERENCES)) {
    if (normalizedName.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedName)) {
      return ref;
    }
  }

  // 부분 매칭 시도
  const keywords = Object.keys(MARKET_PRICE_REFERENCES);
  for (const keyword of keywords) {
    if (normalizedName.includes(keyword.toLowerCase())) {
      return MARKET_PRICE_REFERENCES[keyword];
    }
  }

  return null;
}

/**
 * 위험 점수 계산
 */
function calculateRiskScore(violations: PriceAdValidation['violations']): number {
  if (violations.length === 0) return 0;

  let score = 0;
  for (const v of violations) {
    switch (v.severity) {
      case 'critical':
        score += 40;
        break;
      case 'major':
        score += 25;
        break;
      case 'minor':
        score += 10;
        break;
    }
  }

  return Math.min(100, score);
}

// ============================================
// 검증기 클래스
// ============================================

/**
 * 가격 광고 규정 검증기
 */
export class PriceAdValidator {
  private rules: PriceAdRule[];
  private marketReferences: Map<string, MarketPriceReference>;

  constructor() {
    this.rules = PRICE_AD_RULES;
    this.marketReferences = new Map(Object.entries(MARKET_PRICE_REFERENCES));
  }

  /**
   * 단일 가격 검증
   */
  validate(
    price: ExtractedPrice,
    options?: {
      allPrices?: ExtractedPrice[];
      visualEmphasis?: VisualEmphasis;
      marketPrices?: MarketPriceReference;
    }
  ): PriceAdValidationResult {
    const violations: PriceAdValidation['violations'] = [];

    const context: ValidationContext = {
      price,
      allPrices: options?.allPrices || [price],
      visualEmphasis: options?.visualEmphasis,
      marketPrices: options?.marketPrices,
    };

    // 모든 규칙 검사
    for (const rule of this.rules) {
      const result = rule.checkFn(context);
      if (result?.violated) {
        violations.push({
          ruleCode: rule.code,
          ruleName: rule.name,
          description: result.description,
          severity: rule.severity,
        });
      }
    }

    const riskScore = calculateRiskScore(violations);

    return {
      price,
      isCompliant: violations.length === 0,
      violations,
      summary: this.generateSummary(price, violations),
      riskScore,
      validatedAt: new Date(),
    };
  }

  /**
   * 여러 가격 일괄 검증
   */
  validateBatch(
    prices: ExtractedPrice[],
    visualEmphasis?: VisualEmphasis
  ): PriceAdValidationResult[] {
    return prices.map(price =>
      this.validate(price, {
        allPrices: prices,
        visualEmphasis,
      })
    );
  }

  /**
   * 검증 요약 생성
   */
  private generateSummary(
    price: ExtractedPrice,
    violations: PriceAdValidation['violations']
  ): string {
    if (violations.length === 0) {
      return `"${price.procedureName}" 가격 광고 규정 준수`;
    }

    const criticalCount = violations.filter(v => v.severity === 'critical').length;
    const majorCount = violations.filter(v => v.severity === 'major').length;
    const minorCount = violations.filter(v => v.severity === 'minor').length;

    const parts: string[] = [];
    if (criticalCount > 0) parts.push(`심각 ${criticalCount}건`);
    if (majorCount > 0) parts.push(`주요 ${majorCount}건`);
    if (minorCount > 0) parts.push(`경미 ${minorCount}건`);

    return `"${price.procedureName}" 가격 광고 위반 ${violations.length}건 (${parts.join(', ')})`;
  }

  /**
   * 시장가 참조 업데이트
   */
  updateMarketReference(procedureName: string, reference: MarketPriceReference): void {
    this.marketReferences.set(procedureName, reference);
  }

  /**
   * 시장가 참조 조회
   */
  getMarketReference(procedureName: string): MarketPriceReference | undefined {
    return this.marketReferences.get(procedureName) ||
           findMarketReference(procedureName) ||
           undefined;
  }

  /**
   * 모든 규칙 목록 반환
   */
  getRules(): Array<{ code: string; name: string; description: string; severity: string }> {
    return this.rules.map(r => ({
      code: r.code,
      name: r.name,
      description: r.description,
      severity: r.severity,
    }));
  }
}

// ============================================
// 편의 함수
// ============================================

/**
 * 기본 검증기 인스턴스
 */
export const priceAdValidator = new PriceAdValidator();

/**
 * 단일 가격 검증 (단축 함수)
 */
export function validatePriceAd(
  price: ExtractedPrice,
  visualEmphasis?: VisualEmphasis
): PriceAdValidationResult {
  return priceAdValidator.validate(price, { visualEmphasis });
}

/**
 * 여러 가격 일괄 검증 (단축 함수)
 */
export function validatePriceAdBatch(
  prices: ExtractedPrice[],
  visualEmphasis?: VisualEmphasis
): PriceAdValidationResult[] {
  return priceAdValidator.validateBatch(prices, visualEmphasis);
}

/**
 * 가격 위험도 평가 (빠른 검사)
 */
export function assessPriceRisk(price: ExtractedPrice): {
  riskLevel: 'low' | 'medium' | 'high';
  reasons: string[];
} {
  const reasons: string[] = [];

  // 할인율 검사
  if (price.discountRate) {
    if (price.discountRate > 70) {
      reasons.push(`극단적 할인율 (${price.discountRate}%)`);
    } else if (price.discountRate > 50) {
      reasons.push(`높은 할인율 (${price.discountRate}%)`);
    }
  }

  // 시장가 대비 검사
  const reference = findMarketReference(price.procedureName);
  if (reference) {
    const ratio = price.price / reference.averagePrice;
    if (ratio < 0.3) {
      reasons.push('시장가 대비 30% 미만');
    } else if (ratio < 0.5) {
      reasons.push('시장가 대비 50% 미만');
    }
  }

  // 프로모션 + 조건 없음
  if (price.isPromotion && !price.conditions) {
    reasons.push('프로모션이지만 조건 미표시');
  }

  // 위험도 결정
  let riskLevel: 'low' | 'medium' | 'high';
  if (reasons.length >= 3 || reasons.some(r => r.includes('극단적'))) {
    riskLevel = 'high';
  } else if (reasons.length >= 1) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'low';
  }

  return { riskLevel, reasons };
}
