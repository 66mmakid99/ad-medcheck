-- ============================================
-- MEDCHECK Engine - 시술가격 모듈 v2
-- Migration: 004_pricing_v2_upgrade.sql
-- 
-- 추가 기능:
-- 1. 부위별 가격 + 샷당 단가
-- 2. 스크린샷 원본 증빙
-- 3. 매핑 승인 시스템 (오매핑 방지)
-- 4. 복합 시술 파싱
-- 5. 가격 변동 알림 (증빙 포함)
-- ============================================

-- ============================================
-- 1. 부위 표준화 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS target_areas (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT,                        -- face, body, etc
  parent_code TEXT,                     -- 상위 부위
  avg_shots INTEGER,                    -- 해당 부위 평균 샷수
  display_order INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 부위 초기 데이터
INSERT OR IGNORE INTO target_areas (id, code, name, category, avg_shots, display_order) VALUES
-- 얼굴
('TA-001', 'FACE_FULL', '얼굴 전체', 'face', 500, 1),
('TA-002', 'FACE_LOWER', '하안면', 'face', 300, 2),
('TA-003', 'FACE_UPPER', '상안면', 'face', 200, 3),
('TA-004', 'EYE', '눈가', 'face', 100, 4),
('TA-005', 'FOREHEAD', '이마', 'face', 150, 5),
('TA-006', 'CHEEK', '볼', 'face', 150, 6),
('TA-007', 'CHIN', '턱', 'face', 100, 7),
('TA-008', 'JAWLINE', '턱라인', 'face', 150, 8),
('TA-009', 'NECK', '목', 'face', 200, 9),
('TA-010', 'NASOLABIAL', '팔자', 'face', 80, 10),
-- 바디
('TA-011', 'BODY_ARM', '팔', 'body', 300, 20),
('TA-012', 'BODY_BELLY', '복부', 'body', 500, 21),
('TA-013', 'BODY_THIGH', '허벅지', 'body', 600, 22),
('TA-014', 'BODY_BACK', '등', 'body', 800, 23),
('TA-015', 'BODY_HIP', '엉덩이', 'body', 400, 24),
-- 기타
('TA-099', 'UNKNOWN', '부위 미상', 'unknown', NULL, 99);

-- ============================================
-- 2. 가격 기록 v2 (부위별 + 샷당 단가)
-- ============================================
CREATE TABLE IF NOT EXISTS price_records_v2 (
  id TEXT PRIMARY KEY,
  procedure_id TEXT NOT NULL,
  hospital_id TEXT,
  
  -- 💰 가격 정보
  price INTEGER NOT NULL,
  price_type TEXT DEFAULT 'fixed',      -- fixed, starting, range_min, range_max
  original_text TEXT,                   -- 원본 텍스트 그대로
  
  -- 📍 부위 정보
  target_area_code TEXT NOT NULL,       -- FACE_FULL, EYE, etc
  target_area_detail TEXT,              -- 추가 상세 (눈가+이마 등)
  
  -- 📊 단가 계산용
  shot_count INTEGER,                   -- 샷수
  volume_cc REAL,                       -- 용량 (cc, ml)
  cartridge_type TEXT,                  -- 카트리지 종류
  session_count INTEGER DEFAULT 1,      -- 회차 (1회, 3회 패키지 등)
  
  -- 💵 계산된 단가 (자동)
  price_per_shot REAL,                  -- 샷당 단가
  price_per_cc REAL,                    -- cc당 단가
  price_per_session REAL,               -- 회당 단가
  
  -- 🖼️ 원본 증빙 (핵심!)
  source_url TEXT,
  screenshot_id TEXT,                   -- price_screenshots 참조
  ocr_raw_text TEXT,                    -- OCR 원본 텍스트
  ocr_confidence REAL,                  -- OCR 신뢰도
  
  -- 포함사항
  is_event INTEGER DEFAULT 0,
  event_name TEXT,
  event_end_date TEXT,
  includes_anesthesia INTEGER,          -- 마취비 포함
  includes_followup INTEGER,            -- 사후관리 포함
  includes_items TEXT,                  -- JSON ["마취비", "사후관리"]
  
  -- 완성도
  completeness_score INTEGER DEFAULT 0,
  missing_fields TEXT,                  -- JSON ["shot_count", "target_area"]
  
  -- 메타
  source_type TEXT DEFAULT 'crawl',     -- crawl, manual, api
  is_verified INTEGER DEFAULT 0,
  collected_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  
  FOREIGN KEY (procedure_id) REFERENCES procedures(id),
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
);

-- ============================================
-- 3. 스크린샷 저장 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS price_screenshots (
  id TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  
  -- 전체 스크린샷
  full_screenshot_path TEXT,            -- 저장 경로
  full_screenshot_url TEXT,             -- 접근 URL
  screenshot_at TEXT,                   -- 캡쳐 시점
  
  -- 크롭된 가격 영역들
  crop_areas TEXT,                      -- JSON [{ path, url, x, y, w, h, ocr_text }, ...]
  
  -- 변경 감지
  page_hash TEXT,                       -- 페이지 변경 감지용 해시
  is_changed INTEGER DEFAULT 0,         -- 이전 대비 변경됨?
  previous_screenshot_id TEXT,          -- 이전 스크린샷 (비교용)
  change_detected_at TEXT,
  
  -- 메타
  page_title TEXT,
  viewport_width INTEGER,
  viewport_height INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
);

-- ============================================
-- 4. 매핑 후보 테이블 (오매핑 방지)
-- ============================================
CREATE TABLE IF NOT EXISTS mapping_candidates (
  id TEXT PRIMARY KEY,
  alias_name TEXT NOT NULL,             -- 수집된 시술명 (핑크주사)
  normalized_name TEXT,                 -- 정규화 (소문자, 공백제거)
  suggested_procedure_id TEXT,          -- AI 추천 원본 시술
  
  -- 수집 통계
  total_cases INTEGER DEFAULT 1,        -- 총 발견 횟수
  unique_hospitals INTEGER DEFAULT 1,   -- 발견된 병원 수
  hospital_ids TEXT,                    -- JSON ["HOSP-001", "HOSP-002"]
  first_seen_at TEXT,
  last_seen_at TEXT,
  
  -- 수집된 가격 분포
  price_samples TEXT,                   -- JSON [500000, 480000, 520000]
  price_avg INTEGER,
  price_min INTEGER,
  price_max INTEGER,
  price_stddev REAL,                    -- 표준편차 (이상치 탐지용)
  
  -- 분석 결과
  text_similarity REAL,                 -- AI 텍스트 유사도 (0-100)
  price_similarity REAL,                -- 가격 범위 유사도 (0-100)
  ai_reasoning TEXT,                    -- AI 판단 근거
  
  -- 승인 조건 충족 여부
  meets_case_threshold INTEGER DEFAULT 0,     -- 5건↑?
  meets_hospital_threshold INTEGER DEFAULT 0, -- 3개 병원↑?
  meets_time_threshold INTEGER DEFAULT 0,     -- 7일↑?
  meets_price_threshold INTEGER DEFAULT 0,    -- 원본 ±40%?
  meets_similarity_threshold INTEGER DEFAULT 0, -- 유사도 70%↑?
  
  -- 상태
  status TEXT DEFAULT 'collecting',
  -- collecting: 수집 중
  -- pending_review: 조건 충족, 검토 대기
  -- approved: 승인됨
  -- rejected: 거절됨
  -- merged: 다른 별칭과 병합됨
  
  reviewed_by TEXT,
  reviewed_at TEXT,
  rejection_reason TEXT,
  approved_alias_id TEXT,               -- 승인 시 생성된 alias ID
  
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 5. 시술 별칭 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS procedure_aliases (
  id TEXT PRIMARY KEY,
  procedure_id TEXT NOT NULL,
  alias_name TEXT NOT NULL,
  normalized_name TEXT,
  
  alias_type TEXT DEFAULT 'marketing',  -- marketing, brand, slang, typo, regional
  confidence INTEGER DEFAULT 100,       -- 신뢰도 (승인된 건 100)
  source TEXT,                          -- 출처 (어디서 발견?)
  source_hospital_id TEXT,              -- 특정 병원 한정 별칭?
  
  is_verified INTEGER DEFAULT 1,        -- 검증됨
  verified_by TEXT,
  verified_at TEXT,
  
  mapping_candidate_id TEXT,            -- 원본 후보 ID (추적용)
  note TEXT,
  
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(procedure_id, alias_name),
  FOREIGN KEY (procedure_id) REFERENCES procedures(id)
);

-- ============================================
-- 6. 복합 시술 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS procedure_packages (
  id TEXT PRIMARY KEY,
  package_name TEXT NOT NULL,           -- 울써마지
  normalized_name TEXT,
  
  package_type TEXT DEFAULT 'combo',    -- combo(복합), course(코스), set(세트)
  description TEXT,
  is_official INTEGER DEFAULT 0,        -- 공식 패키지명? vs 병원 자체 명칭
  
  -- 가격 분석용
  expected_price_min INTEGER,           -- 구성 시술 합계 최소
  expected_price_max INTEGER,           -- 구성 시술 합계 최대
  
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 7. 복합 시술 구성
-- ============================================
CREATE TABLE IF NOT EXISTS package_components (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  procedure_id TEXT NOT NULL,
  
  quantity INTEGER DEFAULT 1,           -- 몇 회
  unit TEXT,                            -- 회, 샷, cc 등
  unit_amount INTEGER,                  -- 300 (샷)
  target_area_code TEXT,                -- 해당 구성의 부위
  ratio REAL,                           -- 구성 비율 (0.0~1.0)
  
  display_order INTEGER,
  note TEXT,
  
  FOREIGN KEY (package_id) REFERENCES procedure_packages(id),
  FOREIGN KEY (procedure_id) REFERENCES procedures(id)
);

-- ============================================
-- 8. 알려진 복합 시술 사전 (자동 파싱용)
-- ============================================
CREATE TABLE IF NOT EXISTS known_combinations (
  id TEXT PRIMARY KEY,
  combo_name TEXT NOT NULL,             -- 울써마지
  combo_pattern TEXT,                   -- 정규식 패턴 (울써마지|울쎄라써마지)
  
  component_1_name TEXT NOT NULL,       -- 울쎄라
  component_1_id TEXT,
  component_2_name TEXT NOT NULL,       -- 써마지
  component_2_id TEXT,
  component_3_name TEXT,
  component_3_id TEXT,
  
  is_verified INTEGER DEFAULT 1,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 알려진 복합 시술 초기 데이터
INSERT OR IGNORE INTO known_combinations (id, combo_name, combo_pattern, component_1_name, component_2_name) VALUES
('KC-001', '울써마지', '울써마지|울쎄라써마지', '울쎄라', '써마지'),
('KC-002', '슈링크턱스', '슈링크턱스|슈링크울쎄라', '슈링크', '울쎄라'),
('KC-003', '인모드듀오', '인모드듀오|인모드듀얼', '인모드FX', '인모드GFX'),
('KC-004', '써마지볼륨', '써마지볼륨', '써마지', '볼륨필러'),
('KC-005', '리프테라울쎄라', '리프테라울쎄라|리프울', '리프테라', '울쎄라');

-- ============================================
-- 9. 수집된 원본 시술명 (매핑 전 보존)
-- ============================================
CREATE TABLE IF NOT EXISTS collected_procedure_names (
  id TEXT PRIMARY KEY,
  raw_name TEXT NOT NULL,               -- 크롤링된 그대로
  normalized_name TEXT,                 -- 정규화
  
  -- 매핑 결과
  mapped_procedure_id TEXT,             -- 매핑된 시술 ID
  mapped_package_id TEXT,               -- 매핑된 패키지 ID
  mapped_alias_id TEXT,                 -- 매핑에 사용된 별칭
  mapping_confidence INTEGER,           -- 매핑 신뢰도
  mapping_method TEXT,                  -- direct, alias, package, ai, manual
  
  mapping_status TEXT DEFAULT 'pending',
  -- pending: 매핑 대기
  -- auto_mapped: 자동 매핑됨 (80%↑)
  -- candidate: 후보로 등록됨 (80%↓)
  -- manual_mapped: 수동 매핑
  -- unmappable: 매핑 불가
  
  -- 수집 정보
  source_url TEXT,
  source_hospital_id TEXT,
  price_record_id TEXT,                 -- 연결된 가격 기록
  
  occurrence_count INTEGER DEFAULT 1,   -- 발견 횟수
  first_seen_at TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 10. 가격 변동 알림 (증빙 포함!)
-- ============================================
CREATE TABLE IF NOT EXISTS price_change_alerts (
  id TEXT PRIMARY KEY,
  
  -- 관계
  subscriber_hospital_id TEXT NOT NULL, -- 알림 받는 병원
  competitor_hospital_id TEXT NOT NULL, -- 가격 바꾼 경쟁사
  procedure_id TEXT NOT NULL,
  
  -- 변경 내용
  previous_price INTEGER,
  current_price INTEGER,
  price_change INTEGER,                 -- 차이
  price_change_percent REAL,            -- 변동률
  
  -- 부위/샷수 정보 (핵심!)
  target_area_code TEXT,
  target_area_name TEXT,
  previous_shot_count INTEGER,
  current_shot_count INTEGER,
  previous_price_per_shot REAL,
  current_price_per_shot REAL,
  shot_price_change_percent REAL,       -- 샷당 단가 변동률
  
  -- 스크린샷 증빙 (핵심!)
  previous_screenshot_id TEXT,
  previous_screenshot_url TEXT,
  current_screenshot_id TEXT,
  current_screenshot_url TEXT,
  source_page_url TEXT,
  
  -- AI 분석
  ai_analysis TEXT,
  change_reason_guess TEXT,             -- 이벤트, 가격인하, 오류 등
  
  -- 비교 정보 (구독자 병원과)
  subscriber_same_procedure_price INTEGER,
  price_gap INTEGER,                    -- 경쟁사와 가격 차이
  price_gap_percent REAL,
  
  -- 상태
  alert_type TEXT DEFAULT 'price_drop', -- price_drop, price_rise, new_procedure, removed
  severity TEXT DEFAULT 'info',         -- info, warning, urgent
  is_read INTEGER DEFAULT 0,
  read_at TEXT,
  is_archived INTEGER DEFAULT 0,
  
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 11. 경쟁사 모니터링 설정
-- ============================================
CREATE TABLE IF NOT EXISTS competitor_settings (
  id TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL,            -- 구독 병원
  
  -- 경쟁사 목록
  competitor_ids TEXT,                  -- JSON ["HOSP-001", "HOSP-002"]
  auto_detect INTEGER DEFAULT 1,        -- 자동 탐지 사용?
  
  -- 자동 탐지 조건
  same_region INTEGER DEFAULT 1,        -- 같은 지역
  same_category INTEGER DEFAULT 1,      -- 같은 진료과
  max_competitors INTEGER DEFAULT 10,   -- 최대 경쟁사 수
  
  region TEXT,
  category TEXT,
  
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 12. 가격 알림 설정
-- ============================================
CREATE TABLE IF NOT EXISTS price_watch_settings (
  id TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL,
  
  -- 모니터링 대상
  watch_type TEXT,                      -- all, competitor, procedure
  target_hospital_id TEXT,              -- 특정 경쟁사
  target_procedure_id TEXT,             -- 특정 시술
  
  -- 알림 조건
  alert_on_drop INTEGER DEFAULT 1,      -- 가격 인하 시
  alert_on_rise INTEGER DEFAULT 0,      -- 가격 인상 시
  alert_on_new INTEGER DEFAULT 1,       -- 신규 시술 등록 시
  threshold_percent INTEGER DEFAULT 10, -- 몇 % 변동 시
  
  -- 알림 방법
  notify_email INTEGER DEFAULT 1,
  notify_dashboard INTEGER DEFAULT 1,
  notify_push INTEGER DEFAULT 0,
  
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 13. 콜드콜 발송 기록
-- ============================================
CREATE TABLE IF NOT EXISTS coldcall_logs (
  id TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL,
  
  email_type TEXT,                      -- completeness, promotion, alert
  email_template TEXT,
  recipient_email TEXT,
  
  -- 내용
  subject TEXT,
  completeness_score INTEGER,
  missing_fields TEXT,                  -- JSON
  
  -- 추적
  sent_at TEXT DEFAULT (datetime('now')),
  opened_at TEXT,
  clicked_at TEXT,
  unsubscribed_at TEXT,
  
  status TEXT DEFAULT 'sent',           -- sent, opened, clicked, bounced, unsubscribed
  
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
);

-- ============================================
-- 14. 가격 히스토리 (변동 추적)
-- ============================================
CREATE TABLE IF NOT EXISTS price_history (
  id TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL,
  procedure_id TEXT NOT NULL,
  target_area_code TEXT,
  
  price INTEGER NOT NULL,
  shot_count INTEGER,
  price_per_shot REAL,
  
  screenshot_id TEXT,
  screenshot_url TEXT,
  
  recorded_at TEXT DEFAULT (datetime('now')),
  
  -- 이전 기록 참조 (연결 리스트)
  previous_history_id TEXT,
  price_change INTEGER,
  price_change_percent REAL
);

-- ============================================
-- 인덱스
-- ============================================
CREATE INDEX IF NOT EXISTS idx_price_v2_procedure ON price_records_v2(procedure_id);
CREATE INDEX IF NOT EXISTS idx_price_v2_hospital ON price_records_v2(hospital_id);
CREATE INDEX IF NOT EXISTS idx_price_v2_area ON price_records_v2(target_area_code);
CREATE INDEX IF NOT EXISTS idx_price_v2_collected ON price_records_v2(collected_at);

CREATE INDEX IF NOT EXISTS idx_screenshots_hospital ON price_screenshots(hospital_id);
CREATE INDEX IF NOT EXISTS idx_screenshots_url ON price_screenshots(source_url);

CREATE INDEX IF NOT EXISTS idx_mapping_status ON mapping_candidates(status);
CREATE INDEX IF NOT EXISTS idx_mapping_alias ON mapping_candidates(alias_name);

CREATE INDEX IF NOT EXISTS idx_aliases_procedure ON procedure_aliases(procedure_id);
CREATE INDEX IF NOT EXISTS idx_aliases_name ON procedure_aliases(alias_name);

CREATE INDEX IF NOT EXISTS idx_collected_names ON collected_procedure_names(raw_name);
CREATE INDEX IF NOT EXISTS idx_collected_status ON collected_procedure_names(mapping_status);

CREATE INDEX IF NOT EXISTS idx_alerts_subscriber ON price_change_alerts(subscriber_hospital_id);
CREATE INDEX IF NOT EXISTS idx_alerts_competitor ON price_change_alerts(competitor_hospital_id);
CREATE INDEX IF NOT EXISTS idx_alerts_read ON price_change_alerts(is_read);

CREATE INDEX IF NOT EXISTS idx_history_hospital ON price_history(hospital_id, procedure_id);

-- ============================================
-- procedures 테이블 확장 (기존 테이블 ALTER)
-- ============================================
-- SQLite에서는 ALTER TABLE ADD COLUMN만 가능
-- 이미 존재하면 에러 무시

-- 공식 명칭
-- ALTER TABLE procedures ADD COLUMN official_name TEXT;
-- 제조사
-- ALTER TABLE procedures ADD COLUMN manufacturer TEXT;
-- 장비 세대
-- ALTER TABLE procedures ADD COLUMN equipment_generation TEXT;
-- 기준 단위
-- ALTER TABLE procedures ADD COLUMN base_unit TEXT;
-- 소모품 여부
-- ALTER TABLE procedures ADD COLUMN has_consumable INTEGER DEFAULT 0;
-- 부위별 가격 다름 여부
-- ALTER TABLE procedures ADD COLUMN price_varies_by_area INTEGER DEFAULT 0;

-- ============================================
-- 초기 별칭 데이터 (자주 쓰이는 것들)
-- ============================================
INSERT OR IGNORE INTO procedure_aliases (id, procedure_id, alias_name, alias_type, confidence) VALUES
-- K-BOOSTER 별칭
('PA-001', 'PROC-SKIN-001', '핑크주사', 'marketing', 100),
('PA-002', 'PROC-SKIN-001', '물광주사', 'marketing', 90),
('PA-003', 'PROC-SKIN-001', '연예인주사', 'marketing', 85),
('PA-004', 'PROC-SKIN-001', 'K-BOOSTER주사', 'brand', 100),
-- 울쎄라 별칭
('PA-005', 'PROC-SKIN-008', '울쎄라리프팅', 'marketing', 100),
('PA-006', 'PROC-SKIN-008', 'HIFU울쎄라', 'marketing', 95),
-- 보톡스 별칭
('PA-007', 'PROC-SKIN-001', '보톨리눔', 'medical', 100),
('PA-008', 'PROC-SKIN-001', '보툴리눔톡신', 'medical', 100),
('PA-009', 'PROC-SKIN-001', '나보타', 'brand', 95),
('PA-010', 'PROC-SKIN-001', '제오민', 'brand', 95);

-- ============================================
-- 승인 조건 설정 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS mapping_approval_settings (
  id TEXT PRIMARY KEY,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value INTEGER NOT NULL,
  description TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO mapping_approval_settings (id, setting_key, setting_value, description) VALUES
('MAS-001', 'min_cases', 5, '최소 발견 횟수'),
('MAS-002', 'min_hospitals', 3, '최소 발견 병원 수'),
('MAS-003', 'min_days', 7, '최소 대기 일수'),
('MAS-004', 'price_tolerance_percent', 40, '가격 허용 오차 (%)'),
('MAS-005', 'min_similarity', 70, '최소 유사도 (%)'),
('MAS-006', 'auto_approve_threshold', 80, '자동 승인 신뢰도 (%)');

-- ============================================
-- 완료!
-- ============================================
