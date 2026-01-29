/**
 * 규칙 엔진
 * 패턴 매칭 결과를 분석하여 위반 판정 및 점수/등급 계산
 */

import type { PatternMatch } from './pattern-matcher';
import type { ViolationResult, ViolationType, ViolationSeverity } from '../../types';

// ============================================
// 타입 정의
// ============================================

/**
 * 분석 등급
 */
export type AnalysisGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * 등급별 설명
 */
export const GRADE_DESCRIPTIONS: Record<AnalysisGrade, string> = {
  A: '우수 - 위반 사항 없음',
  B: '양호 - 경미한 위반 존재',
  C: '주의 - 개선 필요',
  D: '위험 - 즉시 수정 필요',
  F: '심각 - 법적 조치 가능',
};

/**
 * 점수 계산 결과
 */
export interface ScoreResult {
  /** 총점 (0-100, 높을수록 위반 심각) */
  totalScore: number;
  /** 심각도별 점수 */
  severityScores: {
    critical: number;
    major: number;
    minor: number;
  };
  /** 카테고리별 점수 */
  categoryScores: Record<string, number>;
  /** 최종 등급 */
  grade: AnalysisGrade;
  /** 등급 설명 */
  gradeDescription: string;
  /** 준수율 (100 - totalScore) */
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
// 점수 가중치 설정
// ============================================

const SEVERITY_WEIGHTS = {
  critical: 30,  // critical 위반 1건당 30점
  major: 15,     // major 위반 1건당 15점
  minor: 5,      // minor 위반 1건당 5점
};

const CATEGORY_WEIGHTS: Record<string, number> = {
  '치료효과보장': 1.5,    // 치료효과 보장은 가중치 높음
  '부작용부정': 1.5,      // 부작용 부정도 가중치 높음
  '최상급표현': 1.2,
  '비교광고': 1.3,
  '환자유인': 1.4,
  '전후사진': 1.2,
  '체험기': 1.1,
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
    // 위반 결과 생성
    const violations = this.convertToViolations(matches);

    // 점수 계산
    const score = this.calculateScore(matches);

    // 요약 생성
    const summary = this.generateSummary(violations, score);

    // 권장 조치 생성
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
    }));
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
   * 점수 계산
   */
  private calculateScore(matches: PatternMatch[]): ScoreResult {
    const severityScores = { critical: 0, major: 0, minor: 0 };
    const categoryScores: Record<string, number> = {};

    let totalScore = 0;

    for (const match of matches) {
      // 심각도별 점수
      const baseScore = SEVERITY_WEIGHTS[match.severity];
      const categoryWeight = CATEGORY_WEIGHTS[match.category] || 1.0;
      const weightedScore = baseScore * categoryWeight;

      severityScores[match.severity] += baseScore;

      // 카테고리별 점수
      if (!categoryScores[match.category]) {
        categoryScores[match.category] = 0;
      }
      categoryScores[match.category] += weightedScore;

      totalScore += weightedScore;
    }

    // 점수 정규화 (최대 100)
    totalScore = Math.min(100, Math.round(totalScore));

    // 등급 결정
    const grade = this.calculateGrade(totalScore);

    return {
      totalScore,
      severityScores,
      categoryScores,
      grade,
      gradeDescription: GRADE_DESCRIPTIONS[grade],
      complianceRate: 100 - totalScore,
    };
  }

  /**
   * 등급 계산
   */
  private calculateGrade(score: number): AnalysisGrade {
    if (score === 0) return 'A';
    if (score <= 10) return 'B';
    if (score <= 30) return 'C';
    if (score <= 60) return 'D';
    return 'F';
  }

  /**
   * 요약 생성
   */
  private generateSummary(violations: ViolationResult[], score: ScoreResult): string {
    if (violations.length === 0) {
      return '위반 사항이 발견되지 않았습니다. 광고 내용이 의료법을 준수하고 있습니다.';
    }

    const highCount = violations.filter(v => v.severity === 'high').length;
    const mediumCount = violations.filter(v => v.severity === 'medium').length;
    const lowCount = violations.filter(v => v.severity === 'low').length;

    const parts: string[] = [];
    if (highCount > 0) parts.push(`심각 ${highCount}건`);
    if (mediumCount > 0) parts.push(`주요 ${mediumCount}건`);
    if (lowCount > 0) parts.push(`경미 ${lowCount}건`);

    return `총 ${violations.length}건의 위반 발견 (${parts.join(', ')}). ` +
      `등급: ${score.grade} (${score.gradeDescription}), ` +
      `준수율: ${score.complianceRate}%`;
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
      recommendations.push('현재 광고 내용을 유지하세요.');
      return recommendations;
    }

    // 심각도별 권장 조치
    const highViolations = violations.filter(v => v.severity === 'high');
    const mediumViolations = violations.filter(v => v.severity === 'medium');

    if (highViolations.length > 0) {
      recommendations.push(
        `즉시 수정 필요: ${highViolations.length}건의 심각한 위반이 있습니다. ` +
        '법적 조치를 받을 수 있으므로 해당 내용을 즉시 삭제하거나 수정하세요.'
      );
    }

    if (mediumViolations.length > 0) {
      recommendations.push(
        `주요 수정 권장: ${mediumViolations.length}건의 주요 위반이 있습니다. ` +
        '광고 심의 과정에서 문제가 될 수 있습니다.'
      );
    }

    // 등급별 추가 권장 조치
    if (score.grade === 'F') {
      recommendations.push(
        '광고 전면 재검토를 권장합니다. 현재 상태로 게시 시 행정 처분 대상이 될 수 있습니다.'
      );
    } else if (score.grade === 'D') {
      recommendations.push(
        '광고 내용의 상당 부분 수정이 필요합니다. 전문가 검토를 받아보세요.'
      );
    }

    // 카테고리별 구체적 권장
    const categories = [...new Set(violations.map(v => v.type))];

    if (categories.includes('guarantee')) {
      recommendations.push(
        '"완치", "100%" 등 치료 효과를 보장하는 표현을 삭제하세요.'
      );
    }

    if (categories.includes('exaggeration')) {
      recommendations.push(
        '"최고", "최상", "유일" 등 과장 표현을 객관적 사실로 대체하세요.'
      );
    }

    if (categories.includes('before_after')) {
      recommendations.push(
        '전후 비교 사진 사용 시 반드시 법적 요건을 확인하세요.'
      );
    }

    return recommendations;
  }
}

// 싱글톤 인스턴스
export const ruleEngine = new RuleEngine();
