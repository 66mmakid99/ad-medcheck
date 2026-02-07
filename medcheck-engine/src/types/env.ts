import type { D1Database } from '../db/d1';

export type Env = {
  DB: D1Database;
  ENVIRONMENT: string;
  ENGINE_VERSION: string;
  PATTERN_VERSION: string;
  LOG_LEVEL: string;
};

export type AppBindings = { Bindings: Env };
