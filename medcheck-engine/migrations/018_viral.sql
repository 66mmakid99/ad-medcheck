-- 018: Viral MedCheck Tables
-- 온라인 마케팅 현황 분석

CREATE TABLE IF NOT EXISTS viral_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hospital_id TEXT NOT NULL,
  total_score REAL NOT NULL DEFAULT 0,
  blog_count INTEGER DEFAULT 0,
  cafe_count INTEGER DEFAULT 0,
  sponsored_ratio REAL DEFAULT 0,
  estimated_ad_spend INTEGER DEFAULT 0,
  sns_channels JSON,
  analyzed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS viral_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hospital_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  title TEXT,
  url TEXT,
  is_sponsored INTEGER DEFAULT 0,
  published_at TEXT,
  detected_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS keyword_ad_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hospital_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  ad_position INTEGER,
  estimated_cpc INTEGER,
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_viral_hospital ON viral_scores(hospital_id);
CREATE INDEX IF NOT EXISTS idx_viral_posts_hospital ON viral_posts(hospital_id);
