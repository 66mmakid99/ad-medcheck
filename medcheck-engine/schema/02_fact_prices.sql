-- ================================================================
-- MADMEDCHECK 가격 DB - Phase 1
-- fact_prices (가격 팩트 테이블)
-- ================================================================
-- 목적: OCR로 수집된 모든 가격 데이터를 정규화하여 저장
-- 핵심: price_per_unit (단위당 가격) 자동 계산으로 가격 비교 가능
-- ================================================================

-- 테이블 생성
CREATE TABLE IF NOT EXISTS fact_prices (
  -- Primary Key
  id TEXT PRIMARY KEY,                          -- 예: PRICE-20240131-001
  
  -- ================================================================
  -- 원본 데이터 (OCR에서 추출한 그대로)
  -- ================================================================
  raw_price_text TEXT,                          -- "300샷 79만원", "리쥬란 4cc 49만원"
  raw_quantity_text TEXT,                       -- "300샷", "4cc"
  raw_unit_text TEXT,                           -- "샷", "cc"
  
  -- ================================================================
  -- 정규화된 가격 정보 (핵심!)
  -- ================================================================
  total_price INTEGER NOT NULL,                 -- 총 가격 (원 단위, 정수)
  quantity REAL NOT NULL,                       -- 수량 (300, 4, 10000 등)
  unit_id TEXT NOT NULL,                        -- 단위 FK → dim_units.id
  
  -- ★★★ 핵심 계산 필드 ★★★
  price_per_unit REAL GENERATED ALWAYS AS (
    CASE 
      WHEN quantity > 0 THEN ROUND(total_price / quantity, 2)
      ELSE NULL 
    END
  ) STORED,                                     -- 단위당 가격 (자동 계산)
  
  -- 기준 단위 환산 (비교용)
  -- 예: 1만줄 → 100샷으로 환산
  normalized_quantity REAL,                     -- 기준 단위로 환산된 수량
  normalized_unit_id TEXT,                      -- 기준 단위 ID
  normalized_price_per_unit REAL,               -- 기준 단위당 가격
  
  -- ================================================================
  -- 시술 정보
  -- ================================================================
  procedure_id TEXT,                            -- 시술 FK → procedures.id
  procedure_name_raw TEXT,                      -- OCR 추출 원본 시술명
  procedure_name_matched TEXT,                  -- 매칭된 표준 시술명
  
  equipment_name TEXT,                          -- 장비명 (울쎄라, 써마지 등)
  equipment_brand TEXT,                         -- 장비 브랜드 (클래시스 등)
  
  -- ================================================================
  -- 병원 정보
  -- ================================================================
  hospital_id TEXT,                             -- 병원 FK → hospitals.id
  hospital_name TEXT,                           -- 병원명 (비정규화, 조회 편의)
  
  -- ================================================================
  -- 지역 정보 (계층적)
  -- ================================================================
  region_id TEXT,                               -- 지역 FK → dim_regions.id
  sido TEXT,                                    -- 시/도 (서울특별시)
  sigungu TEXT,                                 -- 시/군/구 (강남구)
  dong TEXT,                                    -- 읍/면/동 (역삼동)
  
  -- ================================================================
  -- 가격 유형 및 조건
  -- ================================================================
  price_type TEXT DEFAULT 'regular',            -- regular, event, package, membership
  is_event INTEGER DEFAULT 0,                   -- 이벤트 가격 여부
  event_name TEXT,                              -- 이벤트명 (신규 고객, 첫 방문 등)
  event_start_date TEXT,                        -- 이벤트 시작일
  event_end_date TEXT,                          -- 이벤트 종료일
  
  -- 패키지 정보
  is_package INTEGER DEFAULT 0,                 -- 패키지 상품 여부
  package_sessions INTEGER,                     -- 패키지 횟수 (3회, 5회 등)
  price_per_session REAL,                       -- 회당 가격
  
  -- 조건 정보
  conditions TEXT,                              -- JSON: 추가 조건들
  
  -- ================================================================
  -- 데이터 출처 및 품질
  -- ================================================================
  source_type TEXT NOT NULL,                    -- ocr, crawl, manual, api
  source_id TEXT,                               -- 원본 소스 ID (ocr_result_id 등)
  source_url TEXT,                              -- 수집 URL
  source_platform TEXT,                         -- naver_place, google, website
  
  -- OCR 관련
  ocr_confidence REAL,                          -- OCR 신뢰도 (0.0 ~ 1.0)
  ocr_result_id TEXT,                           -- ocr_results FK
  original_image_url TEXT,                      -- 원본 이미지 URL
  
  -- 데이터 품질
  data_quality_score REAL,                      -- 데이터 품질 점수 (0~100)
  is_verified INTEGER DEFAULT 0,                -- 검증 완료 여부
  verified_by TEXT,                             -- 검증자
  verified_at TEXT,                             -- 검증 시각
  
  -- ================================================================
  -- 유효 기간
  -- ================================================================
  price_valid_from TEXT,                        -- 가격 유효 시작일
  price_valid_to TEXT,                          -- 가격 유효 종료일
  is_active INTEGER DEFAULT 1,                  -- 현재 유효 여부
  
  -- ================================================================
  -- 비교 분석용 (집계 시 사용)
  -- ================================================================
  region_avg_price REAL,                        -- 해당 지역 평균가 (배치 계산)
  region_percentile REAL,                       -- 지역 내 백분위 (배치 계산)
  fair_price REAL,                              -- 적정 시세 (배치 계산)
  price_vs_fair REAL,                           -- 적정 시세 대비 (배치 계산)
  
  -- ================================================================
  -- Timestamps
  -- ================================================================
  collected_at TEXT DEFAULT (datetime('now')),  -- 수집 시각
  created_at TEXT DEFAULT (datetime('now')),    -- 생성 시각
  updated_at TEXT DEFAULT (datetime('now')),    -- 수정 시각
  
  -- ================================================================
  -- Constraints
  -- ================================================================
  FOREIGN KEY (unit_id) REFERENCES dim_units(id),
  FOREIGN KEY (normalized_unit_id) REFERENCES dim_units(id),
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id),
  FOREIGN KEY (procedure_id) REFERENCES procedures(id)
);

-- ================================================================
-- 인덱스 생성 (쿼리 성능 최적화)
-- ================================================================

-- 기본 조회용
CREATE INDEX IF NOT EXISTS idx_fp_hospital ON fact_prices(hospital_id);
CREATE INDEX IF NOT EXISTS idx_fp_procedure ON fact_prices(procedure_id);
CREATE INDEX IF NOT EXISTS idx_fp_unit ON fact_prices(unit_id);

-- 지역 조회용
CREATE INDEX IF NOT EXISTS idx_fp_sido ON fact_prices(sido);
CREATE INDEX IF NOT EXISTS idx_fp_sigungu ON fact_prices(sigungu);
CREATE INDEX IF NOT EXISTS idx_fp_dong ON fact_prices(dong);

-- 가격 비교용 (핵심!)
CREATE INDEX IF NOT EXISTS idx_fp_price_per_unit ON fact_prices(price_per_unit);
CREATE INDEX IF NOT EXISTS idx_fp_normalized_price ON fact_prices(normalized_price_per_unit);
CREATE INDEX IF NOT EXISTS idx_fp_total_price ON fact_prices(total_price);

-- 필터링용
CREATE INDEX IF NOT EXISTS idx_fp_is_event ON fact_prices(is_event);
CREATE INDEX IF NOT EXISTS idx_fp_is_active ON fact_prices(is_active);
CREATE INDEX IF NOT EXISTS idx_fp_price_type ON fact_prices(price_type);
CREATE INDEX IF NOT EXISTS idx_fp_source ON fact_prices(source_type);

-- 시계열 분석용
CREATE INDEX IF NOT EXISTS idx_fp_collected ON fact_prices(collected_at);
CREATE INDEX IF NOT EXISTS idx_fp_created ON fact_prices(created_at);

-- 복합 인덱스 (자주 사용되는 조합)
CREATE INDEX IF NOT EXISTS idx_fp_region_procedure ON fact_prices(sigungu, procedure_id);
CREATE INDEX IF NOT EXISTS idx_fp_hospital_procedure ON fact_prices(hospital_id, procedure_id);
CREATE INDEX IF NOT EXISTS idx_fp_procedure_unit ON fact_prices(procedure_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_fp_sigungu_price ON fact_prices(sigungu, price_per_unit);

-- ================================================================
-- 가격 변동 이력 테이블 (Phase 1.5)
-- ================================================================
CREATE TABLE IF NOT EXISTS fact_price_history (
  id TEXT PRIMARY KEY,
  price_id TEXT NOT NULL,                       -- fact_prices FK
  
  -- 변경 전/후
  old_total_price INTEGER,
  new_total_price INTEGER,
  old_quantity REAL,
  new_quantity REAL,
  old_price_per_unit REAL,
  new_price_per_unit REAL,
  
  -- 변동률
  price_change_amount INTEGER,                  -- 가격 변동액
  price_change_rate REAL,                       -- 가격 변동률 (%)
  
  -- 메타
  change_type TEXT,                             -- increase, decrease, new, discontinued
  change_reason TEXT,                           -- event_start, event_end, regular_change
  
  -- Timestamps
  changed_at TEXT DEFAULT (datetime('now')),
  
  FOREIGN KEY (price_id) REFERENCES fact_prices(id)
);

CREATE INDEX IF NOT EXISTS idx_fph_price ON fact_price_history(price_id);
CREATE INDEX IF NOT EXISTS idx_fph_changed ON fact_price_history(changed_at);

-- ================================================================
-- 트리거: fact_prices 변경 시 이력 자동 기록
-- ================================================================
CREATE TRIGGER IF NOT EXISTS trg_price_history
AFTER UPDATE OF total_price, quantity ON fact_prices
WHEN OLD.total_price != NEW.total_price OR OLD.quantity != NEW.quantity
BEGIN
  INSERT INTO fact_price_history (
    id,
    price_id,
    old_total_price,
    new_total_price,
    old_quantity,
    new_quantity,
    old_price_per_unit,
    new_price_per_unit,
    price_change_amount,
    price_change_rate,
    change_type,
    changed_at
  ) VALUES (
    'HIST-' || strftime('%Y%m%d%H%M%S', 'now') || '-' || abs(random() % 10000),
    NEW.id,
    OLD.total_price,
    NEW.total_price,
    OLD.quantity,
    NEW.quantity,
    CASE WHEN OLD.quantity > 0 THEN OLD.total_price / OLD.quantity ELSE NULL END,
    CASE WHEN NEW.quantity > 0 THEN NEW.total_price / NEW.quantity ELSE NULL END,
    NEW.total_price - OLD.total_price,
    CASE WHEN OLD.total_price > 0 
         THEN ROUND((NEW.total_price - OLD.total_price) * 100.0 / OLD.total_price, 2)
         ELSE NULL END,
    CASE 
      WHEN NEW.total_price > OLD.total_price THEN 'increase'
      WHEN NEW.total_price < OLD.total_price THEN 'decrease'
      ELSE 'no_change'
    END,
    datetime('now')
  );
END;

-- ================================================================
-- 트리거: updated_at 자동 갱신
-- ================================================================
CREATE TRIGGER IF NOT EXISTS trg_fact_prices_updated
AFTER UPDATE ON fact_prices
BEGIN
  UPDATE fact_prices SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ================================================================
-- 유용한 뷰들
-- ================================================================

-- 1. 가격 비교 뷰 (단위당 가격 포함)
CREATE VIEW IF NOT EXISTS v_price_comparison AS
SELECT 
  fp.id,
  fp.hospital_name,
  fp.procedure_name_matched AS procedure_name,
  fp.sigungu,
  fp.total_price,
  fp.quantity,
  u.unit_name_ko AS unit,
  fp.price_per_unit,
  fp.is_event,
  fp.price_type,
  fp.collected_at
FROM fact_prices fp
JOIN dim_units u ON fp.unit_id = u.id
WHERE fp.is_active = 1;

-- 2. 지역별 평균 가격 뷰
CREATE VIEW IF NOT EXISTS v_region_avg_prices AS
SELECT 
  fp.sigungu,
  fp.procedure_id,
  p.name AS procedure_name,
  fp.unit_id,
  u.unit_name_ko AS unit,
  COUNT(*) AS sample_count,
  ROUND(AVG(fp.price_per_unit), 0) AS avg_price_per_unit,
  ROUND(MIN(fp.price_per_unit), 0) AS min_price_per_unit,
  ROUND(MAX(fp.price_per_unit), 0) AS max_price_per_unit,
  ROUND(AVG(fp.total_price), 0) AS avg_total_price
FROM fact_prices fp
JOIN dim_units u ON fp.unit_id = u.id
LEFT JOIN procedures p ON fp.procedure_id = p.id
WHERE fp.is_active = 1 AND fp.is_event = 0
GROUP BY fp.sigungu, fp.procedure_id, fp.unit_id;

-- 3. 병원별 시술 가격 뷰
CREATE VIEW IF NOT EXISTS v_hospital_prices AS
SELECT 
  fp.hospital_id,
  fp.hospital_name,
  fp.sigungu,
  fp.procedure_id,
  fp.procedure_name_matched AS procedure_name,
  fp.equipment_name,
  fp.total_price,
  fp.quantity,
  u.unit_name_ko AS unit,
  fp.price_per_unit,
  fp.is_event,
  fp.event_name,
  fp.collected_at
FROM fact_prices fp
JOIN dim_units u ON fp.unit_id = u.id
WHERE fp.is_active = 1
ORDER BY fp.hospital_name, fp.procedure_name_matched;
