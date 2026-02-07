-- ============================================
-- Migration 012: OCR Feedback
-- OCR 분석 결과에 대한 사람의 판정 피드백 저장
-- D1 호환: TRIGGER, VIEW, FOREIGN KEY 사용 안함
-- ============================================

CREATE TABLE IF NOT EXISTS ocr_feedback (
  id TEXT PRIMARY KEY,
  ocr_result_id TEXT NOT NULL,
  violation_index INTEGER NOT NULL,
  pattern_id TEXT,
  matched_text TEXT,
  category TEXT,
  analysis_mode TEXT,
  human_judgment TEXT NOT NULL CHECK (human_judgment IN ('correct', 'false_positive', 'missed')),
  comment TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ocr_feedback_unique ON ocr_feedback(ocr_result_id, violation_index);
CREATE INDEX IF NOT EXISTS idx_ocr_feedback_result ON ocr_feedback(ocr_result_id);
CREATE INDEX IF NOT EXISTS idx_ocr_feedback_judgment ON ocr_feedback(human_judgment);
CREATE INDEX IF NOT EXISTS idx_ocr_feedback_pattern ON ocr_feedback(pattern_id);
CREATE INDEX IF NOT EXISTS idx_ocr_feedback_mode ON ocr_feedback(analysis_mode);
CREATE INDEX IF NOT EXISTS idx_ocr_feedback_created ON ocr_feedback(created_at DESC);
