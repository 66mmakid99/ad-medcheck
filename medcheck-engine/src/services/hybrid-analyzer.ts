/**
 * Hybrid Analyzer Service
 * 정규식 매칭 결과를 Gemini Flash LLM으로 2차 검증하여 오탐을 줄이고 confidence를 정교화
 *
 * 파이프라인: 이미지 → Gemini OCR → 1차 정규식 필터 → 2차 Gemini LLM 검증 → 최종 결과
 */

// ============================================
// 타입 정의
// ============================================

export interface HybridVerification {
  patternId: string;
  matchedText: string;
  aiConfidence: number;       // 0-100
  aiVerdict: boolean;         // true=실제위반, false=오탐
  reasoning: string;          // AI 판단 근거
}

export interface HybridResult {
  verifications: HybridVerification[];
  confirmedViolations: ViolationItem[];    // aiConfidence >= 70
  falsePositiveCandidates: ViolationItem[];// aiConfidence < 70
  aiProcessingTimeMs: number;
}

/** 위반 항목 (judgment.violations의 각 요소) */
export interface ViolationItem {
  patternId: string;
  category: string;
  subcategory?: string;
  severity: string;
  matchedText: string;
  description: string;
  legalBasis: string;
  confidence: number;
  [key: string]: unknown;
}

// ============================================
// Gemini 텍스트 API 호출 (OCR용 Vision과 별도)
// ============================================

const GEMINI_TEXT_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

async function callGeminiText(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch(`${GEMINI_TEXT_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API 오류: ${response.status} - ${errorText}`);
  }

  const result = await response.json() as any;
  return result.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ============================================
// 프롬프트 생성
// ============================================

function buildVerificationPrompt(extractedText: string, violations: ViolationItem[], fpContext?: string): string {
  const violationList = violations.map((v, i) => {
    return `${i + 1}. [${v.patternId}] "${v.matchedText}" - ${v.description} (${v.category}, ${v.severity})`;
  }).join('\n');

  return `당신은 한국 의료광고법(의료법 제56조) 전문 분석가입니다.

아래는 의료광고에서 추출된 텍스트와, 정규식 패턴 매칭으로 탐지된 잠재적 위반 항목 목록입니다.
각 위반 항목이 실제로 의료법 위반인지 **전체 문맥을 고려하여** 판단해주세요.

## 추출된 광고 텍스트
${extractedText}

## 정규식 매칭 결과 (검증 대상)
${violationList}

## 판단 기준
- 해당 표현이 의료법 제56조에서 금지하는 내용인지 문맥상 확인
- 단순히 키워드가 포함되어 있다고 위반이 아님 (예: "100% 예약제"는 치료효과 보장이 아님)
- 의학적 설명이나 정당한 정보 제공은 위반이 아님
- 면책 문구가 함께 있는 경우 위반 가능성 낮음
${fpContext || ''}
## 응답 형식
반드시 아래 JSON 배열 형식으로만 응답하세요. 설명 없이 JSON만 출력하세요.

[
  {
    "index": 1,
    "patternId": "P-56-01-001",
    "aiConfidence": 85,
    "aiVerdict": true,
    "reasoning": "판단 근거를 한 문장으로"
  }
]

- index: 위 목록의 번호
- aiConfidence: 0-100 (위반 확신도. 70 이상이면 실제 위반으로 판단)
- aiVerdict: true(실제 위반) / false(오탐)
- reasoning: 판단 근거 (한국어, 한 문장)`;
}

// ============================================
// AI 응답 파싱
// ============================================

function parseAIResponse(raw: string, violations: ViolationItem[]): HybridVerification[] {
  // JSON 블록 추출 (```json ... ``` 또는 [ ... ])
  let jsonStr = raw.trim();

  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  // 배열 부분만 추출
  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    jsonStr = arrayMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr) as Array<{
      index: number;
      patternId: string;
      aiConfidence: number;
      aiVerdict: boolean;
      reasoning: string;
    }>;

    return parsed.map((item) => {
      const idx = (item.index ?? 1) - 1;
      const violation = violations[idx];
      return {
        patternId: item.patternId || violation?.patternId || 'unknown',
        matchedText: violation?.matchedText || '',
        aiConfidence: Math.max(0, Math.min(100, item.aiConfidence ?? 50)),
        aiVerdict: item.aiVerdict ?? false,
        reasoning: item.reasoning || '판단 근거 없음',
      };
    });
  } catch {
    // AI 응답 파싱 실패 시 모든 위반을 기본값으로 반환
    console.warn('[HybridAnalyzer] AI 응답 JSON 파싱 실패, 기본값 사용');
    return violations.map((v) => ({
      patternId: v.patternId,
      matchedText: v.matchedText,
      aiConfidence: 50,
      aiVerdict: true,
      reasoning: 'AI 응답 파싱 실패 - 수동 검토 필요',
    }));
  }
}

// ============================================
// 메인 검증 함수
// ============================================

const AI_CONFIDENCE_THRESHOLD = 70;

/** FP 학습 데이터 (분석 시 주입) */
export interface FpLearningData {
  fpContext: string;                                    // Gemini 프롬프트에 추가할 FP 컨텍스트
  fpPenaltyMap: Map<string, { fpRate: number; confidencePenalty: number }>;  // 패턴별 confidence 감점
}

/**
 * 정규식 매칭 결과를 Gemini Flash로 2차 검증
 *
 * @param apiKey - Gemini API 키
 * @param extractedText - OCR로 추출된 전체 텍스트
 * @param violations - 1차 정규식 매칭으로 탐지된 위반 항목 배열
 * @param fpLearning - FP 학습 데이터 (선택)
 * @returns HybridResult - 검증 결과 (확정 위반 + 오탐 후보)
 */
export async function verifyViolationsWithAI(
  apiKey: string,
  extractedText: string,
  violations: ViolationItem[],
  fpLearning?: FpLearningData
): Promise<HybridResult> {
  const startTime = Date.now();

  // violations가 0건이면 AI 호출 불필요
  if (violations.length === 0) {
    return {
      verifications: [],
      confirmedViolations: [],
      falsePositiveCandidates: [],
      aiProcessingTimeMs: 0,
    };
  }

  // 프롬프트 구성 → Gemini Flash 1회 호출 (배치)
  const prompt = buildVerificationPrompt(extractedText, violations, fpLearning?.fpContext);
  const rawResponse = await callGeminiText(apiKey, prompt);

  // AI 응답 파싱
  const verifications = parseAIResponse(rawResponse, violations);

  // aiConfidence 기준 분류 (FP 이력 반영)
  const confirmedViolations: ViolationItem[] = [];
  const falsePositiveCandidates: ViolationItem[] = [];

  for (const verification of verifications) {
    const originalViolation = violations.find(
      (v) => v.patternId === verification.patternId
    );
    if (!originalViolation) continue;

    // FP 이력에 따른 confidence 감점
    let adjustedConfidence = verification.aiConfidence;
    if (fpLearning?.fpPenaltyMap) {
      const penalty = fpLearning.fpPenaltyMap.get(verification.patternId);
      if (penalty && penalty.confidencePenalty > 0) {
        adjustedConfidence = Math.max(0, adjustedConfidence - penalty.confidencePenalty * 100);
      }
    }

    // AI 결과를 원본에 병합
    const enriched: ViolationItem = {
      ...originalViolation,
      aiConfidence: adjustedConfidence,
      aiConfidenceRaw: verification.aiConfidence,
      aiVerdict: verification.aiVerdict,
      aiReasoning: verification.reasoning,
    };

    if (adjustedConfidence >= AI_CONFIDENCE_THRESHOLD) {
      confirmedViolations.push(enriched);
    } else {
      falsePositiveCandidates.push(enriched);
    }
  }

  return {
    verifications,
    confirmedViolations,
    falsePositiveCandidates,
    aiProcessingTimeMs: Date.now() - startTime,
  };
}
