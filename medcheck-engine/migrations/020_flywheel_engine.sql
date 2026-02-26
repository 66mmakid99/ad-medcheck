-- 020_flywheel_engine.sql
-- Phase 6: Flywheel 자동 고도화 엔진

-- 신규 패턴 후보 (Gemini가 발견, 규칙엔진에 없는 것)
CREATE TABLE IF NOT EXISTS pattern_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  suggested_pattern TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  source TEXT NOT NULL,
  example_texts TEXT NOT NULL,
  example_hospitals TEXT,
  occurrence_count INTEGER DEFAULT 1,
  avg_confidence REAL,
  status TEXT DEFAULT 'pending',
  approved_at TEXT,
  approved_pattern_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 패턴 성능 추적
CREATE TABLE IF NOT EXISTS flywheel_pattern_performance (
  pattern_id TEXT PRIMARY KEY,
  total_matches INTEGER DEFAULT 0,
  true_positives INTEGER DEFAULT 0,
  false_positives INTEGER DEFAULT 0,
  precision REAL,
  confidence_adjustment REAL DEFAULT 0,
  last_fp_at TEXT,
  last_tp_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 네거티브 리스트 후보
CREATE TABLE IF NOT EXISTS negative_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term TEXT NOT NULL,
  category TEXT,
  source TEXT NOT NULL,
  fp_count INTEGER DEFAULT 1,
  example_contexts TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);

-- 분석 결과 아카이브 (학습 데이터 원본)
CREATE TABLE IF NOT EXISTS analysis_archive (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hospital_id TEXT,
  hospital_name TEXT,
  analysis_id TEXT NOT NULL,
  source TEXT NOT NULL,
  pattern_id TEXT,
  matched_text TEXT NOT NULL,
  context_text TEXT,
  section_type TEXT,
  severity TEXT,
  confidence REAL,
  from_image INTEGER DEFAULT 0,
  gemini_found INTEGER DEFAULT 0,
  rule_found INTEGER DEFAULT 0,
  user_verdict TEXT,
  image_r2_key TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- MADMEDSALES 동기화 (동적 네거티브)
CREATE TABLE IF NOT EXISTS madmedsales_sync (
  hospital_id TEXT NOT NULL,
  data_type TEXT NOT NULL,
  term TEXT NOT NULL,
  confirmed INTEGER DEFAULT 1,
  synced_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (hospital_id, data_type, term)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_archive_pattern ON analysis_archive(pattern_id);
CREATE INDEX IF NOT EXISTS idx_archive_hospital ON analysis_archive(hospital_id);
CREATE INDEX IF NOT EXISTS idx_archive_verdict ON analysis_archive(user_verdict);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON pattern_candidates(status);
CREATE INDEX IF NOT EXISTS idx_negative_status ON negative_candidates(status);
