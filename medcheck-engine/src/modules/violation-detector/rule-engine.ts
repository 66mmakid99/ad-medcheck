/**
 * 규칙 엔진
 * 패턴 매칭 결과를 분석하여 위반 판정 및 청정지수/등급 계산
 *
 * v2.1 수정사항:
 * - 점수 체계 역전: 100점 = 좋음 (청정지수)
 * - 날씨 이모지 + 직관적 상태 표현
 * - 신뢰도를 점수 계산에 반영
 * - 부드럽고 간결한 안내 문구
 *
 * v3.0 수정사항 (Task 1-1):
 * - 4단계 심각도 (critical/high/medium/low)
 * - 면책조항 감지 시 심각도 1단계 하향 (절대 위반 제외)
 * - 영역별 가중치 (event/treatment/faq/review/doctor)
 * - 카운트 기반 등급 계산
 */

import type { PatternMatch } from './pattern-matcher';
import type { ViolationResult, ViolationType, ViolationSeverity } from '../../types';

// ============================================
// 타입 정의
// ============================================

/**
 * 분석 등급
 */
export type AnalysisGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * 등급 정보
 */
export interface GradeInfo {
  emoji: string;
  status: string;
  message: string;
}

/**
 * 등급별 정보 (날씨 이모지 + 직관적 표현)
 */
export const GRADE_INFO: Record<AnalysisGrade, GradeInfo> = {
  S: {
    emoji: '☀️',
    status: '쾌적',
    message: '완벽해요! 규정을 잘 준수했어요',
  },
  A: {
    emoji: '🌤️',
    status: '화창',
    message: '아주 좋아요. 사소한 부분만 확인해보세요',
  },
  B: {
    emoji: '⛅',
    status: '맑음',
    message: '양호해요. 몇 가지만 다듬으면 더 좋아질 거예요',
  },
  C: {
    emoji: '🌥️',
    status: '흐림',
    message: '괜찮아요. 표시된 부분을 검토해주세요',
  },
  D: {
    emoji: '🌧️',
    status: '주의',
    message: '수정이 필요한 부분이 있어요',
  },
  F: {
    emoji: '⛈️',
    status: '경고',
    message: '전체적인 검토를 권장드려요',
  },
};

/**
 * 개별 항목 표시 (신뢰도 기반)
 */
export interface ItemLabel {
  emoji: string;
  label: string;
  message: string;
}

export const CONFIDENCE_LABELS: Record<'high' | 'medium' | 'low', ItemLabel> = {
  high: {
    emoji: '🌧️',
    label: '수정 권장',
    message: '이 표현은 수정해주시면 좋겠어요',
  },
  medium: {
    emoji: '🌦️',
    label: '검토 필요',
    message: '이 표현을 확인해주세요',
  },
  low: {
    emoji: '☁️',
    label: '참고',
    message: '맥락에 따라 주의가 필요할 수 있어요',
  },
};

// 이전 버전 호환성을 위한 GRADE_DESCRIPTIONS
export const GRADE_DESCRIPTIONS: Record<AnalysisGrade, string> = {
  S: '☀️ 쾌적 - 완벽해요!',
  A: '🌤️ 화창 - 아주 좋아요',
  B: '⛅ 맑음 - 양호해요',
  C: '🌥️ 흐림 - 괜찮아요',
  D: '🌧️ 주의 - 수정이 필요해요',
  F: '⛈️ 경고 - 검토가 필요해요',
};

/**
 * 청정지수 결과
 */
export interface ScoreResult {
  /** 청정지수 (0-100, 높을수록 좋음) */
  cleanScore: number;
  /** 감점 합계 */
  totalDeduction: number;
  /** 심각도별 감점 (4단계) */
  severityDeductions: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  /** 심각도별 개수 (4단계) */
  severityCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  /** 카테고리별 감점 */
  categoryDeductions: Record<string, number>;
  /** 최종 등급 */
  grade: AnalysisGrade;
  /** 등급 정보 */
  gradeInfo: GradeInfo;
  /** 영역 타입 */
  sectionType?: string;

  // 이전 버전 호환성
  totalScore: number;
  gradeDescription: string;
  complianceRate: number;
}

/**
 * 위반 판정 결과
 */
export interface ViolationJudgment {
  /** 위반 목록 */
  violations: ViolationResult[];
  /** 점수 결과 */
  score: ScoreResult;
  /** 분석 요약 */
  summary: string;
  /** 권장 조치 */
  recommendations: string[];
  /** 분석 시간 */
  analyzedAt: Date;
}

// ============================================
// 감점 가중치 설정
// ============================================

/**
 * 4단계 심각도별 감점 (출력 심각도 기준)
 */
const SEVERITY_DEDUCTIONS: Record<string, number> = {
  critical: 25,
  high: 15,
  medium: 8,
  low: 3,
};

const CATEGORY_WEIGHTS: Record<string, number> = {
  '치료효과보장': 1.3,
  '부작용부정': 1.3,
  '최상급표현': 1.1,
  '비교광고': 1.2,
  '환자유인': 1.2,
  '전후사진': 1.1,
  '체험기': 1.0,
  '금지어': 1.0,
};

/**
 * 영역별 가중치
 */
const SECTION_WEIGHTS: Record<string, number> = {
  'event': 0.8,       // 이벤트 - 할인 표현 흔함
  'treatment': 1.2,   // 시술 설명 - 과장 표현 심각
  'faq': 0.6,         // FAQ - 정보 제공 목적
  'review': 0.7,      // 후기 - 환자 표현
  'doctor': 1.0,      // 의사 소개
  'default': 1.0,     // 기타
};

/**
 * 절대 위반 패턴 (면책조항 있어도 심각도 유지)
 */
const ABSOLUTE_VIOLATIONS = [
  'P-56-01-001',  // 100% 완치/성공
  'P-56-01-002',  // 100% 효과 보장
  'P-56-02-001',  // 부작용 없음 단정
];

// ============================================
// 규칙 엔진 클래스
// ============================================

export class RuleEngine {
  /**
   * 패턴 매칭 결과를 위반 판정으로 변환
   * @param matches 패턴 매칭 결과
   * @param sectionType 영역 타입 (event/treatment/faq/review/doctor/default)
   */
  judge(matches: PatternMatch[], sectionType?: string): ViolationJudgment {
    const violations = this.convertToViolations(matches);
    const score = this.calculateScore(violations, sectionType);
    const summary = this.generateSummary(violations, score);
    const recommendations = this.generateRecommendations(violations, score);

    return {
      violations,
      score,
      summary,
      recommendations,
      analyzedAt: new Date(),
    };
  }

  /**
   * PatternMatch → ViolationResult 변환 (4단계 심각도 + 면책조항 하향)
   */
  private convertToViolations(matches: PatternMatch[]): ViolationResult[] {
    return matches.map(match => ({
      type: this.mapCategoryToType(match.category),
      status: this.determineStatus(match.confidence),
      severity: this.mapSeverity(match.severity, match.disclaimerDetected, match.patternId),
      matchedText: match.matchedText,
      position: match.position,
      description: match.description,
      legalBasis: [
        {
          law: '의료법',
          article: match.legalBasis,
          description: match.description,
        },
      ],
      confidence: match.confidence,
      patternId: match.patternId,
      itemLabel: this.getItemLabel(match.confidence),
      suggestion: match.suggestion,
    }));
  }

  /**
   * 신뢰도에 따른 라벨 반환
   */
  private getItemLabel(confidence: number): ItemLabel {
    if (confidence >= 0.85) return CONFIDENCE_LABELS.high;
    if (confidence >= 0.70) return CONFIDENCE_LABELS.medium;
    return CONFIDENCE_LABELS.low;
  }

  /**
   * 카테고리 → 위반 유형 매핑
   */
  private mapCategoryToType(category: string): ViolationType {
    const mapping: Record<string, ViolationType> = {
      '치료효과보장': 'guarantee',
      '부작용부정': 'false_claim',
      '최상급표현': 'exaggeration',
      '비교광고': 'comparison',
      '환자유인': 'price_inducement',
      '전후사진': 'before_after',
      '체험기': 'testimonial',
      '금지어': 'prohibited_expression',
    };
    return mapping[category] || 'other';
  }

  /**
   * 심각도 매핑 (3단계 패턴 → 4단계 출력)
   * 면책조항 감지 시 1단계 하향 (절대 위반 제외)
   */
  private mapSeverity(
    severity: string,
    disclaimerDetected?: boolean,
    patternId?: string
  ): ViolationSeverity {
    // 기본 매핑: critical→critical, major→high, minor→medium
    let mapped: ViolationSeverity;
    if (severity === 'critical') mapped = 'critical';
    else if (severity === 'major') mapped = 'high';
    else mapped = 'medium';

    // 면책조항 감지 시 1단계 하향 (절대 위반 제외)
    if (disclaimerDetected && patternId && !ABSOLUTE_VIOLATIONS.includes(patternId)) {
      mapped = this.downgradeSeverity(mapped);
    }

    return mapped;
  }

  /**
   * 심각도 1단계 하향
   */
  private downgradeSeverity(severity: ViolationSeverity): ViolationSeverity {
    switch (severity) {
      case 'critical': return 'high';
      case 'high': return 'medium';
      case 'medium': return 'low';
      case 'low': return 'low';
    }
  }

  /**
   * 신뢰도에 따른 상태 결정
   */
  private determineStatus(confidence: number): 'violation' | 'likely' | 'possible' {
    if (confidence >= 0.85) return 'violation';
    if (confidence >= 0.7) return 'likely';
    return 'possible';
  }

  /**
   * 청정지수 계산 (4단계 심각도 + 영역 가중치)
   */
  private calculateScore(violations: ViolationResult[], sectionType?: string): ScoreResult {
    const severityDeductions = { critical: 0, high: 0, medium: 0, low: 0 };
    const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    const categoryDeductions: Record<string, number> = {};
    const sectionWeight = SECTION_WEIGHTS[sectionType || 'default'] || 1.0;

    let totalDeduction = 0;

    for (const violation of violations) {
      const baseDeduction = SEVERITY_DEDUCTIONS[violation.severity] || 5;
      const categoryWeight = CATEGORY_WEIGHTS[this.reverseMapType(violation.type)] || 1.0;
      const confidenceMultiplier = violation.confidence;
      const weightedDeduction = baseDeduction * categoryWeight * sectionWeight * confidenceMultiplier;

      severityDeductions[violation.severity] += Math.round(baseDeduction * confidenceMultiplier);
      severityCounts[violation.severity]++;

      const categoryName = this.reverseMapType(violation.type);
      if (!categoryDeductions[categoryName]) {
        categoryDeductions[categoryName] = 0;
      }
      categoryDeductions[categoryName] += Math.round(weightedDeduction);

      totalDeduction += weightedDeduction;
    }

    totalDeduction = Math.min(100, Math.round(totalDeduction));
    const cleanScore = Math.max(0, 100 - totalDeduction);
    const grade = this.calculateGrade(severityCounts);
    const gradeInfo = GRADE_INFO[grade];

    return {
      cleanScore,
      totalDeduction,
      severityDeductions,
      severityCounts,
      categoryDeductions,
      grade,
      gradeInfo,
      sectionType,
      // 이전 버전 호환성
      totalScore: cleanScore,
      gradeDescription: GRADE_DESCRIPTIONS[grade],
      complianceRate: cleanScore,
    };
  }

  /**
   * ViolationType → 카테고리명 역매핑
   */
  private reverseMapType(type: ViolationType): string {
    const mapping: Record<ViolationType, string> = {
      'guarantee': '치료효과보장',
      'false_claim': '부작용부정',
      'exaggeration': '최상급표현',
      'comparison': '비교광고',
      'price_inducement': '환자유인',
      'before_after': '전후사진',
      'testimonial': '체험기',
      'prohibited_expression': '금지어',
      'other': '기타',
    };
    return mapping[type] || '기타';
  }

  /**
   * 등급 계산 (카운트 기반)
   */
  private calculateGrade(counts: { critical: number; high: number; medium: number; low: number }): AnalysisGrade {
    if (counts.critical === 0 && counts.high === 0 && counts.medium === 0 && counts.low === 0) return 'S';
    if (counts.critical === 0 && counts.high === 0 && counts.medium <= 2) return 'A';
    if (counts.critical === 0 && counts.high <= 1) return 'B';
    if (counts.critical === 0) return 'C';
    if (counts.critical <= 2) return 'D';
    return 'F';
  }

  /**
   * 요약 생성
   */
  private generateSummary(violations: ViolationResult[], score: ScoreResult): string {
    const { gradeInfo, cleanScore } = score;

    if (violations.length === 0) {
      return `${gradeInfo.emoji} ${gradeInfo.status} (${cleanScore}점) - ${gradeInfo.message}`;
    }

    return `${gradeInfo.emoji} ${gradeInfo.status} (${cleanScore}점) - 확인이 필요한 표현 ${violations.length}건`;
  }

  /**
   * 권장 조치 생성
   */
  private generateRecommendations(
    violations: ViolationResult[],
    score: ScoreResult
  ): string[] {
    const recommendations: string[] = [];

    if (violations.length === 0) {
      recommendations.push('현재 광고 내용을 유지해주세요.');
      return recommendations;
    }

    // 심각도별 개수 (4단계)
    const criticalCount = violations.filter(v => v.severity === 'critical').length;
    const highCount = violations.filter(v => v.severity === 'high').length;
    const mediumCount = violations.filter(v => v.severity === 'medium').length;
    const lowCount = violations.filter(v => v.severity === 'low').length;

    if (criticalCount > 0) {
      recommendations.push(`⛈️ 즉시 수정 ${criticalCount}건: 법적 위반 가능성이 높아요`);
    }

    if (highCount > 0) {
      recommendations.push(`🌧️ 수정 권장 ${highCount}건: 심의에서 지적받을 수 있어요`);
    }

    if (mediumCount > 0) {
      recommendations.push(`🌦️ 검토 필요 ${mediumCount}건: 확인해보시면 좋겠어요`);
    }

    if (lowCount > 0) {
      recommendations.push(`☁️ 참고 ${lowCount}건: 맥락에 따라 검토해주세요`);
    }

    // 카테고리별 구체적 안내
    const categories = [...new Set(violations.map(v => v.type))];

    if (categories.includes('guarantee')) {
      recommendations.push('💡 효과 보장 표현은 "개인에 따라 다를 수 있습니다" 문구를 추가해보세요');
    }

    if (categories.includes('exaggeration')) {
      recommendations.push('💡 "최고", "최상" 등은 객관적 표현으로 변경해보세요');
    }

    if (categories.includes('false_claim')) {
      recommendations.push('💡 부작용 관련 표현은 "최소화" 등으로 완화해보세요');
    }

    if (categories.includes('before_after')) {
      recommendations.push('💡 전후 사진 사용 시 법적 요건을 확인해주세요');
    }

    return recommendations;
  }
}

// 싱글톤 인스턴스
export const ruleEngine = new RuleEngine();
