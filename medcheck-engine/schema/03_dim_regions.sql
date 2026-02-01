-- ================================================================
-- MADMEDCHECK 가격 DB - Phase 2
-- dim_regions (지역 계층 테이블)
-- ================================================================
-- 목적: 시/도 > 시/군/구 > 읍/면/동 계층 구조로 지역 관리
-- 활용: 지역별 가격 비교, 동네 시세 분석
-- ================================================================

-- 테이블 생성
CREATE TABLE IF NOT EXISTS dim_regions (
  -- Primary Key
  id TEXT PRIMARY KEY,                          -- 예: REG-11680-101 (시군구코드-동코드)
  
  -- 지역 계층 구조
  sido_code TEXT NOT NULL,                      -- 시도 코드 (11: 서울, 26: 부산...)
  sido_name TEXT NOT NULL,                      -- 시도명 (서울특별시, 부산광역시...)
  
  sigungu_code TEXT,                            -- 시군구 코드 (11680: 강남구...)
  sigungu_name TEXT,                            -- 시군구명 (강남구, 서초구...)
  
  dong_code TEXT,                               -- 읍면동 코드
  dong_name TEXT,                               -- 읍면동명 (역삼동, 삼성동...)
  
  -- 행정구역 전체 표기
  full_address TEXT,                            -- 서울특별시 강남구 역삼동
  short_address TEXT,                           -- 강남구 역삼동
  
  -- 지역 레벨 (집계용)
  region_level INTEGER NOT NULL,                -- 1: 시도, 2: 시군구, 3: 읍면동
  
  -- 상위 지역 참조 (계층 구조)
  parent_id TEXT,                               -- 상위 지역 ID (동→구, 구→시)
  
  -- 좌표 정보 (선택)
  latitude REAL,                                -- 위도
  longitude REAL,                               -- 경도
  
  -- 메타데이터
  is_active INTEGER DEFAULT 1,                  -- 활성화 여부
  hospital_count INTEGER DEFAULT 0,             -- 해당 지역 병원 수 (배치 업데이트)
  price_count INTEGER DEFAULT 0,                -- 해당 지역 가격 데이터 수
  
  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  
  -- Constraints
  FOREIGN KEY (parent_id) REFERENCES dim_regions(id)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_regions_sido ON dim_regions(sido_code);
CREATE INDEX IF NOT EXISTS idx_regions_sigungu ON dim_regions(sigungu_code);
CREATE INDEX IF NOT EXISTS idx_regions_dong ON dim_regions(dong_code);
CREATE INDEX IF NOT EXISTS idx_regions_level ON dim_regions(region_level);
CREATE INDEX IF NOT EXISTS idx_regions_parent ON dim_regions(parent_id);
CREATE INDEX IF NOT EXISTS idx_regions_sido_name ON dim_regions(sido_name);
CREATE INDEX IF NOT EXISTS idx_regions_sigungu_name ON dim_regions(sigungu_name);

-- 복합 인덱스
CREATE INDEX IF NOT EXISTS idx_regions_sido_sigungu ON dim_regions(sido_name, sigungu_name);

-- ================================================================
-- 초기 데이터: 주요 지역 (시도 레벨)
-- ================================================================

INSERT OR REPLACE INTO dim_regions (id, sido_code, sido_name, sigungu_code, sigungu_name, dong_code, dong_name, full_address, short_address, region_level, parent_id) VALUES
-- 시도 레벨 (Level 1)
('REG-11', '11', '서울특별시', NULL, NULL, NULL, NULL, '서울특별시', '서울', 1, NULL),
('REG-26', '26', '부산광역시', NULL, NULL, NULL, NULL, '부산광역시', '부산', 1, NULL),
('REG-27', '27', '대구광역시', NULL, NULL, NULL, NULL, '대구광역시', '대구', 1, NULL),
('REG-28', '28', '인천광역시', NULL, NULL, NULL, NULL, '인천광역시', '인천', 1, NULL),
('REG-29', '29', '광주광역시', NULL, NULL, NULL, NULL, '광주광역시', '광주', 1, NULL),
('REG-30', '30', '대전광역시', NULL, NULL, NULL, NULL, '대전광역시', '대전', 1, NULL),
('REG-31', '31', '울산광역시', NULL, NULL, NULL, NULL, '울산광역시', '울산', 1, NULL),
('REG-36', '36', '세종특별자치시', NULL, NULL, NULL, NULL, '세종특별자치시', '세종', 1, NULL),
('REG-41', '41', '경기도', NULL, NULL, NULL, NULL, '경기도', '경기', 1, NULL),
('REG-42', '42', '강원특별자치도', NULL, NULL, NULL, NULL, '강원특별자치도', '강원', 1, NULL),
('REG-43', '43', '충청북도', NULL, NULL, NULL, NULL, '충청북도', '충북', 1, NULL),
('REG-44', '44', '충청남도', NULL, NULL, NULL, NULL, '충청남도', '충남', 1, NULL),
('REG-45', '45', '전북특별자치도', NULL, NULL, NULL, NULL, '전북특별자치도', '전북', 1, NULL),
('REG-46', '46', '전라남도', NULL, NULL, NULL, NULL, '전라남도', '전남', 1, NULL),
('REG-47', '47', '경상북도', NULL, NULL, NULL, NULL, '경상북도', '경북', 1, NULL),
('REG-48', '48', '경상남도', NULL, NULL, NULL, NULL, '경상남도', '경남', 1, NULL),
('REG-50', '50', '제주특별자치도', NULL, NULL, NULL, NULL, '제주특별자치도', '제주', 1, NULL);

-- ================================================================
-- 초기 데이터: 서울 주요 구 (시군구 레벨)
-- ================================================================

INSERT OR REPLACE INTO dim_regions (id, sido_code, sido_name, sigungu_code, sigungu_name, dong_code, dong_name, full_address, short_address, region_level, parent_id) VALUES
-- 서울 구 레벨 (Level 2)
('REG-11680', '11', '서울특별시', '11680', '강남구', NULL, NULL, '서울특별시 강남구', '강남구', 2, 'REG-11'),
('REG-11650', '11', '서울특별시', '11650', '서초구', NULL, NULL, '서울특별시 서초구', '서초구', 2, 'REG-11'),
('REG-11740', '11', '서울특별시', '11740', '송파구', NULL, NULL, '서울특별시 송파구', '송파구', 2, 'REG-11'),
('REG-11500', '11', '서울특별시', '11500', '강서구', NULL, NULL, '서울특별시 강서구', '강서구', 2, 'REG-11'),
('REG-11620', '11', '서울특별시', '11620', '관악구', NULL, NULL, '서울특별시 관악구', '관악구', 2, 'REG-11'),
('REG-11215', '11', '서울특별시', '11215', '광진구', NULL, NULL, '서울특별시 광진구', '광진구', 2, 'REG-11'),
('REG-11530', '11', '서울특별시', '11530', '구로구', NULL, NULL, '서울특별시 구로구', '구로구', 2, 'REG-11'),
('REG-11545', '11', '서울특별시', '11545', '금천구', NULL, NULL, '서울특별시 금천구', '금천구', 2, 'REG-11'),
('REG-11350', '11', '서울특별시', '11350', '노원구', NULL, NULL, '서울특별시 노원구', '노원구', 2, 'REG-11'),
('REG-11320', '11', '서울특별시', '11320', '도봉구', NULL, NULL, '서울특별시 도봉구', '도봉구', 2, 'REG-11'),
('REG-11230', '11', '서울특별시', '11230', '동대문구', NULL, NULL, '서울특별시 동대문구', '동대문구', 2, 'REG-11'),
('REG-11590', '11', '서울특별시', '11590', '동작구', NULL, NULL, '서울특별시 동작구', '동작구', 2, 'REG-11'),
('REG-11440', '11', '서울특별시', '11440', '마포구', NULL, NULL, '서울특별시 마포구', '마포구', 2, 'REG-11'),
('REG-11410', '11', '서울특별시', '11410', '서대문구', NULL, NULL, '서울특별시 서대문구', '서대문구', 2, 'REG-11'),
('REG-11200', '11', '서울특별시', '11200', '성동구', NULL, NULL, '서울특별시 성동구', '성동구', 2, 'REG-11'),
('REG-11290', '11', '서울특별시', '11290', '성북구', NULL, NULL, '서울특별시 성북구', '성북구', 2, 'REG-11'),
('REG-11560', '11', '서울특별시', '11560', '양천구', NULL, NULL, '서울특별시 양천구', '양천구', 2, 'REG-11'),
('REG-11560', '11', '서울특별시', '11560', '양천구', NULL, NULL, '서울특별시 양천구', '양천구', 2, 'REG-11'),
('REG-11170', '11', '서울특별시', '11170', '용산구', NULL, NULL, '서울특별시 용산구', '용산구', 2, 'REG-11'),
('REG-11470', '11', '서울특별시', '11470', '은평구', NULL, NULL, '서울특별시 은평구', '은평구', 2, 'REG-11'),
('REG-11110', '11', '서울특별시', '11110', '종로구', NULL, NULL, '서울특별시 종로구', '종로구', 2, 'REG-11'),
('REG-11140', '11', '서울특별시', '11140', '중구', NULL, NULL, '서울특별시 중구', '중구', 2, 'REG-11'),
('REG-11260', '11', '서울특별시', '11260', '중랑구', NULL, NULL, '서울특별시 중랑구', '중랑구', 2, 'REG-11'),
('REG-11710', '11', '서울특별시', '11710', '강동구', NULL, NULL, '서울특별시 강동구', '강동구', 2, 'REG-11'),
('REG-11305', '11', '서울특별시', '11305', '강북구', NULL, NULL, '서울특별시 강북구', '강북구', 2, 'REG-11'),
('REG-11570', '11', '서울특별시', '11570', '영등포구', NULL, NULL, '서울특별시 영등포구', '영등포구', 2, 'REG-11');

-- ================================================================
-- 초기 데이터: 강남구 주요 동 (읍면동 레벨)
-- ================================================================

INSERT OR REPLACE INTO dim_regions (id, sido_code, sido_name, sigungu_code, sigungu_name, dong_code, dong_name, full_address, short_address, region_level, parent_id) VALUES
-- 강남구 동 레벨 (Level 3)
('REG-11680-101', '11', '서울특별시', '11680', '강남구', '101', '역삼동', '서울특별시 강남구 역삼동', '역삼동', 3, 'REG-11680'),
('REG-11680-102', '11', '서울특별시', '11680', '강남구', '102', '삼성동', '서울특별시 강남구 삼성동', '삼성동', 3, 'REG-11680'),
('REG-11680-103', '11', '서울특별시', '11680', '강남구', '103', '청담동', '서울특별시 강남구 청담동', '청담동', 3, 'REG-11680'),
('REG-11680-104', '11', '서울특별시', '11680', '강남구', '104', '논현동', '서울특별시 강남구 논현동', '논현동', 3, 'REG-11680'),
('REG-11680-105', '11', '서울특별시', '11680', '강남구', '105', '신사동', '서울특별시 강남구 신사동', '신사동', 3, 'REG-11680'),
('REG-11680-106', '11', '서울특별시', '11680', '강남구', '106', '압구정동', '서울특별시 강남구 압구정동', '압구정동', 3, 'REG-11680'),
('REG-11680-107', '11', '서울특별시', '11680', '강남구', '107', '대치동', '서울특별시 강남구 대치동', '대치동', 3, 'REG-11680'),
('REG-11680-108', '11', '서울특별시', '11680', '강남구', '108', '도곡동', '서울특별시 강남구 도곡동', '도곡동', 3, 'REG-11680'),
('REG-11680-109', '11', '서울특별시', '11680', '강남구', '109', '개포동', '서울특별시 강남구 개포동', '개포동', 3, 'REG-11680'),
('REG-11680-110', '11', '서울특별시', '11680', '강남구', '110', '일원동', '서울특별시 강남구 일원동', '일원동', 3, 'REG-11680'),
('REG-11680-111', '11', '서울특별시', '11680', '강남구', '111', '수서동', '서울특별시 강남구 수서동', '수서동', 3, 'REG-11680'),
('REG-11680-112', '11', '서울특별시', '11680', '강남구', '112', '세곡동', '서울특별시 강남구 세곡동', '세곡동', 3, 'REG-11680');

-- ================================================================
-- 초기 데이터: 서초구 주요 동
-- ================================================================

INSERT OR REPLACE INTO dim_regions (id, sido_code, sido_name, sigungu_code, sigungu_name, dong_code, dong_name, full_address, short_address, region_level, parent_id) VALUES
('REG-11650-101', '11', '서울특별시', '11650', '서초구', '101', '서초동', '서울특별시 서초구 서초동', '서초동', 3, 'REG-11650'),
('REG-11650-102', '11', '서울특별시', '11650', '서초구', '102', '반포동', '서울특별시 서초구 반포동', '반포동', 3, 'REG-11650'),
('REG-11650-103', '11', '서울특별시', '11650', '서초구', '103', '잠원동', '서울특별시 서초구 잠원동', '잠원동', 3, 'REG-11650'),
('REG-11650-104', '11', '서울특별시', '11650', '서초구', '104', '방배동', '서울특별시 서초구 방배동', '방배동', 3, 'REG-11650'),
('REG-11650-105', '11', '서울특별시', '11650', '서초구', '105', '양재동', '서울특별시 서초구 양재동', '양재동', 3, 'REG-11650');

-- ================================================================
-- 지역 조회용 뷰
-- ================================================================

-- 계층 구조 뷰
CREATE VIEW IF NOT EXISTS v_region_hierarchy AS
SELECT 
  r.id,
  r.region_level,
  r.sido_name,
  r.sigungu_name,
  r.dong_name,
  r.full_address,
  r.short_address,
  r.parent_id,
  p.short_address as parent_name,
  r.hospital_count,
  r.price_count
FROM dim_regions r
LEFT JOIN dim_regions p ON r.parent_id = p.id
WHERE r.is_active = 1
ORDER BY r.sido_code, r.sigungu_code, r.dong_code;

-- 시군구 목록 (가격 비교용)
CREATE VIEW IF NOT EXISTS v_sigungu_list AS
SELECT 
  id,
  sido_name,
  sigungu_name,
  full_address,
  hospital_count,
  price_count
FROM dim_regions
WHERE region_level = 2 AND is_active = 1
ORDER BY sido_name, sigungu_name;
