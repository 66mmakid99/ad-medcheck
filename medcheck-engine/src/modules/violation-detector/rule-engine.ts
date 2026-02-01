/**
 * 규칙 엔진
 * 패턴 매칭 결과를 분석하여 위반 판정 및 청정지수/등급 계산
 * 
 * v2.1 수정사항:
 * - 점수 체계 역전: 100점 = 좋음 (청정지수)
 * - 날씨 이모지 + 직관적 상태 표현
 * - 신뢰도를 점수 계산에 반영
 * - 부드럽고 간결한 안내 문구
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
  /** 심각도별 감점 */
  severityDeductions: {
    critical: number;
    major: number;
    minor: number;
  };
  /** 카테고리별 감점 */
  categoryDeductions: Record<string, number>;
  /** 최종 등급 */
  grade: AnalysisGrade;
  /** 등급 정보 */
  gradeInfo: GradeInfo;
  
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

const SEVERITY_DEDUCTIONS = {
  critical: 25,
  major: 12,
  minor: 5,
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

// ============================================
// 규칙 엔진 클래스
// ============================================

export class RuleEngine {
  /**
   * 패턴 매칭 결과를 위반 판정으로 변환
   */
  judge(matches: PatternMatch[]): ViolationJudgment {
    const violations = this.convertToViolations(matches);
    const score = this.calculateScore(matches);
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
   * PatternMatch → ViolationResult 변환
   */
  private convertToViolations(matches: PatternMatch[]): ViolationResult[] {
    return matches.map(match => ({
      type: this.mapCategoryToType(match.category),
      status: this.determineStatus(match.confidence),
      severity: this.mapSeverity(match.severity),
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
   * 심각도 매핑
   */
  private mapSeverity(severity: string): ViolationSeverity {
    if (severity === 'critical') return 'high';
    if (severity === 'major') return 'medium';
    return 'low';
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
   * 청정지수 계산 (신뢰도 반영)
   */
  private calculateScore(matches: PatternMatch[]): ScoreResult {
    const severityDeductions = { critical: 0, major: 0, minor: 0 };
    const categoryDeductions: Record<string, number> = {};

    let totalDeduction = 0;

    for (const match of matches) {
      const baseDeduction = SEVERITY_DEDUCTIONS[match.severity];
      const categoryWeight = CATEGORY_WEIGHTS[match.category] || 1.0;
      const confidenceMultiplier = match.confidence;
      const weightedDeduction = baseDeduction * categoryWeight * confidenceMultiplier;

      severityDeductions[match.severity] += Math.round(baseDeduction * confidenceMultiplier);

      if (!categoryDeductions[match.category]) {
        categoryDeductions[match.category] = 0;
      }
      categoryDeductions[match.category] += Math.round(weightedDeduction);

      totalDeduction += weightedDeduction;
    }

    totalDeduction = Math.min(100, Math.round(totalDeduction));
    const cleanScore = Math.max(0, 100 - totalDeduction);
    const grade = this.calculateGrade(cleanScore);
    const gradeInfo = GRADE_INFO[grade];

    return {
      cleanScore,
      totalDeduction,
      severityDeductions,
      categoryDeductions,
      grade,
      gradeInfo,
      // 이전 버전 호환성
      totalScore: cleanScore,
      gradeDescription: GRADE_DESCRIPTIONS[grade],
      complianceRate: cleanScore,
    };
  }

  /**
   * 등급 계산
   */
  private calculateGrade(cleanScore: number): AnalysisGrade {
    if (cleanScore === 100) return 'S';
    if (cleanScore >= 90) return 'A';
    if (cleanScore >= 70) return 'B';
    if (cleanScore >= 50) return 'C';
    if (cleanScore >= 30) return 'D';
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

    // 심각도별 개수
    const highCount = violations.filter(v => v.severity === 'high').length;
    const mediumCount = violations.filter(v => v.severity === 'medium').length;
    const lowCount = violations.filter(v => v.severity === 'low').length;

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
