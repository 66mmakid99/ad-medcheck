/**
 * 모듈 barrel export 테스트
 * 모든 모듈 진입점이 올바르게 re-export하는지 검증
 */
import { describe, it, expect } from 'vitest';

describe('Module barrel exports', () => {
  describe('modules/feedback', () => {
    it('exports PatternTuner', async () => {
      const mod = await import('../modules/feedback');
      expect(mod.PatternTuner).toBeDefined();
      expect(typeof mod.PatternTuner).toBe('function');
    });

    it('exports GrayZoneCollector', async () => {
      const mod = await import('../modules/feedback');
      expect(mod.GrayZoneCollector).toBeDefined();
    });

    it('exports AutoLearner', async () => {
      const mod = await import('../modules/feedback');
      expect(mod.AutoLearner).toBeDefined();
    });

    it('exports PerformanceTracker', async () => {
      const mod = await import('../modules/feedback');
      expect(mod.PerformanceTracker).toBeDefined();
    });
  });

  describe('modules/gemini', () => {
    it('exports callGeminiForViolation', async () => {
      const mod = await import('../modules/gemini');
      expect(mod.callGeminiForViolation).toBeDefined();
      expect(typeof mod.callGeminiForViolation).toBe('function');
    });

    it('exports buildViolationPrompt', async () => {
      const mod = await import('../modules/gemini');
      expect(mod.buildViolationPrompt).toBeDefined();
    });

    it('exports estimateTokenCount', async () => {
      const mod = await import('../modules/gemini');
      expect(mod.estimateTokenCount).toBeDefined();
    });

    it('exports GeminiAuditor', async () => {
      const mod = await import('../modules/gemini');
      expect(mod.GeminiAuditor).toBeDefined();
    });
  });

  describe('modules/pipeline', () => {
    it('exports runAnalysisPipeline', async () => {
      const mod = await import('../modules/pipeline');
      expect(mod.runAnalysisPipeline).toBeDefined();
    });

    it('exports savePipelineResult', async () => {
      const mod = await import('../modules/pipeline');
      expect(mod.savePipelineResult).toBeDefined();
    });

    it('exports runGeminiPipeline', async () => {
      const mod = await import('../modules/pipeline');
      expect(mod.runGeminiPipeline).toBeDefined();
    });
  });

  describe('modules/pricing', () => {
    it('exports extractPricesFromOCR', async () => {
      const mod = await import('../modules/pricing');
      expect(mod.extractPricesFromOCR).toBeDefined();
    });
  });
});
