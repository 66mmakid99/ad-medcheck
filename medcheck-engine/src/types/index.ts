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
export type ViolationSeverity = 'high' | 'medium' | 'low';

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
