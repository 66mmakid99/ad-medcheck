/**
 * Gemini 위반 분석 전용 타입 정의
 * Phase 1: 프롬프트 빌더 + Phase 2: GeminiAuditor 공통 타입
 */

// ============================================
// Gemini 프롬프트 입력 타입
// ============================================

/** 프롬프트 빌더 설정 */
export interface ViolationPromptConfig {
  patterns: PromptPattern[];
  negativeList: string[];
  disclaimerRules: DisclaimerRule[];
  departmentRules: PromptDepartmentRule[];
  contextExceptions: PromptContextException[];
  sectionWeights: SectionWeight[];
  confirmedDevices?: string[];
  confirmedTreatments?: string[];
  grayZoneExamples?: GrayZoneCase[];
}

/** 프롬프트용 패턴 (patterns.json에서 추출) */
export interface PromptPattern {
  id: string;
  category: string;
  subcategory: string;
  severity: 'critical' | 'major' | 'minor';
  description: string;
  example: string;
  exceptions?: string[];
  legalBasis: string;
}

/** 면책조항 규칙 */
export interface DisclaimerRule {
  pattern: string;
  description: string;
}

/** 프롬프트용 진료과목 규칙 */
export interface PromptDepartmentRule {
  id: string;
  department: string;
  name: string;
  description: string;
  severity: 'critical' | 'major' | 'minor';
  legalBasis: string;
}

/** 프롬프트용 맥락 예외 */
export interface PromptContextException {
  type: string;
  description: string;
  examples: string[];
}

/** 영역별 가중치 */
export interface SectionWeight {
  type: string;
  weight: number;
  label: string;
}

// ============================================
// Gemini 출력 타입 (JSON 스키마)
// ============================================

/** Gemini 전체 출력 */
export interface GeminiViolationOutput {
  sections: GeminiSection[];
  violations: GeminiViolation[];
  gray_zones: GrayZone[];
  mandatory_items: MandatoryItems;
  summary: GeminiSummary;
  checklist_verification: ChecklistVerification;
}

/** 영역 분류 */
export interface GeminiSection {
  type: 'treatment' | 'event' | 'faq' | 'review' | 'doctor' | 'default';
  startIndex: number;
  endIndex: number;
}

/** Gemini가 출력하는 개별 위반 */
export interface GeminiViolation {
  patternId: string;
  category: string;
  severity: 'critical' | 'major' | 'minor';
  originalText: string;
  context: string;
  sectionType: 'treatment' | 'event' | 'faq' | 'review' | 'doctor' | 'default';
  confidence: number;
  reasoning: string;
  fromImage: boolean;
  disclaimerPresent: boolean;
  adjustedSeverity: 'critical' | 'major' | 'minor' | 'low';
}

/** Gray Zone 사례 */
export interface GrayZone {
  evasion_type: string;
  evasion_category: 'structural' | 'wording' | 'visual' | 'platform';
  evasion_description: string;
  legal_target: string;
  target_violation_type: string;
  evidence: string;
  confidence: number;
}

/** Gray Zone DB 저장용 */
export interface GrayZoneCase extends GrayZone {
  id?: number;
  hospital_id?: string;
  hospital_name?: string;
  source_url?: string;
  analysis_id?: string;
  admin_verdict?: 'violation' | 'borderline' | 'legal' | 'pending';
  admin_reasoning?: string;
  added_to_prompt?: number;
  occurrence_count?: number;
  evidence_text?: string;
  target_law?: string;
}

/** 필수 기재사항 */
export interface MandatoryItems {
  hospital_name: MandatoryItem;
  address: MandatoryItem;
  phone: MandatoryItem;
  department: MandatoryItem;
  doctor_info: MandatoryItem;
  price_disclosure: MandatoryItem & { applicable?: boolean };
}

export interface MandatoryItem {
  found: boolean;
  value?: string;
}

/** 요약 */
export interface GeminiSummary {
  total_violations: number;
  by_severity: {
    critical: number;
    major: number;
    minor: number;
  };
  gray_zone_count: number;
  mandatory_missing: number;
  overall_risk: 'low' | 'medium' | 'high' | 'critical';
}

/** 체크리스트 확인 */
export interface ChecklistVerification {
  used_only_provided_pattern_ids: boolean;
  checked_negative_list: boolean;
  applied_disclaimer_rules: boolean;
  applied_section_weights: boolean;
  checked_context_exceptions: boolean;
  reported_gray_zones_separately: boolean;
}

// ============================================
// Auditor 결과 타입 (Phase 2용, 미리 정의)
// ============================================

/** 감사 결과 */
export interface AuditResult {
  id: string;
  finalViolations: AuditedViolation[];
  grayZones: GrayZone[];
  mandatoryItems: MandatoryItems;
  grade: GradeResult;
  auditIssues: AuditIssue[];
  geminiOriginalCount: number;
  finalCount: number;
  auditDelta: number;
}

/** 감사 후 최종 위반 (source 필드 추가) */
export interface AuditedViolation extends GeminiViolation {
  source?: 'gemini' | 'rule_engine_supplement';
}

/** 등급 결과 */
export interface GradeResult {
  cleanScore: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  violationCount: number;
}

/** 감사 이슈 */
export interface AuditIssue {
  type:
    | 'FABRICATED_PATTERN_ID'
    | 'NEGATIVE_LIST_VIOLATION'
    | 'DISCLAIMER_NOT_APPLIED'
    | 'GEMINI_MISSED'
    | 'CONFIDENCE_ADJUSTED'
    | 'GEMINI_NEW_PATTERN';
  action: 'REMOVE' | 'ADD' | 'DOWNGRADE' | 'ADJUST';
  detail: string;
  originalViolation?: GeminiViolation;
}
