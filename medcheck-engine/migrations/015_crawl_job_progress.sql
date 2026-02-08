-- ============================================
-- 015_crawl_job_progress.sql
-- 크롤링 실시간 진행 상황 + 상세 정보 필드 추가
-- ============================================

-- crawl_jobs: 실시간 진행 상황 필드
ALTER TABLE crawl_jobs ADD COLUMN violations_found INTEGER DEFAULT 0;
ALTER TABLE crawl_jobs ADD COLUMN recent_logs TEXT;

-- crawl_logs: 병원별/위반별 상세 데이터
ALTER TABLE crawl_logs ADD COLUMN hospitals_detail TEXT;
ALTER TABLE crawl_logs ADD COLUMN violations_detail TEXT;
