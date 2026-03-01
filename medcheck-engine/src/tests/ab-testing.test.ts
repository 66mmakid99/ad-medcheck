/**
 * A/B 테스트 프레임워크 단위 테스트
 */
import { describe, it, expect } from 'vitest';
import { ABTestingService } from '../services/ab-testing';

// Mock D1 database
function createMockDB() {
  const store: Record<string, any[]> = {
    ab_tests: [],
    ab_test_results: [],
  };

  return {
    prepare: (sql: string) => ({
      bind: (...args: any[]) => ({
        run: async () => {
          // INSERT simulation
          if (sql.includes('INSERT INTO ab_tests')) {
            store.ab_tests.push({
              id: args[0], name: args[1], description: args[2],
              target_type: args[3], target_id: args[4],
              control_value: args[5], treatment_value: args[6],
              traffic_percent: args[7], start_date: args[8],
              end_date: args[9], min_sample_size: args[10],
              significance_level: args[11], status: 'draft',
            });
          }
          if (sql.includes('INSERT INTO ab_test_results')) {
            store.ab_test_results.push({
              id: args[0], test_id: args[1], group_name: args[2],
              is_correct: args[3], is_false_positive: args[4],
              is_false_negative: args[5],
            });
          }
          if (sql.includes('UPDATE ab_tests SET status')) {
            const test = store.ab_tests.find(t => t.id === args[0]);
            if (test) test.status = 'running';
          }
          return { success: true };
        },
        first: async () => {
          if (sql.includes('SELECT traffic_percent')) {
            const test = store.ab_tests.find(t => t.id === args[0]);
            return test ? { traffic_percent: test.traffic_percent } : null;
          }
          if (sql.includes('SELECT min_sample_size')) {
            const test = store.ab_tests.find(t => t.id === args[0]);
            return test || null;
          }
          if (sql.includes('FROM ab_test_results')) {
            const group = args[1] || (sql.includes("'control'") ? 'control' : 'treatment');
            const results = store.ab_test_results.filter(
              r => r.test_id === args[0] && r.group_name === group
            );
            if (results.length === 0) return { samples: 0, accuracy: 0, fp_rate: 0, fn_rate: 0 };
            return {
              samples: results.length,
              accuracy: results.reduce((a, r) => a + r.is_correct, 0) / results.length,
              fp_rate: results.reduce((a, r) => a + r.is_false_positive, 0) / results.length,
              fn_rate: results.reduce((a, r) => a + r.is_false_negative, 0) / results.length,
            };
          }
          return null;
        },
        all: async () => ({ results: store.ab_tests }),
      }),
    }),
    _store: store,
  };
}

describe('ABTestingService', () => {
  it('creates a test with draft status', async () => {
    const db = createMockDB();
    const service = new ABTestingService(db);

    const id = await service.createTest({
      name: 'Test confidence adjustment',
      description: 'Testing P-56-01-001 confidence change',
      targetType: 'pattern_confidence',
      targetId: 'P-56-01-001',
      controlValue: '0.7',
      treatmentValue: '0.85',
      trafficPercent: 50,
      startDate: '2026-03-01',
      endDate: null,
      minSampleSize: 100,
      significanceLevel: 0.05,
    });

    expect(id).toMatch(/^ab-/);
    expect(db._store.ab_tests).toHaveLength(1);
    expect(db._store.ab_tests[0].status).toBe('draft');
  });

  it('assigns control/treatment groups based on traffic percent', async () => {
    const db = createMockDB();
    const service = new ABTestingService(db);

    const id = await service.createTest({
      name: 'Test',
      description: '',
      targetType: 'pattern_confidence',
      targetId: 'P-56-01-001',
      controlValue: '0.7',
      treatmentValue: '0.85',
      trafficPercent: 50,
      startDate: '2026-03-01',
      endDate: null,
      minSampleSize: 100,
      significanceLevel: 0.05,
    });

    db._store.ab_tests[0].status = 'running';

    // Run 100 assignments and check distribution
    let treatment = 0;
    for (let i = 0; i < 100; i++) {
      const group = await service.assignGroup(id);
      if (group === 'treatment') treatment++;
    }

    // Should be roughly 50/50 (between 25 and 75 with high probability)
    expect(treatment).toBeGreaterThan(20);
    expect(treatment).toBeLessThan(80);
  });

  it('returns control for non-running test', async () => {
    const db = createMockDB();
    const service = new ABTestingService(db);
    const group = await service.assignGroup('nonexistent');
    expect(group).toBe('control');
  });
});
