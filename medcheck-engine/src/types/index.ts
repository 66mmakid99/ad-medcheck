/**
 * MedCheck Engine 기본 타입 정의
 */

// ============================================
// 입력 타입 (크롤링 데이터)
// ============================================

/**
 * 모듈 입력 데이터
 * 크롤러에서 수집한 의료광고 데이터
 */
export interface ModuleInput {
  /** 광고 출처 URL */
  source: string;

  /** 광고 텍스트 내용 */
  content: string;

  /** 이미지 URL 목록 (선택) */
  images?: string[];

  /** 수집 시간 */
  collectedAt?: Date;

  /** 추가 메타데이터 */
  metadata?: {
    /** 의료기관명 */
    hospitalName?: string;
    /** 진료과목 */
    department?: string;
    /** 광고 유형 (블로그, SNS, 웹사이트 등) */
    adType?: string;
    /** 기타 정보 */
    [key: string]: unknown;
  };
}

// ============================================
// 출력 타입 (분석 결과)
// ============================================

/**
 * 모듈 출력 데이터
 * 분석 엔진의 최종 결과물
 */
export interface ModuleOutput {
  /** 위반 탐지 결과 목록 */
  violations: ViolationResult[];

  /** 수가 분석 결과 목록 (선택) */
  prices?: PriceResult[];

  /** 분석 요약 */
  summary: string;

  /** 전체 신뢰도 (0-1) */
  confidence: number;

  /** 분석 소요 시간 (ms) */
  processingTime?: number;

  /** 분석 일시 */
  analyzedAt: Date;
}

// ============================================
// 위반 탐지 결과 (Module 1)
// ============================================

/**
 * 위반 심각도 레벨
 */
export type ViolationSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * 위반 상태
 */
export type ViolationStatus =
  | 'violation'      // 확실한 위반
  | 'likely'         // 위반 가능성 높음
  | 'possible'       // 위반 가능성 있음
  | 'clean';         // 위반 아님

/**
 * 위반 유형
 */
export type ViolationType =
  | 'prohibited_expression'   // 금지 표현
  | 'exaggeration'           // 과장 광고
  | 'false_claim'            // 허위 광고
  | 'guarantee'              // 효과 보장
  | 'comparison'             // 비교 광고
  | 'before_after'           // 전후 사진
  | 'testimonial'            // 환자 후기
  | 'price_inducement'       // 가격 유인
  | 'other';                 // 기타

/**
 * 법적 근거
 */
export interface LegalBasis {
  /** 법령명 */
  law: string;

  /** 조항 */
  article: string;

  /** 조항 내용 요약 */
  description: string;

  /** 참조 파일 경로 (references/ 내) */
  referenceFile?: string;
}

/**
 * 위반 탐지 결과
 */
export interface ViolationResult {
  /** 위반 유형 */
  type: ViolationType;

  /** 위반 상태 */
  status: ViolationStatus;

  /** 심각도 */
  severity: ViolationSeverity;

  /** 탐지된 텍스트 */
  matchedText: string;

  /** 원문에서의 위치 (시작 인덱스) */
  position?: number;

  /** 위반 설명 */
  description: string;

  /** 법적 근거 */
  legalBasis: LegalBasis[];

  /** 신뢰도 (0-1) */
  confidence: number;

  /** 매칭된 패턴 ID */
  patternId?: string;
}

// ============================================
// 수가 분석 결과 (Module 2)
// ============================================

/**
 * 급여 구분
 */
export type CoverageType =
  | 'covered'        // 급여
  | 'non_covered'    // 비급여
  | 'mixed'          // 혼합
  | 'unknown';       // 알 수 없음

/**
 * 가격 상태
 */
export type PriceStatus =
  | 'normal'         // 정상 범위
  | 'high'           // 높음
  | 'low'            // 낮음 (덤핑 의심)
  | 'unknown';       // 판단 불가

/**
 * 수가 분석 결과
 */
export interface PriceResult {
  /** 시술/치료 항목명 */
  itemName: string;

  /** 광고된 가격 */
  advertisedPrice: number;

  /** 급여 구분 */
  coverageType: CoverageType;

  /** 가격 상태 */
  priceStatus: PriceStatus;

  /** 참고 가격 범위 (최소) */
  referenceMin?: number;

  /** 참고 가격 범위 (최대) */
  referenceMax?: number;

  /** 분석 코멘트 */
  comment?: string;

  /** 신뢰도 (0-1) */
  confidence: number;
}

// ============================================
// 패턴 정의 타입
// ============================================

/**
 * 위반 패턴 정의
 */
export interface ViolationPattern {
  /** 패턴 고유 ID */
  id: string;

  /** 패턴명 */
  name: string;

  /** 위반 유형 */
  type: ViolationType;

  /** 정규표현식 패턴 */
  regex: string;

  /** 키워드 목록 (정규식 대신 사용 가능) */
  keywords?: string[];

  /** 기본 심각도 */
  defaultSeverity: ViolationSeverity;

  /** 법적 근거 */
  legalBasis: LegalBasis[];

  /** 설명 */
  description: string;

  /** 활성화 여부 */
  enabled: boolean;
}

// ============================================
// 피드백 시스템 타입 (자동 개선)
// ============================================

/**
 * 피드백 타입 (확장)
 */
export type FeedbackTypeExtended =
  | 'true_positive'     // 정탐 (맞음)
  | 'false_positive'    // 오탐 (잘못 탐지)
  | 'false_negative'    // 미탐 (놓침)
  | 'severity_adjust';  // 심각도 조정

/**
 * 피드백 검토 상태
 */
export type FeedbackReviewStatus =
  | 'pending'    // 검토 대기
  | 'reviewed'   // 검토 완료
  | 'applied'    // 적용됨
  | 'rejected';  // 거부됨

/**
 * 맥락 유형
 */
export type ContextType =
  | 'negation'     // 부정문 (아니다, 없다)
  | 'question'     // 의문문
  | 'quotation'    // 인용문
  | 'disclaimer'   // 면책조항
  | 'comparison'   // 비교 문맥
  | 'normal';      // 일반

/**
 * 위반 탐지 피드백 요청
 */
export interface ViolationFeedbackRequest {
  /** 분석 ID */
  analysisId: string;
  /** 특정 위반 항목 ID */
  violationId?: string;
  /** 피드백 타입 */
  feedbackType: FeedbackTypeExtended;
  /** 패턴 ID (오탐/정탐 시) */
  patternId?: string;
  /** 원래 심각도 */
  originalSeverity?: ViolationSeverity;
  /** 수정된 심각도 (severity_adjust 시) */
  correctedSeverity?: ViolationSeverity;
  /** 주변 맥락 텍스트 */
  contextText?: string;
  /** 맥락 유형 */
  contextType?: ContextType;
  /** 병원 진료과목 */
  hospitalDepartment?: string;
  /** 미탐지된 텍스트 (false_negative 시) */
  missedText?: string;
  /** 새 패턴 제안 */
  suggestedPattern?: string;
  /** 사용자 메모 */
  userNote?: string;
  /** 제출자 */
  submittedBy?: string;
}

/**
 * 가격 추출 피드백 타입
 */
export type PriceFeedbackType =
  | 'correct'          // 정확함
  | 'wrong_price'      // 가격 오류
  | 'wrong_procedure'  // 시술명 오류
  | 'wrong_mapping'    // 매핑 오류
  | 'wrong_unit'       // 단위 오류
  | 'missing_info';    // 정보 누락

/**
 * 가격 추출 피드백 요청
 */
export interface PriceFeedbackRequest {
  /** 추출된 가격 ID */
  extractedPriceId: number;
  /** OCR 결과 ID */
  ocrResultId?: number;
  /** 피드백 타입 */
  feedbackType: PriceFeedbackType;
  /** 원래 가격 */
  originalPrice?: number;
  /** 수정된 가격 */
  correctedPrice?: number;
  /** 원래 시술명 */
  originalProcedure?: string;
  /** 수정된 시술명 */
  correctedProcedure?: string;
  /** 올바른 시술 ID */
  correctedProcedureId?: string;
  /** 필드별 수정 내용 (JSON) */
  fieldCorrections?: Record<string, { original: unknown; corrected: unknown }>;
  /** 사용자 메모 */
  userNote?: string;
  /** 제출자 */
  submittedBy?: string;
}

/**
 * 패턴 성능 데이터
 */
export interface PatternPerformance {
  patternId: string;
  periodType: 'daily' | 'weekly' | 'monthly' | 'all_time';
  periodStart: string;
  periodEnd: string;
  totalMatches: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  isFlagged: boolean;
  flagReason?: string;
}

/**
 * 맥락별 성능 데이터
 */
export interface ContextPerformance {
  patternId: string;
  contextType: ContextType;
  totalMatches: number;
  truePositives: number;
  falsePositives: number;
  accuracy: number;
  confidenceModifier: number;
  sampleTexts?: string[];
}

/**
 * 진료과목별 성능 데이터
 */
export interface DepartmentPerformance {
  patternId: string;
  departmentCode: string;
  departmentName: string;
  totalMatches: number;
  truePositives: number;
  falsePositives: number;
  accuracy: number;
  confidenceModifier: number;
}

/**
 * 자동 학습 타입
 */
export type LearningType =
  | 'exception_generated'       // 예외 규칙 생성
  | 'confidence_adjusted'       // 신뢰도 조정
  | 'pattern_suggested'         // 패턴 제안
  | 'mapping_learned'           // 매핑 학습
  | 'severity_adjusted'         // 심각도 조정
  | 'context_modifier_updated'; // 맥락 배수 업데이트

/**
 * 학습 대상 타입
 */
export type LearningTargetType =
  | 'pattern'
  | 'mapping'
  | 'exception'
  | 'procedure';

/**
 * 학습 상태
 */
export type LearningStatus =
  | 'pending'      // 대기
  | 'approved'     // 승인됨
  | 'rejected'     // 거부됨
  | 'auto_applied' // 자동 적용됨
  | 'expired';     // 만료됨

/**
 * 자동 학습 로그
 */
export interface AutoLearningLog {
  id: string;
  learningType: LearningType;
  targetType: LearningTargetType;
  targetId: string;
  inputData: unknown;
  outputData: unknown;
  confidenceScore: number;
  sourceFeedbackCount: number;
  sourceFeedbackIds: string[];
  status: LearningStatus;
  autoApplyEligible: boolean;
  autoApplyReason?: string;
  appliedAt?: string;
  appliedBy?: string;
  rejectedReason?: string;
  createdAt: string;
}

/**
 * 예외 규칙 후보
 */
export interface ExceptionCandidate {
  id: string;
  patternId: string;
  exceptionType: 'keyword' | 'context' | 'regex' | 'department' | 'composite';
  exceptionPattern: string;
  exceptionDescription?: string;
  sourceType: 'auto' | 'manual' | 'suggested';
  sourceFeedbackIds: string[];
  sampleTexts: string[];
  occurrenceCount: number;
  uniqueSources: number;
  confidence: number;
  meetsThreshold: boolean;
  status: 'collecting' | 'pending_review' | 'approved' | 'rejected' | 'merged';
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
}

/**
 * 성능 리포트
 */
export interface PerformanceReport {
  generatedAt: string;
  periodDays: number;
  summary: {
    totalPatterns: number;
    totalFeedbacks: number;
    avgAccuracy: number;
    flaggedPatterns: number;
    pendingLearning: number;
  };
  topPerformers: PatternPerformance[];
  lowPerformers: PatternPerformance[];
  contextStats: Array<{
    contextType: ContextType;
    avgAccuracy: number;
    patternCount: number;
  }>;
  departmentStats: Array<{
    department: string;
    avgAccuracy: number;
    patternCount: number;
  }>;
  learningStats: {
    pendingExceptions: number;
    approvedThisWeek: number;
    autoAppliedThisWeek: number;
  };
}
