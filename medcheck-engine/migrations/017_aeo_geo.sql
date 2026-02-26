-- 017: AEO/GEO Analysis Tables
-- AG MedCheck - AI 검색 노출 경쟁력 분석

CREATE TABLE IF NOT EXISTS aeo_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hospital_id TEXT NOT NULL,
  total_score REAL NOT NULL DEFAULT 0,
  content_score REAL NOT NULL DEFAULT 0,
  technical_score REAL NOT NULL DEFAULT 0,
  trust_score REAL NOT NULL DEFAULT 0,
  local_score REAL NOT NULL DEFAULT 0,
  ai_friendly_score REAL NOT NULL DEFAULT 0,
  details JSON,
  analyzed_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS aeo_detail_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  score_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_score REAL NOT NULL DEFAULT 0,
  max_score REAL NOT NULL,
  evidence TEXT,
  recommendation TEXT
);

CREATE TABLE IF NOT EXISTS ai_query_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query_text TEXT NOT NULL,
  ai_engine TEXT NOT NULL,
  recommended_hospitals JSON,
  raw_response TEXT,
  queried_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_aeo_hospital ON aeo_scores(hospital_id);
CREATE INDEX IF NOT EXISTS idx_aeo_date ON aeo_scores(analyzed_at);
CREATE INDEX IF NOT EXISTS idx_ai_query_engine ON ai_query_results(ai_engine);
