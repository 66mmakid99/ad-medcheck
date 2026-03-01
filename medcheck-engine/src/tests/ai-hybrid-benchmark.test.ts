/**
 * AI 하이브리드 분석 벤치마크 테스트
 *
 * Rule-only vs AI hybrid 정확도를 비교합니다.
 * AI API 호출 없이 context-analyzer의 로컬 로직만 테스트합니다.
 */
import { describe, it, expect } from 'vitest';
import { PatternMatcher } from '../modules/violation-detector/pattern-matcher';

const matcher = new PatternMatcher();

// 매칭 결과 + 신뢰도를 반환
function analyzeText(text: string) {
  const matches = matcher.match(text, { minConfidence: 0.5 });
  return {
    detected: matches.length > 0,
    count: matches.length,
    maxConfidence: matches.length > 0
      ? Math.max(...matches.map(m => m.confidence))
      : 0,
    categories: [...new Set(matches.map(m => m.category))],
    matches,
  };
}

// === 맥락 의존 케이스 (Rule-only로는 판단이 어려운 경계선 케이스) ===
const CONTEXT_DEPENDENT_CASES = [
  {
    id: 'CTX-01',
    text: '이 시술은 효과가 좋다는 후기가 많습니다.',
    expectedViolation: false,
    description: '후기 언급 (비위반)',
  },
  {
    id: 'CTX-02',
    text: '시술 효과에는 개인차가 있으며, 부작용이 발생할 수 있습니다.',
    expectedViolation: false,
    description: '면책 고지 (비위반)',
  },
  {
    id: 'CTX-03',
    text: '검증된 의료진이 직접 시술합니다.',
    expectedViolation: false,
    description: '의료진 소개 (비위반)',
  },
  {
    id: 'CTX-04',
    text: '100% 자연유래 성분을 사용합니다.',
    expectedViolation: false,
    description: '100% 성분 설명 (예외)',
  },
  {
    id: 'CTX-05',
    text: '최신 장비를 도입하여 정밀한 시술이 가능합니다.',
    expectedViolation: false,
    description: '장비 소개 (비위반)',
  },
];

// === 명확한 위반 케이스 (Rule + AI 모두 탐지해야 함) ===
const CLEAR_VIOLATIONS = [
  {
    id: 'CLR-01',
    text: '100% 완치를 약속드립니다. 부작용은 전혀 없습니다.',
    expectedViolation: true,
    description: '완치 보장 + 부작용 부정',
  },
  {
    id: 'CLR-02',
    text: '국내 최초 도입! 독보적인 기술력의 최고 병원',
    expectedViolation: true,
    description: '최초/최고 표현',
  },
  {
    id: 'CLR-03',
    text: '지금 예약하면 시술비 50% 할인! 선착순 마감',
    expectedViolation: true,
    description: '할인 환자유인',
  },
  {
    id: 'CLR-04',
    text: '연예인 OOO님도 방문한 피부과. 만족도 100%!',
    expectedViolation: true,
    description: '유명인 광고 + 만족도',
  },
  {
    id: 'CLR-05',
    text: '타 병원 보다 더 나은 치료 결과를 보장합니다.',
    expectedViolation: true,
    description: '타 병원 비교',
  },
];

// === 꼼수 패턴 탐지 케이스 (Category 19) ===
const TRICK_PATTERN_CASES = [
  {
    id: 'TRK-01',
    text: '전후 사진은 로그인 후 확인 가능합니다.',
    expectedViolation: true,
    description: '로그인 장벽',
  },
  {
    id: 'TRK-02',
    text: 'DM으로 가격 상담 가능합니다.',
    expectedViolation: true,
    description: 'DM 유도',
  },
  {
    id: 'TRK-03',
    text: '댓글로 가격 문의주세요.',
    expectedViolation: true,
    description: '댓글 유도',
  },
];

describe('AI Hybrid Benchmark', () => {
  describe('Clear Violations - 명확한 위반', () => {
    for (const c of CLEAR_VIOLATIONS) {
      it(`${c.id}: ${c.description}`, () => {
        const result = analyzeText(c.text);
        expect(result.detected).toBe(c.expectedViolation);
      });
    }
  });

  describe('Context-Dependent - 맥락 의존', () => {
    for (const c of CONTEXT_DEPENDENT_CASES) {
      it(`${c.id}: ${c.description}`, () => {
        const result = analyzeText(c.text);
        expect(result.detected).toBe(c.expectedViolation);
      });
    }
  });

  describe('Trick Patterns - 꼼수 패턴', () => {
    for (const c of TRICK_PATTERN_CASES) {
      it(`${c.id}: ${c.description}`, () => {
        const result = analyzeText(c.text);
        expect(result.detected).toBe(c.expectedViolation);
      });
    }
  });

  it('Benchmark summary', () => {
    const allCases = [
      ...CLEAR_VIOLATIONS,
      ...CONTEXT_DEPENDENT_CASES,
      ...TRICK_PATTERN_CASES,
    ];

    let correct = 0;
    const results: Array<{id: string; expected: boolean; actual: boolean; ok: boolean}> = [];

    for (const c of allCases) {
      const result = analyzeText(c.text);
      const ok = result.detected === c.expectedViolation;
      if (ok) correct++;
      results.push({
        id: c.id,
        expected: c.expectedViolation,
        actual: result.detected,
        ok,
      });
    }

    const accuracy = correct / allCases.length;
    const failed = results.filter(r => !r.ok);

    if (failed.length > 0) {
      console.log('Failed cases:', failed);
    }
    console.log(`Benchmark accuracy: ${(accuracy * 100).toFixed(1)}% (${correct}/${allCases.length})`);

    // 최소 85% 이상 정확도 기대
    expect(accuracy).toBeGreaterThanOrEqual(0.85);
  });
});
