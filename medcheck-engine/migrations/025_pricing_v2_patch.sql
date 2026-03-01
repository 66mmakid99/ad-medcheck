-- ============================================
-- 025: 가격 모듈 v2 누락 스키마 패치
-- target_areas.display_order, mapping_candidates 확장, price_change_alerts 생성
-- ============================================

-- 1. target_areas에 display_order 컬럼 추가
ALTER TABLE target_areas ADD COLUMN display_order INTEGER;

-- 2. target_areas에 avg_shots 컬럼 추가 (없을 경우)
ALTER TABLE target_areas ADD COLUMN avg_shots INTEGER;

-- 3. mapping_candidates 확장 컬럼 추가
ALTER TABLE mapping_candidates ADD COLUMN alias_name TEXT;
ALTER TABLE mapping_candidates ADD COLUMN normalized_name TEXT;
ALTER TABLE mapping_candidates ADD COLUMN total_cases INTEGER DEFAULT 1;
ALTER TABLE mapping_candidates ADD COLUMN unique_hospitals INTEGER DEFAULT 1;
ALTER TABLE mapping_candidates ADD COLUMN hospital_ids TEXT;
ALTER TABLE mapping_candidates ADD COLUMN first_seen_at TEXT;
ALTER TABLE mapping_candidates ADD COLUMN last_seen_at TEXT;
ALTER TABLE mapping_candidates ADD COLUMN price_samples TEXT;
ALTER TABLE mapping_candidates ADD COLUMN price_avg INTEGER;
ALTER TABLE mapping_candidates ADD COLUMN price_min INTEGER;
ALTER TABLE mapping_candidates ADD COLUMN price_max INTEGER;
ALTER TABLE mapping_candidates ADD COLUMN price_stddev REAL;
ALTER TABLE mapping_candidates ADD COLUMN text_similarity REAL;
ALTER TABLE mapping_candidates ADD COLUMN price_similarity REAL;
ALTER TABLE mapping_candidates ADD COLUMN ai_reasoning TEXT;
ALTER TABLE mapping_candidates ADD COLUMN meets_case_threshold INTEGER DEFAULT 0;
ALTER TABLE mapping_candidates ADD COLUMN meets_hospital_threshold INTEGER DEFAULT 0;
ALTER TABLE mapping_candidates ADD COLUMN meets_time_threshold INTEGER DEFAULT 0;
ALTER TABLE mapping_candidates ADD COLUMN meets_price_threshold INTEGER DEFAULT 0;
ALTER TABLE mapping_candidates ADD COLUMN meets_similarity_threshold INTEGER DEFAULT 0;
ALTER TABLE mapping_candidates ADD COLUMN reject_reason TEXT;

-- 4. price_change_alerts 테이블 생성
CREATE TABLE IF NOT EXISTS price_change_alerts (
  id TEXT PRIMARY KEY,
  subscriber_hospital_id TEXT NOT NULL,
  competitor_hospital_id TEXT NOT NULL,
  procedure_id TEXT NOT NULL,
  previous_price INTEGER,
  current_price INTEGER,
  price_change INTEGER,
  price_change_percent REAL,
  target_area_code TEXT,
  target_area_name TEXT,
  previous_shot_count INTEGER,
  current_shot_count INTEGER,
  previous_price_per_shot REAL,
  current_price_per_shot REAL,
  shot_price_change_percent REAL,
  previous_screenshot_id TEXT,
  previous_screenshot_url TEXT,
  current_screenshot_id TEXT,
  current_screenshot_url TEXT,
  source_page_url TEXT,
  ai_analysis TEXT,
  change_reason_guess TEXT,
  subscriber_same_procedure_price INTEGER,
  price_gap INTEGER,
  price_gap_percent REAL,
  alert_type TEXT DEFAULT 'price_drop',
  severity TEXT DEFAULT 'info',
  is_read INTEGER DEFAULT 0,
  read_at TEXT,
  is_archived INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_alerts_subscriber ON price_change_alerts(subscriber_hospital_id);
CREATE INDEX IF NOT EXISTS idx_alerts_competitor ON price_change_alerts(competitor_hospital_id);
CREATE INDEX IF NOT EXISTS idx_alerts_read ON price_change_alerts(is_read);

-- 5. competitor_settings 테이블 생성
CREATE TABLE IF NOT EXISTS competitor_settings (
  id TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL,
  competitor_ids TEXT,
  auto_detect INTEGER DEFAULT 1,
  same_region INTEGER DEFAULT 1,
  same_category INTEGER DEFAULT 1,
  max_competitors INTEGER DEFAULT 10,
  region TEXT,
  category TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 6. price_history 테이블 생성
CREATE TABLE IF NOT EXISTS price_history (
  id TEXT PRIMARY KEY,
  price_record_id TEXT NOT NULL,
  hospital_id TEXT,
  procedure_id TEXT,
  target_area_code TEXT,
  old_price INTEGER,
  new_price INTEGER,
  change_percent REAL,
  change_type TEXT DEFAULT 'update',
  detected_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_price_history_record ON price_history(price_record_id);
