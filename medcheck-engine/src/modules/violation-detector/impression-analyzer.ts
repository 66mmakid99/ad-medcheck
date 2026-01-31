/**
 * 전체 인상 평가 분석기
 * 광고 텍스트의 전체적인 인상을 평가하여 위반 가능성 판단
 *
 * 평가 요소:
 * - 톤/분위기 분석
 * - 광고 공격성 평가
 * - 신뢰성 인상 분석
 * - 종합 위험도 산출
 */

import type { PatternMatch } from './pattern-matcher';
import type { CompoundViolation } from './compound-detector';
import type { DepartmentViolation, DepartmentType } from './department-rules';
import type { MandatoryCheckResult } from '../mandatory-checker';

// ============================================
// 타입 정의
// ============================================

/**
 * 톤 유형
 */
export type ToneType =
  | 'PROFESSIONAL'    // 전문적
  | 'PROMOTIONAL'     // 홍보성
  | 'AGGRESSIVE'      // 공격적
  | 'EMOTIONAL'       // 감성적
  | 'INFORMATIVE'     // 정보 제공적
  | 'REASSURING'      // 안심 유도
  | 'URGENT'          // 긴급성 강조
  | 'NEUTRAL';        // 중립적

/**
 * 신뢰성 인상
 */
export type CredibilityImpression =
  | 'HIGH'            // 높은 신뢰성
  | 'MEDIUM'          // 보통
  | 'LOW'             // 낮은 신뢰성
  | 'SUSPICIOUS';     // 의심스러움

/**
 * 위험 수준
 */
export type RiskLevel =
  | 'SAFE'            // 안전
  | 'LOW'             // 낮은 위험
  | 'MEDIUM'          // 중간 위험
  | 'HIGH'            // 높은 위험
  | 'CRITICAL';       // 심각한 위험

/**
 * 톤 분석 결과
 */
export interface ToneAnalysis {
  /** 주요 톤 */
  primaryTone: ToneType;
  /** 보조 톤들 */
  secondaryTones: ToneType[];
  /** 톤 점수 (-1: 부정적, 0: 중립, 1: 긍정적) */
  toneScore: number;
  /** 공격성 수준 (0-1) */
  aggressiveness: number;
  /** 감지된 톤 신호들 */
  toneSignals: string[];
}

/**
 * 신뢰성 분석 결과
 */
export interface CredibilityAnalysis {
  /** 신뢰성 인상 */
  impression: CredibilityImpression;
  /** 신뢰성 점수 (0-100) */
  score: number;
  /** 긍정적 요소들 */
  positiveFactors: string[];
  /** 부정적 요소들 */
  negativeFactors: string[];
}

/**
 * 종합 인상 분석 결과
 */
export interface ImpressionAnalysis {
  /** 전체 위험 수준 */
  riskLevel: RiskLevel;
  /** 위험 점수 (0-100, 높을수록 위험) */
  riskScore: number;
  /** 톤 분석 */
  toneAnalysis: ToneAnalysis;
  /** 신뢰성 분석 */
  credibilityAnalysis: CredibilityAnalysis;
  /** 광고 규정 준수 점수 (0-100) */
  complianceScore: number;
  /** 종합 평가 */
  overallAssessment: string;
  /** 주요 문제점 */
  keyIssues: string[];
  /** 개선 권고사항 */
  recommendations: string[];
  /** 분석 신뢰도 */
  confidence: number;
}

/**
 * 분석 입력 데이터
 */
export interface AnalysisInput {
  /** 원본 텍스트 */
  text: string;
  /** 패턴 매칭 결과 */
  patternMatches?: PatternMatch[];
  /** 복합 위반 */
  compoundViolations?: CompoundViolation[];
  /** 진료과목별 위반 */
  departmentViolations?: DepartmentViolation[];
  /** 필수 기재사항 검사 결과 */
  mandatoryCheck?: MandatoryCheckResult;
  /** 감지된 진료과목 */
  department?: DepartmentType;
}

// ============================================
// 톤 분석 패턴
// ============================================

const TONE_PATTERNS: Array<{
  tone: ToneType;
  patterns: RegExp[];
  weight: number;
}> = [
  {
    tone: 'AGGRESSIVE',
    patterns: [
      /지금\s*(?:당장|바로|즉시)/gi,
      /(?:놓치지|후회하지)\s*마세요/gi,
      /(?:한정|마감|선착순)/gi,
      /(?:오늘|이번\s*주)\s*(?:만|까지)/gi,
    ],
    weight: 1.0,
  },
  {
    tone: 'PROMOTIONAL',
    patterns: [
      /(?:특가|할인|이벤트|세일)/gi,
      /(?:\d+)%\s*(?:할인|DC|OFF)/gi,
      /(?:무료|공짜|0원)/gi,
      /(?:가격|비용)\s*(?:파격|특별)/gi,
    ],
    weight: 0.8,
  },
  {
    tone: 'EMOTIONAL',
    patterns: [
      /(?:고민|걱정|스트레스)\s*(?:이신가요|되시나요)/gi,
      /(?:힘드|괴로|어려)\s*(?:시죠|우시죠)/gi,
      /(?:행복|기쁨|만족)\s*(?:을|를)\s*(?:드립니다|선물)/gi,
      /(?:꿈|희망|소망)/gi,
    ],
    weight: 0.6,
  },
  {
    tone: 'REASSURING',
    patterns: [
      /(?:안심|안전|걱정\s*없)/gi,
      /(?:믿고|신뢰)\s*(?:맡기|오세요)/gi,
      /(?:편안한?|부담\s*없)/gi,
      /(?:확실한?|보장)/gi,
    ],
    weight: 0.5,
  },
  {
    tone: 'URGENT',
    patterns: [
      /(?:마감|종료)\s*(?:임박|직전)/gi,
      /(?:서두르|빨리)/gi,
      /(?:지금이\s*아니면|기회)/gi,
      /(?:막차|마지막)/gi,
    ],
    weight: 0.9,
  },
  {
    tone: 'PROFESSIONAL',
    patterns: [
      /(?:전문|숙련|경력)\s*(?:의료진|의사)/gi,
      /(?:최신|첨단)\s*(?:장비|기술)/gi,
      /(?:연구|논문|학회)/gi,
      /(?:인증|허가|승인)/gi,
    ],
    weight: -0.3, // 긍정적 요소
  },
  {
    tone: 'INFORMATIVE',
    patterns: [
      /(?:안내|설명|정보)/gi,
      /(?:특징|장점|효과)\s*(?:는|은)/gi,
      /(?:방법|과정|절차)/gi,
      /(?:주의사항|부작용)/gi,
    ],
    weight: -0.2, // 긍정적 요소
  },
];

// ============================================
// 신뢰성 요소 패턴
// ============================================

const CREDIBILITY_POSITIVE_PATTERNS: Array<{
  pattern: RegExp;
  factor: string;
  weight: number;
}> = [
  { pattern: /의료법\s*(?:제?\d+조)?/gi, factor: '법적 근거 제시', weight: 10 },
  { pattern: /(?:식약처|FDA|CE)\s*(?:허가|승인|인증)/gi, factor: '공인 인증 언급', weight: 10 },
  { pattern: /(?:연구|논문|임상)\s*(?:결과|데이터)/gi, factor: '연구 근거 제시', weight: 8 },
  { pattern: /개인\s*(?:차이|마다|에\s*따라)/gi, factor: '개인차 명시', weight: 5 },
  { pattern: /(?:부작용|이상반응)\s*(?:이|가)\s*(?:있을|발생)/gi, factor: '부작용 언급', weight: 8 },
  { pattern: /(?:전문의|의사)\s*(?:와|과)\s*(?:상담|상의)/gi, factor: '전문 상담 권유', weight: 5 },
  { pattern: /(?:사전\s*)?(?:검사|진단)\s*(?:필요|필수)/gi, factor: '사전 검사 안내', weight: 5 },
];

const CREDIBILITY_NEGATIVE_PATTERNS: Array<{
  pattern: RegExp;
  factor: string;
  weight: number;
}> = [
  { pattern: /(?:100%|완벽|확실)\s*(?:효과|완치|보장)/gi, factor: '효과 100% 보장', weight: -15 },
  { pattern: /부작용\s*(?:없|제로|0)/gi, factor: '부작용 없다고 단정', weight: -15 },
  { pattern: /(?:최고|최초|유일|독보적)/gi, factor: '최상급 표현 사용', weight: -10 },
  { pattern: /(?:다른|타)\s*(?:병원|의원)\s*(?:보다|대비)/gi, factor: '타 의료기관 비교', weight: -12 },
  { pattern: /(?:1|한)\s*(?:번|회)\s*(?:에|로)\s*(?:완치|해결)/gi, factor: '단기 완치 주장', weight: -10 },
  { pattern: /(?:평생|영구)\s*(?:효과|보장|유지)/gi, factor: '영구적 효과 주장', weight: -10 },
  { pattern: /(?:재발\s*없|다시는\s*안)/gi, factor: '재발 없음 주장', weight: -12 },
];

// ============================================
// 전체 인상 분석기 클래스
// ============================================

export class ImpressionAnalyzer {
  /**
   * 종합 인상 분석
   */
  analyze(input: AnalysisInput): ImpressionAnalysis {
    const { text, patternMatches, compoundViolations, departmentViolations, mandatoryCheck } = input;

    // 톤 분석
    const toneAnalysis = this.analyzeTone(text);

    // 신뢰성 분석
    const credibilityAnalysis = this.analyzeCredibility(text);

    // 위반 기반 점수 계산
    const violationScore = this.calculateViolationScore(
      patternMatches,
      compoundViolations,
      departmentViolations
    );

    // 필수 기재사항 점수
    const mandatoryScore = mandatoryCheck?.score || 50;

    // 종합 위험 점수 계산
    const riskScore = this.calculateRiskScore(
      toneAnalysis,
      credibilityAnalysis,
      violationScore,
      mandatoryScore
    );

    // 위험 수준 결정
    const riskLevel = this.determineRiskLevel(riskScore);

    // 규정 준수 점수
    const complianceScore = Math.max(0, 100 - riskScore);

    // 주요 문제점 수집
    const keyIssues = this.collectKeyIssues(
      toneAnalysis,
      credibilityAnalysis,
      patternMatches,
      compoundViolations,
      departmentViolations,
      mandatoryCheck
    );

    // 개선 권고사항 생성
    const recommendations = this.generateRecommendations(
      keyIssues,
      toneAnalysis,
      credibilityAnalysis,
      mandatoryCheck
    );

    // 종합 평가 생성
    const overallAssessment = this.generateOverallAssessment(
      riskLevel,
      riskScore,
      keyIssues.length
    );

    // 분석 신뢰도 계산
    const confidence = this.calculateConfidence(
      text.length,
      (patternMatches?.length || 0) +
        (compoundViolations?.length || 0) +
        (departmentViolations?.length || 0)
    );

    return {
      riskLevel,
      riskScore,
      toneAnalysis,
      credibilityAnalysis,
      complianceScore,
      overallAssessment,
      keyIssues,
      recommendations,
      confidence,
    };
  }

  /**
   * 톤 분석
   */
  private analyzeTone(text: string): ToneAnalysis {
    const toneScores = new Map<ToneType, number>();
    const toneSignals: string[] = [];
    let totalAggressiveness = 0;

    for (const { tone, patterns, weight } of TONE_PATTERNS) {
      let score = 0;
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        const matches = text.match(pattern);
        if (matches) {
          score += matches.length;
          toneSignals.push(...matches.slice(0, 2).map(m => `[${tone}] ${m}`));
        }
      }
      toneScores.set(tone, score);

      // 공격성 계산
      if (weight > 0 && score > 0) {
        totalAggressiveness += score * weight;
      }
    }

    // 주요 톤 결정
    let maxScore = 0;
    let primaryTone: ToneType = 'NEUTRAL';
    const secondaryTones: ToneType[] = [];

    for (const [tone, score] of toneScores) {
      if (score > maxScore) {
        if (maxScore > 0) {
          secondaryTones.push(primaryTone);
        }
        maxScore = score;
        primaryTone = tone;
      } else if (score > 0) {
        secondaryTones.push(tone);
      }
    }

    // 톤 점수 계산 (-1 ~ 1)
    let toneScore = 0;
    const negativeWeight =
      (toneScores.get('AGGRESSIVE') || 0) * 1.0 +
      (toneScores.get('URGENT') || 0) * 0.8 +
      (toneScores.get('PROMOTIONAL') || 0) * 0.3;
    const positiveWeight =
      (toneScores.get('PROFESSIONAL') || 0) * 0.5 +
      (toneScores.get('INFORMATIVE') || 0) * 0.5;

    const totalWeight = negativeWeight + positiveWeight;
    if (totalWeight > 0) {
      toneScore = (positiveWeight - negativeWeight) / totalWeight;
    }

    // 공격성 정규화 (0-1)
    const aggressiveness = Math.min(1, totalAggressiveness / 10);

    return {
      primaryTone,
      secondaryTones,
      toneScore,
      aggressiveness,
      toneSignals,
    };
  }

  /**
   * 신뢰성 분석
   */
  private analyzeCredibility(text: string): CredibilityAnalysis {
    const positiveFactors: string[] = [];
    const negativeFactors: string[] = [];
    let score = 50; // 기본 점수

    // 긍정적 요소 검사
    for (const { pattern, factor, weight } of CREDIBILITY_POSITIVE_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        positiveFactors.push(factor);
        score += weight;
      }
    }

    // 부정적 요소 검사
    for (const { pattern, factor, weight } of CREDIBILITY_NEGATIVE_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        negativeFactors.push(factor);
        score += weight; // 음수 가중치
      }
    }

    // 점수 정규화 (0-100)
    score = Math.max(0, Math.min(100, score));

    // 신뢰성 인상 결정
    let impression: CredibilityImpression;
    if (score >= 70) {
      impression = 'HIGH';
    } else if (score >= 50) {
      impression = 'MEDIUM';
    } else if (score >= 30) {
      impression = 'LOW';
    } else {
      impression = 'SUSPICIOUS';
    }

    return {
      impression,
      score,
      positiveFactors,
      negativeFactors,
    };
  }

  /**
   * 위반 기반 점수 계산
   */
  private calculateViolationScore(
    patternMatches?: PatternMatch[],
    compoundViolations?: CompoundViolation[],
    departmentViolations?: DepartmentViolation[]
  ): number {
    let score = 0;

    // 패턴 매칭 위반
    if (patternMatches) {
      for (const match of patternMatches) {
        if (match.severity === 'critical') score += 25;
        else if (match.severity === 'major') score += 15;
        else score += 5;
      }
    }

    // 복합 위반
    if (compoundViolations) {
      for (const violation of compoundViolations) {
        if (violation.severity === 'critical') score += 30;
        else if (violation.severity === 'major') score += 20;
        else score += 10;
      }
    }

    // 진료과목별 위반
    if (departmentViolations) {
      for (const violation of departmentViolations) {
        if (violation.severity === 'critical') score += 20;
        else if (violation.severity === 'major') score += 12;
        else score += 5;
      }
    }

    return Math.min(100, score);
  }

  /**
   * 종합 위험 점수 계산
   */
  private calculateRiskScore(
    toneAnalysis: ToneAnalysis,
    credibilityAnalysis: CredibilityAnalysis,
    violationScore: number,
    mandatoryScore: number
  ): number {
    // 가중치 적용
    const weights = {
      violation: 0.4,
      credibility: 0.25,
      tone: 0.2,
      mandatory: 0.15,
    };

    const credibilityRisk = 100 - credibilityAnalysis.score;
    const toneRisk = (toneAnalysis.aggressiveness + (1 - (toneAnalysis.toneScore + 1) / 2)) * 50;
    const mandatoryRisk = 100 - mandatoryScore;

    const riskScore =
      violationScore * weights.violation +
      credibilityRisk * weights.credibility +
      toneRisk * weights.tone +
      mandatoryRisk * weights.mandatory;

    return Math.round(Math.min(100, Math.max(0, riskScore)));
  }

  /**
   * 위험 수준 결정
   */
  private determineRiskLevel(riskScore: number): RiskLevel {
    if (riskScore >= 80) return 'CRITICAL';
    if (riskScore >= 60) return 'HIGH';
    if (riskScore >= 40) return 'MEDIUM';
    if (riskScore >= 20) return 'LOW';
    return 'SAFE';
  }

  /**
   * 주요 문제점 수집
   */
  private collectKeyIssues(
    toneAnalysis: ToneAnalysis,
    credibilityAnalysis: CredibilityAnalysis,
    patternMatches?: PatternMatch[],
    compoundViolations?: CompoundViolation[],
    departmentViolations?: DepartmentViolation[],
    mandatoryCheck?: MandatoryCheckResult
  ): string[] {
    const issues: string[] = [];

    // 톤 관련 문제
    if (toneAnalysis.aggressiveness > 0.6) {
      issues.push('광고 톤이 지나치게 공격적입니다');
    }
    if (toneAnalysis.primaryTone === 'URGENT') {
      issues.push('긴급성을 과도하게 강조하고 있습니다');
    }

    // 신뢰성 관련 문제
    for (const factor of credibilityAnalysis.negativeFactors) {
      issues.push(factor);
    }

    // 패턴 매칭 위반
    if (patternMatches) {
      const criticalMatches = patternMatches.filter(m => m.severity === 'critical');
      if (criticalMatches.length > 0) {
        issues.push(`심각한 위반 ${criticalMatches.length}건 감지됨`);
      }
    }

    // 복합 위반
    if (compoundViolations && compoundViolations.length > 0) {
      issues.push(`복합 위반 ${compoundViolations.length}건 감지됨`);
    }

    // 진료과목별 위반
    if (departmentViolations && departmentViolations.length > 0) {
      issues.push(`진료과목 특화 위반 ${departmentViolations.length}건 감지됨`);
    }

    // 필수 기재사항 누락
    if (mandatoryCheck && mandatoryCheck.missingItems.length > 0) {
      issues.push(`필수 기재사항 누락: ${mandatoryCheck.missingItems.join(', ')}`);
    }

    return issues;
  }

  /**
   * 개선 권고사항 생성
   */
  private generateRecommendations(
    keyIssues: string[],
    toneAnalysis: ToneAnalysis,
    credibilityAnalysis: CredibilityAnalysis,
    mandatoryCheck?: MandatoryCheckResult
  ): string[] {
    const recommendations: string[] = [];

    // 톤 관련 권고
    if (toneAnalysis.aggressiveness > 0.5) {
      recommendations.push('광고 톤을 보다 정보 제공적으로 조정하세요');
    }

    // 신뢰성 관련 권고
    if (credibilityAnalysis.score < 50) {
      recommendations.push('객관적인 근거와 데이터를 추가하세요');
      recommendations.push('부작용 가능성과 개인차를 명시하세요');
    }

    // 필수 기재사항 관련 권고
    if (mandatoryCheck?.missingItems.length) {
      for (const item of mandatoryCheck.missingItems) {
        recommendations.push(`${item}을(를) 추가하세요`);
      }
    }

    // 일반 권고
    if (keyIssues.length > 0) {
      recommendations.push('전문가 상담을 통한 법적 검토를 권장합니다');
    }

    if (credibilityAnalysis.positiveFactors.length === 0) {
      recommendations.push('면책 조항을 추가하여 법적 위험을 줄이세요');
    }

    return recommendations;
  }

  /**
   * 종합 평가 생성
   */
  private generateOverallAssessment(
    riskLevel: RiskLevel,
    riskScore: number,
    issueCount: number
  ): string {
    const riskLabels: Record<RiskLevel, string> = {
      SAFE: '안전',
      LOW: '낮은 위험',
      MEDIUM: '중간 위험',
      HIGH: '높은 위험',
      CRITICAL: '심각한 위험',
    };

    const assessments: Record<RiskLevel, string> = {
      SAFE: '이 광고는 의료광고 규정을 잘 준수하고 있습니다.',
      LOW: '이 광고는 대체로 규정을 준수하고 있으나, 일부 개선이 필요합니다.',
      MEDIUM: '이 광고는 여러 문제점이 있어 수정이 필요합니다.',
      HIGH: '이 광고는 심각한 규정 위반이 있어 즉각적인 수정이 필요합니다.',
      CRITICAL: '이 광고는 다수의 심각한 위반이 있어 게시를 중단하고 전면 수정해야 합니다.',
    };

    return `[${riskLabels[riskLevel]}] 위험 점수: ${riskScore}/100, 문제점 ${issueCount}건 발견. ${assessments[riskLevel]}`;
  }

  /**
   * 분석 신뢰도 계산
   */
  private calculateConfidence(textLength: number, violationCount: number): number {
    let confidence = 0.7;

    // 텍스트 길이에 따른 신뢰도
    if (textLength > 500) confidence += 0.1;
    if (textLength > 1000) confidence += 0.05;
    if (textLength < 100) confidence -= 0.15;

    // 위반 감지 수에 따른 신뢰도
    if (violationCount > 0) confidence += 0.05;
    if (violationCount > 5) confidence += 0.05;

    return Math.min(0.95, Math.max(0.5, confidence));
  }

  /**
   * 간단 분석 (텍스트만)
   */
  analyzeSimple(text: string): ImpressionAnalysis {
    return this.analyze({ text });
  }

  /**
   * 위험 수준 한글 변환
   */
  getRiskLevelLabel(level: RiskLevel): string {
    const labels: Record<RiskLevel, string> = {
      SAFE: '안전',
      LOW: '낮은 위험',
      MEDIUM: '중간 위험',
      HIGH: '높은 위험',
      CRITICAL: '심각한 위험',
    };
    return labels[level];
  }

  /**
   * 톤 유형 한글 변환
   */
  getToneLabel(tone: ToneType): string {
    const labels: Record<ToneType, string> = {
      PROFESSIONAL: '전문적',
      PROMOTIONAL: '홍보성',
      AGGRESSIVE: '공격적',
      EMOTIONAL: '감성적',
      INFORMATIVE: '정보 제공적',
      REASSURING: '안심 유도',
      URGENT: '긴급성 강조',
      NEUTRAL: '중립적',
    };
    return labels[tone];
  }

  /**
   * 신뢰성 인상 한글 변환
   */
  getCredibilityLabel(impression: CredibilityImpression): string {
    const labels: Record<CredibilityImpression, string> = {
      HIGH: '높은 신뢰성',
      MEDIUM: '보통',
      LOW: '낮은 신뢰성',
      SUSPICIOUS: '의심스러움',
    };
    return labels[impression];
  }
}

// 싱글톤 인스턴스
export const impressionAnalyzer = new ImpressionAnalyzer();

// 팩토리 함수
export function createImpressionAnalyzer(): ImpressionAnalyzer {
  return new ImpressionAnalyzer();
}
