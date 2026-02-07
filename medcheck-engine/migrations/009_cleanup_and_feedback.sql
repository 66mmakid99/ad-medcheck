-- 009_cleanup_and_feedback.sql
-- P1 보안 감사 조치: 누락 테이블 추가 + D1 금지 문법 정리
-- 작성일: 2026-02-07
-- D1 호환: TRIGGER, VIEW, FOREIGN KEY 사용 안함

-- ============================================
-- 1. 누락된 feedback 테이블 추가
-- (feedback.ts에서 사용하지만 스키마 미정의였음)
-- ============================================

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('false_positive', 'false_negative', 'severity_adjust', 'general')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'applied', 'rejected')),
  comment TEXT,
  pattern_id TEXT,
  missed_text TEXT,
  submitted_by TEXT,
  reviewed_by TEXT,
  review_comment TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_analysis ON feedback(analysis_id);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_pattern ON feedback(pattern_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);

-- ============================================
-- 2. D1 금지 문법 정리 (이전 마이그레이션에서 실패했을 수 있는 항목)
-- TRIGGER/VIEW는 D1에서 미지원이므로 DROP 시도 (이미 없을 수 있음)
-- ============================================

-- 006에서 생성 시도된 트리거 (D1에서는 생성 안 됐을 것)
DROP TRIGGER IF EXISTS trigger_crawl_sessions_updated;
DROP TRIGGER IF EXISTS trigger_collected_hospitals_after_insert;

-- 007에서 생성 시도된 트리거/뷰
DROP TRIGGER IF EXISTS trigger_extracted_prices_updated;
DROP VIEW IF EXISTS v_hospital_extracted_prices;
DROP VIEW IF EXISTS v_procedure_price_comparison;
