/**
 * 위반 탐지 모듈 (Violation Detector)
 * 의료광고 텍스트에서 위반 패턴을 탐지하고 판정
 *
 * 통합 기능:
 * - 패턴 매칭 (오탐 방지 강화)
 * - 규칙 엔진
 * - 필수 기재사항 검사
 * - 복합 위반 탐지
 * - 진료과목별 특화 규칙
 * - 전체 인상 평가
 */

import { PatternMatcher, patternMatcher } from './pattern-matcher';
import { RuleEngine, ruleEngine } from './rule-engine';
import { CompoundDetector, compoundDetector } from './compound-detector';
import { DepartmentRuleEngine, departmentRuleEngine } from './department-rules';
import { ImpressionAnalyzer, impressionAnalyzer } from './impression-analyzer';
import { checkMandatoryItems } from '../mandatory-checker';

import type { PatternMatch, MatchOptions, ContextExceptionType } from './pattern-matcher';
import type { ViolationJudgment, ScoreResult, AnalysisGrade } from './rule-engine';
import type { CompoundViolation, CompoundRule } from './compound-detector';
import type { DepartmentViolation, DepartmentType, DepartmentDetectionResult } from './department-rules';
import type { ImpressionAnalysis, ToneAnalysis, CredibilityAnalysis, RiskLevel } from './impression-analyzer';
import type { MandatoryCheckResult } from '../mandatory-checker';

// ============================================
// 타입 재export
// ============================================

export type { PatternMatch, MatchOptions, ContextExceptionType } from './pattern-matcher';
export type { ViolationJudgment, ScoreResult, AnalysisGrade } from './rule-engine';
export type { CompoundViolation, CompoundRule } from './compound-detector';
export type { DepartmentViolation, DepartmentType, DepartmentDetectionResult } from './department-rules';
export type { ImpressionAnalysis, ToneAnalysis, CredibilityAnalysis, RiskLevel } from './impression-analyzer';
export type { MandatoryCheckResult } from '../mandatory-checker';
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
  /** 분석 대상 URL (영역 감지용) */
  url?: string;
  /** 확장 분석 활성화 (기본: true) */
  enableExtendedAnalysis?: boolean;
  /** 복합 위반 탐지 활성화 (기본: true) */
  enableCompoundDetection?: boolean;
  /** 진료과목별 분석 활성화 (기본: true) */
  enableDepartmentRules?: boolean;
  /** 전체 인상 분석 활성화 (기본: true) */
  enableImpressionAnalysis?: boolean;
  /** 필수 기재사항 검사 활성화 (기본: true) */
  enableMandatoryCheck?: boolean;
  /** 지정 진료과목 (미지정 시 자동 감지) */
  department?: DepartmentType;
}

/**
 * 분석 응답
 */
export interface DetectionResponse {
  /** 분석 ID */
  id: string;
  /** 입력 텍스트 길이 */
  inputLength: number;
  /** 패턴 매칭 결과 */
  matches: PatternMatch[];
  /** 위반 판정 */
  judgment: ViolationJudgment;
  /** 처리 시간 (ms) */
  processingTimeMs: number;
  /** 복합 위반 (확장 분석 시) */
  compoundViolations?: CompoundViolation[];
  /** 진료과목별 위반 (확장 분석 시) */
  departmentViolations?: DepartmentViolation[];
  /** 감지된 진료과목 */
  departmentDetection?: DepartmentDetectionResult;
  /** 필수 기재사항 검사 결과 */
  mandatoryCheck?: MandatoryCheckResult;
  /** 전체 인상 분석 결과 */
  impressionAnalysis?: ImpressionAnalysis;
  /** 종합 위험 점수 (0-100) */
  overallRiskScore?: number;
  /** 종합 규정 준수 점수 (0-100) */
  overallComplianceScore?: number;
}

// ============================================
// ViolationDetector 클래스
// ============================================

/**
 * 위반 탐지기
 * 패턴 매칭과 규칙 엔진을 통합하여 분석 수행
 * 확장 기능: 복합 위반, 진료과목별 규칙, 전체 인상 분석
 */
export class ViolationDetector {
  private matcher: PatternMatcher;
  private engine: RuleEngine;
  private compoundDetector: CompoundDetector;
  private departmentEngine: DepartmentRuleEngine;
  private impressionAnalyzer: ImpressionAnalyzer;

  constructor(
    matcher: PatternMatcher = patternMatcher,
    engine: RuleEngine = ruleEngine,
    compound: CompoundDetector = compoundDetector,
    department: DepartmentRuleEngine = departmentRuleEngine,
    impression: ImpressionAnalyzer = impressionAnalyzer
  ) {
    this.matcher = matcher;
    this.engine = engine;
    this.compoundDetector = compound;
    this.departmentEngine = department;
    this.impressionAnalyzer = impression;
  }

  /**
   * URL/텍스트에서 영역(섹션) 감지
   */
  private detectSection(url?: string, text?: string): string {
    if (url) {
      if (/event|이벤트|할인|프로모션|discount|sale/i.test(url)) return 'event';
      if (/treatment|시술|surgery|수술|procedure/i.test(url)) return 'treatment';
      if (/faq|자주\s*묻는|qa|qna/i.test(url)) return 'faq';
      if (/review|후기|전후|before.?after/i.test(url)) return 'review';
      if (/doctor|의료진|원장|staff|team/i.test(url)) return 'doctor';
    }
    if (text) {
      const firstPart = text.substring(0, 500);
      if (/이벤트|할인|프로모션|특가|세일/.test(firstPart)) return 'event';
      if (/자주\s*묻는|FAQ|Q\s*&\s*A/i.test(firstPart)) return 'faq';
      if (/후기|리뷰|전후|체험/.test(firstPart)) return 'review';
    }
    return 'default';
  }

  /**
   * 텍스트 분석 수행 (통합 분석)
   */
  analyze(request: DetectionRequest): DetectionResponse {
    const startTime = Date.now();
    const {
      text,
      options,
      url,
      enableExtendedAnalysis = true,
      enableCompoundDetection = true,
      enableDepartmentRules = true,
      enableImpressionAnalysis = true,
      enableMandatoryCheck = true,
      department,
    } = request;

    // 0. 영역 감지
    const sectionType = this.detectSection(url, text);

    // 1. 패턴 매칭 (오탐 방지 강화 적용)
    const matches = this.matcher.match(text, options);

    // 2. 위반 판정 (영역 가중치 적용)
    const judgment = this.engine.judge(matches, sectionType);

    // 3. 분석 ID 생성
    const id = this.generateAnalysisId();

    // 기본 응답
    const response: DetectionResponse = {
      id,
      inputLength: text.length,
      matches,
      judgment,
      processingTimeMs: 0,
    };

    // 확장 분석
    if (enableExtendedAnalysis) {
      // 4. 복합 위반 탐지
      if (enableCompoundDetection) {
        response.compoundViolations = this.compoundDetector.detect(text);
      }

      // 5. 진료과목 감지 및 특화 규칙 검사
      if (enableDepartmentRules) {
        const detection = department
          ? { department, confidence: 1, evidence: [] }
          : this.departmentEngine.detectDepartment(text);

        response.departmentDetection = detection;
        response.departmentViolations = this.departmentEngine.checkWithDepartment(
          text,
          detection.department
        );

        // 일반 규칙도 함께 검사 (진료과목이 general이 아닌 경우)
        if (detection.department !== 'general') {
          const generalViolations = this.departmentEngine.checkWithDepartment(text, 'general');
          response.departmentViolations.push(...generalViolations);
        }
      }

      // 6. 필수 기재사항 검사
      if (enableMandatoryCheck) {
        response.mandatoryCheck = checkMandatoryItems(text);
      }

      // 7. 전체 인상 분석
      if (enableImpressionAnalysis) {
        response.impressionAnalysis = this.impressionAnalyzer.analyze({
          text,
          patternMatches: matches,
          compoundViolations: response.compoundViolations,
          departmentViolations: response.departmentViolations,
          mandatoryCheck: response.mandatoryCheck,
          department: response.departmentDetection?.department,
        });

        // 종합 점수 설정
        response.overallRiskScore = response.impressionAnalysis.riskScore;
        response.overallComplianceScore = response.impressionAnalysis.complianceScore;
      }
    }

    response.processingTimeMs = Date.now() - startTime;

    return response;
  }

  /**
   * 빠른 분석 (패턴 매칭만, 점수 반환)
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
   * 진료과목 지정 분석
   */
  analyzeWithDepartment(text: string, department: DepartmentType): DetectionResponse {
    return this.analyze({
      text,
      department,
    });
  }

  /**
   * 빠른 분석 (확장 기능 없음)
   */
  analyzeQuick(text: string, options?: MatchOptions): DetectionResponse {
    return this.analyze({
      text,
      options,
      enableExtendedAnalysis: false,
    });
  }

  /**
   * 전체 분석 (모든 기능 활성화)
   */
  analyzeFull(text: string): DetectionResponse {
    return this.analyze({
      text,
      enableExtendedAnalysis: true,
      enableCompoundDetection: true,
      enableDepartmentRules: true,
      enableImpressionAnalysis: true,
      enableMandatoryCheck: true,
    });
  }

  /**
   * 복합 위반만 탐지
   */
  detectCompoundViolations(text: string): CompoundViolation[] {
    return this.compoundDetector.detect(text);
  }

  /**
   * 진료과목 감지
   */
  detectDepartment(text: string): DepartmentDetectionResult {
    return this.departmentEngine.detectDepartment(text);
  }

  /**
   * 필수 기재사항 검사
   */
  checkMandatory(text: string): MandatoryCheckResult {
    return checkMandatoryItems(text);
  }

  /**
   * 인상 분석
   */
  analyzeImpression(text: string): ImpressionAnalysis {
    return this.impressionAnalyzer.analyzeSimple(text);
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

  /**
   * 진료과목 목록 조회
   */
  getDepartments(): DepartmentType[] {
    return this.departmentEngine.getDepartments();
  }

  /**
   * 진료과목별 규칙 수 조회
   */
  getDepartmentRuleCount(department: DepartmentType): number {
    return this.departmentEngine.getRulesByDepartment(department).length;
  }

  /**
   * 복합 규칙 수 조회
   */
  getCompoundRuleCount(): number {
    return this.compoundDetector.getRules().length;
  }
}

// 싱글톤 인스턴스
export const violationDetector = new ViolationDetector();

// 클래스 및 인스턴스 export
export { PatternMatcher, patternMatcher } from './pattern-matcher';
export { RuleEngine, ruleEngine } from './rule-engine';
export { CompoundDetector, compoundDetector } from './compound-detector';
export { DepartmentRuleEngine, departmentRuleEngine } from './department-rules';
export { ImpressionAnalyzer, impressionAnalyzer } from './impression-analyzer';
export { checkMandatoryItems } from '../mandatory-checker';
