-- 008_feedback_system.sql
-- 자동 개선 시스템 Phase 1: 피드백 인프라
-- 작성일: 2026-01-31
-- D1 호환: TRIGGER, VIEW, FOREIGN KEY 사용 안함

-- ============================================
-- 1. 확장된 분석 피드백 테이블
-- ============================================

CREATE TABLE IF NOT EXISTS analysis_feedback_v2 (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  violation_id TEXT,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('true_positive', 'false_positive', 'false_negative', 'severity_adjust')),
  pattern_id TEXT,
  original_severity TEXT,
  corrected_severity TEXT,
  context_text TEXT,
  context_type TEXT CHECK (context_type IS NULL OR context_type IN ('negation', 'question', 'quotation', 'disclaimer', 'comparison', 'normal')),
  hospital_department TEXT,
  missed_text TEXT,
  suggested_pattern TEXT,
  user_note TEXT,
  submitted_by TEXT,
  reviewed_by TEXT,
  review_status TEXT DEFAULT 'pending' CHECK (review_status IN ('pending', 'reviewed', 'applied', 'rejected')),
  reviewed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_afv2_analysis ON analysis_feedback_v2(analysis_id);
CREATE INDEX IF NOT EXISTS idx_afv2_pattern ON analysis_feedback_v2(pattern_id);
CREATE INDEX IF NOT EXISTS idx_afv2_type ON analysis_feedback_v2(feedback_type);
CREATE INDEX IF NOT EXISTS idx_afv2_status ON analysis_feedback_v2(review_status);
CREATE INDEX IF NOT EXISTS idx_afv2_context ON analysis_feedback_v2(context_type);
CREATE INDEX IF NOT EXISTS idx_afv2_department ON analysis_feedback_v2(hospital_department);
CREATE INDEX IF NOT EXISTS idx_afv2_created ON analysis_feedback_v2(created_at DESC);

-- ============================================
-- 2. 패턴별 성능 집계 테이블
-- ============================================

CREATE TABLE IF NOT EXISTS pattern_performance (
  id TEXT PRIMARY KEY,
  pattern_id TEXT NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'all_time')),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  total_matches INTEGER DEFAULT 0,
  true_positives INTEGER DEFAULT 0,
  false_positives INTEGER DEFAULT 0,
  false_negatives INTEGER DEFAULT 0,
  accuracy REAL,
  precision_score REAL,
  recall_score REAL,
  f1_score REAL,
  is_flagged INTEGER DEFAULT 0,
  flag_reason TEXT,
  last_calculated TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(pattern_id, period_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_pp_pattern ON pattern_performance(pattern_id);
CREATE INDEX IF NOT EXISTS idx_pp_period ON pattern_performance(period_type, period_start);
CREATE INDEX IF NOT EXISTS idx_pp_flagged ON pattern_performance(is_flagged);
CREATE INDEX IF NOT EXISTS idx_pp_accuracy ON pattern_performance(accuracy);

-- ============================================
-- 3. 맥락별 성능 테이블
-- ============================================

CREATE TABLE IF NOT EXISTS context_performance (
  id TEXT PRIMARY KEY,
  pattern_id TEXT NOT NULL,
  context_type TEXT NOT NULL CHECK (context_type IN ('negation', 'question', 'quotation', 'disclaimer', 'comparison', 'normal')),
  total_matches INTEGER DEFAULT 0,
  true_positives INTEGER DEFAULT 0,
  false_positives INTEGER DEFAULT 0,
  accuracy REAL,
  confidence_modifier REAL DEFAULT 1.0,
  sample_texts TEXT,
  last_calculated TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(pattern_id, context_type)
);

CREATE INDEX IF NOT EXISTS idx_cp_pattern ON context_performance(pattern_id);
CREATE INDEX IF NOT EXISTS idx_cp_context ON context_performance(context_type);
CREATE INDEX IF NOT EXISTS idx_cp_accuracy ON context_performance(accuracy);

-- ============================================
-- 4. 진료과목별 성능 테이블
-- ============================================

CREATE TABLE IF NOT EXISTS department_performance (
  id TEXT PRIMARY KEY,
  pattern_id TEXT NOT NULL,
  department_code TEXT NOT NULL,
  department_name TEXT,
  total_matches INTEGER DEFAULT 0,
  true_positives INTEGER DEFAULT 0,
  false_positives INTEGER DEFAULT 0,
  accuracy REAL,
  confidence_modifier REAL DEFAULT 1.0,
  last_calculated TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(pattern_id, department_code)
);

CREATE INDEX IF NOT EXISTS idx_dp_pattern ON department_performance(pattern_id);
CREATE INDEX IF NOT EXISTS idx_dp_department ON department_performance(department_code);
CREATE INDEX IF NOT EXISTS idx_dp_accuracy ON department_performance(accuracy);

-- ============================================
-- 5. 가격 추출 피드백 테이블
-- ============================================

CREATE TABLE IF NOT EXISTS price_extraction_feedback (
  id TEXT PRIMARY KEY,
  extracted_price_id INTEGER NOT NULL,
  ocr_result_id INTEGER,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('correct', 'wrong_price', 'wrong_procedure', 'wrong_mapping', 'wrong_unit', 'missing_info')),
  original_price INTEGER,
  corrected_price INTEGER,
  original_procedure TEXT,
  corrected_procedure TEXT,
  corrected_procedure_id TEXT,
  original_mapping_id TEXT,
  corrected_mapping_id TEXT,
  field_corrections TEXT,
  user_note TEXT,
  submitted_by TEXT,
  reviewed_by TEXT,
  review_status TEXT DEFAULT 'pending' CHECK (review_status IN ('pending', 'reviewed', 'applied', 'rejected')),
  reviewed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pef_price ON price_extraction_feedback(extracted_price_id);
CREATE INDEX IF NOT EXISTS idx_pef_ocr ON price_extraction_feedback(ocr_result_id);
CREATE INDEX IF NOT EXISTS idx_pef_type ON price_extraction_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_pef_status ON price_extraction_feedback(review_status);
CREATE INDEX IF NOT EXISTS idx_pef_created ON price_extraction_feedback(created_at DESC);

-- ============================================
-- 6. 자동 학습 로그 테이블
-- ============================================

CREATE TABLE IF NOT EXISTS auto_learning_log (
  id TEXT PRIMARY KEY,
  learning_type TEXT NOT NULL CHECK (learning_type IN ('exception_generated', 'confidence_adjusted', 'pattern_suggested', 'mapping_learned', 'severity_adjusted', 'context_modifier_updated')),
  target_type TEXT NOT NULL CHECK (target_type IN ('pattern', 'mapping', 'exception', 'procedure')),
  target_id TEXT NOT NULL,
  input_data TEXT,
  output_data TEXT,
  confidence_score REAL,
  source_feedback_count INTEGER DEFAULT 0,
  source_feedback_ids TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'auto_applied', 'expired')),
  auto_apply_eligible INTEGER DEFAULT 0,
  auto_apply_reason TEXT,
  applied_at TEXT,
  applied_by TEXT,
  rejected_reason TEXT,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_all_type ON auto_learning_log(learning_type);
CREATE INDEX IF NOT EXISTS idx_all_target ON auto_learning_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_all_status ON auto_learning_log(status);
CREATE INDEX IF NOT EXISTS idx_all_confidence ON auto_learning_log(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_all_created ON auto_learning_log(created_at DESC);

-- ============================================
-- 7. 예외 규칙 후보 테이블
-- ============================================

CREATE TABLE IF NOT EXISTS exception_candidates (
  id TEXT PRIMARY KEY,
  pattern_id TEXT NOT NULL,
  exception_type TEXT NOT NULL CHECK (exception_type IN ('keyword', 'context', 'regex', 'department', 'composite')),
  exception_pattern TEXT NOT NULL,
  exception_description TEXT,
  source_type TEXT DEFAULT 'auto' CHECK (source_type IN ('auto', 'manual', 'suggested')),
  source_feedback_ids TEXT,
  sample_texts TEXT,
  occurrence_count INTEGER DEFAULT 1,
  unique_sources INTEGER DEFAULT 1,
  confidence REAL DEFAULT 0.5,
  meets_threshold INTEGER DEFAULT 0,
  threshold_met_at TEXT,
  status TEXT DEFAULT 'collecting' CHECK (status IN ('collecting', 'pending_review', 'approved', 'rejected', 'merged')),
  approved_by TEXT,
  approved_at TEXT,
  rejection_reason TEXT,
  merged_into_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ec_pattern ON exception_candidates(pattern_id);
CREATE INDEX IF NOT EXISTS idx_ec_type ON exception_candidates(exception_type);
CREATE INDEX IF NOT EXISTS idx_ec_status ON exception_candidates(status);
CREATE INDEX IF NOT EXISTS idx_ec_confidence ON exception_candidates(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_ec_occurrence ON exception_candidates(occurrence_count DESC);
CREATE INDEX IF NOT EXISTS idx_ec_created ON exception_candidates(created_at DESC);

-- ============================================
-- 8. 매핑 학습 데이터 테이블
-- ============================================

CREATE TABLE IF NOT EXISTS mapping_learning_data (
  id TEXT PRIMARY KEY,
  raw_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  mapped_procedure_id TEXT,
  mapped_procedure_name TEXT,
  learning_source TEXT CHECK (learning_source IS NULL OR learning_source IN ('approval', 'feedback', 'bulk_import')),
  source_mapping_id TEXT,
  pattern_type TEXT CHECK (pattern_type IS NULL OR pattern_type IN ('exact', 'suffix', 'prefix', 'contains', 'regex', 'synonym')),
  learned_pattern TEXT,
  confidence REAL DEFAULT 1.0,
  application_count INTEGER DEFAULT 0,
  last_applied_at TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mld_raw ON mapping_learning_data(raw_name);
CREATE INDEX IF NOT EXISTS idx_mld_normalized ON mapping_learning_data(normalized_name);
CREATE INDEX IF NOT EXISTS idx_mld_procedure ON mapping_learning_data(mapped_procedure_id);
CREATE INDEX IF NOT EXISTS idx_mld_pattern ON mapping_learning_data(pattern_type);
CREATE INDEX IF NOT EXISTS idx_mld_active ON mapping_learning_data(is_active);

-- ============================================
-- 9. 피드백 설정 테이블
-- ============================================

CREATE TABLE IF NOT EXISTS feedback_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  setting_type TEXT CHECK (setting_type IS NULL OR setting_type IN ('number', 'string', 'boolean', 'json')),
  description TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO feedback_settings (setting_key, setting_value, setting_type, description) VALUES ('accuracy_threshold', '0.8', 'number', '패턴 정확도 경고 임계값');
INSERT OR IGNORE INTO feedback_settings (setting_key, setting_value, setting_type, description) VALUES ('exception_min_occurrences', '5', 'number', '예외 규칙 생성 최소 발생 횟수');
INSERT OR IGNORE INTO feedback_settings (setting_key, setting_value, setting_type, description) VALUES ('exception_min_confidence', '0.85', 'number', '예외 규칙 자동 적용 최소 신뢰도');
INSERT OR IGNORE INTO feedback_settings (setting_key, setting_value, setting_type, description) VALUES ('auto_apply_confidence', '0.95', 'number', '자동 적용 최소 신뢰도');
INSERT OR IGNORE INTO feedback_settings (setting_key, setting_value, setting_type, description) VALUES ('context_modifier_min_samples', '10', 'number', '맥락 신뢰도 조정 최소 샘플 수');
INSERT OR IGNORE INTO feedback_settings (setting_key, setting_value, setting_type, description) VALUES ('performance_aggregation_days', '30', 'number', '성능 집계 기본 기간 (일)');
INSERT OR IGNORE INTO feedback_settings (setting_key, setting_value, setting_type, description) VALUES ('flag_review_period_days', '7', 'number', '플래그된 패턴 검토 기간');
INSERT OR IGNORE INTO feedback_settings (setting_key, setting_value, setting_type, description) VALUES ('learning_expiry_days', '90', 'number', '학습 후보 만료 기간');
