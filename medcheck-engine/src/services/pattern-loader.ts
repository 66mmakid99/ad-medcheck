/**
 * 패턴 데이터 로더
 * patterns.json + violation-detector 모듈에서 프롬프트용 데이터를 추출
 *
 * Phase 1: Gemini 위반 탐지 프롬프트 설계
 */

import patternsData from '../../patterns/patterns.json';
import type {
  PromptPattern,
  DisclaimerRule,
  PromptDepartmentRule,
  PromptContextException,
  SectionWeight,
  ViolationPromptConfig,
} from '../types/violation-types';

// ============================================
// 1. patterns.json → PromptPattern[]
// ============================================

function loadPatterns(): PromptPattern[] {
  const raw = (patternsData as { patterns: any[] }).patterns || [];
  return raw.map((p) => ({
    id: p.id,
    category: p.category,
    subcategory: p.subcategory,
    severity: p.severity,
    description: p.description,
    example: p.example,
    exceptions: p.exceptions,
    legalBasis: p.legalBasis,
  }));
}

// ============================================
// 2. pattern-matcher.ts의 NEGATIVE_LIST → string[]
// ============================================

const NEGATIVE_LIST_DATA: Record<string, string[]> = {
  equipment: [
    'TORR RF', '울쎄라', '써마지', '인모드', '슈링크',
    '포텐자', '리쥬란', '쥬베룩', '볼뉴머', '실펌',
    '피코슈어', '레블라이트', '클래리티', '젠틀맥스',
    '올리지오', '텐써마', '더모톡신', '소노퀸', '더블로',
    '울트라포머', '이브아르', '엘란쎄', '스칼렛',
    'FLX', 'MPT', 'HIFU', 'IPL', 'RF',
  ],
  medications: [
    '보톡스', '디스포트', '제오민', '나보타', '보툴렉스',
    '쥬비덤', '레스틸렌', '벨로테로', '볼류마', '볼벨라',
    '리도카인', '히알루론산', '필러', '메조테라피',
    '스컬트라', '래디어스', '엑소좀', 'PRP', 'PDRN',
  ],
  skincare: [
    '선크림', '보습제', '클렌저', '토너', '세럼',
    '레티놀', '비타민C', '나이아신아마이드', '세라마이드',
    'AHA', 'BHA', 'EGF', '펩타이드',
  ],
  medicalTerms: [
    '피부과', '성형외과', '치과', '안과', '산부인과',
    '내과', '외과', '정형외과', '비뇨기과', '이비인후과',
    '전문의', '원장', '대표원장', '부원장',
    '사업자등록번호', '의료기관번호',
  ],
  certifications: [
    'FDA 승인', 'FDA 인증', 'FDA approved', 'FDA cleared',
    'CE 인증', 'CE 마크', 'CE marking',
    '식약처 인증', '식약처 승인', '식약처 허가', '식약처 등록',
    'MFDS 승인', 'KFDA 승인',
    'ISO 인증', 'ISO 13485',
    'GMP 인증', 'CGMP',
    '의료기기 허가', '의료기기 인증', '의료기기 승인',
    '특허', '특허 등록', '특허 취득',
    'TFDA 승인', 'ANVISA 승인', 'PMDA 승인',
  ],
};

function loadNegativeList(): string[] {
  return Object.values(NEGATIVE_LIST_DATA).flat();
}

// ============================================
// 3. rule-engine.ts의 면책조항 규칙 → DisclaimerRule[]
// ============================================

function loadDisclaimerRules(): DisclaimerRule[] {
  return [
    { pattern: '개인에 따라 결과가 다를 수 있습니다', description: '효과 개인차 고지' },
    { pattern: '개인 차이가 있을 수 있습니다', description: '개인차 고지' },
    { pattern: '시술 전 전문의 상담', description: '전문의 상담 권유' },
    { pattern: '부작용이 발생할 수 있습니다', description: '부작용 가능성 고지' },
    { pattern: '결과를 보장하지 않습니다', description: '결과 비보장 고지' },
    { pattern: '의료법 제56조', description: '의료법 준수 명시' },
    { pattern: '개인 체질에 따라', description: '체질별 차이 고지' },
    { pattern: '효과에는 개인 차이', description: '효과 개인차 고지' },
  ];
}

// ============================================
// 4. department-rules.ts → PromptDepartmentRule[]
// ============================================

function loadDepartmentRules(): PromptDepartmentRule[] {
  return [
    { id: 'DERM-001', department: '피부과', name: '시술 횟수 과소 표현', description: '레이저/시술 횟수를 적게 표현하여 효과 과장', severity: 'major', legalBasis: '의료법 제56조 제2항 제3호' },
    { id: 'DERM-002', department: '피부과', name: '피부 완벽 재생 주장', description: '피부 완벽 재생/복구를 보장하는 표현', severity: 'critical', legalBasis: '의료법 제56조 제2항 제3호' },
    { id: 'DERM-003', department: '피부과', name: '여드름 완치 보장', description: '여드름 완치/재발 방지를 보장', severity: 'critical', legalBasis: '의료법 제56조 제2항 제3호' },
    { id: 'PLST-001', department: '성형외과', name: '자연스러운 결과 보장', description: '수술 결과의 자연스러움을 보장', severity: 'major', legalBasis: '의료법 제56조 제2항 제3호' },
    { id: 'PLST-002', department: '성형외과', name: '흉터 없음 주장', description: '수술 흉터가 없다고 단정', severity: 'major', legalBasis: '의료법 제56조 제2항 제2호' },
    { id: 'PLST-003', department: '성형외과', name: '성형 효과 영구성 주장', description: '성형 효과가 영구적이라고 표현', severity: 'major', legalBasis: '의료법 제56조 제2항 제3호' },
    { id: 'DENT-001', department: '치과', name: '임플란트 평생 보장', description: '임플란트의 평생 사용을 보장', severity: 'critical', legalBasis: '의료법 제56조 제2항 제3호' },
    { id: 'DENT-002', department: '치과', name: '무통 치료 단정', description: '치과 치료가 무통임을 단정', severity: 'major', legalBasis: '의료법 제56조 제2항 제2호' },
    { id: 'DENT-003', department: '치과', name: '교정 기간 과소 표현', description: '치아 교정 기간을 과소하게 표현', severity: 'minor', legalBasis: '의료법 제56조 제2항 제3호' },
    { id: 'ORNT-001', department: '한의원', name: '한약 효과 보장', description: '한약의 효과를 단정적으로 표현', severity: 'critical', legalBasis: '의료법 제56조 제2항 제3호' },
    { id: 'ORNT-002', department: '한의원', name: '다이어트 한약 효과 과장', description: '다이어트 한약의 효과를 과장', severity: 'critical', legalBasis: '의료법 제56조 제2항 제3호' },
    { id: 'ORNT-003', department: '한의원', name: '침/추나 효과 과장', description: '침/추나 치료 효과를 과장', severity: 'major', legalBasis: '의료법 제56조 제2항 제3호' },
    { id: 'PSYC-001', department: '정신건강의학과', name: '정신질환 완치 보장', description: '정신질환 완치를 보장', severity: 'critical', legalBasis: '의료법 제56조 제2항 제3호' },
    { id: 'PSYC-002', department: '정신건강의학과', name: '약물 부작용 부정', description: '정신과 약물의 부작용이 없다고 표현', severity: 'critical', legalBasis: '의료법 제56조 제2항 제2호' },
    { id: 'OPHT-001', department: '안과', name: '시력 보장 표현', description: '라식/라섹 후 특정 시력을 보장', severity: 'critical', legalBasis: '의료법 제56조 제2항 제3호' },
    { id: 'OPHT-002', department: '안과', name: '수술 부작용 부정', description: '눈 수술 부작용이 없다고 표현', severity: 'critical', legalBasis: '의료법 제56조 제2항 제2호' },
    { id: 'ORTH-001', department: '정형외과', name: '관절/척추 완치 보장', description: '관절/척추 질환 완치를 보장', severity: 'critical', legalBasis: '의료법 제56조 제2항 제3호' },
    { id: 'ORTH-002', department: '정형외과', name: '도수치료 효과 과장', description: '도수치료 효과를 과장', severity: 'major', legalBasis: '의료법 제56조 제2항 제3호' },
    { id: 'INTL-001', department: '내과', name: '만성질환 완치 보장', description: '만성질환(당뇨, 고혈압) 완치를 보장', severity: 'critical', legalBasis: '의료법 제56조 제2항 제3호' },
    { id: 'GENL-001', department: '일반', name: '검진 결과 보장', description: '건강검진으로 특정 결과를 보장', severity: 'major', legalBasis: '의료법 제56조 제2항 제3호' },
  ];
}

// ============================================
// 5. pattern-matcher.ts의 CONTEXT_EXCEPTIONS → PromptContextException[]
// ============================================

function loadContextExceptions(): PromptContextException[] {
  return [
    {
      type: 'NEGATION',
      description: '부정문: "100% 보장하지 않습니다" → 위반 아님',
      examples: ['절대 보장하지 않습니다', '완치를 약속하지 않습니다', '효과가 있다고 단정할 수 없습니다'],
    },
    {
      type: 'QUESTION',
      description: '질문문: "100% 효과가 있나요?" → 위반 아님',
      examples: ['정말 완치가 되나요?', '부작용이 없을까요?', '최고의 시술인가요?'],
    },
    {
      type: 'QUOTATION',
      description: '인용문: 다른 출처를 인용하는 경우 → 위반 아님 (단, 인용 자체가 광고면 위반)',
      examples: ['환자가 "완치됐다"고 했다', '논문에서 "효과적"이라 표현'],
    },
    {
      type: 'LEGAL_NOTICE',
      description: '법적고지: "의료법 제56조에 따라..." → 위반 아님',
      examples: ['의료법 제56조에 의해 금지됩니다', '법률에 따라 제한됩니다'],
    },
    {
      type: 'NEGATIVE_EXAMPLE',
      description: '부정적 예시: "이런 광고는 하면 안 됩니다" → 위반 아님',
      examples: ['이러한 표현은 금지됩니다', '위반 사례: 100% 완치', '잘못된 광고 예시입니다'],
    },
    {
      type: 'CONDITIONAL',
      description: '조건문: "~할 수 있습니다" (가능성 표현) → 단독으로는 위반 아님',
      examples: ['개선될 수 있습니다', '효과가 있을 수 있습니다', '경우에 따라 다릅니다'],
    },
    {
      type: 'NAVIGATION',
      description: '네비게이션 텍스트: 메뉴, 헤더, 푸터 → 신뢰도 -0.5',
      examples: ['홈 > 시술소개 > 레이저', '메뉴: 피부과 | 성형외과 | 치과'],
    },
    {
      type: 'SIDE_EFFECT_NEGATION',
      description: '부작용 부정 특수처리: "부작용이 거의 없다" → 위반 (부정어+부작용=위반)',
      examples: ['부작용이 거의 없습니다', '부작용 걱정 없이', '부작용 없는 시술'],
    },
    {
      type: 'OFFICIAL_CERTIFICATION',
      description: '공인 기관 인증/승인 표현: "FDA 승인", "식약처 인증", "CE 인증" → 위반 아님 (사실 기재)',
      examples: ['FDA 승인 장비', '식약처 인증 의료기기', 'CE 인증 획득', 'ISO 13485 인증'],
    },
  ];
}

// ============================================
// 6. 영역별 가중치 → SectionWeight[]
// ============================================

function loadSectionWeights(): SectionWeight[] {
  return [
    { type: 'treatment', weight: 1.2, label: '시술/치료 소개 페이지' },
    { type: 'event', weight: 0.8, label: '이벤트/프로모션 페이지' },
    { type: 'faq', weight: 0.6, label: 'FAQ/자주묻는질문' },
    { type: 'review', weight: 0.7, label: '후기/리뷰 섹션' },
    { type: 'doctor', weight: 1.0, label: '의사 소개 페이지' },
    { type: 'default', weight: 1.0, label: '기본(분류 불가)' },
  ];
}

// ============================================
// 절대 위반 패턴 ID (면책조항 있어도 심각도 유지)
// ============================================

export const ABSOLUTE_VIOLATION_IDS = [
  'P-56-01-001',  // 100% 완치/성공
  'P-56-01-002',  // 100% 효과 보장
  'P-56-02-001',  // 부작용 없음 단정
];

// ============================================
// 통합 로더 함수
// ============================================

/**
 * 프롬프트용 전체 데이터 로드
 * 동적 네거티브 리스트(confirmedDevices/Treatments)는 외부에서 주입
 */
export function loadPatternsForPrompt(dynamic?: {
  confirmedDevices?: string[];
  confirmedTreatments?: string[];
  grayZoneExamples?: any[];
}): ViolationPromptConfig {
  return {
    patterns: loadPatterns(),
    negativeList: loadNegativeList(),
    disclaimerRules: loadDisclaimerRules(),
    departmentRules: loadDepartmentRules(),
    contextExceptions: loadContextExceptions(),
    sectionWeights: loadSectionWeights(),
    confirmedDevices: dynamic?.confirmedDevices,
    confirmedTreatments: dynamic?.confirmedTreatments,
    grayZoneExamples: dynamic?.grayZoneExamples,
  };
}

/**
 * 개별 데이터 접근용 유틸
 */
export const PatternLoader = {
  getPatterns: loadPatterns,
  getNegativeList: loadNegativeList,
  getDisclaimerRules: loadDisclaimerRules,
  getDepartmentRules: loadDepartmentRules,
  getContextExceptions: loadContextExceptions,
  getSectionWeights: loadSectionWeights,
  getAbsoluteViolationIds: () => ABSOLUTE_VIOLATION_IDS,
};
