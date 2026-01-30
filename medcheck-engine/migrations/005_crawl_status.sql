-- ============================================
-- MEDCHECK Engine - 크롤링 상태 모니터링
-- Migration: 005_crawl_status.sql
-- ============================================

-- 크롤링 작업 상태 테이블
CREATE TABLE IF NOT EXISTS crawl_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,              -- naver_place, google_search, hospital_crawl, price_crawl
  status TEXT DEFAULT 'running',       -- running, paused, completed, failed
  progress INTEGER DEFAULT 0,          -- 현재 진행 수
  total INTEGER DEFAULT 0,             -- 전체 대상 수
  found INTEGER DEFAULT 0,             -- 발견 수
  failed INTEGER DEFAULT 0,            -- 실패 수
  current_item TEXT,                   -- 현재 처리 중인 항목
  started_at TEXT,                     -- 시작 시간
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,                   -- 완료 시간
  message TEXT,                        -- 상태 메시지
  input_file TEXT,                     -- 입력 파일 경로
  output_file TEXT,                    -- 출력 파일 경로
  error_log TEXT                       -- 에러 로그
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status ON crawl_jobs(status);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_updated ON crawl_jobs(updated_at DESC);
