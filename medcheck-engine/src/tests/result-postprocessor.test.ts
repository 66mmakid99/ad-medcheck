import { describe, it, expect } from 'vitest';
import {
  deduplicateByPatternId,
  removeHospitalNameFalsePositives,
  removeNavigationRepeats,
  postprocessViolations,
} from '../services/result-postprocessor';

describe('deduplicateByPatternId', () => {
  it('returns empty array for null/empty input', () => {
    expect(deduplicateByPatternId([])).toEqual([]);
    expect(deduplicateByPatternId(null as any)).toEqual([]);
  });

  it('keeps single violation as-is', () => {
    const input = [{ patternId: 'P-56-01-001', description: 'test', confidence: 0.9 }];
    const result = deduplicateByPatternId(input);
    expect(result).toHaveLength(1);
    expect(result[0].patternId).toBe('P-56-01-001');
  });

  it('deduplicates same patternId, keeps highest confidence', () => {
    const input = [
      { patternId: 'P-56-01-001', description: 'low', confidence: 0.5 },
      { patternId: 'P-56-01-001', description: 'high', confidence: 0.9 },
      { patternId: 'P-56-01-001', description: 'mid', confidence: 0.7 },
    ];
    const result = deduplicateByPatternId(input);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.9);
    expect(result[0].description).toContain('3회 발견');
  });

  it('keeps different patternIds separate', () => {
    const input = [
      { patternId: 'P-56-01-001', description: 'a', confidence: 0.8 },
      { patternId: 'P-56-02-001', description: 'b', confidence: 0.7 },
    ];
    const result = deduplicateByPatternId(input);
    expect(result).toHaveLength(2);
  });

  it('uses type as fallback when patternId is missing', () => {
    const input = [
      { type: 'custom', description: 'x', confidence: 0.5 },
      { type: 'custom', description: 'y', confidence: 0.6 },
    ];
    const result = deduplicateByPatternId(input);
    expect(result).toHaveLength(1);
  });
});

describe('removeHospitalNameFalsePositives', () => {
  it('returns input unchanged when no hospitalName', () => {
    const input = [{ matchedText: '피부과' }];
    expect(removeHospitalNameFalsePositives(input, undefined)).toEqual(input);
  });

  it('removes violation matching hospital department name', () => {
    const input = [
      { matchedText: '피부과', patternId: 'P-56-18-001' },
      { matchedText: '100% 완치', patternId: 'P-56-01-001' },
    ];
    const result = removeHospitalNameFalsePositives(input, '뷰티스킨피부과');
    expect(result).toHaveLength(1);
    expect(result[0].matchedText).toBe('100% 완치');
  });

  it('removes violation when matchedText is part of hospital name', () => {
    const input = [{ matchedText: '뷰티스킨' }];
    const result = removeHospitalNameFalsePositives(input, '뷰티스킨피부과의원');
    expect(result).toHaveLength(0);
  });

  it('keeps violation not related to hospital name', () => {
    const input = [{ matchedText: '최고의 시술' }];
    const result = removeHospitalNameFalsePositives(input, '강남성형외과');
    expect(result).toHaveLength(1);
  });
});

describe('removeNavigationRepeats', () => {
  it('returns input unchanged when 5 or fewer violations', () => {
    const input = [
      { matchedText: 'a' }, { matchedText: 'a' },
      { matchedText: 'a' }, { matchedText: 'a' },
    ];
    expect(removeNavigationRepeats(input)).toEqual(input);
  });

  it('keeps only 1 instance of text repeated 5+ times', () => {
    const input = Array.from({ length: 7 }, () => ({ matchedText: '예약하기' }));
    input.push({ matchedText: '100% 완치' });
    const result = removeNavigationRepeats(input);
    const navCount = result.filter(v => v.matchedText === '예약하기').length;
    expect(navCount).toBe(1);
    expect(result.find(v => v.matchedText === '100% 완치')).toBeTruthy();
  });
});

describe('postprocessViolations (pipeline)', () => {
  it('applies all filters in correct order', () => {
    const input = [
      // Should be removed: hospital name FP
      { matchedText: '피부과', patternId: 'P-56-18-001', confidence: 0.8 },
      // Should be removed: navigation text
      { matchedText: '오시는 길', patternId: 'P-56-03-001', confidence: 0.7 },
      // Should survive
      { matchedText: '100% 완치 보장', patternId: 'P-56-01-001', confidence: 0.95 },
      // Should survive (different pattern)
      { matchedText: '부작용 없음', patternId: 'P-56-02-001', confidence: 0.85 },
    ];

    const result = postprocessViolations(input, '뷰티스킨피부과');
    expect(result).toHaveLength(2);
    expect(result.map(v => v.patternId).sort()).toEqual(['P-56-01-001', 'P-56-02-001']);
  });

  it('handles empty input gracefully', () => {
    expect(postprocessViolations([])).toEqual([]);
    expect(postprocessViolations([], '병원명')).toEqual([]);
  });
});
