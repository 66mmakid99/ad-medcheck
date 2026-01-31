/**
 * 복합 위반 탐지기
 * 여러 조건이 함께 충족될 때만 위반이 되는 복잡한 규칙 처리
 *
 * 지원하는 논리 연산:
 * - AND: 모든 조건이 충족되어야 함
 * - OR: 하나 이상의 조건이 충족되어야 함
 * - AND_NOT: 특정 조건이 있으면 위반에서 제외
 * - SEQUENCE: 특정 순서로 조건이 나타나야 함
 */

import type { PatternMatch } from './pattern-matcher';

// ============================================
// 타입 정의
// ============================================

/**
 * 복합 규칙 논리 연산자
 */
export type LogicOperator = 'AND' | 'OR' | 'AND_NOT' | 'SEQUENCE';

/**
 * 조건 정의
 */
export interface Condition {
  /** 조건 ID */
  id: string;
  /** 조건 설명 */
  description: string;
  /** 패턴 (정규식) */
  patterns: RegExp[];
  /** 필수 여부 (AND 연산에서) */
  required?: boolean;
  /** 제외 조건 여부 (AND_NOT) */
  isExclusion?: boolean;
  /** 거리 제한 (문자 수, SEQUENCE에서 사용) */
  maxDistance?: number;
}

/**
 * 복합 규칙 정의
 */
export interface CompoundRule {
  /** 규칙 ID */
  id: string;
  /** 규칙명 */
  name: string;
  /** 설명 */
  description: string;
  /** 카테고리 */
  category: string;
  /** 논리 연산자 */
  operator: LogicOperator;
  /** 조건들 */
  conditions: Condition[];
  /** 심각도 */
  severity: 'critical' | 'major' | 'minor';
  /** 법적 근거 */
  legalBasis: string;
  /** 권장 조치 */
  suggestion: string;
  /** 최소 충족 조건 수 (OR에서 사용) */
  minConditionsMet?: number;
}

/**
 * 조건 매칭 결과
 */
interface ConditionMatch {
  conditionId: string;
  matched: boolean;
  matchedText?: string;
  position?: number;
  endPosition?: number;
}

/**
 * 복합 위반 탐지 결과
 */
export interface CompoundViolation {
  /** 규칙 ID */
  ruleId: string;
  /** 규칙명 */
  ruleName: string;
  /** 카테고리 */
  category: string;
  /** 충족된 조건들 */
  metConditions: ConditionMatch[];
  /** 미충족 조건들 */
  unmetConditions: string[];
  /** 위반 텍스트 (결합) */
  violationText: string;
  /** 맥락 */
  context: string;
  /** 위반 시작 위치 */
  position: number;
  /** 위반 끝 위치 */
  endPosition: number;
  /** 심각도 */
  severity: 'critical' | 'major' | 'minor';
  /** 법적 근거 */
  legalBasis: string;
  /** 설명 */
  description: string;
  /** 권장 조치 */
  suggestion: string;
  /** 신뢰도 */
  confidence: number;
}

// ============================================
// 복합 규칙 정의
// ============================================

const COMPOUND_RULES: CompoundRule[] = [
  // 가격 + 효과 보장 복합 위반
  {
    id: 'CPD-001',
    name: '가격 유인 + 효과 보장',
    description: '저가/할인 강조와 함께 효과를 보장하는 표현',
    category: '복합 위반 - 환자 유인',
    operator: 'AND',
    conditions: [
      {
        id: 'price',
        description: '가격 유인 요소',
        patterns: [
          /(?:\d+)?\s*%?\s*(?:할인|세일|특가|이벤트)/gi,
          /(?:저렴|싼|최저|파격|부담\s*없)/gi,
          /(?:무료|0원|공짜)\s*(?:상담|체험|시술)/gi,
        ],
        required: true,
      },
      {
        id: 'guarantee',
        description: '효과 보장 표현',
        patterns: [
          /(?:100%|완벽|확실)\s*(?:효과|완치|치료)/gi,
          /(?:보장|약속)\s*(?:합니다|드립니다)/gi,
          /(?:틀림없|분명)\s*(?:효과|결과)/gi,
        ],
        required: true,
      },
    ],
    severity: 'critical',
    legalBasis: '의료법 제56조 제2항 제3호, 제9호',
    suggestion: '가격 정보와 치료 효과를 분리하고, 효과 보장 표현을 제거하세요',
  },

  // 전후 사진 + 특정 결과 암시
  {
    id: 'CPD-002',
    name: '전후 사진 + 결과 보장',
    description: '전후 사진과 함께 특정 결과를 암시하는 표현',
    category: '복합 위반 - 전후 사진',
    operator: 'AND',
    conditions: [
      {
        id: 'before_after',
        description: '전후 사진 언급',
        patterns: [
          /(?:전|후)\s*(?:사진|이미지|비교)/gi,
          /(?:before|after)\s*(?:photo|image)?/gi,
          /(?:시술|수술|치료)\s*(?:전|후)/gi,
        ],
        required: true,
      },
      {
        id: 'result_guarantee',
        description: '결과 보장 표현',
        patterns: [
          /(?:이렇게|이처럼)\s*(?:변합니다|됩니다|바뀝니다)/gi,
          /(?:같은|동일한)\s*결과/gi,
          /(?:달라진|변화된)\s*(?:모습|결과)/gi,
        ],
        required: true,
      },
    ],
    severity: 'critical',
    legalBasis: '의료법 제56조 제2항 제5호',
    suggestion: '전후 사진 사용 시 "개인차가 있을 수 있습니다" 등 면책 조항을 명시하세요',
  },

  // 최상급 + 비교광고
  {
    id: 'CPD-003',
    name: '최상급 표현 + 비교광고',
    description: '최상급 표현과 함께 다른 의료기관과 비교',
    category: '복합 위반 - 비교광고',
    operator: 'AND',
    conditions: [
      {
        id: 'superlative',
        description: '최상급 표현',
        patterns: [
          /(?:최고|최초|최신|최상|유일|독보적)/gi,
          /(?:가장|제일)\s*(?:좋|뛰어|우수)/gi,
          /(?:No\.?\s*1|넘버원|1위|1등)/gi,
        ],
        required: true,
      },
      {
        id: 'comparison',
        description: '비교 표현',
        patterns: [
          /(?:다른|타)\s*(?:병원|의원|클리닉)/gi,
          /(?:~?보다|~?에\s*비해)\s*(?:뛰어|우수|좋)/gi,
          /(?:대비|비교)\s*(?:우수|탁월)/gi,
        ],
        required: true,
      },
    ],
    severity: 'critical',
    legalBasis: '의료법 제56조 제2항 제1호, 제4호',
    suggestion: '최상급 표현과 비교 표현을 모두 제거하세요',
  },

  // 부작용 부정 + 안전성 강조
  {
    id: 'CPD-004',
    name: '부작용 부정 + 안전성 강조',
    description: '부작용이 없다고 단정하면서 안전성을 강조',
    category: '복합 위반 - 허위/과장',
    operator: 'AND',
    conditions: [
      {
        id: 'no_side_effect',
        description: '부작용 부정',
        patterns: [
          /부작용\s*(?:이|가)?\s*(?:없|제로|0)/gi,
          /(?:전혀|절대)\s*(?:부작용|이상\s*반응)/gi,
          /안전\s*(?:100%|완벽)/gi,
        ],
        required: true,
      },
      {
        id: 'safety_emphasis',
        description: '안전성 강조',
        patterns: [
          /(?:안심|걱정\s*없|안전)\s*(?:하세요|됩니다|합니다)/gi,
          /(?:무해|해\s*없)/gi,
          /(?:검증된?|입증된?)\s*안전/gi,
        ],
        required: true,
      },
    ],
    severity: 'critical',
    legalBasis: '의료법 제56조 제2항 제2호',
    suggestion: '부작용 가능성을 명시하고, 상담을 통한 확인을 권유하세요',
  },

  // 긴급성 + 가격 할인
  {
    id: 'CPD-005',
    name: '긴급성 유도 + 가격 할인',
    description: '시간 제한을 강조하며 가격 할인으로 환자 유인',
    category: '복합 위반 - 환자 유인',
    operator: 'AND',
    conditions: [
      {
        id: 'urgency',
        description: '긴급성 표현',
        patterns: [
          /(?:오늘|지금|당장)\s*(?:만|까지|한정)/gi,
          /(?:마감|종료)\s*(?:임박|직전)/gi,
          /(?:선착순|한정|마지막)/gi,
        ],
        required: true,
      },
      {
        id: 'discount',
        description: '가격 할인',
        patterns: [
          /(?:\d+)\s*%\s*(?:할인|DC|세일)/gi,
          /(?:반값|절반|파격\s*할인)/gi,
          /(?:특가|이벤트\s*가격?)/gi,
        ],
        required: true,
      },
    ],
    severity: 'major',
    legalBasis: '의료법 제56조 제2항 제9호',
    suggestion: '시간 제한 없는 정상 가격 정보만 표시하세요',
  },

  // 전문의 자격 + 과장된 경력
  {
    id: 'CPD-006',
    name: '전문의 자격 + 과장된 경력',
    description: '전문의 자격과 함께 검증 불가한 경력 과장',
    category: '복합 위반 - 허위/과장',
    operator: 'AND',
    conditions: [
      {
        id: 'specialist',
        description: '전문의 언급',
        patterns: [
          /[가-힣]+\s*전문의/gi,
          /(?:전문|숙련)\s*의료진/gi,
        ],
        required: true,
      },
      {
        id: 'exaggerated_career',
        description: '과장된 경력',
        patterns: [
          /(?:\d+)\s*(?:만|천)\s*(?:건|케이스|례)/gi,
          /(?:수많은|수천|수만)\s*(?:경험|시술|수술)/gi,
          /(?:국내\s*최다|업계\s*최고)\s*(?:경험|경력)/gi,
        ],
        required: true,
      },
    ],
    severity: 'major',
    legalBasis: '의료법 제56조 제2항 제1호',
    suggestion: '검증 가능한 객관적 경력 정보만 표시하세요',
  },

  // 특정 질환 + 완치 보장
  {
    id: 'CPD-007',
    name: '특정 질환 + 완치 보장',
    description: '특정 질환을 언급하며 완치를 보장',
    category: '복합 위반 - 효과 보장',
    operator: 'AND',
    conditions: [
      {
        id: 'disease',
        description: '질환 언급',
        patterns: [
          /(?:암|당뇨|고혈압|치매|관절염)/gi,
          /(?:아토피|탈모|비만|우울증)/gi,
          /(?:디스크|척추\s*질환|만성\s*통증)/gi,
        ],
        required: true,
      },
      {
        id: 'cure_guarantee',
        description: '완치 보장',
        patterns: [
          /(?:완치|완전\s*치료|근본\s*치료)/gi,
          /(?:뿌리\s*뽑|완전\s*제거|근절)/gi,
          /(?:다시는|재발\s*없)/gi,
        ],
        required: true,
      },
    ],
    severity: 'critical',
    legalBasis: '의료법 제56조 제2항 제3호',
    suggestion: '완치 보장 표현을 제거하고 치료 가능성으로 표현하세요',
  },

  // 면책 조항이 있으면 제외 (AND_NOT 예시)
  {
    id: 'CPD-008',
    name: '효과 주장 - 면책 조항 없음',
    description: '효과를 주장하면서 면책 조항이 없는 경우',
    category: '복합 위반 - 면책 누락',
    operator: 'AND_NOT',
    conditions: [
      {
        id: 'effect_claim',
        description: '효과 주장',
        patterns: [
          /(?:효과|결과)\s*(?:가|를)\s*(?:보|느끼)/gi,
          /(?:개선|완화|호전)\s*(?:됩니다|됐습니다|되었습니다)/gi,
          /(?:만족|성공)\s*(?:률|율)\s*(?:\d+)?%/gi,
        ],
        required: true,
        isExclusion: false,
      },
      {
        id: 'disclaimer',
        description: '면책 조항',
        patterns: [
          /개인\s*(?:에\s*따라|마다|차이)/gi,
          /(?:결과|효과)\s*(?:가|는)\s*다를\s*수/gi,
          /(?:부작용|이상반응)\s*(?:이|가)\s*(?:있을|발생)/gi,
        ],
        required: false,
        isExclusion: true,
      },
    ],
    severity: 'minor',
    legalBasis: '의료법 시행령 제23조',
    suggestion: '"개인에 따라 결과가 다를 수 있습니다" 등 면책 조항을 추가하세요',
  },

  // 순차적 조건 (SEQUENCE 예시)
  {
    id: 'CPD-009',
    name: '문제 제기 → 해결책 제시',
    description: '문제를 제기한 직후 자사 시술을 해결책으로 제시',
    category: '복합 위반 - 불안 조장',
    operator: 'SEQUENCE',
    conditions: [
      {
        id: 'problem',
        description: '문제/불안 제기',
        patterns: [
          /(?:고민|걱정|스트레스)\s*(?:이신가요|되시나요|있으신가요)/gi,
          /(?:힘드|어렵|불편)\s*(?:시죠|으시죠|지\s*않으세요)/gi,
          /(?:~?때문에|~?로\s*인해)\s*(?:고민|힘들)/gi,
        ],
        required: true,
        maxDistance: 0, // 첫 번째이므로 사용 안 함
      },
      {
        id: 'solution',
        description: '자사 해결책 제시',
        patterns: [
          /(?:저희|당원|본원)\s*(?:에서|병원|클리닉)/gi,
          /(?:해결|치료|시술)\s*(?:해\s*드립니다|가능합니다)/gi,
          /(?:지금|바로)\s*(?:상담|예약)/gi,
        ],
        required: true,
        maxDistance: 200, // 200자 이내
      },
    ],
    severity: 'minor',
    legalBasis: '의료법 제56조 제2항',
    suggestion: '불안 조장 없이 객관적인 정보를 제공하세요',
  },
];

// ============================================
// 복합 위반 탐지기 클래스
// ============================================

export class CompoundDetector {
  private rules: CompoundRule[];

  constructor(customRules?: CompoundRule[]) {
    this.rules = customRules || COMPOUND_RULES;
  }

  /**
   * 복합 위반 탐지
   */
  detect(text: string): CompoundViolation[] {
    const violations: CompoundViolation[] = [];

    for (const rule of this.rules) {
      const violation = this.evaluateRule(text, rule);
      if (violation) {
        violations.push(violation);
      }
    }

    return violations;
  }

  /**
   * 규칙 평가
   */
  private evaluateRule(text: string, rule: CompoundRule): CompoundViolation | null {
    switch (rule.operator) {
      case 'AND':
        return this.evaluateAND(text, rule);
      case 'OR':
        return this.evaluateOR(text, rule);
      case 'AND_NOT':
        return this.evaluateAND_NOT(text, rule);
      case 'SEQUENCE':
        return this.evaluateSEQUENCE(text, rule);
      default:
        return null;
    }
  }

  /**
   * AND 연산 평가 - 모든 조건이 충족되어야 함
   */
  private evaluateAND(text: string, rule: CompoundRule): CompoundViolation | null {
    const metConditions: ConditionMatch[] = [];
    const unmetConditions: string[] = [];

    for (const condition of rule.conditions) {
      if (condition.isExclusion) continue;

      const match = this.matchCondition(text, condition);
      if (match.matched) {
        metConditions.push(match);
      } else if (condition.required) {
        unmetConditions.push(condition.id);
      }
    }

    // 필수 조건 중 하나라도 미충족이면 위반 아님
    if (unmetConditions.length > 0) {
      return null;
    }

    // 모든 필수 조건 충족
    return this.createViolation(text, rule, metConditions, unmetConditions);
  }

  /**
   * OR 연산 평가 - 하나 이상의 조건이 충족되어야 함
   */
  private evaluateOR(text: string, rule: CompoundRule): CompoundViolation | null {
    const metConditions: ConditionMatch[] = [];
    const unmetConditions: string[] = [];
    const minRequired = rule.minConditionsMet || 1;

    for (const condition of rule.conditions) {
      const match = this.matchCondition(text, condition);
      if (match.matched) {
        metConditions.push(match);
      } else {
        unmetConditions.push(condition.id);
      }
    }

    // 최소 요구 조건 수 미충족
    if (metConditions.length < minRequired) {
      return null;
    }

    return this.createViolation(text, rule, metConditions, unmetConditions);
  }

  /**
   * AND_NOT 연산 평가 - 제외 조건이 없어야 함
   */
  private evaluateAND_NOT(text: string, rule: CompoundRule): CompoundViolation | null {
    const metConditions: ConditionMatch[] = [];
    const unmetConditions: string[] = [];
    let hasRequiredCondition = false;
    let hasExclusionCondition = false;

    for (const condition of rule.conditions) {
      const match = this.matchCondition(text, condition);

      if (condition.isExclusion) {
        // 제외 조건이 충족되면 위반 아님
        if (match.matched) {
          hasExclusionCondition = true;
        }
      } else {
        // 일반 조건
        if (match.matched) {
          metConditions.push(match);
          if (condition.required) {
            hasRequiredCondition = true;
          }
        } else if (condition.required) {
          unmetConditions.push(condition.id);
        }
      }
    }

    // 제외 조건이 있으면 위반 아님
    if (hasExclusionCondition) {
      return null;
    }

    // 필수 조건이 충족되지 않으면 위반 아님
    if (!hasRequiredCondition || unmetConditions.length > 0) {
      return null;
    }

    return this.createViolation(text, rule, metConditions, unmetConditions);
  }

  /**
   * SEQUENCE 연산 평가 - 순서대로 조건이 나타나야 함
   */
  private evaluateSEQUENCE(text: string, rule: CompoundRule): CompoundViolation | null {
    const metConditions: ConditionMatch[] = [];
    let lastEndPosition = 0;

    for (let i = 0; i < rule.conditions.length; i++) {
      const condition = rule.conditions[i];
      const searchText = text.slice(lastEndPosition);

      // 조건 매칭 (남은 텍스트에서)
      const match = this.matchCondition(searchText, condition);

      if (!match.matched) {
        if (condition.required) {
          return null; // 필수 조건 미충족
        }
        continue;
      }

      // 위치 조정 (전체 텍스트 기준)
      const adjustedMatch: ConditionMatch = {
        ...match,
        position: match.position !== undefined ? lastEndPosition + match.position : undefined,
        endPosition: match.endPosition !== undefined ? lastEndPosition + match.endPosition : undefined,
      };

      // 거리 제한 확인
      if (i > 0 && condition.maxDistance !== undefined) {
        const prevEnd = metConditions[metConditions.length - 1]?.endPosition || 0;
        const currentStart = adjustedMatch.position || 0;
        const distance = currentStart - prevEnd;

        if (distance > condition.maxDistance) {
          return null; // 거리 초과
        }
      }

      metConditions.push(adjustedMatch);
      lastEndPosition = adjustedMatch.endPosition || lastEndPosition;
    }

    // 모든 필수 조건이 순서대로 충족됨
    const requiredConditions = rule.conditions.filter(c => c.required);
    if (metConditions.length < requiredConditions.length) {
      return null;
    }

    return this.createViolation(text, rule, metConditions, []);
  }

  /**
   * 조건 매칭
   */
  private matchCondition(text: string, condition: Condition): ConditionMatch {
    for (const pattern of condition.patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);

      if (match) {
        return {
          conditionId: condition.id,
          matched: true,
          matchedText: match[0],
          position: match.index,
          endPosition: match.index + match[0].length,
        };
      }
    }

    return {
      conditionId: condition.id,
      matched: false,
    };
  }

  /**
   * 위반 객체 생성
   */
  private createViolation(
    text: string,
    rule: CompoundRule,
    metConditions: ConditionMatch[],
    unmetConditions: string[]
  ): CompoundViolation {
    // 위반 텍스트 결합
    const violationTexts = metConditions
      .filter(c => c.matchedText)
      .map(c => c.matchedText as string);

    const violationText = violationTexts.join(' + ');

    // 위치 계산
    const positions = metConditions
      .filter(c => c.position !== undefined)
      .map(c => c.position as number);
    const endPositions = metConditions
      .filter(c => c.endPosition !== undefined)
      .map(c => c.endPosition as number);

    const position = positions.length > 0 ? Math.min(...positions) : 0;
    const endPosition = endPositions.length > 0 ? Math.max(...endPositions) : text.length;

    // 컨텍스트 추출
    const contextStart = Math.max(0, position - 50);
    const contextEnd = Math.min(text.length, endPosition + 50);
    let context = text.slice(contextStart, contextEnd);
    if (contextStart > 0) context = '...' + context;
    if (contextEnd < text.length) context = context + '...';

    // 신뢰도 계산
    const confidence = this.calculateConfidence(rule, metConditions);

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      category: rule.category,
      metConditions,
      unmetConditions,
      violationText,
      context,
      position,
      endPosition,
      severity: rule.severity,
      legalBasis: rule.legalBasis,
      description: rule.description,
      suggestion: rule.suggestion,
      confidence,
    };
  }

  /**
   * 신뢰도 계산
   */
  private calculateConfidence(rule: CompoundRule, metConditions: ConditionMatch[]): number {
    let base = 0.7;

    // 심각도에 따른 가중치
    if (rule.severity === 'critical') base += 0.15;
    else if (rule.severity === 'major') base += 0.1;

    // 충족된 조건 수에 따른 가중치
    const conditionRatio = metConditions.length / rule.conditions.filter(c => !c.isExclusion).length;
    base += conditionRatio * 0.1;

    return Math.min(0.95, base);
  }

  /**
   * 규칙 목록 조회
   */
  getRules(): CompoundRule[] {
    return this.rules;
  }

  /**
   * 특정 규칙으로 검사
   */
  detectWithRule(text: string, ruleId: string): CompoundViolation | null {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule) return null;

    return this.evaluateRule(text, rule);
  }

  /**
   * 카테고리별 검사
   */
  detectByCategory(text: string, category: string): CompoundViolation[] {
    const categoryRules = this.rules.filter(r => r.category.includes(category));
    const violations: CompoundViolation[] = [];

    for (const rule of categoryRules) {
      const violation = this.evaluateRule(text, rule);
      if (violation) {
        violations.push(violation);
      }
    }

    return violations;
  }

  /**
   * 패턴 매칭 결과와 결합
   */
  combineWithPatternMatches(
    text: string,
    patternMatches: PatternMatch[]
  ): {
    compoundViolations: CompoundViolation[];
    relatedPatternMatches: Map<string, PatternMatch[]>;
  } {
    const compoundViolations = this.detect(text);
    const relatedPatternMatches = new Map<string, PatternMatch[]>();

    // 복합 위반과 관련된 패턴 매칭 연결
    for (const violation of compoundViolations) {
      const related = patternMatches.filter(pm => {
        // 위치가 겹치는 경우
        const overlaps =
          pm.position < violation.endPosition && pm.endPosition > violation.position;
        return overlaps;
      });

      if (related.length > 0) {
        relatedPatternMatches.set(violation.ruleId, related);
      }
    }

    return { compoundViolations, relatedPatternMatches };
  }
}

// 싱글톤 인스턴스
export const compoundDetector = new CompoundDetector();

// 팩토리 함수
export function createCompoundDetector(customRules?: CompoundRule[]): CompoundDetector {
  return new CompoundDetector(customRules);
}
