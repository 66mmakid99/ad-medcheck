/**
 * 분석 리포트 생성기
 *
 * Phase 8: cleanScore 기반 등급 + 맛보기/전체 리포트
 */

import type { AuditResult, AuditedViolation, GradeResult } from '../types/violation-types';

// ============================================
// 등급 라벨
// ============================================

const GRADE_INFO: Record<string, { label: string; emoji: string; description: string }> = {
  S: { label: '최우수', emoji: '☀️', description: '의료광고 규정을 완벽히 준수하고 있습니다.' },
  A: { label: '우수', emoji: '🟢', description: '경미한 이슈가 있으나 전체적으로 양호합니다.' },
  B: { label: '양호', emoji: '🟡', description: '일부 개선이 필요한 항목이 있습니다.' },
  C: { label: '주의', emoji: '🟠', description: '복수의 위반 사항이 발견되어 개선이 권고됩니다.' },
  D: { label: '위험', emoji: '🔴', description: '심각한 위반이 포함되어 즉시 시정이 필요합니다.' },
  F: { label: '심각', emoji: '⚫', description: '다수의 심각한 위반이 발견되어 법적 제재 위험이 있습니다.' },
};

// ============================================
// 리포트 타입
// ============================================

export interface MedcheckReport {
  type: 'preview' | 'full';
  hospitalName: string;
  analysisDate: string;
  grade: GradeResult & { label: string; emoji: string; description: string };
  summary: {
    totalViolations: number;
    bySeverity: { critical: number; major: number; minor: number; low: number };
    grayZoneCount: number;
    mandatoryMissing: number;
  };
  topViolations: ReportViolation[];
  /** full 리포트에서만 포함 */
  allViolations?: ReportViolation[];
  grayZones?: any[];
  mandatoryItems?: any;
  recommendations: string[];
}

interface ReportViolation {
  patternId: string;
  category: string;
  severity: string;
  text: string;
  reasoning: string;
  legalBasis?: string;
}

// ============================================
// 리포트 생성
// ============================================

/**
 * 맛보기 리포트 생성 (상위 3건만 공개)
 */
export function generatePreviewReport(
  auditResult: AuditResult,
  hospitalName: string,
): MedcheckReport {
  const gradeInfo = GRADE_INFO[auditResult.grade.grade] || GRADE_INFO.C;
  const sorted = sortViolationsBySeverity(auditResult.finalViolations);

  return {
    type: 'preview',
    hospitalName,
    analysisDate: new Date().toISOString().split('T')[0],
    grade: {
      ...auditResult.grade,
      ...gradeInfo,
    },
    summary: buildSummary(auditResult),
    topViolations: sorted.slice(0, 3).map(toReportViolation),
    recommendations: generateRecommendations(auditResult),
  };
}

/**
 * 전체 리포트 생성
 */
export function generateFullReport(
  auditResult: AuditResult,
  hospitalName: string,
): MedcheckReport {
  const gradeInfo = GRADE_INFO[auditResult.grade.grade] || GRADE_INFO.C;
  const sorted = sortViolationsBySeverity(auditResult.finalViolations);

  return {
    type: 'full',
    hospitalName,
    analysisDate: new Date().toISOString().split('T')[0],
    grade: {
      ...auditResult.grade,
      ...gradeInfo,
    },
    summary: buildSummary(auditResult),
    topViolations: sorted.slice(0, 3).map(toReportViolation),
    allViolations: sorted.map(toReportViolation),
    grayZones: auditResult.grayZones,
    mandatoryItems: auditResult.mandatoryItems,
    recommendations: generateRecommendations(auditResult),
  };
}

// ============================================
// 콜드메일 생성
// ============================================

export interface ColdEmailOutput {
  subject: string;
  body: string;
  angle: string;
  priority: 'hot' | 'warm' | 'cold' | 'skip';
  gradeInfo: { grade: string; cleanScore: number; emoji: string };
}

/**
 * 분석 결과 기반 콜드메일 자동 생성
 */
export function generateColdEmail(
  auditResult: AuditResult,
  hospitalName: string,
  salesAngle?: string,
): ColdEmailOutput {
  const { grade, cleanScore } = auditResult.grade;
  const gradeInfo = GRADE_INFO[grade] || GRADE_INFO.C;
  const priority = derivePriority(grade, cleanScore, auditResult.grayZones.length);

  const topViolations = sortViolationsBySeverity(auditResult.finalViolations).slice(0, 3);

  const angle = salesAngle || buildAngle(auditResult);

  const subject = buildSubject(hospitalName, grade);
  const body = buildBody(hospitalName, auditResult, topViolations, angle);

  return {
    subject,
    body,
    angle,
    priority,
    gradeInfo: { grade, cleanScore, emoji: gradeInfo.emoji },
  };
}

// ============================================
// 유틸리티
// ============================================

function buildSummary(auditResult: AuditResult) {
  const vs = auditResult.finalViolations;
  const mandatoryItems = auditResult.mandatoryItems || {};
  const mandatoryMissing = Object.values(mandatoryItems).filter(
    (item: any) => !item.found && (item.applicable !== false)
  ).length;

  return {
    totalViolations: vs.length,
    bySeverity: {
      critical: vs.filter(v => (v.adjustedSeverity || v.severity) === 'critical').length,
      major: vs.filter(v => (v.adjustedSeverity || v.severity) === 'major').length,
      minor: vs.filter(v => (v.adjustedSeverity || v.severity) === 'minor').length,
      low: vs.filter(v => (v.adjustedSeverity || v.severity) === 'low').length,
    },
    grayZoneCount: auditResult.grayZones.length,
    mandatoryMissing,
  };
}

function sortViolationsBySeverity(violations: AuditedViolation[]): AuditedViolation[] {
  const order: Record<string, number> = { critical: 0, major: 1, minor: 2, low: 3 };
  return [...violations].sort((a, b) => {
    const aOrder = order[a.adjustedSeverity || a.severity] ?? 9;
    const bOrder = order[b.adjustedSeverity || b.severity] ?? 9;
    return aOrder - bOrder;
  });
}

function toReportViolation(v: AuditedViolation): ReportViolation {
  return {
    patternId: v.patternId,
    category: v.category || '',
    severity: v.adjustedSeverity || v.severity,
    text: v.originalText || '',
    reasoning: v.reasoning || '',
  };
}

function generateRecommendations(auditResult: AuditResult): string[] {
  const recs: string[] = [];
  const vs = auditResult.finalViolations;

  const criticals = vs.filter(v => (v.adjustedSeverity || v.severity) === 'critical');
  if (criticals.length > 0) {
    recs.push(`심각 위반 ${criticals.length}건 즉시 수정 필요`);
  }

  const categories = new Set(vs.map(v => v.category));
  if (categories.has('부작용부정')) {
    recs.push('부작용 관련 표현을 정확하게 명시하세요');
  }
  if (categories.has('치료효과보장')) {
    recs.push('치료 효과 보장 표현을 제거하세요');
  }
  if (categories.has('최상급표현')) {
    recs.push('최고, 최초, 유일 등 최상급 표현을 삭제하세요');
  }
  if (categories.has('환자유인')) {
    recs.push('할인/무료 이벤트 표현을 의료법에 맞게 수정하세요');
  }

  if (auditResult.grayZones.length > 0) {
    recs.push(`법 우회 ${auditResult.grayZones.length}건 감지 — 선제적 시정 권고`);
  }

  if (recs.length === 0) {
    recs.push('현재 광고는 의료광고 규정을 잘 준수하고 있습니다');
  }

  return recs;
}

function derivePriority(
  grade: string,
  cleanScore: number,
  grayZoneCount: number,
): 'hot' | 'warm' | 'cold' | 'skip' {
  if (grade === 'D' || grade === 'F') return 'hot';
  if (grade === 'C') return 'warm';
  if (grade === 'B' && grayZoneCount > 0) return 'warm';
  return 'cold';
}

function buildAngle(auditResult: AuditResult): string {
  const categories = new Set(auditResult.finalViolations.map(v => v.category));
  const angles: string[] = [];

  if (categories.has('치료효과보장') || categories.has('부작용부정')) {
    angles.push('법적 제재 리스크 관리');
  }
  if (categories.has('최상급표현')) {
    angles.push('브랜드 신뢰도 관리');
  }
  if (categories.has('환자유인')) {
    angles.push('프리미엄 포지셔닝 전환');
  }
  if (auditResult.grayZones.length > 0) {
    angles.push('선제적 컴플라이언스');
  }

  return angles.length > 0 ? angles.join(' + ') : '광고 컴플라이언스 개선';
}

function buildSubject(hospitalName: string, grade: string): string {
  if (grade === 'D' || grade === 'F') {
    return `[긴급] ${hospitalName} 의료광고 위반 사항 안내`;
  }
  if (grade === 'C') {
    return `${hospitalName} 의료광고 개선 제안 드립니다`;
  }
  return `${hospitalName} 의료광고 컴플라이언스 리포트`;
}

function buildBody(
  hospitalName: string,
  auditResult: AuditResult,
  topViolations: AuditedViolation[],
  angle: string,
): string {
  const { grade, cleanScore } = auditResult.grade;
  const gradeInfo = GRADE_INFO[grade] || GRADE_INFO.C;

  let body = `안녕하세요, ${hospitalName} 관계자님.

귀 병원의 온라인 의료광고를 분석한 결과를 안내드립니다.

■ 분석 결과 요약
- 컴플라이언스 등급: ${gradeInfo.emoji} ${grade} (${gradeInfo.label})
- 청결 점수: ${cleanScore}/100
- 발견 위반: ${auditResult.finalCount}건

■ 주요 발견사항
`;

  for (const v of topViolations) {
    body += `  • [${v.adjustedSeverity || v.severity}] ${v.category}: "${(v.originalText || '').substring(0, 50)}"\n`;
  }

  if (auditResult.finalCount > 3) {
    body += `  ... 외 ${auditResult.finalCount - 3}건\n`;
  }

  body += `
■ 제안 방향: ${angle}

상세 리포트와 함께 개선 방안을 안내드리겠습니다.
편하신 시간에 연락 주시면 무료 컨설팅을 제공해드리겠습니다.

감사합니다.
`;

  return body;
}
