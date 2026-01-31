-- 007_extracted_prices.sql
-- OCR로 추출된 가격 정보 저장 테이블

-- 1. 이미지 OCR 결과 테이블
CREATE TABLE IF NOT EXISTS ocr_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hospital_id INTEGER,
  image_url TEXT NOT NULL,
  source_url TEXT,
  classification_type TEXT,
  classification_confidence REAL,
  extracted_text TEXT,
  text_confidence REAL,
  visual_emphasis TEXT,
  violations TEXT,
  processing_time_ms INTEGER,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE SET NULL
);

-- 2. 추출된 가격 정보 테이블
CREATE TABLE IF NOT EXISTS extracted_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ocr_result_id INTEGER NOT NULL,
  hospital_id INTEGER,
  procedure_name TEXT NOT NULL,
  normalized_procedure TEXT,
  procedure_id INTEGER,
  price INTEGER NOT NULL,
  original_price INTEGER,
  discount_rate REAL,
  shots INTEGER,
  area TEXT,
  price_type TEXT NOT NULL,
  original_text TEXT,
  extraction_confidence REAL,
  price_per_unit INTEGER,
  is_promotion INTEGER DEFAULT 0,
  has_time_limit INTEGER DEFAULT 0,
  conditions TEXT,
  validation_status TEXT,
  validation_result TEXT,
  risk_score INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (ocr_result_id) REFERENCES ocr_results(id) ON DELETE CASCADE,
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE SET NULL,
  FOREIGN KEY (procedure_id) REFERENCES procedures(id) ON DELETE SET NULL
);

-- 3. 가격 광고 위반 기록 테이블
CREATE TABLE IF NOT EXISTS price_ad_violations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  extracted_price_id INTEGER NOT NULL,
  rule_code TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (extracted_price_id) REFERENCES extracted_prices(id) ON DELETE CASCADE
);

-- 4. 이미지 위반 기록 테이블
CREATE TABLE IF NOT EXISTS image_violations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ocr_result_id INTEGER NOT NULL,
  violation_type TEXT NOT NULL,
  related_text TEXT,
  severity TEXT NOT NULL,
  description TEXT NOT NULL,
  legal_basis TEXT,
  confidence REAL,
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
HAVING COUNT(*) >= 3;
