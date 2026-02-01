-- ================================================================
-- MADMEDCHECK 가격 DB - Phase 3
-- price_alerts - 수정본 v2
-- ================================================================

-- 기존 뷰/테이블 삭제 (충돌 방지)
DROP VIEW IF EXISTS v_active_alerts;
DROP VIEW IF EXISTS v_recent_alert_logs;
DROP VIEW IF EXISTS v_alert_matches;
DROP TABLE IF EXISTS price_alert_logs;
DROP TABLE IF EXISTS price_alerts;

-- 1. 알림 구독 테이블
CREATE TABLE price_alerts (
  id TEXT PRIMARY KEY,
  
  user_id TEXT,
  user_email TEXT,
  user_phone TEXT,
  webhook_url TEXT,
  
  procedure_id TEXT,
  procedure_name TEXT,
  hospital_id TEXT,
  hospital_name TEXT,
  sigungu TEXT,
  
  alert_type TEXT NOT NULL,
  
  threshold_price INTEGER,
  threshold_price_per_unit REAL,
  threshold_percent REAL,
  unit_id TEXT,
  
  alert_channel TEXT DEFAULT 'email',
  frequency TEXT DEFAULT 'realtime',
  is_active INTEGER DEFAULT 1,
  
  alert_count INTEGER DEFAULT 0,
  last_alert_at TEXT,
  
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 2. 알림 발송 이력 테이블
CREATE TABLE price_alert_logs (
  id TEXT PRIMARY KEY,
  
  alert_id TEXT NOT NULL,
  
  trigger_type TEXT NOT NULL,
  trigger_price_id TEXT,
  
  hospital_name TEXT,
  procedure_name TEXT,
  sigungu TEXT,
  
  old_price INTEGER,
  new_price INTEGER,
  old_price_per_unit REAL,
  new_price_per_unit REAL,
  change_amount INTEGER,
  change_percent REAL,
  
  channel TEXT,
  recipient TEXT,
  
  status TEXT DEFAULT 'pending',
  sent_at TEXT,
  error_message TEXT,
  
  created_at TEXT DEFAULT (datetime('now'))
);

-- 3. 인덱스
CREATE INDEX idx_alerts_user ON price_alerts(user_id);
CREATE INDEX idx_alerts_email ON price_alerts(user_email);
CREATE INDEX idx_alerts_procedure ON price_alerts(procedure_id);
CREATE INDEX idx_alerts_sigungu ON price_alerts(sigungu);
CREATE INDEX idx_alerts_hospital ON price_alerts(hospital_id);
CREATE INDEX idx_alerts_type ON price_alerts(alert_type);
CREATE INDEX idx_alerts_active ON price_alerts(is_active);

CREATE INDEX idx_alert_logs_alert ON price_alert_logs(alert_id);
CREATE INDEX idx_alert_logs_status ON price_alert_logs(status);
CREATE INDEX idx_alert_logs_created ON price_alert_logs(created_at);
