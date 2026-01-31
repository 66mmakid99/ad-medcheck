/**
 * 필수 기재사항 검사 모듈
 * 의료광고에 반드시 포함되어야 하는 정보 확인
 */

// ============================================
// 타입 정의
// ============================================

/**
 * 필수 기재사항 검사 결과
 */
export interface MandatoryCheckResult {
  /** 모든 필수 항목 충족 여부 */
  isComplete: boolean;
  /** 점수 (0-100) */
  score: number;
  /** 검사된 항목들 */
  items: MandatoryItem[];
  /** 누락된 필수 항목 */
  missingItems: string[];
  /** 경고 메시지 */
  warnings: string[];
}

/**
 * 필수 기재 항목
 */
export interface MandatoryItem {
  /** 항목명 */
  name: string;
  /** 필수 여부 */
  required: boolean;
  /** 발견 여부 */
  found: boolean;
  /** 발견된 값 */
  value?: string;
  /** 형식 유효성 */
  isValid: boolean;
  /** 문제점 */
  issue?: string;
}

/**
 * 항목 정의
 */
interface MandatoryItemDefinition {
  name: string;
  required: boolean;
  patterns: RegExp[];
  validate: (value: string, context: string) => boolean;
  extractValue?: (match: RegExpMatchArray) => string;
}

// ============================================
// 필수 기재사항 정의
// ============================================

const MANDATORY_ITEMS: MandatoryItemDefinition[] = [
  {
    name: '의료기관명',
    required: true,
    patterns: [
      /([가-힣A-Za-z0-9]+\s*(의원|병원|클리닉|센터|의료원|메디컬))/,
      /([A-Za-z]+\s*(clinic|hospital|center|medical))/i,
    ],
    validate: (value: string) => value.length >= 2 && value.length <= 50,
    extractValue: (match) => match[1],
  },
  {
    name: '소재지',
    required: true,
    patterns: [
      /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/,
      /([가-힣]+(?:시|도)\s*[가-힣]+(?:구|군)\s*[가-힣]+(?:동|읍|면|로|길))/,
      /([가-힣]+구\s+[가-힣]+동)/,
      /([가-힣]+시\s+[가-힣]+구)/,
    ],
    validate: (value: string) => value.length >= 2,
  },
  {
    name: '전화번호',
    required: true,
    patterns: [
      /(\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{4})/,
      /(1\d{3}[-.\s]?\d{4})/,
      /(02[-.\s]?\d{3,4}[-.\s]?\d{4})/,
    ],
    validate: (value: string) => {
      const digits = value.replace(/\D/g, '');
      return digits.length >= 8 && digits.length <= 12;
    },
  },
  {
    name: '진료과목',
    required: false, // 권장
    patterns: [
      /(피부과|성형외과|내과|외과|정형외과|안과|이비인후과|치과|한의원|정신건강의학과|산부인과|소아청소년과|비뇨의학과|신경외과|흉부외과)/,
      /(피부|성형|미용|에스테틱|리프팅|레이저)/,
    ],
    validate: () => true,
  },
  {
    name: '전문의 자격',
    required: false, // 표시할 경우 정확해야 함
    patterns: [
      /([가-힣]+\s*전문의)/,
      /(전문의\s*\d+인)/,
      /([가-힣]+과\s*전문의)/,
    ],
    validate: (value: string, context: string) => {
      // 전문의 자격과 진료과목 일치 검증
      const specialtyMatch = value.match(/([가-힣]+)(?:과)?\s*전문의/);
      if (!specialtyMatch) return true;

      const specialty = specialtyMatch[1];

      // 진료과목과 전문의 불일치 체크
      const mismatchPatterns: [string, RegExp][] = [
        ['피부', /성형외과|정형외과|내과|외과/],
        ['성형', /피부과|내과|정형외과/],
        ['정형', /피부과|성형외과|내과/],
        ['내', /피부과|성형외과|정형외과/],
      ];

      for (const [spec, mismatch] of mismatchPatterns) {
        if (specialty.includes(spec) && mismatch.test(context)) {
          // 더 상세한 검증 필요 - 같은 병원에서 여러 과 운영 가능
          // 단순히 불일치로 판단하지 않고 경고만
          return true;
        }
      }

      return true;
    },
  },
  {
    name: '대표자명',
    required: false,
    patterns: [
      /(대표\s*(?:원장|의사)?\s*:?\s*[가-힣]{2,4})/,
      /(원장\s*:?\s*[가-힣]{2,4})/,
    ],
    validate: (value: string) => {
      const nameMatch = value.match(/[가-힣]{2,4}/);
      return nameMatch !== null;
    },
  },
];

// ============================================
// 검사 함수
// ============================================

/**
 * 필수 기재사항 검사
 */
export function checkMandatoryItems(
  text: string,
  options?: { department?: string }
): MandatoryCheckResult {
  const results: MandatoryItem[] = [];
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const item of MANDATORY_ITEMS) {
    let found = false;
    let value = '';
    let isValid = false;
    let issue = '';

    for (const pattern of item.patterns) {
      const match = text.match(pattern);
      if (match) {
        found = true;
        value = item.extractValue ? item.extractValue(match) : match[0];
        isValid = item.validate(value, text);
        if (!isValid) {
          issue = `${item.name} 형식이 올바르지 않음`;
        }
        break;
      }
    }

    if (!found && item.required) {
      missing.push(item.name);
    }

    results.push({
      name: item.name,
      required: item.required,
      found,
      value: found ? value : undefined,
      isValid: found ? isValid : false,
      issue: issue || undefined,
    });
  }

  // 특수 검증 로직
  const specialistItem = results.find(r => r.name === '전문의 자격');
  const departmentItem = results.find(r => r.name === '진료과목');

  // 전문의 표기 있는데 진료과목 없음
  if (specialistItem?.found && !departmentItem?.found) {
    warnings.push('전문의 자격 표시 시 진료과목도 함께 표시하는 것이 권장됨');
  }

  // 전문의와 진료과목 불일치 가능성 체크
  if (specialistItem?.found && departmentItem?.found) {
    const specialistValue = specialistItem.value || '';
    const departmentValue = departmentItem.value || '';

    const mismatchCheck = checkSpecialistDepartmentMatch(specialistValue, departmentValue);
    if (mismatchCheck.warning) {
      warnings.push(mismatchCheck.warning);
    }
  }

  // 의료기관명이 없지만 다른 정보가 많으면 경고
  const hospitalItem = results.find(r => r.name === '의료기관명');
  if (!hospitalItem?.found && results.filter(r => r.found).length >= 2) {
    warnings.push('의료기관명이 명시되지 않았습니다. 필수 기재사항입니다.');
  }

  const score = calculateMandatoryScore(results);

  return {
    isComplete: missing.length === 0,
    score,
    items: results,
    missingItems: missing,
    warnings,
  };
}

/**
 * 전문의-진료과목 일치 검사
 */
function checkSpecialistDepartmentMatch(
  specialist: string,
  department: string
): { match: boolean; warning?: string } {
  const specialistType = extractSpecialtyType(specialist);
  const departmentType = extractSpecialtyType(department);

  if (!specialistType || !departmentType) {
    return { match: true };
  }

  // 완전 불일치 케이스
  const incompatible: [string, string[]][] = [
    ['피부', ['정형외과', '내과', '외과', '안과']],
    ['성형', ['피부과', '내과', '정형외과', '안과']],
    ['정형', ['피부과', '성형외과', '내과', '안과']],
    ['안', ['피부과', '성형외과', '정형외과']],
  ];

  for (const [spec, incompatDepts] of incompatible) {
    if (specialistType.includes(spec)) {
      for (const dept of incompatDepts) {
        if (departmentType.includes(dept.replace('과', ''))) {
          return {
            match: false,
            warning: `전문의 자격(${specialist})과 표시된 진료과목(${department})이 일치하지 않을 수 있습니다`,
          };
        }
      }
    }
  }

  return { match: true };
}

/**
 * 전문 분야 추출
 */
function extractSpecialtyType(text: string): string | null {
  const match = text.match(/(피부|성형|정형|내|외|안|이비인후|치|한의|정신|산부|소아|비뇨|신경|흉부)/);
  return match ? match[1] : null;
}

/**
 * 필수 기재사항 점수 계산
 */
function calculateMandatoryScore(items: MandatoryItem[]): number {
  let totalWeight = 0;
  let earnedWeight = 0;

  for (const item of items) {
    const weight = item.required ? 30 : 10;
    totalWeight += weight;

    if (item.found && item.isValid) {
      earnedWeight += weight;
    } else if (item.found && !item.isValid) {
      earnedWeight += weight * 0.5; // 형식 불완전
    }
  }

  return Math.round((earnedWeight / totalWeight) * 100);
}

// ============================================
// 유틸리티 함수
// ============================================

/**
 * 필수 항목만 추출
 */
export function getRequiredItems(): string[] {
  return MANDATORY_ITEMS.filter(item => item.required).map(item => item.name);
}

/**
 * 모든 항목 목록 반환
 */
export function getAllMandatoryItems(): Array<{ name: string; required: boolean }> {
  return MANDATORY_ITEMS.map(item => ({
    name: item.name,
    required: item.required,
  }));
}

/**
 * 특정 항목 검사
 */
export function checkSingleItem(
  text: string,
  itemName: string
): MandatoryItem | null {
  const itemDef = MANDATORY_ITEMS.find(item => item.name === itemName);
  if (!itemDef) return null;

  for (const pattern of itemDef.patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = itemDef.extractValue ? itemDef.extractValue(match) : match[0];
      const isValid = itemDef.validate(value, text);
      return {
        name: itemDef.name,
        required: itemDef.required,
        found: true,
        value,
        isValid,
        issue: isValid ? undefined : `${itemDef.name} 형식이 올바르지 않음`,
      };
    }
  }

  return {
    name: itemDef.name,
    required: itemDef.required,
    found: false,
    isValid: false,
  };
}
