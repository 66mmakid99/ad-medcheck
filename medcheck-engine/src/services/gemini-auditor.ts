/**
 * GeminiAuditor — Gemini 결과 사후 검증 모듈
 *
 * Phase 2: 규칙엔진이 Boss, Gemini가 Worker
 *
 * 5가지 감사:
 * 1. 존재하지 않는 patternId 날조 → 강제 제거
 * 2. 네거티브 리스트 항목을 위반으로 잡음 → 강제 제거
 * 3. 면책조항 있는데 하향 안 함 → 강제 하향 (절대 위반 제외)
 * 4. Gemini가 놓친 명백한 위반 → 강제 추가 (규칙엔진 정규식)
 * 5. 비정상적 confidence 보정
 *
 * + 등급/점수 계산 (항상 규칙엔진이 계산 — 일관성)
 */

import type {
  GeminiViolationOutput,
  GeminiViolation,
  AuditResult,
  AuditedViolation,
  AuditIssue,
  GradeResult,
  PromptPattern,
  DisclaimerRule,
} from '../types/violation-types';
import { PatternMatcher } from '../modules/violation-detector/pattern-matcher';
import { ABSOLUTE_VIOLATION_IDS } from './pattern-loader';

// ============================================
// 영역별 가중치 (rule-engine.ts와 동일)
// ============================================

const SECTION_WEIGHTS: Record<string, number> = {
  event: 0.8,
  treatment: 1.2,
  faq: 0.6,
  review: 0.7,
  doctor: 1.0,
  default: 1.0,
};

// ============================================
// 심각도별 감점 (Phase 8에서 확정, 여기서 사용)
// ============================================

const SEVERITY_PENALTY: Record<string, number> = {
  critical: 20,
  major: 7,
  minor: 3,
  low: 1,
};

// ============================================
// GeminiAuditor 클래스
// ============================================

export class GeminiAuditor {
  private validPatternIds: Set<string>;
  private negativeList: string[];
  private normalizedNegatives: string[];
  private disclaimerRules: DisclaimerRule[];
  private patternMatcher: PatternMatcher;

  constructor(
    patterns: PromptPattern[],
    negativeList: string[],
    disclaimerRules: DisclaimerRule[],
  ) {
    this.validPatternIds = new Set(patterns.map(p => p.id));
    this.negativeList = negativeList;
    this.normalizedNegatives = negativeList.map(n => n.toLowerCase().replace(/\s/g, ''));
    this.disclaimerRules = disclaimerRules;
    this.patternMatcher = new PatternMatcher();
  }

  /**
   * Gemini 결과를 감사하여 최종 결과 생성
   */
  audit(geminiOutput: GeminiViolationOutput, originalText: string): AuditResult {
    const issues: AuditIssue[] = [];
    let finalViolations: AuditedViolation[] = geminiOutput.violations.map(v => ({
      ...v,
      source: 'gemini' as const,
    }));

    const originalCount = finalViolations.length;

    // 감사 1: 존재하지 않는 patternId 날조 → 강제 제거
    finalViolations = this.removeInvalidPatternIds(finalViolations, issues);

    // 감사 2: 네거티브 리스트 항목을 위반으로 잡음 → 강제 제거
    finalViolations = this.removeNegativeListViolations(finalViolations, issues);

    // 감사 2.5: 공인 기관 인증/승인 오탐 제거 (P-56-11 계열)
    finalViolations = this.removeCertificationFalsePositives(finalViolations, issues);

    // 감사 3: 면책조항 있는데 하향 안 함 → 강제 하향
    finalViolations = this.enforceDisclaimerDowngrade(finalViolations, originalText, issues);

    // 감사 4: Gemini가 놓친 명백한 위반 → 강제 추가
    finalViolations = this.addMissedViolations(finalViolations, originalText, issues);

    // 감사 5: 비정상적 confidence 보정
    finalViolations = this.adjustConfidence(finalViolations, issues);

    // 감사 6: 동일 patternId + originalText 중복 제거
    finalViolations = this.removeDuplicateViolations(finalViolations, issues);

    // 등급/점수 계산 (항상 규칙엔진이 계산)
    const grade = this.calculateGrade(finalViolations);

    return {
      id: generateId(),
      finalViolations,
      grayZones: geminiOutput.gray_zones || [],
      mandatoryItems: geminiOutput.mandatory_items,
      grade,
      auditIssues: issues,
      geminiOriginalCount: originalCount,
      finalCount: finalViolations.length,
      auditDelta: finalViolations.length - originalCount,
    };
  }

  // ============================================
  // 감사 1: patternId 검증
  // ============================================

  private removeInvalidPatternIds(
    violations: AuditedViolation[],
    issues: AuditIssue[],
  ): AuditedViolation[] {
    return violations.filter(v => {
      if (!this.validPatternIds.has(v.patternId)) {
        issues.push({
          type: 'FABRICATED_PATTERN_ID',
          action: 'REMOVE',
          detail: `Gemini가 존재하지 않는 패턴 ${v.patternId}를 날조함`,
          originalViolation: v,
        });
        return false;
      }
      return true;
    });
  }

  // ============================================
  // 감사 2: 네거티브 리스트 체크
  // ============================================

  private removeNegativeListViolations(
    violations: AuditedViolation[],
    issues: AuditIssue[],
  ): AuditedViolation[] {
    return violations.filter(v => {
      const originalText = (v.originalText || '').toLowerCase().replace(/\s/g, '');
      if (originalText.length === 0) return true;

      const isNegative = this.normalizedNegatives.some(neg => {
        // 네거티브 단어만으로 이루어진 텍스트 = 오탐
        if (originalText === neg) return true;
        // 네거티브 항목을 포함하고 그 외 의미있는 내용이 없는 경우
        if (originalText.length <= neg.length + 5 && originalText.includes(neg)) return true;
        return false;
      });

      if (isNegative) {
        issues.push({
          type: 'NEGATIVE_LIST_VIOLATION',
          action: 'REMOVE',
          detail: `네거티브 리스트 항목 "${v.originalText}"을 위반으로 잡음`,
          originalViolation: v,
        });
        return false;
      }
      return true;
    });
  }

  // ============================================
  // 감사 2.5: 공인 기관 인증/승인 오탐 제거
  // ============================================

  private removeCertificationFalsePositives(
    violations: AuditedViolation[],
    issues: AuditIssue[],
  ): AuditedViolation[] {
    const CERT_ORGS = [
      'fda', 'ce', '식약처', 'mfds', 'kfda', 'iso', 'gmp', 'cgmp',
      'tfda', 'anvisa', 'pmda', '보건복지부', '질병관리청',
    ];
    const CERT_WORDS = ['인증', '승인', '허가', '등록', 'approved', 'cleared', 'certified'];

    return violations.filter(v => {
      // P-56-11 계열 (인증과장) 또는 원문에 "인증"/"승인" 포함
      const text = (v.originalText || '').toLowerCase();
      const context = (v.context || '').toLowerCase();
      const combined = text + ' ' + context;

      // 인증/승인 관련 위반인지 확인
      const hasCertWord = CERT_WORDS.some(w => text.includes(w));
      if (!hasCertWord) return true; // 인증/승인 관련 아니면 유지

      // 공인 기관명이 컨텍스트에 포함되면 오탐
      const hasOfficialOrg = CERT_ORGS.some(org => combined.includes(org));
      if (hasOfficialOrg) {
        issues.push({
          type: 'CERTIFICATION_FALSE_POSITIVE',
          action: 'REMOVE',
          detail: `공인 기관 인증 표현 오탐: ${v.patternId} "${(v.originalText || '').substring(0, 40)}"`,
          originalViolation: v,
        });
        return false;
      }

      return true;
    });
  }

  // ============================================
  // 감사 3: 면책조항 하향 강제
  // ============================================

  private enforceDisclaimerDowngrade(
    violations: AuditedViolation[],
    originalText: string,
    issues: AuditIssue[],
  ): AuditedViolation[] {
    // 페이지에 면책조항이 있는지 확인
    const hasDisclaimer = this.disclaimerRules.some(rule =>
      originalText.includes(rule.pattern)
    );

    if (!hasDisclaimer) return violations;

    return violations.map(v => {
      // 절대 위반은 하향하지 않음
      if (ABSOLUTE_VIOLATION_IDS.includes(v.patternId)) return v;

      // 이미 Gemini가 하향했으면 스킵
      if (v.disclaimerPresent && v.adjustedSeverity !== v.severity) return v;

      // 면책조항이 있는데 하향 안 된 경우 강제 하향
      if (!v.disclaimerPresent || v.adjustedSeverity === v.severity) {
        const downgraded = downgradeSeverity(v.severity);
        if (downgraded !== v.severity) {
          issues.push({
            type: 'DISCLAIMER_NOT_APPLIED',
            action: 'DOWNGRADE',
            detail: `면책조항 존재하나 ${v.patternId}의 심각도가 하향되지 않음: ${v.severity}→${downgraded}`,
            originalViolation: v,
          });
        }
        return {
          ...v,
          disclaimerPresent: true,
          adjustedSeverity: downgraded,
        };
      }

      return v;
    });
  }

  // ============================================
  // 감사 4: 놓친 위반 추가 (기존 정규식 패턴매처)
  // ============================================

  private addMissedViolations(
    violations: AuditedViolation[],
    text: string,
    issues: AuditIssue[],
  ): AuditedViolation[] {
    // 기존 pattern-matcher.ts로 정규식 매칭 실행
    const ruleEngineResults = this.patternMatcher.match(text, {
      minSeverity: 'major', // major 이상만
      minConfidence: 0.7,
    });

    const geminiPatternIds = new Set(violations.map(v => v.patternId));

    // critical/major 중 Gemini가 놓친 것만 추가
    for (const rule of ruleEngineResults) {
      if (geminiPatternIds.has(rule.patternId)) continue;
      if (rule.severity !== 'critical' && rule.severity !== 'major') continue;

      issues.push({
        type: 'GEMINI_MISSED',
        action: 'ADD',
        detail: `규칙엔진이 잡았으나 Gemini가 놓친 위반: ${rule.patternId} "${rule.matchedText.substring(0, 30)}"`,
      });

      violations.push({
        patternId: rule.patternId,
        category: rule.category,
        severity: rule.severity,
        originalText: rule.matchedText,
        context: rule.context,
        sectionType: 'default',
        confidence: rule.severity === 'critical' ? 0.95 : 0.85,
        reasoning: `규칙엔진 정규식 보충 탐지 (${rule.description})`,
        fromImage: false,
        disclaimerPresent: rule.disclaimerDetected || false,
        adjustedSeverity: rule.severity,
        source: 'rule_engine_supplement',
      });
    }

    return violations;
  }

  // ============================================
  // 감사 5: confidence 보정
  // ============================================

  private adjustConfidence(
    violations: AuditedViolation[],
    issues: AuditIssue[],
  ): AuditedViolation[] {
    return violations.map(v => {
      // critical인데 0.7 미만이면 0.85로 보정
      if (v.severity === 'critical' && v.confidence < 0.7) {
        issues.push({
          type: 'CONFIDENCE_ADJUSTED',
          action: 'ADJUST',
          detail: `${v.patternId}: critical인데 confidence ${v.confidence} → 0.85로 보정`,
          originalViolation: v,
        });
        return { ...v, confidence: 0.85 };
      }

      // major인데 0.5 미만이면 0.7로 보정
      if (v.severity === 'major' && v.confidence < 0.5) {
        issues.push({
          type: 'CONFIDENCE_ADJUSTED',
          action: 'ADJUST',
          detail: `${v.patternId}: major인데 confidence ${v.confidence} → 0.70로 보정`,
          originalViolation: v,
        });
        return { ...v, confidence: 0.70 };
      }

      return v;
    });
  }

  // ============================================
  // 감사 6: 동일 patternId + originalText 중복 제거
  // ============================================

  private removeDuplicateViolations(
    violations: AuditedViolation[],
    issues: AuditIssue[],
  ): AuditedViolation[] {
    const seen = new Map<string, AuditedViolation>();
    const result: AuditedViolation[] = [];

    for (const v of violations) {
      const key = `${v.patternId}::${(v.originalText || '').trim()}`;
      const existing = seen.get(key);

      if (existing) {
        // 중복 발견 → 높은 confidence 유지, 낮은 것 제거
        if (v.confidence > existing.confidence) {
          // 새 것이 더 높으면 교체
          const idx = result.indexOf(existing);
          if (idx !== -1) result[idx] = v;
          seen.set(key, v);
          issues.push({
            type: 'DUPLICATE_VIOLATION',
            action: 'REMOVE',
            detail: `중복 제거: ${v.patternId} "${(v.originalText || '').substring(0, 40)}" (confidence ${existing.confidence}→${v.confidence} 유지)`,
            originalViolation: existing,
          });
        } else {
          // 기존이 더 높으면 새 것 버림
          issues.push({
            type: 'DUPLICATE_VIOLATION',
            action: 'REMOVE',
            detail: `중복 제거: ${v.patternId} "${(v.originalText || '').substring(0, 40)}" (confidence ${v.confidence} 제거, ${existing.confidence} 유지)`,
            originalViolation: v,
          });
        }
      } else {
        seen.set(key, v);
        result.push(v);
      }
    }

    return result;
  }

  // ============================================
  // 등급/점수 계산 (규칙엔진 기반 — 일관성)
  // ============================================

  private calculateGrade(violations: AuditedViolation[]): GradeResult {
    let score = 100;

    for (const v of violations) {
      const basePenalty = SEVERITY_PENALTY[v.adjustedSeverity || v.severity] || 3;
      const sectionMultiplier = SECTION_WEIGHTS[v.sectionType] || 1.0;
      const confidenceMultiplier = v.confidence;

      score -= basePenalty * sectionMultiplier * confidenceMultiplier;
    }

    score = Math.max(0, Math.round(score));

    const grade = score >= 95 ? 'S' as const
      : score >= 85 ? 'A' as const
      : score >= 70 ? 'B' as const
      : score >= 55 ? 'C' as const
      : score >= 40 ? 'D' as const
      : 'F' as const;

    return {
      cleanScore: score,
      grade,
      violationCount: violations.length,
    };
  }
}

// ============================================
// 유틸리티
// ============================================

function downgradeSeverity(severity: string): 'critical' | 'major' | 'minor' | 'low' {
  switch (severity) {
    case 'critical': return 'major';
    case 'major': return 'minor';
    case 'minor': return 'low';
    case 'low': return 'low';
    default: return severity as any;
  }
}

function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `audit_${timestamp}_${random}`;
}
