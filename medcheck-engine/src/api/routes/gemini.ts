/**
 * Gemini 위반 분석 API 라우트
 */
import { Hono } from 'hono';
import type { AppBindings } from '../../types/env';
import { loadPatternsForPrompt } from '../../services/pattern-loader';
import { buildViolationPrompt, estimateTokenCount } from '../../modules/gemini';
import { callGeminiForViolation } from '../../modules/gemini';
import { GeminiAuditor } from '../../modules/gemini';

export const geminiRoutes = new Hono<AppBindings>();

/**
 * GET /prompt-info
 * 생성된 프롬프트 정보 (토큰 수, 구조)
 */
geminiRoutes.get('/prompt-info', (c) => {
  const config = loadPatternsForPrompt();
  const prompt = buildViolationPrompt(config);
  const tokens = estimateTokenCount(prompt);
  return c.json({
    promptCharCount: prompt.length,
    estimatedTokens: tokens,
    tokenTarget: 30000,
    underTarget: tokens < 30000,
    dictionaries: {
      patterns: config.patterns.length,
      negativeList: config.negativeList.length,
      disclaimerRules: config.disclaimerRules.length,
      departmentRules: config.departmentRules.length,
      contextExceptions: config.contextExceptions.length,
      sectionWeights: config.sectionWeights.length,
    },
  });
});

/**
 * POST /analyze
 * Gemini 위반 분석 직접 호출
 */
geminiRoutes.post('/analyze', async (c) => {
  try {
    const apiKey = c.env.GEMINI_API_KEY;
    if (!apiKey) {
      return c.json({ success: false, error: 'GEMINI_API_KEY not configured' }, 500);
    }

    const rawBuffer = await c.req.arrayBuffer();
    let bodyText = new TextDecoder('utf-8').decode(rawBuffer);
    if (bodyText.includes('\uFFFD')) {
      bodyText = new TextDecoder('euc-kr', { fatal: false }).decode(rawBuffer);
    }
    const body = JSON.parse(bodyText) as { text: string };

    if (!body.text) {
      return c.json({ success: false, error: 'text는 필수입니다' }, 400);
    }

    const config = loadPatternsForPrompt();
    const prompt = buildViolationPrompt(config);
    const startTime = Date.now();
    const result = await callGeminiForViolation(prompt, { text: body.text }, apiKey);
    const elapsed = Date.now() - startTime;

    return c.json({
      success: true,
      elapsed_ms: elapsed,
      prompt_tokens: estimateTokenCount(prompt),
      result,
    });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

/**
 * POST /analyze-full
 * Gemini 분석 + GeminiAuditor 사후 검증 전체 파이프라인
 */
geminiRoutes.post('/analyze-full', async (c) => {
  try {
    const apiKey = c.env.GEMINI_API_KEY;
    if (!apiKey) {
      return c.json({ success: false, error: 'GEMINI_API_KEY not configured' }, 500);
    }

    const rawBuffer = await c.req.arrayBuffer();
    let bodyText = new TextDecoder('utf-8').decode(rawBuffer);
    if (bodyText.includes('\uFFFD')) {
      bodyText = new TextDecoder('euc-kr', { fatal: false }).decode(rawBuffer);
    }
    const body = JSON.parse(bodyText) as { text: string };

    if (!body.text) {
      return c.json({ success: false, error: 'text는 필수입니다' }, 400);
    }

    const config = loadPatternsForPrompt();
    const prompt = buildViolationPrompt(config);
    const startTime = Date.now();

    const geminiResult = await callGeminiForViolation(prompt, { text: body.text }, apiKey);
    const geminiElapsed = Date.now() - startTime;

    const auditor = new GeminiAuditor(config.patterns, config.negativeList, config.disclaimerRules);
    const auditResult = auditor.audit(geminiResult, body.text);
    const totalElapsed = Date.now() - startTime;

    return c.json({
      success: true,
      gemini_elapsed_ms: geminiElapsed,
      total_elapsed_ms: totalElapsed,
      audit: {
        geminiOriginalCount: auditResult.geminiOriginalCount,
        finalCount: auditResult.finalCount,
        auditDelta: auditResult.auditDelta,
        issues: auditResult.auditIssues,
      },
      grade: auditResult.grade,
      violations: auditResult.finalViolations.map(v => ({
        patternId: v.patternId,
        category: v.category,
        severity: v.severity,
        adjustedSeverity: v.adjustedSeverity,
        originalText: v.originalText,
        confidence: v.confidence,
        reasoning: v.reasoning,
        disclaimerPresent: v.disclaimerPresent,
        source: v.source,
      })),
      grayZones: auditResult.grayZones,
      mandatoryItems: auditResult.mandatoryItems,
    });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});
