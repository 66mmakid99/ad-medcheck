-- 022: Gemini 분석 결과 저장 테이블
-- Gemini 파이프라인 분석 결과를 D1에 저장하여 대시보드에서 조회

CREATE TABLE IF NOT EXISTS gemini_analysis_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hospital_name TEXT NOT NULL,
  url TEXT NOT NULL,
  success INTEGER DEFAULT 1,
  crawl_method TEXT,
  text_length INTEGER DEFAULT 0,
  grade TEXT,
  clean_score REAL DEFAULT 0,
  violation_count INTEGER DEFAULT 0,
  gray_zone_count INTEGER DEFAULT 0,
  critical_count INTEGER DEFAULT 0,
  major_count INTEGER DEFAULT 0,
  minor_count INTEGER DEFAULT 0,
  violations_json TEXT,
  gray_zones_json TEXT,
  mandatory_items_json TEXT,
  audit_issues_json TEXT,
  fetch_time_ms INTEGER DEFAULT 0,
  gemini_time_ms INTEGER DEFAULT 0,
  total_time_ms INTEGER DEFAULT 0,
  error_message TEXT,
  batch_id TEXT,
  analyzed_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gemini_results_url ON gemini_analysis_results(url);
CREATE INDEX IF NOT EXISTS idx_gemini_results_grade ON gemini_analysis_results(grade);
CREATE INDEX IF NOT EXISTS idx_gemini_results_analyzed_at ON gemini_analysis_results(analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_gemini_results_batch ON gemini_analysis_results(batch_id);
