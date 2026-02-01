-- ================================================================
-- MADMEDCHECK 가격 DB - Phase 2
-- bridge_procedure_aliases (시술명 동의어 매핑) - 수정본
-- ================================================================
-- FK 제약 제거: procedures 테이블에 없는 시술도 별칭 등록 가능
-- ================================================================

-- 테이블 생성
CREATE TABLE IF NOT EXISTS bridge_procedure_aliases (
  id TEXT PRIMARY KEY,
  
  -- 시술 매핑 (FK 제약 없음 - 유연성)
  procedure_id TEXT NOT NULL,
  procedure_name TEXT,                          -- 시술명 (참조용)
  
  -- 별칭 정보
  alias TEXT NOT NULL,
  alias_type TEXT DEFAULT 'common',             -- common, brand, abbreviation, typo, english, korean
  
  -- 매칭 설정
  is_exact_match INTEGER DEFAULT 1,
  match_priority INTEGER DEFAULT 0,
  
  -- 메타데이터
  source TEXT,
  confidence REAL DEFAULT 1.0,
  usage_count INTEGER DEFAULT 0,
  
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  
  UNIQUE(procedure_id, alias)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_aliases_procedure ON bridge_procedure_aliases(procedure_id);
CREATE INDEX IF NOT EXISTS idx_aliases_alias ON bridge_procedure_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_aliases_type ON bridge_procedure_aliases(alias_type);
CREATE INDEX IF NOT EXISTS idx_aliases_priority ON bridge_procedure_aliases(match_priority DESC);
CREATE INDEX IF NOT EXISTS idx_aliases_active ON bridge_procedure_aliases(is_active);
CREATE INDEX IF NOT EXISTS idx_aliases_alias_lower ON bridge_procedure_aliases(lower(alias));

-- ================================================================
-- 장비-시술 매핑 테이블
-- ================================================================

CREATE TABLE IF NOT EXISTS bridge_equipment_procedures (
  id TEXT PRIMARY KEY,
  
  equipment_name TEXT NOT NULL,
  equipment_brand TEXT,
  equipment_model TEXT,
  
  procedure_id TEXT NOT NULL,
  procedure_name TEXT,
  
  default_unit_id TEXT,
  equipment_aliases TEXT,
  
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_equip_name ON bridge_equipment_procedures(equipment_name);
CREATE INDEX IF NOT EXISTS idx_equip_procedure ON bridge_equipment_procedures(procedure_id);

-- ================================================================
-- 초기 데이터: HIFU 시술 별칭
-- ================================================================

-- 울쎄라
INSERT OR REPLACE INTO bridge_procedure_aliases (id, procedure_id, procedure_name, alias, alias_type, match_priority) VALUES
('ALIAS-ULTHERA-001', 'PROC-LIFT-HIFU-001', '울쎄라', '울쎄라', 'brand', 100),
('ALIAS-ULTHERA-002', 'PROC-LIFT-HIFU-001', '울쎄라', 'ulthera', 'english', 100),
('ALIAS-ULTHERA-003', 'PROC-LIFT-HIFU-001', '울쎄라', 'ultherapy', 'english', 100),
('ALIAS-ULTHERA-004', 'PROC-LIFT-HIFU-001', '울쎄라', '울쎄라피', 'brand', 90),
('ALIAS-ULTHERA-005', 'PROC-LIFT-HIFU-001', '울쎄라', '울쎄라 리프팅', 'common', 80),
('ALIAS-ULTHERA-006', 'PROC-LIFT-HIFU-001', '울쎄라', '울쎄라리프팅', 'common', 80);

-- 울트라포머
INSERT OR REPLACE INTO bridge_procedure_aliases (id, procedure_id, procedure_name, alias, alias_type, match_priority) VALUES
('ALIAS-ULTRA-001', 'PROC-LIFT-HIFU-002', '울트라포머', '울트라포머', 'brand', 100),
('ALIAS-ULTRA-002', 'PROC-LIFT-HIFU-002', '울트라포머', 'ultraformer', 'english', 100),
('ALIAS-ULTRA-003', 'PROC-LIFT-HIFU-002', '울트라포머', '울트라포머3', 'brand', 95),
('ALIAS-ULTRA-004', 'PROC-LIFT-HIFU-002', '울트라포머', '울트라포머 MPT', 'brand', 95),
('ALIAS-ULTRA-005', 'PROC-LIFT-HIFU-002', '울트라포머', 'MPT', 'abbreviation', 70),
('ALIAS-ULTRA-006', 'PROC-LIFT-HIFU-002', '울트라포머', '울포', 'abbreviation', 60);

-- 슈링크
INSERT OR REPLACE INTO bridge_procedure_aliases (id, procedure_id, procedure_name, alias, alias_type, match_priority) VALUES
('ALIAS-SHRINK-001', 'PROC-LIFT-HIFU-003', '슈링크', '슈링크', 'brand', 100),
('ALIAS-SHRINK-002', 'PROC-LIFT-HIFU-003', '슈링크', 'shrink', 'english', 100),
('ALIAS-SHRINK-003', 'PROC-LIFT-HIFU-003', '슈링크', '슈링크 유니버스', 'brand', 95),
('ALIAS-SHRINK-004', 'PROC-LIFT-HIFU-003', '슈링크', '슈링크유니버스', 'brand', 95);

-- 리니어지
INSERT OR REPLACE INTO bridge_procedure_aliases (id, procedure_id, procedure_name, alias, alias_type, match_priority) VALUES
('ALIAS-LINEAR-001', 'PROC-LIFT-HIFU-004', '리니어지', '리니어지', 'brand', 100),
('ALIAS-LINEAR-002', 'PROC-LIFT-HIFU-004', '리니어지', '리니어Z', 'brand', 100),
('ALIAS-LINEAR-003', 'PROC-LIFT-HIFU-004', '리니어지', 'linearz', 'english', 100),
('ALIAS-LINEAR-004', 'PROC-LIFT-HIFU-004', '리니어지', '리니어', 'abbreviation', 70);

-- ================================================================
-- 초기 데이터: ONDA 리프팅 (줄 단위)
-- ================================================================

INSERT OR REPLACE INTO bridge_procedure_aliases (id, procedure_id, procedure_name, alias, alias_type, match_priority) VALUES
('ALIAS-ONDA-001', 'PROC-LIFT-ONDA-001', 'ONDA 리프팅', '온다', 'brand', 100),
('ALIAS-ONDA-002', 'PROC-LIFT-ONDA-001', 'ONDA 리프팅', 'ONDA', 'english', 100),
('ALIAS-ONDA-003', 'PROC-LIFT-ONDA-001', 'ONDA 리프팅', 'onda', 'english', 100),
('ALIAS-ONDA-004', 'PROC-LIFT-ONDA-001', 'ONDA 리프팅', '온다리프팅', 'common', 90),
('ALIAS-ONDA-005', 'PROC-LIFT-ONDA-001', 'ONDA 리프팅', '온다 리프팅', 'common', 90),
('ALIAS-ONDA-006', 'PROC-LIFT-ONDA-001', 'ONDA 리프팅', '온다쿨웨이브', 'brand', 85),
('ALIAS-ONDA-007', 'PROC-LIFT-ONDA-001', 'ONDA 리프팅', 'ONDA Coolwaves', 'english', 85);

-- ================================================================
-- 초기 데이터: 고주파 (RF) 시술
-- ================================================================

-- 써마지
INSERT OR REPLACE INTO bridge_procedure_aliases (id, procedure_id, procedure_name, alias, alias_type, match_priority) VALUES
('ALIAS-THERMAGE-001', 'PROC-LIFT-RF-001', '써마지', '써마지', 'brand', 100),
('ALIAS-THERMAGE-002', 'PROC-LIFT-RF-001', '써마지', 'thermage', 'english', 100),
('ALIAS-THERMAGE-003', 'PROC-LIFT-RF-001', '써마지', '써마지FLX', 'brand', 95),
('ALIAS-THERMAGE-004', 'PROC-LIFT-RF-001', '써마지', '써마지 FLX', 'brand', 95),
('ALIAS-THERMAGE-005', 'PROC-LIFT-RF-001', '써마지', '서마지', 'typo', 60),
('ALIAS-THERMAGE-006', 'PROC-LIFT-RF-001', '써마지', 'FLX', 'abbreviation', 50);

-- 인모드
INSERT OR REPLACE INTO bridge_procedure_aliases (id, procedure_id, procedure_name, alias, alias_type, match_priority) VALUES
('ALIAS-INMODE-001', 'PROC-LIFT-RF-002', '인모드', '인모드', 'brand', 100),
('ALIAS-INMODE-002', 'PROC-LIFT-RF-002', '인모드', 'inmode', 'english', 100),
('ALIAS-INMODE-003', 'PROC-LIFT-RF-002', '인모드', '인모드 리프팅', 'common', 90);

-- ================================================================
-- 초기 데이터: 필러/주사 시술
-- ================================================================

-- 리쥬란
INSERT OR REPLACE INTO bridge_procedure_aliases (id, procedure_id, procedure_name, alias, alias_type, match_priority) VALUES
('ALIAS-REJURAN-001', 'PROC-INJ-SKIN-001', '리쥬란', '리쥬란', 'brand', 100),
('ALIAS-REJURAN-002', 'PROC-INJ-SKIN-001', '리쥬란', 'rejuran', 'english', 100),
('ALIAS-REJURAN-003', 'PROC-INJ-SKIN-001', '리쥬란', '리쥬란힐러', 'brand', 95),
('ALIAS-REJURAN-004', 'PROC-INJ-SKIN-001', '리쥬란', '리쥬란 힐러', 'brand', 95),
('ALIAS-REJURAN-005', 'PROC-INJ-SKIN-001', '리쥬란', '연어주사', 'common', 80),
('ALIAS-REJURAN-006', 'PROC-INJ-SKIN-001', '리쥬란', 'PDRN', 'abbreviation', 70);

-- 쥬베룩
INSERT OR REPLACE INTO bridge_procedure_aliases (id, procedure_id, procedure_name, alias, alias_type, match_priority) VALUES
('ALIAS-JUVELOOK-001', 'PROC-INJ-SKIN-002', '쥬베룩', '쥬베룩', 'brand', 100),
('ALIAS-JUVELOOK-002', 'PROC-INJ-SKIN-002', '쥬베룩', 'juvelook', 'english', 100),
('ALIAS-JUVELOOK-003', 'PROC-INJ-SKIN-002', '쥬베룩', '쥬베룩볼륨', 'brand', 95),
('ALIAS-JUVELOOK-004', 'PROC-INJ-SKIN-002', '쥬베룩', '주베룩', 'typo', 60);

-- ================================================================
-- 초기 데이터: 보톡스
-- ================================================================

INSERT OR REPLACE INTO bridge_procedure_aliases (id, procedure_id, procedure_name, alias, alias_type, match_priority) VALUES
('ALIAS-BOTOX-001', 'PROC-INJ-BTX-001', '보톡스', '보톡스', 'common', 100),
('ALIAS-BOTOX-002', 'PROC-INJ-BTX-001', '보톡스', 'botox', 'english', 100),
('ALIAS-BOTOX-003', 'PROC-INJ-BTX-001', '보톡스', '보툴리눔', 'common', 90),
('ALIAS-BOTOX-004', 'PROC-INJ-BTX-001', '보톡스', '보툴리눔톡신', 'common', 90),
('ALIAS-BOTOX-005', 'PROC-INJ-BTX-001', '보톡스', '나보타', 'brand', 85),
('ALIAS-BOTOX-006', 'PROC-INJ-BTX-001', '보톡스', '제오민', 'brand', 85),
('ALIAS-BOTOX-007', 'PROC-INJ-BTX-001', '보톡스', '디스포트', 'brand', 85),
('ALIAS-BOTOX-008', 'PROC-INJ-BTX-001', '보톡스', '메디톡신', 'brand', 80),
('ALIAS-BOTOX-009', 'PROC-INJ-BTX-001', '보톡스', '이노톡스', 'brand', 80),
('ALIAS-BOTOX-010', 'PROC-INJ-BTX-001', '보톡스', '코어톡스', 'brand', 80);

-- ================================================================
-- 장비-시술 매핑 초기 데이터
-- ================================================================

INSERT OR REPLACE INTO bridge_equipment_procedures (id, equipment_name, equipment_brand, procedure_id, procedure_name, default_unit_id, equipment_aliases) VALUES
('EQUIP-001', '울쎄라', 'Merz', 'PROC-LIFT-HIFU-001', '울쎄라', 'UNIT-SHOT', '["울쎄라피", "Ulthera", "Ultherapy"]'),
('EQUIP-002', '울트라포머', '클래시스', 'PROC-LIFT-HIFU-002', '울트라포머', 'UNIT-SHOT', '["울트라포머3", "울트라포머MPT", "Ultraformer"]'),
('EQUIP-003', '슈링크', '클래시스', 'PROC-LIFT-HIFU-003', '슈링크', 'UNIT-SHOT', '["슈링크유니버스", "Shrink"]'),
('EQUIP-004', '온다', 'DEKA', 'PROC-LIFT-ONDA-001', 'ONDA 리프팅', 'UNIT-JOULE', '["ONDA", "온다쿨웨이브"]'),
('EQUIP-005', '써마지', 'Solta', 'PROC-LIFT-RF-001', '써마지', 'UNIT-SHOT', '["써마지FLX", "Thermage"]'),
('EQUIP-006', '인모드', 'InMode', 'PROC-LIFT-RF-002', '인모드', 'UNIT-SHOT', '["InMode"]');

-- ================================================================
-- 뷰
-- ================================================================

CREATE VIEW IF NOT EXISTS v_procedure_aliases AS
SELECT 
  pa.id,
  pa.procedure_id,
  pa.procedure_name,
  pa.alias,
  pa.alias_type,
  pa.match_priority,
  pa.usage_count,
  pa.confidence
FROM bridge_procedure_aliases pa
WHERE pa.is_active = 1
ORDER BY pa.match_priority DESC;

CREATE VIEW IF NOT EXISTS v_alias_lookup AS
SELECT 
  lower(alias) as alias_lower,
  alias,
  procedure_id,
  procedure_name,
  match_priority
FROM bridge_procedure_aliases
WHERE is_active = 1
ORDER BY match_priority DESC;
