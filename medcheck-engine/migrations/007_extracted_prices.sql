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

-- [D1 호환성] TRIGGER 제거됨 - 애플리케이션 레벨에서 updated_at 직접 설정
-- [D1 호환성] VIEW 제거됨 - 애플리케이션 레벨 쿼리로 대체
-- v_hospital_extracted_prices: API에서 JOIN 쿼리 직접 실행
-- v_procedure_price_comparison: API에서 GROUP BY 쿼리 직접 실행
