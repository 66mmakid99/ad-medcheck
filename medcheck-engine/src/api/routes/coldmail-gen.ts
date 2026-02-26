/**
 * Cold Mail Generation API
 * 병원 분석 결과 기반 개인화 메일 생성
 */

import { Hono } from 'hono';
import type { D1Database } from '../../db/d1';

interface Env {
  DB: D1Database;
}

const coldmailGenRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /v1/coldmail/generate
 * 분석 결과 기반 콜드메일 생성
 */
coldmailGenRoutes.post('/generate', async (c) => {
  const body = await c.req.json<{
    hospitalId: string;
    hospitalName?: string;
    hospitalEmail?: string;
    template?: 'ad' | 'aeo' | 'viral' | 'combined';
  }>();

  const { hospitalId, hospitalName, template = 'combined' } = body;

  if (!hospitalId) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'hospitalId는 필수입니다.' },
    }, 400);
  }

  try {
    // 분석 결과 조회
    const adResult = await c.env.DB.prepare(`
      SELECT grade, violation_count FROM hospital_analysis_results
      WHERE hospital_id = ? AND status = 'success'
      ORDER BY analyzed_at DESC LIMIT 1
    `).bind(hospitalId).first();

    const aeoResult = await c.env.DB.prepare(`
      SELECT total_score FROM aeo_scores
      WHERE hospital_id = ? ORDER BY analyzed_at DESC LIMIT 1
    `).bind(hospitalId).first();

    const viralResult = await c.env.DB.prepare(`
      SELECT total_score, blog_count, estimated_ad_spend FROM viral_scores
      WHERE hospital_id = ? ORDER BY analyzed_at DESC LIMIT 1
    `).bind(hospitalId).first();

    const name = hospitalName || hospitalId;

    // 메일 생성
    const subject = generateSubject(name, adResult, aeoResult, viralResult, template);
    const htmlBody = generateHtmlBody(name, hospitalId, adResult, aeoResult, viralResult, template);
    const textBody = generateTextBody(name, hospitalId, adResult, aeoResult, viralResult, template);

    return c.json({
      success: true,
      data: {
        hospitalId,
        hospitalName: name,
        template,
        subject,
        htmlBody,
        textBody,
        hasAdData: !!adResult,
        hasAeoData: !!aeoResult,
        hasViralData: !!viralResult,
      },
    });
  } catch (error) {
    const err = error as Error;
    return c.json({
      success: false,
      error: { code: 'GENERATE_ERROR', message: err.message },
    }, 500);
  }
});

// ─── Mail Template Generation ───

function generateSubject(
  name: string,
  ad: any, aeo: any, viral: any,
  template: string,
): string {
  if (template === 'ad' && ad) {
    return `[MADMEDCHECK] ${name} 의료광고 무료 분석 결과 - ${ad.grade}등급`;
  }
  if (template === 'aeo' && aeo) {
    return `[MADMEDCHECK] ${name} AI 검색 노출 경쟁력 ${aeo.total_score}점 - 무료 개선 가이드`;
  }
  if (template === 'viral' && viral) {
    return `[MADMEDCHECK] ${name} 온라인 마케팅 현황 분석 - 월 추정 ${formatWon(viral.estimated_ad_spend)}`;
  }
  // combined
  const highlights = [];
  if (ad) highlights.push(`광고 ${ad.grade}등급`);
  if (aeo) highlights.push(`AI검색 ${aeo.total_score}점`);
  return `[MADMEDCHECK] ${name} 무료 진단 리포트 (${highlights.join(', ')})`;
}

function generateHtmlBody(
  name: string, hospitalId: string,
  ad: any, aeo: any, viral: any,
  template: string,
): string {
  const reportUrl = `https://medcheck-engine.mmakid.workers.dev/v1/report/combined-preview/${encodeURIComponent(hospitalId)}`;

  let body = `
<div style="font-family: 'Noto Sans KR', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 16px 16px 0 0; color: white;">
    <h1 style="margin: 0; font-size: 24px;">🛡️ MADMEDCHECK</h1>
    <p style="margin: 5px 0 0; opacity: 0.9;">의료광고 컴플라이언스 자동 분석 서비스</p>
  </div>

  <div style="background: white; padding: 30px; border: 1px solid #e2e8f0; border-top: none;">
    <h2 style="color: #1a2744; margin-top: 0;">${name} 원장님 안녕하세요,</h2>
    <p style="color: #64748b; line-height: 1.8;">MADMEDCHECK에서 <strong>${name}</strong>의 온라인 현황을 무료로 분석해 드렸습니다.</p>
`;

  if (ad) {
    body += `
    <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin: 20px 0; border-left: 4px solid #6366f1;">
      <h3 style="margin: 0 0 10px; color: #6366f1;">📋 광고 컴플라이언스</h3>
      <p style="margin: 0; font-size: 28px; font-weight: bold; color: #1a2744;">${ad.grade}등급 <span style="font-size: 14px; color: #94a3b8;">/ 위반 ${ad.violation_count}건</span></p>
    </div>`;
  }

  if (aeo) {
    body += `
    <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin: 20px 0; border-left: 4px solid #06b6d4;">
      <h3 style="margin: 0 0 10px; color: #06b6d4;">🤖 AI 검색 경쟁력</h3>
      <p style="margin: 0; font-size: 28px; font-weight: bold; color: #1a2744;">${aeo.total_score}점 <span style="font-size: 14px; color: #94a3b8;">/ 100점 만점</span></p>
    </div>`;
  }

  if (viral) {
    body += `
    <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin: 20px 0; border-left: 4px solid #ec4899;">
      <h3 style="margin: 0 0 10px; color: #ec4899;">📣 마케팅 현황</h3>
      <p style="margin: 0; font-size: 28px; font-weight: bold; color: #1a2744;">${viral.total_score}점 <span style="font-size: 14px; color: #94a3b8;">/ 블로그 ${viral.blog_count}건</span></p>
    </div>`;
  }

  body += `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${reportUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 14px 40px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 16px;">
        무료 상세 리포트 보기 →
      </a>
    </div>

    <p style="color: #94a3b8; font-size: 12px; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
      이 메일은 MADMEDCHECK에서 발송했습니다. 수신을 원하지 않으시면 답장으로 알려주세요.
    </p>
  </div>
</div>`;

  return body;
}

function generateTextBody(
  name: string, hospitalId: string,
  ad: any, aeo: any, viral: any,
  template: string,
): string {
  let text = `${name} 원장님 안녕하세요,\n\nMADMEDCHECK에서 ${name}의 온라인 현황을 무료로 분석해 드렸습니다.\n\n`;

  if (ad) text += `[광고 컴플라이언스] ${ad.grade}등급 / 위반 ${ad.violation_count}건\n`;
  if (aeo) text += `[AI 검색 경쟁력] ${aeo.total_score}점 / 100점\n`;
  if (viral) text += `[마케팅 현황] ${viral.total_score}점 / 블로그 ${viral.blog_count}건\n`;

  text += `\n상세 리포트: https://medcheck-engine.mmakid.workers.dev/v1/report/combined-preview/${encodeURIComponent(hospitalId)}\n`;
  text += `\n이 메일은 MADMEDCHECK에서 발송했습니다.\n`;

  return text;
}

function formatWon(amount: number): string {
  if (!amount) return '0원';
  if (amount >= 10000) return `${Math.round(amount / 10000)}만원`;
  return `${amount.toLocaleString()}원`;
}

export { coldmailGenRoutes };
