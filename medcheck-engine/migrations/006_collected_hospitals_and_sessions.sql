-- 006_collected_hospitals_and_sessions.sql
-- 크롤링 결과 관리 시스템

-- 1. 크롤링 세션 테이블 (전체 세션 관리)
CREATE TABLE IF NOT EXISTS crawl_sessions (
  id TEXT PRIMARY KEY,
  session_type TEXT NOT NULL,  -- 'hospital_crawl', 'naver_place', 'google_search'
  target_sido TEXT,               -- '서울', '경기', '수도권', '전체'
  target_region TEXT,
  filter_conditions TEXT,         -- JSON: { departments: ['피부과'], keywords: ['울쎄라'] }
  status TEXT DEFAULT 'running',    -- 'running', 'completed', 'failed', 'cancelled'
  total_hospitals INTEGER DEFAULT 0,
  filtered_hospitals INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_seconds INTEGER,
  output_file_path TEXT,          -- 기존 CSV 파일 경로 (호환성용)
  message TEXT,                     -- 마지막 메시지
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 2. 수집된 병원 테이블 (크롤러가 수집한 병원 데이터)
CREATE TABLE IF NOT EXISTS collected_hospitals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crawl_session_id TEXT NOT NULL,   -- crawl_sessions.id 참조
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  homepage_url TEXT,
  naver_place_url TEXT,             -- 네이버 플레이스 URL
  google_search_url TEXT,           -- 구글 검색 URL
  sido TEXT,                        -- 시도
  sigungu TEXT,                     -- 시군구
  region TEXT,                       -- 지역 (시도 + 시군구)
  department TEXT,                   -- 진료과목
  department_codes TEXT,             -- JSON: ['14', '09'] (공공데이터 코드)
  category TEXT,                     -- '피부과', '성형외과', 'GP'
  matched_keywords TEXT,              -- JSON: ['피부', '스킨', '울쎄라'] (매칭된 키워드)
  filtering_status TEXT,              -- 'matched', 'filtered_out'
  raw_data TEXT,                     -- 원본 데이터 (JSON)
  source TEXT DEFAULT 'public_api',   -- 'public_api', 'naver_place', 'google_search'
  crawl_order INTEGER,                -- 크롤링 순서
  crawled_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (crawl_session_id) REFERENCES crawl_sessions(id) ON DELETE CASCADE
);

-- 3. 병원 분석 결과 테이블
CREATE TABLE IF NOT EXISTS hospital_analysis_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crawl_session_id TEXT NOT NULL,
  hospital_id INTEGER NOT NULL,       -- collected_hospitals.id
  analysis_date TEXT DEFAULT (datetime('now')),
  url_analyzed TEXT,                 -- 분석된 URL
  grade TEXT,                         -- 'A', 'B', 'C', 'D', 'F'
  violation_count INTEGER DEFAULT 0,
  summary TEXT,
  violations TEXT,                    -- JSON: [{type, severity, matchedText, description}]
  analysis_time_ms INTEGER,
  status TEXT,                         -- 'success', 'error', 'skipped'
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (crawl_session_id) REFERENCES crawl_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (hospital_id) REFERENCES collected_hospitals(id) ON DELETE CASCADE
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_crawl_sessions_status ON crawl_sessions(status);
CREATE INDEX IF NOT EXISTS idx_crawl_sessions_type ON crawl_sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_crawl_sessions_created ON crawl_sessions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collected_hospitals_session ON collected_hospitals(crawl_session_id);
CREATE INDEX IF NOT EXISTS idx_collected_hospitals_status ON collected_hospitals(filtering_status);
CREATE INDEX IF NOT EXISTS idx_collected_hospitals_category ON collected_hospitals(category);
CREATE INDEX IF NOT EXISTS idx_collected_hospitals_region ON collected_hospitals(region);
CREATE INDEX IF NOT EXISTS idx_collected_hospitals_has_url ON collected_hospitals(homepage_url) WHERE homepage_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_analysis_session ON hospital_analysis_results(crawl_session_id);
CREATE INDEX IF NOT EXISTS idx_analysis_hospital ON hospital_analysis_results(hospital_id);
CREATE INDEX IF NOT EXISTS idx_analysis_grade ON hospital_analysis_results(grade);

-- [D1 호환성] TRIGGER 제거됨 - 애플리케이션 레벨에서 처리
-- updated_at 갱신: API 핸들러에서 UPDATE 시 datetime('now') 직접 설정
-- 세션 통계 갱신: collected-hospitals API 핸들러에서 INSERT 후 세션 통계 업데이트
