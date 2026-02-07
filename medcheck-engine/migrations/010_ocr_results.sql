-- ============================================
-- Migration 010: OCR Pipeline Results
-- OCR + 패턴 매칭 파이프라인 결과 저장 테이블
-- ============================================

CREATE TABLE IF NOT EXISTS ocr_results (
  id TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  extracted_text TEXT,
  ocr_confidence REAL DEFAULT 0,
  gemini_model TEXT DEFAULT 'gemini-2.0-flash',
  violation_count INTEGER DEFAULT 0,
  violations_json TEXT,
  score_json TEXT,
  grade TEXT,
  total_score REAL DEFAULT 0,
  compound_violations_json TEXT,
  department_violations_json TEXT,
  options_json TEXT,
  processing_time_ms INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ocr_results_grade ON ocr_results(grade);
CREATE INDEX IF NOT EXISTS idx_ocr_results_created ON ocr_results(created_at);
CREATE INDEX IF NOT EXISTS idx_ocr_results_violation_count ON ocr_results(violation_count);
