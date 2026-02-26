-- 021_gray_zone_cases.sql
-- Phase 7: Gray Zone 사례집 시스템

CREATE TABLE IF NOT EXISTS gray_zone_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- 발견 맥락
  hospital_id TEXT,
  hospital_name TEXT,
  source_url TEXT NOT NULL,
  analysis_id TEXT,
  discovered_at TEXT DEFAULT (datetime('now')),

  -- 우회 기법 분류
  evasion_type TEXT NOT NULL,
  evasion_category TEXT NOT NULL,
  evasion_description TEXT NOT NULL,

  -- 법적 맥락
  target_law TEXT,
  target_violation TEXT,
  why_gray TEXT,

  -- 증거
  evidence_text TEXT,
  evidence_screenshot_r2 TEXT,
  evidence_html_snapshot_r2 TEXT,

  -- 판정
  gemini_confidence REAL,
  admin_verdict TEXT DEFAULT 'pending',
  admin_reasoning TEXT,
  admin_decided_at TEXT,

  -- 활용
  added_to_prompt INTEGER DEFAULT 0,
  added_to_patterns INTEGER DEFAULT 0,
  similar_case_ids TEXT,

  -- 트렌드 추적
  occurrence_count INTEGER DEFAULT 1,
  last_seen_at TEXT,
  trend_quarter TEXT,
  first_seen_quarter TEXT
);

CREATE INDEX IF NOT EXISTS idx_gz_evasion_type ON gray_zone_cases(evasion_type);
CREATE INDEX IF NOT EXISTS idx_gz_category ON gray_zone_cases(evasion_category);
CREATE INDEX IF NOT EXISTS idx_gz_verdict ON gray_zone_cases(admin_verdict);
CREATE INDEX IF NOT EXISTS idx_gz_quarter ON gray_zone_cases(trend_quarter);
CREATE INDEX IF NOT EXISTS idx_gz_prompt ON gray_zone_cases(added_to_prompt);
