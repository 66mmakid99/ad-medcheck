/**
 * Gemini API 호출 래퍼
 * Gemini 2.5 Flash를 사용한 위반 분석 API 클라이언트
 *
 * Phase 1: Gemini 위반 탐지 프롬프트 설계
 *
 * MADMEDSALES의 gemini 호출 구조와 동일한 패턴.
 * 사전이 다를 뿐.
 */

import type { GeminiViolationOutput } from '../types/violation-types';

// ============================================
// 설정
// ============================================

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const MAX_RETRIES = 1;
const TIMEOUT_MS = 45_000; // 45초

// ============================================
// 메인 함수
// ============================================

/**
 * Gemini 2.5 Flash에 위반 분석 요청
 *
 * @param prompt - buildViolationPrompt()로 생성한 시스템 프롬프트
 * @param content - 분석 대상 (텍스트 + 이미지)
 * @param apiKey - Gemini API 키
 * @returns 파싱된 GeminiViolationOutput
 */
export async function callGeminiForViolation(
  prompt: string,
  content: {
    text: string;
    images?: { base64: string; mimeType: string }[];
  },
  apiKey: string
): Promise<GeminiViolationOutput> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await executeGeminiCall(prompt, content, apiKey, attempt > 0);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[GeminiClient] Attempt ${attempt + 1} failed:`, lastError.message);

      if (attempt < MAX_RETRIES) {
        // 재시도 시 JSON 강조 프롬프트 추가
        console.log('[GeminiClient] Retrying with stricter JSON instruction...');
      }
    }
  }

  throw new Error(`Gemini API 호출 실패 (${MAX_RETRIES + 1}회 시도): ${lastError?.message}`);
}

// ============================================
// Gemini API 실행
// ============================================

async function executeGeminiCall(
  prompt: string,
  content: { text: string; images?: { base64: string; mimeType: string }[] },
  apiKey: string,
  isRetry: boolean,
): Promise<GeminiViolationOutput> {
  // 사용자 메시지 구성
  const userParts: any[] = [];

  // 이미지가 있으면 먼저 추가
  if (content.images && content.images.length > 0) {
    for (const img of content.images) {
      userParts.push({
        inline_data: {
          mime_type: img.mimeType,
          data: img.base64,
        },
      });
    }
  }

  // 텍스트 추가
  let userText = `아래 의료광고 텍스트를 분석하라:\n\n${content.text}`;
  if (isRetry) {
    userText += '\n\n⚠️ 반드시 유효한 JSON만 응답하라. 마크다운 코드블록(```)을 사용하지 마라.';
  }
  userParts.push({ text: userText });

  const requestBody = {
    system_instruction: {
      parts: [{ text: prompt }],
    },
    contents: [
      {
        role: 'user',
        parts: userParts,
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  };

  // API 호출 (타임아웃 포함)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini API ${response.status}: ${errorBody.substring(0, 500)}`);
    }

    const apiResult = await response.json() as any;

    // 응답 텍스트 추출
    const responseText = apiResult.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      throw new Error('Gemini 응답에 텍스트가 없습니다');
    }

    // JSON 파싱
    const parsed = parseGeminiResponse(responseText);

    // 스키마 검증
    validateOutput(parsed);

    return parsed;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================
// 응답 파싱
// ============================================

/**
 * Gemini 응답에서 JSON 추출 및 파싱
 */
function parseGeminiResponse(text: string): GeminiViolationOutput {
  let jsonText = text.trim();

  // 마크다운 코드블록 제거
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.slice(7);
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.slice(3);
  }
  if (jsonText.endsWith('```')) {
    jsonText = jsonText.slice(0, -3);
  }
  jsonText = jsonText.trim();

  try {
    return JSON.parse(jsonText) as GeminiViolationOutput;
  } catch (e) {
    // JSON이 잘린 경우 복구 시도
    const recovered = tryRecoverJson(jsonText);
    if (recovered) return recovered;

    throw new Error(`JSON 파싱 실패: ${(e as Error).message}. 응답 시작: ${jsonText.substring(0, 200)}`);
  }
}

/**
 * 잘린 JSON 복구 시도
 */
function tryRecoverJson(text: string): GeminiViolationOutput | null {
  // 열린 중괄호/대괄호 카운트
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escape = false;

  for (const char of text) {
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') braces++;
    if (char === '}') braces--;
    if (char === '[') brackets++;
    if (char === ']') brackets--;
  }

  // 닫는 괄호 추가
  let fixed = text;
  while (brackets > 0) {
    fixed += ']';
    brackets--;
  }
  while (braces > 0) {
    fixed += '}';
    braces--;
  }

  try {
    return JSON.parse(fixed) as GeminiViolationOutput;
  } catch {
    return null;
  }
}

// ============================================
// 스키마 검증
// ============================================

/**
 * Gemini 출력이 기대 스키마와 일치하는지 검증
 * 누락된 필드는 기본값으로 채움
 */
function validateOutput(output: GeminiViolationOutput): void {
  // 필수 필드 확인 및 기본값
  if (!output.sections) output.sections = [];
  if (!output.violations) output.violations = [];
  if (!output.gray_zones) output.gray_zones = [];
  if (!output.mandatory_items) {
    output.mandatory_items = {
      hospital_name: { found: false },
      address: { found: false },
      phone: { found: false },
      department: { found: false },
      doctor_info: { found: false },
      price_disclosure: { found: false, applicable: false },
    };
  }
  if (!output.summary) {
    output.summary = {
      total_violations: output.violations.length,
      by_severity: { critical: 0, major: 0, minor: 0 },
      gray_zone_count: output.gray_zones.length,
      mandatory_missing: 0,
      overall_risk: 'low',
    };
  }
  if (!output.checklist_verification) {
    output.checklist_verification = {
      used_only_provided_pattern_ids: false,
      checked_negative_list: false,
      applied_disclaimer_rules: false,
      applied_section_weights: false,
      checked_context_exceptions: false,
      reported_gray_zones_separately: false,
    };
  }

  // violations 필드 검증
  for (const v of output.violations) {
    if (!v.patternId) throw new Error('violation에 patternId 누락');
    if (typeof v.confidence !== 'number') v.confidence = 0.7;
    if (!v.severity) v.severity = 'minor';
    if (!v.adjustedSeverity) v.adjustedSeverity = v.severity;
    if (typeof v.fromImage !== 'boolean') v.fromImage = false;
    if (typeof v.disclaimerPresent !== 'boolean') v.disclaimerPresent = false;
    if (!v.sectionType) v.sectionType = 'default';
    if (!v.context) v.context = v.originalText || '';
    if (!v.reasoning) v.reasoning = '';
  }
}

// ============================================
// 유틸: 사용량 추정
// ============================================

/**
 * 예상 비용 계산 (₩)
 * Gemini 2.5 Flash: 입력 $0.15/1M tokens, 출력 $0.60/1M tokens
 * 환율 1,400원/$ 기준
 */
export function estimateCost(inputTokens: number, outputTokens: number): {
  inputCostKRW: number;
  outputCostKRW: number;
  totalCostKRW: number;
} {
  const exchangeRate = 1400;
  const inputCostUSD = (inputTokens / 1_000_000) * 0.15;
  const outputCostUSD = (outputTokens / 1_000_000) * 0.60;

  return {
    inputCostKRW: Math.round(inputCostUSD * exchangeRate),
    outputCostKRW: Math.round(outputCostUSD * exchangeRate),
    totalCostKRW: Math.round((inputCostUSD + outputCostUSD) * exchangeRate),
  };
}
