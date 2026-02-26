/**
 * 분석 결과 후처리 - 패턴별 중복 제거 + 병원명 오탐 제거
 * 
 * 이 파일의 함수를 analysis-pipeline.ts의 Step 3 이후에 호출합니다.
 * 
 * 위치: src/services/result-postprocessor.ts
 */

/**
 * 위반 결과에서 같은 패턴 ID의 중복을 제거합니다.
 * 
 * 예: "피부과"가 페이지에 30번 나와서 P-56-18-001이 30번 잡히면
 * → 가장 신뢰도 높은 1건만 남기고 나머지 29건 제거
 * 
 * 이렇게 하면 "같은 유형의 위반은 1번만 카운트"됩니다.
 */
export function deduplicateByPatternId(violations: any[]): any[] {
  if (!violations || violations.length === 0) return [];

  const bestByPattern = new Map<string, any>();

  for (const v of violations) {
    const patternId = v.patternId || v.type || 'unknown';
    const existing = bestByPattern.get(patternId);

    if (!existing) {
      // 첫 발견
      bestByPattern.set(patternId, { ...v, _count: 1 });
    } else {
      // 이미 있으면 카운트만 증가, 신뢰도 높은 걸로 교체
      existing._count = (existing._count || 1) + 1;
      if ((v.confidence || 0) > (existing.confidence || 0)) {
        bestByPattern.set(patternId, { ...v, _count: existing._count });
      }
    }
  }

  // _count 정보를 description에 반영
  const result: any[] = [];
  for (const [, v] of bestByPattern) {
    const count = v._count || 1;
    if (count > 1) {
      v.description = `${v.description} (페이지 내 ${count}회 발견, 1건으로 집계)`;
    }
    delete v._count;
    result.push(v);
  }

  return result;
}

/**
 * 병원명/진료과목이 포함된 오탐을 제거합니다.
 * 
 * 예: "뷰티스킨피부과"라는 병원 이름 자체에 "피부과"가 포함되어 있으면
 * 그 매칭은 위반이 아님
 */
export function removeHospitalNameFalsePositives(
  violations: any[],
  hospitalName?: string,
): any[] {
  if (!violations || violations.length === 0 || !hospitalName) return violations;

  // 병원명에 포함된 키워드 추출
  const nameKeywords = extractNameKeywords(hospitalName);

  return violations.filter(v => {
    const matchedText = (v.matchedText || '').trim();

    // 매칭된 텍스트가 병원명의 일부인 경우 제거
    for (const keyword of nameKeywords) {
      if (keyword === matchedText) {
        return false; // 오탐 → 제거
      }
    }

    // 매칭된 텍스트를 포함하는 문맥이 병원명인 경우 제거
    if (hospitalName.includes(matchedText) && matchedText.length < hospitalName.length) {
      return false;
    }

    return true; // 유지
  });
}

/**
 * 병원명에서 진료과목 키워드 추출
 * "뷰티스킨피부과의원" → ["피부과", "뷰티스킨피부과의원", "뷰티스킨피부과"]
 */
function extractNameKeywords(name: string): string[] {
  const keywords: string[] = [name];

  // 일반적인 진료과목 + 의원/클리닉 패턴
  const departments = [
    '피부과', '성형외과', '치과', '한의원', '내과', '외과',
    '안과', '이비인후과', '비뇨기과', '산부인과', '정형외과',
    '신경외과', '소아과', '정신건강의학과',
  ];

  for (const dept of departments) {
    if (name.includes(dept)) {
      keywords.push(dept);
    }
  }

  return keywords;
}

const COMMON_NAVIGATION_TEXTS = [
  '오시는 길', '진료안내', '진료시간', '예약하기',
  '개인정보처리방침', '이용약관', '사이트맵',
  '오시는길', '진료예약', '상담신청',
];

function isNavigationTextFP(violation: any): boolean {
  const matched = (violation.matchedText || violation.matched || '').trim();
  return COMMON_NAVIGATION_TEXTS.some(nav => matched.includes(nav));
}

/**
 * 네비게이션/메뉴에서 반복되는 위반을 필터링합니다.
 * 
 * 같은 matchedText가 5회 이상 반복되면 네비게이션 요소일 가능성이 높음
 */
export function removeNavigationRepeats(violations: any[]): any[] {
  if (!violations || violations.length <= 5) return violations;

  // matchedText별 빈도 카운트
  const textCount = new Map<string, number>();
  for (const v of violations) {
    const text = (v.matchedText || '').trim();
    textCount.set(text, (textCount.get(text) || 0) + 1);
  }

  // 5회 이상 반복되는 텍스트 식별
  const navigationTexts = new Set<string>();
  for (const [text, count] of textCount) {
    if (count >= 5) {
      navigationTexts.add(text);
    }
  }

  if (navigationTexts.size === 0) return violations;

  // 반복 텍스트는 1건만 남기기
  const seen = new Set<string>();
  return violations.filter(v => {
    const text = (v.matchedText || '').trim();
    if (navigationTexts.has(text)) {
      if (seen.has(text)) return false; // 이미 1건 남김 → 제거
      seen.add(text);
      return true; // 첫 1건은 유지
    }
    return true; // 반복 텍스트 아니면 유지
  });
}

/**
 * 전체 후처리 파이프라인
 * 순서: 병원명 오탐 제거 → 네비게이션 반복 제거 → 패턴별 중복 제거
 */
export function postprocessViolations(
  violations: any[],
  hospitalName?: string,
): any[] {
  let result = violations;

  // 1) 병원명 오탐 제거
  result = removeHospitalNameFalsePositives(result, hospitalName);

  // 2) 네비게이션 텍스트 오탐 제거
  result = result.filter(v => !isNavigationTextFP(v));

  // 3) 네비게이션 반복 제거
  result = removeNavigationRepeats(result);

  // 4) 패턴별 중복 제거 (같은 패턴 = 1건)
  result = deduplicateByPatternId(result);

  return result;
}
