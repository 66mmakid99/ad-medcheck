/**
 * Gemini 위반 탐지 프롬프트 빌더
 * 규칙엔진의 4,300줄 로직을 Gemini 프롬프트용 "사전"으로 변환
 *
 * Phase 1: Gemini 위반 탐지 프롬프트 설계
 *
 * 원칙:
 * - Gemini는 사전에 있는 규칙대로만 판단
 * - 사전에 없는 기준으로 판단하지 않음
 * - 개인적 판단 추가 금지
 */

import type {
  ViolationPromptConfig,
  PromptPattern,
  DisclaimerRule,
  PromptDepartmentRule,
  PromptContextException,
  SectionWeight,
  GrayZoneCase,
} from '../types/violation-types';
import { ABSOLUTE_VIOLATION_IDS } from './pattern-loader';

// ============================================
// 메인 프롬프트 빌더
// ============================================

/**
 * 규칙엔진 데이터를 Gemini 프롬프트로 변환
 * 5개 사전 + 6개 지시 + 선택적 사전 6(Gray Zone)
 */
export function buildViolationPrompt(config: ViolationPromptConfig): string {
  const parts: string[] = [];

  // 시스템 역할
  parts.push(buildSystemRole());

  // 사전 1: 위반 패턴 목록 (압축 형식)
  parts.push(buildPatternDictionary(config.patterns));

  // 사전 2: 네거티브 리스트
  parts.push(buildNegativeListDictionary(
    config.negativeList,
    config.confirmedDevices,
    config.confirmedTreatments,
  ));

  // 사전 3: 면책조항 규칙
  parts.push(buildDisclaimerDictionary(config.disclaimerRules));

  // 사전 4: 영역별 가중치
  parts.push(buildSectionWeightDictionary(config.sectionWeights));

  // 사전 5: 맥락 예외
  parts.push(buildContextExceptionDictionary(config.contextExceptions));

  // 사전 6: Gray Zone 사례집 (있을 경우)
  if (config.grayZoneExamples && config.grayZoneExamples.length > 0) {
    parts.push(buildGrayZoneDictionary(config.grayZoneExamples));
  }

  // 지시 1~6
  parts.push(buildInstructions());

  // 출력 형식
  parts.push(buildOutputSchema());

  return parts.join('\n\n');
}

// ============================================
// 시스템 역할
// ============================================

function buildSystemRole(): string {
  return `[시스템 역할]
너는 한국 의료광고법 위반 심의관이다.
아래 사전과 규칙에 따라 의료 광고 텍스트와 이미지를 분석하라.
사전에 없는 기준으로 판단하지 마라.
네 개인적 판단을 추가하지 마라.
사전의 patternId만 사용하라. 새 ID를 만들지 마라.`;
}

// ============================================
// 사전 1: 위반 패턴 (압축 형식으로 토큰 절약)
// ============================================

function buildPatternDictionary(patterns: PromptPattern[]): string {
  // 카테고리별로 그룹화하여 압축
  const byCategory = new Map<string, PromptPattern[]>();
  for (const p of patterns) {
    if (!byCategory.has(p.category)) {
      byCategory.set(p.category, []);
    }
    byCategory.get(p.category)!.push(p);
  }

  const lines: string[] = [
    `[사전 1: 위반 패턴 목록]`,
    `총 ${patterns.length}개 패턴. 반드시 아래 ID를 결과에 사용하라.`,
    `형식: id|severity|description|example|exceptions`,
    '',
  ];

  for (const [category, catPatterns] of byCategory) {
    lines.push(`## ${category} (${catPatterns.length}건)`);
    for (const p of catPatterns) {
      const exceptions = p.exceptions && p.exceptions.length > 0
        ? `예외:${p.exceptions.join(',')}`
        : '';
      lines.push(`${p.id}|${p.severity}|${p.description}|예:"${p.example}"|${exceptions}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================
// 사전 2: 네거티브 리스트
// ============================================

function buildNegativeListDictionary(
  negativeList: string[],
  confirmedDevices?: string[],
  confirmedTreatments?: string[],
): string {
  const lines: string[] = [
    `[사전 2: 네거티브 리스트 — 절대로 위반으로 잡지 마라]`,
    `아래 단어/표현이 단독으로 매칭될 경우 위반이 아니다.`,
    `이 단어가 포함된 텍스트라도, 위반 표현과 결합되지 않은 단독 사용은 위반이 아니다.`,
    '',
    `기본 네거티브 항목 (${negativeList.length}개):`,
    negativeList.join(', '),
  ];

  if (confirmedDevices && confirmedDevices.length > 0) {
    lines.push('');
    lines.push(`이 병원의 확정 장비 (MADMEDSALES 확인, ${confirmedDevices.length}개):`);
    lines.push(confirmedDevices.join(', '));
  }

  if (confirmedTreatments && confirmedTreatments.length > 0) {
    lines.push('');
    lines.push(`이 병원의 확정 시술 (MADMEDSALES 확인, ${confirmedTreatments.length}개):`);
    lines.push(confirmedTreatments.join(', '));
  }

  return lines.join('\n');
}

// ============================================
// 사전 3: 면책조항 규칙
// ============================================

function buildDisclaimerDictionary(rules: DisclaimerRule[]): string {
  const absoluteIds = ABSOLUTE_VIOLATION_IDS;

  const lines: string[] = [
    `[사전 3: 면책조항 규칙]`,
    `아래 면책 문구가 페이지/문장에 존재할 경우:`,
    '',
  ];

  for (const rule of rules) {
    lines.push(`- "${rule.pattern}" (${rule.description})`);
  }

  lines.push('');
  lines.push(`→ 해당 문장의 위반 심각도를 1단계 하향 (critical→major, major→minor, minor→low)`);
  lines.push(`→ adjustedSeverity 필드에 하향된 심각도를 기록하고, disclaimerPresent를 true로 설정`);
  lines.push('');
  lines.push(`⚠️ 단, 아래 ${absoluteIds.length}개 패턴은 면책조항이 있어도 하향하지 않는다 (절대 위반):`);
  for (const id of absoluteIds) {
    lines.push(`- ${id}`);
  }

  return lines.join('\n');
}

// ============================================
// 사전 4: 영역별 가중치
// ============================================

function buildSectionWeightDictionary(weights: SectionWeight[]): string {
  const lines: string[] = [
    `[사전 4: 영역별 가중치]`,
    `텍스트가 위치한 영역에 따라 심각도 가중치를 적용하라:`,
    '',
  ];

  for (const w of weights) {
    lines.push(`- ${w.label} (${w.type}): ${w.weight}x`);
  }

  return lines.join('\n');
}

// ============================================
// 사전 5: 맥락 예외
// ============================================

function buildContextExceptionDictionary(exceptions: PromptContextException[]): string {
  const lines: string[] = [
    `[사전 5: 맥락 예외 — 이 맥락에서는 위반이 아니다]`,
    `${exceptions.length}종 맥락 예외:`,
    '',
  ];

  for (let i = 0; i < exceptions.length; i++) {
    const ex = exceptions[i];
    lines.push(`${i + 1}. ${ex.type}: ${ex.description}`);
    if (ex.examples.length > 0) {
      lines.push(`   예시: ${ex.examples.slice(0, 2).map(e => `"${e}"`).join(', ')}`);
    }
  }

  return lines.join('\n');
}

// ============================================
// 사전 6: Gray Zone 사례집 (Phase 7에서 데이터 추가)
// ============================================

function buildGrayZoneDictionary(cases: GrayZoneCase[]): string {
  if (cases.length === 0) return '';

  const lines: string[] = [
    `[사전 6: 법 우회 사례집 — 이 패턴들도 감지하라]`,
    '',
    `아래는 실제 병원 사이트에서 발견된 법 우회 사례다.`,
    `유사한 패턴을 발견하면 gray_zones에 보고하라.`,
    '',
  ];

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    lines.push(`사례 ${i + 1}: [${c.evasion_category}] ${c.evasion_type}`);
    lines.push(`- 수법: ${c.evasion_description}`);
    if (c.evidence_text) {
      lines.push(`- 근거: "${c.evidence_text.substring(0, 200)}"`);
    }
    if (c.target_law || c.legal_target) {
      lines.push(`- 대상 법조항: ${c.target_law || c.legal_target}`);
    }
    if (c.admin_verdict && c.admin_reasoning) {
      lines.push(`- 판정: ${c.admin_verdict} — ${c.admin_reasoning}`);
    }
    lines.push('');
  }

  lines.push(`위 사례와 유사한 우회 기법을 발견하면 gray_zones에 추가하라.`);
  lines.push(`새로운 유형의 우회 기법을 발견해도 gray_zones에 추가하라.`);

  return lines.join('\n');
}

// ============================================
// 지시 1~6
// ============================================

function buildInstructions(): string {
  return `[지시 1: 분석 수행]
위 사전에 따라 입력 텍스트의 모든 위반을 찾아라.
각 위반에 대해 반드시 사전 1의 patternId를 사용하라.
사전 1에 없는 patternId를 만들지 마라.
사전 2의 네거티브 리스트에만 해당하는 텍스트는 위반으로 잡지 마라.

[지시 2: 이미지 분석]
이미지가 포함된 경우:
- 전후사진 (Before/After) 여부 확인
- 이미지 내 텍스트 OCR 추출 → 사전 1 기준으로 위반 검사
- 과장된 시각적 표현 확인
- fromImage를 true로 설정

[지시 3: 영역 분류]
텍스트의 각 섹션이 어떤 영역인지 먼저 분류한 후 분석하라.
영역: treatment(시술소개), event(이벤트/프로모션), faq(자주묻는질문), review(후기/리뷰), doctor(의사소개), default(기타)

[지시 4: 필수 기재사항 확인]
아래 6개 항목이 페이지에 있는지 확인하라:
1. 의료기관 명칭 (hospital_name)
2. 소재지 (address)
3. 전화번호 (phone)
4. 진료과목 (department)
5. 의료인 성명/면허종류 (doctor_info)
6. 비급여 진료비 고지 (price_disclosure) — 비급여 시술이 있을 때만 applicable: true

[지시 5: 신뢰도 판정]
각 위반에 confidence (0.0~1.0)를 부여하라:
- 0.9~1.0: 명백한 위반 (패턴 정확 매칭, 맥락 예외 없음)
- 0.7~0.89: 높은 확신 (패턴 매칭, 맥락 일부 애매)
- 0.5~0.69: 보통 확신 (맥락에 따라 위반 가능)
- 0.5 미만: 보고하지 마라 (너무 불확실)

[지시 6: Gray Zone 감지]
명확히 위반인지 아닌지 판단하기 어려운 "법 우회" 사례를 발견하면
violations와 별도로 gray_zones에 보고하라.

감지 대상:
1. 구조적 우회: 로그인 벽 뒤에 전후사진 숨김, 가격 의도적 은닉, 후기를 별도 도메인에 분리
2. 문구적 우회: 면책 후 효과 보장, 가능성 표현으로 단정 회피, 논문 인용으로 학술적 포장
3. 시각적 우회: "시술 과정 사진" 명칭 변경, 일러스트/3D로 전후 비교, 블러 처리 후 결과만 강조
4. 플랫폼 우회: 공식 사이트엔 없지만 SNS/블로그에 전후사진, 인플루언서 협찬 미표시

evasion_type 값: structure_login_wall, structure_price_hide, structure_subdomain_split, wording_disclaimer, wording_hedge, wording_academic_packaging, visual_illustration, visual_process_photo, visual_blur_result, platform_sns_redirect, platform_fake_review, platform_influencer_undisclosed, other`;
}

// ============================================
// 출력 형식 (JSON 스키마)
// ============================================

function buildOutputSchema(): string {
  return `[출력 형식]
반드시 아래 JSON 형식으로만 응답하라. 다른 텍스트를 추가하지 마라.
JSON 외의 텍스트(설명, 마크다운 등)를 절대 포함하지 마라.

{
  "sections": [
    { "type": "treatment|event|faq|review|doctor|default", "startIndex": 0, "endIndex": 500 }
  ],
  "violations": [
    {
      "patternId": "P-56-XX-XXX",
      "category": "string",
      "severity": "critical|major|minor",
      "originalText": "위반 텍스트 원문",
      "context": "위반 텍스트 앞뒤 50자",
      "sectionType": "treatment|event|faq|review|doctor|default",
      "confidence": 0.0,
      "reasoning": "왜 위반인지 한 줄 설명",
      "fromImage": false,
      "disclaimerPresent": false,
      "adjustedSeverity": "critical|major|minor|low"
    }
  ],
  "gray_zones": [
    {
      "evasion_type": "string",
      "evasion_category": "structural|wording|visual|platform",
      "evasion_description": "구체적 우회 방법 설명",
      "legal_target": "의료법 제XX조 제X항 제X호",
      "target_violation_type": "원래 잡히려던 위반 유형",
      "evidence": "근거 텍스트",
      "confidence": 0.0
    }
  ],
  "mandatory_items": {
    "hospital_name": { "found": true, "value": "XXX의원" },
    "address": { "found": false },
    "phone": { "found": true, "value": "02-XXX-XXXX" },
    "department": { "found": true, "value": "피부과" },
    "doctor_info": { "found": false },
    "price_disclosure": { "found": false, "applicable": true }
  },
  "summary": {
    "total_violations": 0,
    "by_severity": { "critical": 0, "major": 0, "minor": 0 },
    "gray_zone_count": 0,
    "mandatory_missing": 0,
    "overall_risk": "low|medium|high|critical"
  },
  "checklist_verification": {
    "used_only_provided_pattern_ids": true,
    "checked_negative_list": true,
    "applied_disclaimer_rules": true,
    "applied_section_weights": true,
    "checked_context_exceptions": true,
    "reported_gray_zones_separately": true
  }
}`;
}

// ============================================
// 유틸: 프롬프트 토큰 수 추정
// ============================================

/**
 * 프롬프트 토큰 수 대략 추정
 * 한글 1자 ≈ 2~3 토큰, 영문/숫자 ≈ 0.25~0.5 토큰
 * 보수적으로 한글 3토큰, 영문 0.5토큰으로 계산
 */
export function estimateTokenCount(prompt: string): number {
  let tokens = 0;
  for (const char of prompt) {
    if (/[\uAC00-\uD7A3]/.test(char)) {
      tokens += 2.5; // 한글
    } else if (/[a-zA-Z0-9]/.test(char)) {
      tokens += 0.4; // 영문/숫자
    } else {
      tokens += 0.5; // 기호/공백
    }
  }
  return Math.ceil(tokens);
}
