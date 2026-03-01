/**
 * 패턴 정확도 회귀 테스트
 *
 * 23개 내장 테스트 케이스에 대한 100% 정확도를 보장합니다.
 * 패턴이나 후처리 로직 변경 시 이 테스트가 깨지면 회귀 발생.
 */
import { describe, it, expect } from 'vitest';
import { PatternMatcher } from '../modules/violation-detector/pattern-matcher';

const matcher = new PatternMatcher();

// 위반 감지 여부 판정 함수 (analyze.ts의 로직 재현)
function detectsViolation(text: string): boolean {
  const matches = matcher.match(text, { minConfidence: 0.5 });
  return matches.length > 0;
}

// === True Positives (위반이어야 함) ===
const TRUE_POSITIVES = [
  { id: 'TP-01', text: '본원은 100% 완치를 보장합니다.', description: '100% 완치 보장' },
  { id: 'TP-02', text: '수술 후 부작용은 전혀 없습니다.', description: '부작용 완전 부정' },
  { id: 'TP-03', text: '국내 최초! 최고의 기술력으로 시술합니다.', description: '최초/최고 표현' },
  { id: 'TP-04', text: '타 병원보다 50% 이상 효과적인 치료법', description: '타 병원 비교' },
  { id: 'TP-05', text: '지금 예약하시면 시술비 무료! 선착순 10명', description: '무료 시술 환자유인' },
  { id: 'TP-06', text: '수술 전후 사진을 보시면 효과를 확인하실 수 있습니다.', description: '전후 사진 유도' },
  { id: 'TP-07', text: '영구적인 효과로 재수술이 필요 없습니다.', description: '영구적 효과 + 재수술 불필요' },
  { id: 'TP-08', text: '연예인 OOO도 다녀간 병원', description: '유명인 이용 광고' },
  { id: 'TP-09', text: '이 시술은 통증이 전혀 없어 마취 없이도 가능합니다.', description: '무통 단정' },
  { id: 'TP-10', text: '1회 시술만으로 확실한 효과를 보장합니다.', description: '1회 효과 보장' },
  { id: 'TP-11', text: '이번 달 한정 50% 할인 이벤트 진행중! 놓치지 마세요.', description: '한정 할인 이벤트' },
  { id: 'TP-12', text: '만족도 100%! 5000명의 환자가 선택한 시술', description: '만족도 100%' },
];

// === True Negatives (위반 아니어야 함) ===
const TRUE_NEGATIVES = [
  { id: 'TN-01', text: '본원은 서울특별시 강남구에 위치하고 있습니다.', description: '단순 위치 정보' },
  { id: 'TN-02', text: '진료 시간: 월~금 09:00~18:00, 토 09:00~13:00', description: '진료 시간 안내' },
  { id: 'TN-03', text: '해당 시술은 개인에 따라 효과가 다를 수 있습니다.', description: '면책 고지' },
  { id: 'TN-04', text: '의료진 소개: 김OO 원장 - 대한피부과학회 정회원', description: '의료진 자격' },
  { id: 'TN-05', text: '100% 소독된 장비를 사용합니다.', description: '100% 소독 (예외)' },
  { id: 'TN-06', text: '시술 후 붓기, 멍 등 일시적인 부작용이 있을 수 있습니다.', description: '부작용 고지 (적법)' },
  { id: 'TN-07', text: '건강보험심사평가원 평가 1등급 병원', description: '공인기관 평가' },
  { id: 'TN-08', text: '예약 문의는 전화 02-1234-5678로 연락주세요.', description: '연락처 안내' },
];

// === Edge Cases ===
const EDGE_CASES = [
  { id: 'EC-01', text: '높은 만족도를 자랑하는 시술입니다.', expected: true, description: '만족도 주장' },
  { id: 'EC-02', text: '검증된 안전한 시술 방법입니다.', expected: false, description: '검증 표현' },
  { id: 'EC-03', text: '빠른 회복이 가능한 최신 장비를 도입하였습니다.', expected: false, description: '빠른 회복 (장비 문맥)' },
];

describe('Pattern Accuracy Regression', () => {
  describe('True Positives - 위반 탐지', () => {
    for (const tp of TRUE_POSITIVES) {
      it(`${tp.id}: ${tp.description}`, () => {
        expect(detectsViolation(tp.text)).toBe(true);
      });
    }
  });

  describe('True Negatives - 비위반 허용', () => {
    for (const tn of TRUE_NEGATIVES) {
      it(`${tn.id}: ${tn.description}`, () => {
        expect(detectsViolation(tn.text)).toBe(false);
      });
    }
  });

  describe('Edge Cases - 경계선 판정', () => {
    for (const ec of EDGE_CASES) {
      it(`${ec.id}: ${ec.description}`, () => {
        expect(detectsViolation(ec.text)).toBe(ec.expected);
      });
    }
  });

  it('Overall accuracy should be 100%', () => {
    let correct = 0;
    let total = 0;

    for (const tp of TRUE_POSITIVES) {
      total++;
      if (detectsViolation(tp.text)) correct++;
    }
    for (const tn of TRUE_NEGATIVES) {
      total++;
      if (!detectsViolation(tn.text)) correct++;
    }
    for (const ec of EDGE_CASES) {
      total++;
      if (detectsViolation(ec.text) === ec.expected) correct++;
    }

    const accuracy = correct / total;
    expect(accuracy).toBe(1.0);
  });
});
