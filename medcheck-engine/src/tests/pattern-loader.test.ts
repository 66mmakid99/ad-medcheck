/**
 * PatternLoader 단위 테스트
 */
import { describe, it, expect } from 'vitest';
import { loadPatternsForPrompt } from '../services/pattern-loader';

describe('PatternLoader', () => {
  const config = loadPatternsForPrompt();

  it('loads patterns from patterns.json', () => {
    expect(config.patterns.length).toBeGreaterThan(100);
  });

  it('each pattern has required fields', () => {
    for (const p of config.patterns.slice(0, 10)) {
      expect(p.id).toBeDefined();
      expect(p.category).toBeDefined();
      expect(p.severity).toBeDefined();
      expect(p.description).toBeDefined();
    }
  });

  it('loads negative list', () => {
    expect(config.negativeList.length).toBeGreaterThan(10);
    expect(config.negativeList).toContain('보톡스');
  });

  it('loads disclaimer rules', () => {
    expect(config.disclaimerRules.length).toBeGreaterThan(0);
    for (const rule of config.disclaimerRules) {
      expect(rule).toBeDefined();
    }
  });

  it('loads department rules', () => {
    expect(config.departmentRules.length).toBeGreaterThan(0);
  });

  it('loads context exceptions', () => {
    expect(config.contextExceptions.length).toBeGreaterThan(0);
  });

  it('loads section weights', () => {
    expect(config.sectionWeights.length).toBeGreaterThan(0);
  });

  it('all severity values are valid', () => {
    const validSeverities = ['critical', 'major', 'minor', 'info'];
    for (const p of config.patterns) {
      expect(validSeverities).toContain(p.severity);
    }
  });

  it('pattern IDs follow P-XX-XX-XXX format', () => {
    const idRegex = /^P-\d{2,3}-\d{2}-\d{3}$/;
    for (const p of config.patterns) {
      expect(p.id).toMatch(idRegex);
    }
  });

  it('has 19 category (꼼수 패턴) patterns', () => {
    const trickPatterns = config.patterns.filter(p => p.id.includes('-19-'));
    expect(trickPatterns.length).toBeGreaterThan(5);
  });
});
