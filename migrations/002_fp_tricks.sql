-- MEDCHECK Engine 고도화 마이그레이션
-- 오탐(False Positive) 관리 + 꼼수 패턴 수집 시스템

-- 1. 오탐 사례 테이블
CREATE TABLE IF NOT EXISTS false_positive_cases (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  pattern_id TEXT NOT NULL,
  matched_text TEXT NOT NULL,
  full_context TEXT NOT NULL,
  source_url TEXT,
  fp_type TEXT NOT NULL DEFAULT 'context_dependent',
  reporter_type TEXT DEFAULT 'user',
  report_reason TEXT,
  status TEXT DEFAULT 'pending',
  resolution TEXT,
  resolution_note TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  similar_cases_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fp_pattern ON false_positive_cases(pattern_id);
CREATE INDEX IF NOT EXISTS idx_fp_status ON false_positive_cases(status);

-- 2. 예외 규칙 테이블
CREATE TABLE IF NOT EXISTS pattern_exceptions (
  id TEXT PRIMARY KEY,
  pattern_id TEXT NOT NULL,
  exception_type TEXT NOT NULL,
  exception_value TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  hit_count INTEGER DEFAULT 0,
  source_fp_ids TEXT,
  created_reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  created_by TEXT DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_exc_pattern ON pattern_exceptions(pattern_id);
CREATE INDEX IF NOT EXISTS idx_exc_active ON pattern_exceptions(is_active);

-- 3. 자동 예외 제안 테이블
CREATE TABLE IF NOT EXISTS exception_suggestions (
  id TEXT PRIMARY KEY,
  pattern_id TEXT NOT NULL,
  exception_type TEXT NOT NULL,
  exception_value TEXT NOT NULL,
  fp_count INTEGER NOT NULL,
  sample_fp_ids TEXT,
  confidence INTEGER NOT NULL,
  estimated_fp_reduction INTEGER,
  estimated_fn_risk INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sugg_pattern ON exception_suggestions(pattern_id);
CREATE INDEX IF NOT EXISTS idx_sugg_status ON exception_suggestions(status);

-- 4. 꼼수 유형 테이블
CREATE TABLE IF NOT EXISTS trick_patterns (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  risk_level TEXT DEFAULT 'medium',
  legal_status TEXT DEFAULT 'gray',
  precedent_exists INTEGER DEFAULT 0,
  precedent_reference TEXT,
  detection_difficulty TEXT DEFAULT 'medium',
  detection_method TEXT,
  technical_method TEXT,
  related_pattern_id TEXT,
  status TEXT DEFAULT 'collecting',
  total_cases INTEGER DEFAULT 0,
  discovered_at TEXT DEFAULT (datetime('now')),
  created_by TEXT DEFAULT 'system',
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_trick_status ON trick_patterns(status);
CREATE INDEX IF NOT EXISTS idx_trick_legal ON trick_patterns(legal_status);

-- 5. 꼼수 발견 사례 테이블
CREATE TABLE IF NOT EXISTS trick_cases (
  id TEXT PRIMARY KEY,
  trick_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_domain TEXT NOT NULL,
  evidence_type TEXT,
  evidence_data TEXT,
  before_access TEXT,
  after_access TEXT,
  before_screenshot TEXT,
  after_screenshot TEXT,
  analysis_note TEXT,
  verified INTEGER DEFAULT 0,
  verified_by TEXT,
  verified_at TEXT,
  discovered_at TEXT DEFAULT (datetime('now')),
  discovered_by TEXT DEFAULT 'crawler'
);

CREATE INDEX IF NOT EXISTS idx_tc_trick ON trick_cases(trick_id);
CREATE INDEX IF NOT EXISTS idx_tc_domain ON trick_cases(source_domain);

-- 6. 꼼수 초기 데이터
INSERT OR IGNORE INTO trick_patterns (id, code, name, description, category, risk_level, legal_status, detection_difficulty, technical_method, detection_method, notes) VALUES
('TRICK-001', 'TRICK-001', 'Before/After 기술적 분리', 'Before는 로그인 필수, After만 공개하여 비교 광고 규정 우회', '기술적우회', 'high', 'gray', 'hard', '로그인 여부에 따라 콘텐츠 접근 제어', '로그인 전/후 콘텐츠 비교', '판례 없음. 모니터링 중.'),
('TRICK-002', 'TRICK-002', '체험기 위장 광고', '광고 표시 없이 체험기 형식으로 작성', '형식적우회', 'high', 'likely_violation', 'medium', '블로그에 체험기 형식 게시', 'AI 문체 분석', '판례 있음.'),
('TRICK-003', 'TRICK-003', '이미지 내 텍스트', '위반 문구를 이미지로 삽입', '기술적우회', 'medium', 'confirmed', 'easy', '이미지에 텍스트 포함', 'OCR 후 패턴 매칭', '탐지 배포 완료'),
('TRICK-004', 'TRICK-004', '표현 변형', '금지어를 공백/특수문자로 분리', '표현우회', 'medium', 'confirmed', 'medium', '"완치" → "완 치"', '정규화 후 매칭', '탐지 배포 완료');