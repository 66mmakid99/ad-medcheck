-- 013_crawl_logs.sql
-- 크롤러 자동 스케줄링 시스템 테이블

-- 크롤링 실행 이력
CREATE TABLE IF NOT EXISTS crawl_logs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  type TEXT NOT NULL,
  region TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_seconds INTEGER,
  hospitals_total INTEGER DEFAULT 0,
  hospitals_analyzed INTEGER DEFAULT 0,
  violations_found INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  error_details TEXT,
  trigger_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_crawl_logs_status ON crawl_logs(status);
CREATE INDEX IF NOT EXISTS idx_crawl_logs_started ON crawl_logs(started_at);

-- 수동 트리거 요청
CREATE TABLE IF NOT EXISTS crawler_triggers (
  id TEXT PRIMARY KEY,
  region TEXT NOT NULL DEFAULT '서울',
  enable_ai INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by TEXT DEFAULT 'dashboard',
  requested_at TEXT DEFAULT (datetime('now')),
  acknowledged_at TEXT,
  completed_at TEXT,
  job_id TEXT,
  result TEXT
);

CREATE INDEX IF NOT EXISTS idx_crawler_triggers_status ON crawler_triggers(status);

-- 스케줄러 하트비트 (단일 행)
CREATE TABLE IF NOT EXISTS crawler_scheduler_status (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  pid INTEGER,
  is_online INTEGER DEFAULT 0,
  schedules TEXT,
  running_jobs INTEGER DEFAULT 0,
  queued_jobs INTEGER DEFAULT 0,
  next_scheduled_run TEXT,
  last_heartbeat TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO crawler_scheduler_status (id) VALUES ('singleton');
