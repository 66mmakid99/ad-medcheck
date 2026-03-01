-- 024_rule_first_pipeline.sql
-- Rule-First 파이프라인 지원을 위한 스키마 확장

-- analysis_archive에 판정/신뢰도/출처 컬럼 추가
ALTER TABLE analysis_archive ADD COLUMN determination TEXT;
ALTER TABLE analysis_archive ADD COLUMN composite_confidence REAL;
ALTER TABLE analysis_archive ADD COLUMN detection_source TEXT;
ALTER TABLE analysis_archive ADD COLUMN updated_at TEXT;

-- HITL 큐 조회용 인덱스 (낮은 confidence + 미결 verdict)
CREATE INDEX IF NOT EXISTS idx_archive_hitl_queue
  ON analysis_archive(composite_confidence, user_verdict)
  WHERE composite_confidence IS NOT NULL;

-- determination별 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_archive_determination
  ON analysis_archive(determination);

-- feedback_settings에 Rule-First 설정 추가
INSERT OR IGNORE INTO feedback_settings (setting_key, setting_value, setting_type, description)
  VALUES ('hitl_confidence_threshold', '0.5', 'number', 'HITL 큐 진입 기준 복합 신뢰도');
INSERT OR IGNORE INTO feedback_settings (setting_key, setting_value, setting_type, description)
  VALUES ('rule_first_enabled', '1', 'boolean', 'Rule-First 파이프라인 활성화 여부');
