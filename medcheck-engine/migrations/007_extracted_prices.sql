-- 007_extracted_prices.sql
-- OCR로 추출된 가격 정보 저장 테이블

-- 1. 이미지 OCR 결과 테이블
CREATE TABLE IF NOT EXISTS ocr_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hospital_id INTEGER,                    -- hospitals.id 참조 (옵션)
  image_url TEXT NOT NULL,                -- 원본 이미지 URL
  source_url TEXT,                        -- 이미지 출처 페이지 URL
  classification_type TEXT,               -- PRICE_MENU, EVENT, PROMOTION, NOTICE, BEFORE_AFTER, REVIEW, IRRELEVANT
  classification_confidence REAL,         -- 분류 신뢰도 (0-1)
  extracted_text TEXT,                    -- 추출된 전체 텍스트
  text_confidence REAL,                   -- 텍스트 추출 신뢰도
  visual_emphasis TEXT,                   -- JSON: VisualEmphasis 데이터
  violations TEXT,                        -- JSON: ImageViolation[] 데이터
  processing_time_ms INTEGER,             -- 처리 시간 (ms)
  error_message TEXT,                     -- 오류 메시지 (실패 시)
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE SET NULL
);

-- 2. 추출된 가격 정보 테이블
CREATE TABLE IF NOT EXISTS extracted_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ocr_result_id INTEGER NOT NULL,         -- ocr_results.id 참조
  hospital_id INTEGER,                    -- hospitals.id 참조 (옵션)
  procedure_name TEXT NOT NULL,           -- 시술명 (원본)
  normalized_procedure TEXT,              -- 정규화된 시술명
  procedure_id INTEGER,                   -- procedures.id 참조 (매핑된 경우)
  price INTEGER NOT NULL,                 -- 가격 (원)
  original_price INTEGER,                 -- 할인 전 원가
  discount_rate REAL,                     -- 할인율 (%)
  shots INTEGER,                          -- 샷/회 수
  area TEXT,                              -- 부위
  price_type TEXT NOT NULL,               -- FIXED, FROM, RANGE, DISCOUNTED, NEGOTIABLE
  original_text TEXT,                     -- 원본 가격 텍스트
  extraction_confidence REAL,             -- 추출 신뢰도 (0-1)
  price_per_unit INTEGER,                 -- 단위당 가격 계산값
  is_promotion INTEGER DEFAULT 0,         -- 프로모션 여부 (0/1)
  has_time_limit INTEGER DEFAULT 0,       -- 기간 한정 여부 (0/1)
  conditions TEXT,                        -- 조건 텍스트
  validation_status TEXT,                 -- COMPLIANT, VIOLATION, PENDING
  validation_result TEXT,                 -- JSON: PriceAdValidationResult
  risk_score INTEGER,                     -- 위험 점수 (0-100)
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (ocr_result_id) REFERENCES ocr_results(id) ON DELETE CASCADE,
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE SET NULL,
  FOREIGN KEY (procedure_id) REFERENCES procedures(id) ON DELETE SET NULL
);

-- 3. 가격 광고 위반 기록 테이블
CREATE TABLE IF NOT EXISTS price_ad_violations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  extracted_price_id INTEGER NOT NULL,    -- extracted_prices.id 참조
  rule_code TEXT NOT NULL,                -- PAR-001 ~ PAR-006
  rule_name TEXT NOT NULL,                -- 규정명
  description TEXT NOT NULL,              -- 위반 설명
  severity TEXT NOT NULL,                 -- critical, major, minor
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (extracted_price_id) REFERENCES extracted_prices(id) ON DELETE CASCADE
);

-- 4. 이미지 위반 기록 테이블 (OCR 이미지 자체 위반)
CREATE TABLE IF NOT EXISTS image_violations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ocr_result_id INTEGER NOT NULL,         -- ocr_results.id 참조
  violation_type TEXT NOT NULL,           -- BEFORE_AFTER, GUARANTEE, EXAGGERATION, PRICE_INDUCEMENT, TESTIMONIAL, OTHER
  related_text TEXT,                      -- 관련 텍스트
  severity TEXT NOT NULL,                 -- critical, major, minor
  description TEXT NOT NULL,              -- 위반 설명
  legal_basis TEXT,                       -- 법적 근거
  confidence REAL,                        -- 탐지 신뢰도
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (ocr_result_id) REFERENCES ocr_results(id) ON DELETE CASCADE
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_ocr_results_hospital ON ocr_results(hospital_id);
CREATE INDEX IF NOT EXISTS idx_ocr_results_classification ON ocr_results(classification_type);
CREATE INDEX IF NOT EXISTS idx_ocr_results_created ON ocr_results(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_extracted_prices_ocr ON extracted_prices(ocr_result_id);
CREATE INDEX IF NOT EXISTS idx_extracted_prices_hospital ON extracted_prices(hospital_id);
CREATE INDEX IF NOT EXISTS idx_extracted_prices_procedure ON extracted_prices(procedure_name);
CREATE INDEX IF NOT EXISTS idx_extracted_prices_normalized ON extracted_prices(normalized_procedure);
CREATE INDEX IF NOT EXISTS idx_extracted_prices_validation ON extracted_prices(validation_status);
CREATE INDEX IF NOT EXISTS idx_extracted_prices_risk ON extracted_prices(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_extracted_prices_created ON extracted_prices(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_ad_violations_price ON price_ad_violations(extracted_price_id);
CREATE INDEX IF NOT EXISTS idx_price_ad_violations_rule ON price_ad_violations(rule_code);
CREATE INDEX IF NOT EXISTS idx_price_ad_violations_severity ON price_ad_violations(severity);

CREATE INDEX IF NOT EXISTS idx_image_violations_ocr ON image_violations(ocr_result_id);
CREATE INDEX IF NOT EXISTS idx_image_violations_type ON image_violations(violation_type);
CREATE INDEX IF NOT EXISTS idx_image_violations_severity ON image_violations(severity);

-- 트리거: extracted_prices 업데이트 시 updated_at 자동 갱신
CREATE TRIGGER IF NOT EXISTS trigger_extracted_prices_updated
AFTER UPDATE ON extracted_prices
FOR EACH ROW
BEGIN
  UPDATE extracted_prices SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- 뷰: 병원별 추출 가격 요약
CREATE VIEW IF NOT EXISTS v_hospital_extracted_prices AS
SELECT
  h.id AS hospital_id,
  h.name AS hospital_name,
  COUNT(DISTINCT ep.id) AS total_prices,
  COUNT(DISTINCT CASE WHEN ep.validation_status = 'VIOLATION' THEN ep.id END) AS violation_count,
  AVG(ep.risk_score) AS avg_risk_score,
  MIN(ep.price) AS min_price,
  MAX(ep.price) AS max_price,
  GROUP_CONCAT(DISTINCT ep.procedure_name) AS procedures
FROM hospitals h
LEFT JOIN extracted_prices ep ON h.id = ep.hospital_id
GROUP BY h.id, h.name;

-- 뷰: 시술별 가격 비교
CREATE VIEW IF NOT EXISTS v_procedure_price_comparison AS
SELECT
  ep.normalized_procedure,
  COUNT(*) AS sample_count,
  AVG(ep.price) AS avg_price,
  MIN(ep.price) AS min_price,
  MAX(ep.price) AS max_price,
  AVG(ep.discount_rate) AS avg_discount_rate,
  COUNT(CASE WHEN ep.validation_status = 'VIOLATION' THEN 1 END) AS violation_count
FROM extracted_prices ep
WHERE ep.normalized_procedure IS NOT NULL
GROUP BY ep.normalized_procedure
HAVING sample_count >= 3;
