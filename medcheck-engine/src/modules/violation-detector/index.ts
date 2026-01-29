/**
 * 위반 탐지 모듈 (Violation Detector)
 * 의료광고 텍스트에서 위반 패턴을 탐지하고 판정
 */

import { PatternMatcher, patternMatcher } from './pattern-matcher';
import { RuleEngine, ruleEngine } from './rule-engine';
import type { PatternMatch, MatchOptions } from './pattern-matcher';
import type { ViolationJudgment, ScoreResult, AnalysisGrade } from './rule-engine';

// ============================================
// 타입 재export
// ============================================

export type { PatternMatch, MatchOptions } from './pattern-matcher';
export type { ViolationJudgment, ScoreResult, AnalysisGrade } from './rule-engine';
export { GRADE_DESCRIPTIONS } from './rule-engine';

// ============================================
// 분석 요청/응답 타입
// ============================================

/**
 * 분석 요청
 */
export interface DetectionRequest {
  /** 분석할 텍스트 */
  text: string;
  /** 옵션 */
  options?: MatchOptions;
}

/**
 * 분석 응답
 */
export interface DetectionResponse {
  /** 분석 ID */
  id: string;
  /** 입력 텍스트 길이 */
  inputLength: number;
  /** 매칭 결과 */
  matches: PatternMatch[];
  /** 위반 판정 */
  judgment: ViolationJudgment;
  /** 처리 시간 (ms) */
  processingTimeMs: number;
}

// ============================================
// ViolationDetector 클래스
// ============================================

/**
 * 위반 탐지기
 * 패턴 매칭과 규칙 엔진을 통합하여 분석 수행
 */
export class ViolationDetector {
  private matcher: PatternMatcher;
  private engine: RuleEngine;

  constructor(
    matcher: PatternMatcher = patternMatcher,
    engine: RuleEngine = ruleEngine
  ) {
    this.matcher = matcher;
    this.engine = engine;
  }

  /**
   * 텍스트 분석 수행
   */
  analyze(request: DetectionRequest): DetectionResponse {
    const startTime = Date.now();
    const { text, options } = request;

    // 1. 패턴 매칭
    const matches = this.matcher.match(text, options);

    // 2. 위반 판정
    const judgment = this.engine.judge(matches);

    // 3. 분석 ID 생성
    const id = this.generateAnalysisId();

    const processingTimeMs = Date.now() - startTime;

    return {
      id,
      inputLength: text.length,
      matches,
      judgment,
      processingTimeMs,
    };
  }

  /**
   * 빠른 분석 (점수만 반환)
   */
  quickScore(text: string): ScoreResult {
    const matches = this.matcher.match(text);
    const judgment = this.engine.judge(matches);
    return judgment.score;
  }

  /**
   * 등급만 반환
   */
  getGrade(text: string): AnalysisGrade {
    return this.quickScore(text).grade;
  }

  /**
   * 위반 여부만 체크
   */
  hasViolation(text: string): boolean {
    const matches = this.matcher.match(text, { maxMatches: 1 });
    return matches.length > 0;
  }

  /**
   * 특정 카테고리 분석
   */
  analyzeCategory(text: string, category: string): DetectionResponse {
    return this.analyze({
      text,
      options: { categories: [category] },
    });
  }

  /**
   * 심각한 위반만 분석
   */
  analyzeCritical(text: string): DetectionResponse {
    return this.analyze({
      text,
      options: { minSeverity: 'critical' },
    });
  }

  /**
   * 분석 ID 생성
   */
  private generateAnalysisId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `vd_${timestamp}_${random}`;
  }

  /**
   * 패턴 수 조회
   */
  getPatternCount(): number {
    return this.matcher.getPatternCount();
  }

  /**
   * 카테고리 목록 조회
   */
  getCategories(): string[] {
    return this.matcher.getCategories();
  }
}

// 싱글톤 인스턴스
export const violationDetector = new ViolationDetector();

// 클래스 및 인스턴스 export
export { PatternMatcher, patternMatcher } from './pattern-matcher';
export { RuleEngine, ruleEngine } from './rule-engine';
