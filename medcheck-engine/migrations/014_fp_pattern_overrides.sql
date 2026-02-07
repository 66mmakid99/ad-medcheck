-- 014_fp_pattern_overrides.sql
-- FP 학습 기반 패턴 오버라이드 테이블

CREATE TABLE IF NOT EXISTS fp_pattern_overrides (
  pattern_id TEXT PRIMARY KEY,
  action TEXT NOT NULL DEFAULT 'normal',
  fp_rate REAL DEFAULT 0,
  total_feedback INTEGER DEFAULT 0,
  fp_count INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  confidence_penalty REAL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fp_overrides_action ON fp_pattern_overrides(action);
CREATE INDEX IF NOT EXISTS idx_fp_overrides_fp_rate ON fp_pattern_overrides(fp_rate);
