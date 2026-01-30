-- ============================================
-- MEDCHECK Engine - 시술가격 모듈
-- Migration: 003_pricing_module.sql
-- ============================================

-- 1. 시술 종류 테이블
CREATE TABLE IF NOT EXISTS procedures (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,           -- PROC-001
  name TEXT NOT NULL,                  -- 쌍꺼풀 수술
  category TEXT NOT NULL,              -- 성형외과, 피부과, 치과 등
  subcategory TEXT,                    -- 눈성형, 코성형 등
  description TEXT,
  is_covered INTEGER DEFAULT 0,        -- 급여 여부 (0: 비급여, 1: 급여)
  avg_price INTEGER,                   -- 평균 가격
  min_price INTEGER,                   -- 최저 가격
  max_price INTEGER,                   -- 최고 가격
  price_count INTEGER DEFAULT 0,       -- 수집된 가격 수
  last_updated TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 2. 병원 테이블
CREATE TABLE IF NOT EXISTS hospitals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                  -- 병원명
  domain TEXT UNIQUE,                  -- gangnam-plastic.com
  category TEXT,                       -- 성형외과, 피부과 등
  region TEXT,                         -- 서울 강남, 부산 해운대 등
  address TEXT,
  phone TEXT,
  is_verified INTEGER DEFAULT 0,       -- 검증 여부
  total_prices INTEGER DEFAULT 0,      -- 등록된 가격 수
  violation_count INTEGER DEFAULT 0,   -- 위반 이력
  last_crawled TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 3. 가격 기록 테이블 (핵심!)
CREATE TABLE IF NOT EXISTS price_records (
  id TEXT PRIMARY KEY,
  procedure_id TEXT NOT NULL,          -- 시술 ID
  hospital_id TEXT,                    -- 병원 ID
  hospital_name TEXT,                  -- 병원명 (hospital_id 없을 때)
  price INTEGER NOT NULL,              -- 가격 (원)
  price_type TEXT DEFAULT 'fixed',     -- fixed, range_min, range_max, starting
  original_text TEXT,                  -- 원본 텍스트 ("150만원~", "50만원부터")
  source_url TEXT,                     -- 수집 URL
  source_type TEXT DEFAULT 'crawl',    -- crawl, manual, api
  is_event INTEGER DEFAULT 0,          -- 이벤트 가격 여부
  event_name TEXT,                     -- 이벤트명
  event_end_date TEXT,                 -- 이벤트 종료일
  has_vat INTEGER DEFAULT 1,           -- VAT 포함 여부
  includes_anesthesia INTEGER,         -- 마취비 포함
  includes_followup INTEGER,           -- 사후관리 포함
  note TEXT,
  verified INTEGER DEFAULT 0,
  verified_at TEXT,
  collected_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (procedure_id) REFERENCES procedures(id),
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
);

-- 4. 가격 이상 알림 테이블
CREATE TABLE IF NOT EXISTS price_alerts (
  id TEXT PRIMARY KEY,
  price_record_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,            -- too_low, too_high, sudden_change, suspicious
  severity TEXT DEFAULT 'medium',      -- low, medium, high, critical
  description TEXT,
  expected_range TEXT,                 -- "100만원 ~ 200만원"
  actual_price INTEGER,
  deviation_percent REAL,              -- 평균 대비 편차 %
  status TEXT DEFAULT 'pending',       -- pending, reviewed, resolved, ignored
  reviewed_by TEXT,
  reviewed_at TEXT,
  resolution_note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 5. 가격 트렌드 테이블 (월별 집계)
CREATE TABLE IF NOT EXISTS price_trends (
  id TEXT PRIMARY KEY,
  procedure_id TEXT NOT NULL,
  year_month TEXT NOT NULL,            -- "2026-01"
  avg_price INTEGER,
  min_price INTEGER,
  max_price INTEGER,
  sample_count INTEGER,
  change_percent REAL,                 -- 전월 대비 변화율
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(procedure_id, year_month)
);

-- 6. 가격 비교 요청 로그
CREATE TABLE IF NOT EXISTS price_comparisons (
  id TEXT PRIMARY KEY,
  procedure_id TEXT NOT NULL,
  region TEXT,
  result_count INTEGER,
  avg_price INTEGER,
  price_range TEXT,
  requested_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 인덱스
-- ============================================
CREATE INDEX IF NOT EXISTS idx_procedures_category ON procedures(category);
CREATE INDEX IF NOT EXISTS idx_procedures_code ON procedures(code);
CREATE INDEX IF NOT EXISTS idx_hospitals_domain ON hospitals(domain);
CREATE INDEX IF NOT EXISTS idx_hospitals_region ON hospitals(region);
CREATE INDEX IF NOT EXISTS idx_price_records_procedure ON price_records(procedure_id);
CREATE INDEX IF NOT EXISTS idx_price_records_hospital ON price_records(hospital_id);
CREATE INDEX IF NOT EXISTS idx_price_records_collected ON price_records(collected_at);
CREATE INDEX IF NOT EXISTS idx_price_alerts_status ON price_alerts(status);
CREATE INDEX IF NOT EXISTS idx_price_trends_procedure ON price_trends(procedure_id);

-- ============================================
-- 초기 데이터: 주요 시술 카테고리
-- ============================================

-- 성형외과 - 눈
INSERT INTO procedures (id, code, name, category, subcategory, is_covered) VALUES
('PROC-EYE-001', 'EYE-001', '쌍꺼풀 수술 (매몰법)', '성형외과', '눈성형', 0),
('PROC-EYE-002', 'EYE-002', '쌍꺼풀 수술 (절개법)', '성형외과', '눈성형', 0),
('PROC-EYE-003', 'EYE-003', '눈매교정', '성형외과', '눈성형', 0),
('PROC-EYE-004', 'EYE-004', '하안검 수술', '성형외과', '눈성형', 0),
('PROC-EYE-005', 'EYE-005', '눈밑지방 재배치', '성형외과', '눈성형', 0);

-- 성형외과 - 코
INSERT INTO procedures (id, code, name, category, subcategory, is_covered) VALUES
('PROC-NOSE-001', 'NOSE-001', '코 높이기 (융비술)', '성형외과', '코성형', 0),
('PROC-NOSE-002', 'NOSE-002', '코끝 성형', '성형외과', '코성형', 0),
('PROC-NOSE-003', 'NOSE-003', '콧볼 축소', '성형외과', '코성형', 0),
('PROC-NOSE-004', 'NOSE-004', '비중격 만곡증 교정', '성형외과', '코성형', 1);

-- 성형외과 - 윤곽
INSERT INTO procedures (id, code, name, category, subcategory, is_covered) VALUES
('PROC-FACE-001', 'FACE-001', '사각턱 축소', '성형외과', '윤곽성형', 0),
('PROC-FACE-002', 'FACE-002', '광대 축소', '성형외과', '윤곽성형', 0),
('PROC-FACE-003', 'FACE-003', '턱끝 성형', '성형외과', '윤곽성형', 0),
('PROC-FACE-004', 'FACE-004', '안면윤곽 3종', '성형외과', '윤곽성형', 0);

-- 피부과
INSERT INTO procedures (id, code, name, category, subcategory, is_covered) VALUES
('PROC-SKIN-001', 'SKIN-001', '보톡스 (이마)', '피부과', '보톡스', 0),
('PROC-SKIN-002', 'SKIN-002', '보톡스 (미간)', '피부과', '보톡스', 0),
('PROC-SKIN-003', 'SKIN-003', '보톡스 (턱)', '피부과', '보톡스', 0),
('PROC-SKIN-004', 'SKIN-004', '필러 (코)', '피부과', '필러', 0),
('PROC-SKIN-005', 'SKIN-005', '필러 (팔자)', '피부과', '필러', 0),
('PROC-SKIN-006', 'SKIN-006', '레이저 토닝', '피부과', '레이저', 0),
('PROC-SKIN-007', 'SKIN-007', '프락셀 레이저', '피부과', '레이저', 0),
('PROC-SKIN-008', 'SKIN-008', '울쎄라 리프팅', '피부과', '리프팅', 0);

-- 치과
INSERT INTO procedures (id, code, name, category, subcategory, is_covered) VALUES
('PROC-DENT-001', 'DENT-001', '임플란트 (1개)', '치과', '임플란트', 0),
('PROC-DENT-002', 'DENT-002', '라미네이트 (1개)', '치과', '심미치료', 0),
('PROC-DENT-003', 'DENT-003', '치아미백', '치과', '심미치료', 0),
('PROC-DENT-004', 'DENT-004', '투명교정', '치과', '교정', 0),
('PROC-DENT-005', 'DENT-005', '치아교정 (메탈)', '치과', '교정', 0);

-- 기타
INSERT INTO procedures (id, code, name, category, subcategory, is_covered) VALUES
('PROC-BODY-001', 'BODY-001', '지방흡입 (복부)', '성형외과', '바디성형', 0),
('PROC-BODY-002', 'BODY-002', '지방흡입 (허벅지)', '성형외과', '바디성형', 0),
('PROC-BODY-003', 'BODY-003', '가슴확대 수술', '성형외과', '바디성형', 0),
('PROC-HAIR-001', 'HAIR-001', '모발이식 (1000모)', '피부과', '모발이식', 0);

-- ============================================
-- 샘플 병원 데이터
-- ============================================
INSERT INTO hospitals (id, name, domain, category, region) VALUES
('HOSP-001', '강남라인성형외과', 'gangnam-line.com', '성형외과', '서울 강남'),
('HOSP-002', '청담우아한의원', 'cd-wooa.kr', '피부과', '서울 강남'),
('HOSP-003', '압구정탑치과', 'apg-top-dental.com', '치과', '서울 강남'),
('HOSP-004', '부산미소성형외과', 'busan-miso.kr', '성형외과', '부산 해운대'),
('HOSP-005', '대구본스킨의원', 'daegu-bonskin.com', '피부과', '대구 수성');

-- ============================================
-- 샘플 가격 데이터
-- ============================================
INSERT INTO price_records (id, procedure_id, hospital_id, price, original_text, source_type) VALUES
('PR-001', 'PROC-EYE-001', 'HOSP-001', 800000, '80만원', 'manual'),
('PR-002', 'PROC-EYE-001', 'HOSP-004', 600000, '60만원', 'manual'),
('PR-003', 'PROC-EYE-002', 'HOSP-001', 1500000, '150만원', 'manual'),
('PR-004', 'PROC-SKIN-001', 'HOSP-002', 150000, '15만원', 'manual'),
('PR-005', 'PROC-SKIN-004', 'HOSP-002', 300000, '30만원', 'manual'),
('PR-006', 'PROC-DENT-001', 'HOSP-003', 1200000, '120만원', 'manual'),
('PR-007', 'PROC-DENT-001', 'HOSP-003', 1000000, '100만원 (이벤트)', 'manual');

-- 시술별 통계 업데이트
UPDATE procedures SET 
  price_count = (SELECT COUNT(*) FROM price_records WHERE procedure_id = procedures.id),
  avg_price = (SELECT AVG(price) FROM price_records WHERE procedure_id = procedures.id),
  min_price = (SELECT MIN(price) FROM price_records WHERE procedure_id = procedures.id),
  max_price = (SELECT MAX(price) FROM price_records WHERE procedure_id = procedures.id),
  last_updated = datetime('now')
WHERE id IN (SELECT DISTINCT procedure_id FROM price_records);
