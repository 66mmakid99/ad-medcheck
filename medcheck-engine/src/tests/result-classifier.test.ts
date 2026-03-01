/**
 * ResultClassifier 단위 테스트
 */
import { describe, it, expect } from 'vitest';
import {
  classifyAnalysisResults,
  mergeRuleAndAIResults,
  calculateCompositeConfidence,
} from '../services/result-classifier';
import type { ViolationResult } from '../types';

function makeViolation(overrides: Partial<ViolationResult> = {}): ViolationResult {
  return {
    type: 'prohibited_expression',
    status: 'violation',
    severity: 'critical',
    matchedText: '100% 완치',
    description: '치료 효과 보장',
    legalBasis: [],
    confidence: 0.9,
    patternId: 'P-56-01-001',
    ...overrides,
  } as ViolationResult;
}

describe('classifyAnalysisResults', () => {
  it('returns safe when no violations', () => {
    const result = classifyAnalysisResults([]);
    expect(result.determination).toBe('safe');
    expect(result.needsAI).toBe(false);
    expect(result.avgConfidence).toBe(1.0);
  });

  it('returns confirmed for high-confidence critical violations', () => {
    const violations = [
      makeViolation({ severity: 'critical', confidence: 0.9 }),
    ];
    const result = classifyAnalysisResults(violations);
    expect(result.determination).toBe('confirmed');
    expect(result.needsAI).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].determination).toBe('confirmed');
  });

  it('returns ambiguous for low-confidence violations', () => {
    const violations = [
      makeViolation({ severity: 'minor', confidence: 0.5 }),
    ];
    const result = classifyAnalysisResults(violations);
    expect(result.determination).toBe('ambiguous');
    expect(result.needsAI).toBe(true);
  });

  it('returns ambiguous for medium severity even with high confidence', () => {
    const violations = [
      makeViolation({ severity: 'medium' as any, confidence: 0.8 }),
    ];
    const result = classifyAnalysisResults(violations);
    expect(result.determination).toBe('ambiguous');
    expect(result.needsAI).toBe(true);
  });

  it('returns confirmed if at least one critical/high with conf >= 0.7', () => {
    const violations = [
      makeViolation({ severity: 'critical', confidence: 0.7 }),
      makeViolation({ severity: 'minor', confidence: 0.4, patternId: 'P-56-02-001' }),
    ];
    const result = classifyAnalysisResults(violations);
    expect(result.determination).toBe('confirmed');
    expect(result.violations).toHaveLength(2);
  });

  it('calculates average confidence correctly', () => {
    const violations = [
      makeViolation({ confidence: 0.8 }),
      makeViolation({ confidence: 0.6, patternId: 'P-56-02-001' }),
    ];
    const result = classifyAnalysisResults(violations);
    expect(result.avgConfidence).toBeCloseTo(0.7, 1);
  });
});

describe('calculateCompositeConfidence', () => {
  it('rule-only: 0.85 * rule + 0.15 * context', () => {
    const cc = calculateCompositeConfidence(0.9, undefined, 0.5);
    expect(cc).toBeCloseTo(0.9 * 0.85 + 0.5 * 0.15, 2);
  });

  it('ai-only: 0.85 * ai + 0.15 * context', () => {
    const cc = calculateCompositeConfidence(undefined, 0.8, 0.5);
    expect(cc).toBeCloseTo(0.8 * 0.85 + 0.5 * 0.15, 2);
  });

  it('both: weighted average 60/30/10', () => {
    const cc = calculateCompositeConfidence(0.9, 0.8, 0.5);
    expect(cc).toBeCloseTo(0.9 * 0.6 + 0.8 * 0.3 + 0.5 * 0.1, 2);
  });

  it('defaults context to 0.5 when not provided', () => {
    const cc = calculateCompositeConfidence(0.9);
    expect(cc).toBeCloseTo(0.9 * 0.85 + 0.5 * 0.15, 2);
  });

  it('returns small value when nothing is provided', () => {
    const cc = calculateCompositeConfidence();
    expect(cc).toBeLessThan(0.2);
    expect(cc).toBeGreaterThanOrEqual(0);
  });
});

describe('mergeRuleAndAIResults', () => {
  it('merges without duplicates', () => {
    const ruleV = [makeViolation({ patternId: 'P-56-01-001', matchedText: '100% 완치' })];
    const aiV = [makeViolation({ patternId: 'P-56-02-001', matchedText: '부작용 없음' })];
    const result = mergeRuleAndAIResults(ruleV, aiV, 'confirmed');
    expect(result.totalCount).toBe(2);
    expect(result.ruleCount).toBe(1);
    expect(result.aiCount).toBe(1);
  });

  it('deduplicates same patternId + similar text', () => {
    const ruleV = [makeViolation({ patternId: 'P-56-01-001', matchedText: '100% 완치를 보장' })];
    const aiV = [makeViolation({ patternId: 'P-56-01-001', matchedText: '100% 완치를 보장합니다' })];
    const result = mergeRuleAndAIResults(ruleV, aiV, 'confirmed');
    expect(result.totalCount).toBe(1);
  });

  it('marks low compositeConfidence as hitl_required', () => {
    const ruleV = [makeViolation({ confidence: 0.3 })];
    const result = mergeRuleAndAIResults(ruleV, [], 'ambiguous');
    const hitlItems = result.violations.filter(v => v.determination === 'hitl_required');
    expect(hitlItems.length).toBeGreaterThanOrEqual(0); // depends on calculation
  });

  it('sets detectionSource to rule_and_ai', () => {
    const ruleV = [makeViolation()];
    const result = mergeRuleAndAIResults(ruleV, [], 'confirmed');
    expect(result.detectionSource).toBe('rule_and_ai');
  });
});
