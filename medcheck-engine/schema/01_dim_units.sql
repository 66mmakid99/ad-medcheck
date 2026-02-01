-- ================================================================
-- MADMEDCHECK 가격 DB - Phase 1
-- dim_units (단위 마스터 테이블)
-- ================================================================
-- 목적: 시술 가격의 단위를 정규화하여 "샷당 가격" 비교 가능하게 함
-- 예시: 울쎄라 300샷 79만원 vs 500샷 100만원 → 샷당 2,633원 vs 2,000원
-- ================================================================

-- 테이블 생성
CREATE TABLE IF NOT EXISTS dim_units (
  -- Primary Key
  id TEXT PRIMARY KEY,                    -- 예: UNIT-SHOT, UNIT-CC
  
  -- Unit Identity
  unit_type TEXT NOT NULL,                -- shot, cc, line, area, unit, session, mg
  unit_code TEXT UNIQUE NOT NULL,         -- 시스템 코드 (SHOT, CC, LINE...)
  
  -- Display Names
  unit_name_ko TEXT NOT NULL,             -- 한국어: 샷, 씨씨, 줄, 부위
  unit_name_en TEXT,                      -- 영어: shot, cc, line, area
  unit_symbol TEXT,                       -- 표시 기호: 샷, cc, 줄, U
  
  -- OCR Parsing Patterns (JSON 배열)
  -- OCR에서 단위 추출 시 매칭할 패턴들
  regex_patterns TEXT,                    -- ["샷", "shot", "S", "SHOT"]
  
  -- Unit Conversion (기준 단위로 환산)
  -- 예: 1만줄 = 100샷으로 환산하여 비교
  base_unit_id TEXT,                      -- 기준 단위 ID (NULL이면 자신이 기준)
  conversion_rate REAL DEFAULT 1.0,       -- 변환 비율 (1만줄 → 100샷이면 0.01)
  
  -- Validation Rules
  min_typical_value REAL,                 -- 일반적 최소값 (이상치 감지용)
  max_typical_value REAL,                 -- 일반적 최대값 (이상치 감지용)
  
  -- 시술 카테고리 매핑 (어떤 시술에 주로 쓰이는 단위인지)
  applicable_categories TEXT,             -- JSON: ["lifting", "injection", "laser"]
  
  -- Metadata
  description TEXT,                       -- 단위 설명
  sort_order INTEGER DEFAULT 0,           -- 정렬 순서
  is_active INTEGER DEFAULT 1,            -- 활성화 여부
  
  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  
  -- Constraints
  FOREIGN KEY (base_unit_id) REFERENCES dim_units(id)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_units_type ON dim_units(unit_type);
CREATE INDEX IF NOT EXISTS idx_units_code ON dim_units(unit_code);
CREATE INDEX IF NOT EXISTS idx_units_active ON dim_units(is_active);

-- ================================================================
-- 초기 데이터 삽입
-- ================================================================

-- 1. 샷 (Shot) - HIFU/고주파 리프팅의 기준 단위
-- ⚠️ 중요: 샷은 HIFU(울쎄라, 울트라포머), 고주파(써마지) 전용!
-- ONDA의 줄(Joule)과는 완전히 다른 시술이므로 환산 불가!
INSERT OR REPLACE INTO dim_units (
  id, unit_type, unit_code, 
  unit_name_ko, unit_name_en, unit_symbol,
  regex_patterns,
  base_unit_id, conversion_rate,
  min_typical_value, max_typical_value,
  applicable_categories,
  description, sort_order
) VALUES (
  'UNIT-SHOT', 'count', 'SHOT',
  '샷', 'shot', '샷',
  '["샷", "shot", "Shot", "SHOT", "s샷"]',
  NULL, 1.0,
  50, 2000,
  '["hifu", "rf", "ulthera", "ultraformer", "thermage"]',
  'HIFU(울쎄라, 울트라포머), 고주파(써마지) 시술의 에너지 조사 횟수. ⚠️ ONDA 줄과 환산 불가!',
  1
);

-- 2. 씨씨 (CC) - 주사/필러의 기준 단위
INSERT OR REPLACE INTO dim_units (
  id, unit_type, unit_code,
  unit_name_ko, unit_name_en, unit_symbol,
  regex_patterns,
  base_unit_id, conversion_rate,
  min_typical_value, max_typical_value,
  applicable_categories,
  description, sort_order
) VALUES (
  'UNIT-CC', 'volume', 'CC',
  '씨씨', 'cc', 'cc',
  '["cc", "CC", "씨씨", "ml", "ML"]',
  NULL, 1.0,
  1, 20,
  '["injection", "filler", "skin_booster"]',
  '필러, 리쥬란 등 주사제 용량 단위. 1cc = 1ml',
  2
);

-- 3. 줄 (Joule) - ONDA 리프팅 전용 에너지 단위
-- ⚠️ 중요: 줄(Joule)은 ONDA 전용 단위이며, 샷(Shot)과는 완전히 다른 시술!
-- 상호 환산 불가능!
INSERT OR REPLACE INTO dim_units (
  id, unit_type, unit_code,
  unit_name_ko, unit_name_en, unit_symbol,
  regex_patterns,
  base_unit_id, conversion_rate,
  min_typical_value, max_typical_value,
  applicable_categories,
  description, sort_order
) VALUES (
  'UNIT-JOULE', 'energy', 'JOULE',
  '줄', 'joule', 'J',
  '["줄", "만줄", "J", "kJ", "joule", "주울"]',
  NULL, 1.0,  -- 기준 단위 없음 (ONDA 고유 단위)
  5000, 100000,
  '["onda"]',
  'ONDA(온다) 리프팅 전용 에너지 단위. 1만줄 = 10kJ. ⚠️ 샷(Shot)과 환산 불가!',
  3
);

-- 4. 유닛 (Unit) - 보톡스 단위
INSERT OR REPLACE INTO dim_units (
  id, unit_type, unit_code,
  unit_name_ko, unit_name_en, unit_symbol,
  regex_patterns,
  base_unit_id, conversion_rate,
  min_typical_value, max_typical_value,
  applicable_categories,
  description, sort_order
) VALUES (
  'UNIT-UNIT', 'unit', 'UNIT',
  '유닛', 'unit', 'U',
  '["유닛", "unit", "Unit", "U", "단위"]',
  NULL, 1.0,
  10, 200,
  '["botox", "toxin"]',
  '보톡스(보툴리눔 톡신) 용량 단위.',
  4
);

-- 5. 부위 (Area) - 레이저/피부 시술
INSERT OR REPLACE INTO dim_units (
  id, unit_type, unit_code,
  unit_name_ko, unit_name_en, unit_symbol,
  regex_patterns,
  base_unit_id, conversion_rate,
  min_typical_value, max_typical_value,
  applicable_categories,
  description, sort_order
) VALUES (
  'UNIT-AREA', 'area', 'AREA',
  '부위', 'area', '부위',
  '["부위", "area", "군데", "곳", "site"]',
  NULL, 1.0,
  1, 10,
  '["laser", "skin", "body"]',
  '시술 부위 단위. 얼굴 전체, 이마, 볼 등.',
  5
);

-- 6. 회 (Session) - 패키지/횟수 단위
INSERT OR REPLACE INTO dim_units (
  id, unit_type, unit_code,
  unit_name_ko, unit_name_en, unit_symbol,
  regex_patterns,
  base_unit_id, conversion_rate,
  min_typical_value, max_typical_value,
  applicable_categories,
  description, sort_order
) VALUES (
  'UNIT-SESSION', 'session', 'SESSION',
  '회', 'session', '회',
  '["회", "번", "차", "session", "times", "회차"]',
  NULL, 1.0,
  1, 20,
  '["package", "treatment", "all"]',
  '시술 횟수/회차 단위. 패키지 상품에 주로 사용.',
  6
);

-- 7. mg (밀리그램) - 약물/주사제 용량
INSERT OR REPLACE INTO dim_units (
  id, unit_type, unit_code,
  unit_name_ko, unit_name_en, unit_symbol,
  regex_patterns,
  base_unit_id, conversion_rate,
  min_typical_value, max_typical_value,
  applicable_categories,
  description, sort_order
) VALUES (
  'UNIT-MG', 'weight', 'MG',
  '밀리그램', 'mg', 'mg',
  '["mg", "MG", "밀리그램"]',
  NULL, 1.0,
  1, 1000,
  '["injection", "medication"]',
  '약물 용량 단위.',
  7
);

-- 8. 바이알 (Vial) - 주사제 용기 단위
INSERT OR REPLACE INTO dim_units (
  id, unit_type, unit_code,
  unit_name_ko, unit_name_en, unit_symbol,
  regex_patterns,
  base_unit_id, conversion_rate,
  min_typical_value, max_typical_value,
  applicable_categories,
  description, sort_order
) VALUES (
  'UNIT-VIAL', 'container', 'VIAL',
  '바이알', 'vial', 'vial',
  '["바이알", "vial", "Vial", "병"]',
  NULL, 1.0,
  1, 5,
  '["injection", "filler", "skin_booster"]',
  '주사제 용기(바이알) 단위. 리쥬란 1바이알 = 2cc 등.',
  8
);

-- 9. 앰플 (Ampule) - 주사제 용기 단위
INSERT OR REPLACE INTO dim_units (
  id, unit_type, unit_code,
  unit_name_ko, unit_name_en, unit_symbol,
  regex_patterns,
  base_unit_id, conversion_rate,
  min_typical_value, max_typical_value,
  applicable_categories,
  description, sort_order
) VALUES (
  'UNIT-AMPULE', 'container', 'AMPULE',
  '앰플', 'ampule', '앰플',
  '["앰플", "ampule", "amp", "AMP"]',
  NULL, 1.0,
  1, 10,
  '["injection", "skin_booster"]',
  '주사제 앰플 단위.',
  9
);

-- 10. 전체 (Full) - 얼굴 전체, 전신 등
INSERT OR REPLACE INTO dim_units (
  id, unit_type, unit_code,
  unit_name_ko, unit_name_en, unit_symbol,
  regex_patterns,
  base_unit_id, conversion_rate,
  min_typical_value, max_typical_value,
  applicable_categories,
  description, sort_order
) VALUES (
  'UNIT-FULL', 'scope', 'FULL',
  '전체', 'full', '전체',
  '["전체", "풀", "full", "Full", "올", "전신", "얼굴전체"]',
  NULL, 1.0,
  1, 1,
  '["lifting", "laser", "body"]',
  '전체 시술 범위. 얼굴 전체, 전신 등.',
  10
);

-- ================================================================
-- 단위 동의어 매핑 뷰 (OCR 파싱 편의용)
-- ================================================================
CREATE VIEW IF NOT EXISTS v_unit_patterns AS
SELECT 
  id,
  unit_code,
  unit_name_ko,
  json_each.value AS pattern
FROM dim_units, json_each(dim_units.regex_patterns)
WHERE is_active = 1;

-- ================================================================
-- 단위 변환 도우미 함수용 뷰
-- ================================================================
CREATE VIEW IF NOT EXISTS v_unit_conversions AS
SELECT 
  u1.id AS from_unit_id,
  u1.unit_code AS from_unit,
  u1.unit_name_ko AS from_name,
  COALESCE(u2.id, u1.id) AS to_unit_id,
  COALESCE(u2.unit_code, u1.unit_code) AS to_unit,
  COALESCE(u2.unit_name_ko, u1.unit_name_ko) AS to_name,
  u1.conversion_rate
FROM dim_units u1
LEFT JOIN dim_units u2 ON u1.base_unit_id = u2.id
WHERE u1.is_active = 1;
