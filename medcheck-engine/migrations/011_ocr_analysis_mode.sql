-- ============================================
-- Migration 011: OCR Hybrid Analysis Mode
-- AI Hybrid 분석 모드 지원 컬럼 추가
-- ============================================

ALTER TABLE ocr_results ADD COLUMN analysis_mode TEXT DEFAULT 'regex';
ALTER TABLE ocr_results ADD COLUMN hybrid_verifications_json TEXT;
ALTER TABLE ocr_results ADD COLUMN false_positive_candidates_json TEXT;
ALTER TABLE ocr_results ADD COLUMN ai_processing_time_ms INTEGER DEFAULT 0;
