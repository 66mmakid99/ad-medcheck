/**
 * Rule-First 파이프라인 분류 로직
 * - classifyAnalysisResults: Rule 결과를 CONFIRMED/SAFE/AMBIGUOUS로 분류
 * - mergeRuleAndAIResults: Rule + AI 결과 병합
 * - calculateCompositeConfidence: 복합 신뢰도 계산
 */

import type { ViolationResult, Determination, DetectionSource } from '../types';

// ============================================
// 타입
// ============================================

export interface ClassificationResult {
  determination: Determination;
  violations: ViolationResult[];
  avgConfidence: number;
  needsAI: boolean;
}

export interface MergedResult {
  violations: ViolationResult[];
  determination: Determination;
  detectionSource: DetectionSource;
  totalCount: number;
  ruleCount: number;
  aiCount: number;
}

// ============================================
// 1. Rule 결과 분류
// ============================================

/**
 * Rule 엔진 결과를 CONFIRMED / SAFE / AMBIGUOUS로 분류
 *
 * - 위반 0건 → safe
 * - critical/high + confidence ≥ 0.7 → confirmed
 * - 그 외 (medium/low 또는 confidence < 0.7) → ambiguous
 */
export function classifyAnalysisResults(
  violations: ViolationResult[]
): ClassificationResult {
  // 위반 0건 → safe
  if (violations.length === 0) {
    return {
      determination: 'safe',
      violations: [],
      avgConfidence: 1.0,
      needsAI: false,
    };
  }

  // 고신뢰 위반 확인: critical/high severity + confidence ≥ 0.7
  const highConfidenceViolations = violations.filter(
    (v) =>
      (v.severity === 'critical' || v.severity === 'high') &&
      v.confidence >= 0.7
  );

  if (highConfidenceViolations.length > 0) {
    // confirmed: 라벨 부여
    const labeled = violations.map((v) => ({
      ...v,
      determination: 'confirmed' as Determination,
      detectionSource: 'rule_only' as DetectionSource,
    }));

    const avgConf =
      labeled.reduce((sum, v) => sum + v.confidence, 0) / labeled.length;

    return {
      determination: 'confirmed',
      violations: labeled,
      avgConfidence: avgConf,
      needsAI: false,
    };
  }

  // ambiguous: medium/low 또는 confidence < 0.7
  const labeled = violations.map((v) => ({
    ...v,
    determination: 'ambiguous' as Determination,
    detectionSource: 'rule_only' as DetectionSource,
  }));

  const avgConf =
    labeled.reduce((sum, v) => sum + v.confidence, 0) / labeled.length;

  return {
    determination: 'ambiguous',
    violations: labeled,
    avgConfidence: avgConf,
    needsAI: true,
  };
}

// ============================================
// 2. Rule + AI 결과 병합
// ============================================

/**
 * Rule 결과와 AI 결과를 병합
 * - Rule 결과에 determination 라벨 부여
 * - AI 결과는 ai_verified 라벨
 * - 중복 제거 (동일 patternId + 유사 matchedText)
 * - compositeConfidence < 0.5 → hitl_required
 */
export function mergeRuleAndAIResults(
  ruleViolations: ViolationResult[],
  aiViolations: ViolationResult[],
  currentDetermination: Determination
): MergedResult {
  // Rule 결과에 라벨 부여
  const labeledRule = ruleViolations.map((v) => ({
    ...v,
    determination: currentDetermination,
    detectionSource: 'rule_and_ai' as DetectionSource,
    compositeConfidence: calculateCompositeConfidence(v.confidence),
  }));

  // AI 결과에 ai_verified 라벨 부여
  const labeledAI = aiViolations.map((v) => ({
    ...v,
    determination: 'ai_verified' as Determination,
    detectionSource: 'rule_and_ai' as DetectionSource,
    compositeConfidence: calculateCompositeConfidence(undefined, v.confidence),
  }));

  // 중복 제거: 동일 patternId + 유사 matchedText
  const merged: ViolationResult[] = [...labeledRule];
  const ruleKeys = new Set(
    labeledRule.map((v) => makeDedupeKey(v))
  );

  for (const aiV of labeledAI) {
    const key = makeDedupeKey(aiV);
    if (!ruleKeys.has(key)) {
      // 유사 텍스트 체크 (Rule에 없는 AI 결과만 추가)
      const isDuplicate = labeledRule.some(
        (rv) =>
          rv.patternId &&
          rv.patternId === aiV.patternId &&
          textSimilarity(rv.matchedText, aiV.matchedText) > 0.7
      );

      if (!isDuplicate) {
        merged.push(aiV);
      }
    }
  }

  // compositeConfidence < 0.5인 항목은 hitl_required로 변경
  const finalViolations = merged.map((v) => {
    const cc = v.compositeConfidence ?? v.confidence;
    if (cc < 0.5) {
      return { ...v, determination: 'hitl_required' as Determination };
    }
    return v;
  });

  // 최종 determination 결정
  const hasHitl = finalViolations.some(
    (v) => v.determination === 'hitl_required'
  );
  const hasAiVerified = finalViolations.some(
    (v) => v.determination === 'ai_verified'
  );

  let finalDetermination: Determination = currentDetermination;
  if (hasHitl) {
    finalDetermination = 'hitl_required';
  } else if (hasAiVerified) {
    finalDetermination = 'ai_verified';
  }

  return {
    violations: finalViolations,
    determination: finalDetermination,
    detectionSource: 'rule_and_ai',
    totalCount: finalViolations.length,
    ruleCount: labeledRule.length,
    aiCount: finalViolations.length - labeledRule.length,
  };
}

// ============================================
// 3. 복합 신뢰도 계산
// ============================================

/**
 * Rule 60% + AI 30% + Context 10% 가중 평균
 */
export function calculateCompositeConfidence(
  ruleConfidence?: number,
  aiConfidence?: number,
  contextConfidence?: number
): number {
  const rule = ruleConfidence ?? 0;
  const ai = aiConfidence ?? 0;
  const context = contextConfidence ?? 0.5; // 기본 중립값

  // 가중치 설정
  const weights = { rule: 0.6, ai: 0.3, context: 0.1 };

  // Rule만 있는 경우: Rule 비중 확대
  if (ruleConfidence !== undefined && aiConfidence === undefined) {
    return rule * 0.85 + context * 0.15;
  }

  // AI만 있는 경우: AI 비중 확대
  if (ruleConfidence === undefined && aiConfidence !== undefined) {
    return ai * 0.85 + context * 0.15;
  }

  // 둘 다 있는 경우: 정상 가중 평균
  return rule * weights.rule + ai * weights.ai + context * weights.context;
}

// ============================================
// 유틸리티
// ============================================

/**
 * 중복 체크용 키 생성
 */
function makeDedupeKey(v: ViolationResult): string {
  const patternPart = v.patternId || 'none';
  const textPart = v.matchedText.toLowerCase().replace(/\s+/g, '').slice(0, 30);
  return `${patternPart}::${textPart}`;
}

/**
 * 간단한 텍스트 유사도 (Jaccard 기반)
 */
function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;

  const normalize = (s: string) =>
    s.toLowerCase().replace(/\s+/g, '');

  const na = normalize(a);
  const nb = normalize(b);

  if (na === nb) return 1;

  // 짧은 텍스트면 포함 관계 체크
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  // 문자 집합 Jaccard 유사도
  const setA = new Set(na.split(''));
  const setB = new Set(nb.split(''));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}
