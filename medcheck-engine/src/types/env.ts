/**
 * MedCheck Engine 환경 바인딩 타입
 * 
 * [수정] GEMINI_API_KEY, CLAUDE_API_KEY를 Env에 추가
 * Cloudflare Dashboard > Workers > Settings > Variables에서 Secret으로 설정
 */
import type { D1Database } from '../db/d1';

export type Env = {
  DB: D1Database;
  ENVIRONMENT: string;
  ENGINE_VERSION: string;
  PATTERN_VERSION: string;
  LOG_LEVEL: string;
  /** Gemini API Key (wrangler secret put GEMINI_API_KEY) */
  GEMINI_API_KEY?: string;
  /** Claude API Key (선택) */
  CLAUDE_API_KEY?: string;
};

export type AppBindings = { Bindings: Env };
