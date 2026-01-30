-- ============================================
-- Phase 5 보완: 오탐 관리 시스템 확장
-- 설계서 기반 스키마 확장
-- ============================================

-- ============================================
-- 1. false_positive_cases 테이블 재정의 (확장)
-- ============================================
DROP TABLE IF EXISTS false_positive_cases;

CREATE TABLE false_positive_cases (
  id TEXT PRIMARY KEY,

  -- 원본 정보
  analysis_id TEXT,                    -- 분석 ID
  pattern_id TEXT NOT NULL,            -- 오탐 발생 패턴
  matched_text TEXT NOT NULL,          -- 매칭된 텍스트
  full_context TEXT,                   -- 전체 맥락 (앞뒤 100자)
  source_url TEXT,                     -- 원본 URL

  -- 피드백 정보
  feedback_id TEXT,                    -- 연결된 피드백
  reporter_type TEXT DEFAULT 'user',   -- user / expert / system
  report_reason TEXT,                  -- 오탐 사유 설명

  -- 분류
  false_positive_type TEXT,            -- context_dependent, domain_specific, quotation, negation, education, pattern_too_broad, ocr_error
  suggested_action TEXT,               -- 제안 조치

  -- 상태 관리
  status TEXT DEFAULT 'reported',      -- reported → reviewing → resolved / rejected
  resolution TEXT,                     -- exception_added / pattern_modified / rejected
  resolution_note TEXT,

  -- 메타
  created_at TEXT DEFAULT (datetime('now')),
  reviewed_at TEXT,
  resolved_at TEXT,
  reviewer TEXT
);

CREATE INDEX idx_fp_pattern ON false_positive_cases(pattern_id);
CREATE INDEX idx_fp_type ON false_positive_cases(false_positive_type);
CREATE INDEX idx_fp_status ON false_positive_cases(status);
CREATE INDEX idx_fp_analysis ON false_positive_cases(analysis_id);

-- ============================================
-- 2. pattern_exceptions 테이블 확장
-- ============================================
DROP TABLE IF EXISTS pattern_exceptions;

CREATE TABLE pattern_exceptions (
  id TEXT PRIMARY KEY,
  pattern_id TEXT NOT NULL,            -- 대상 패턴

  -- 예외 조건
  exception_type TEXT NOT NULL,        -- keyword / regex / context / domain
  exception_value TEXT NOT NULL,       -- 예외 값

  -- 출처
  source_type TEXT,                    -- feedback / expert / auto
  source_id TEXT,                      -- 피드백 ID 등

  -- 상태
  status TEXT DEFAULT 'active',        -- active / deprecated / testing

  -- 효과 측정
  applied_count INTEGER DEFAULT 0,     -- 적용된 횟수
  prevented_fp_count INTEGER DEFAULT 0, -- 방지한 오탐 수

  -- 메타
  created_at TEXT DEFAULT (datetime('now')),
  created_by TEXT,
  version TEXT                         -- 적용된 패턴 버전
);

CREATE INDEX idx_exc_pattern ON pattern_exceptions(pattern_id);
CREATE INDEX idx_exc_status ON pattern_exceptions(status);
CREATE INDEX idx_exc_type ON pattern_exceptions(exception_type);

-- ============================================
-- 3. pattern_versions 테이블 (패턴별 버전 이력)
-- ============================================
DROP TABLE IF EXISTS pattern_versions;

CREATE TABLE pattern_versions (
  id TEXT PRIMARY KEY,
  pattern_id TEXT NOT NULL,
  version TEXT NOT NULL,               -- 1.0, 1.1, 1.2, ...

  -- 변경 내용
  change_type TEXT NOT NULL,           -- initial / pattern_update / exception_add / threshold_adjust
  change_description TEXT NOT NULL,
  change_reason TEXT,

  -- 변경 전/후
  previous_pattern TEXT,               -- 이전 정규식
  new_pattern TEXT,                    -- 새 정규식
  previous_threshold REAL,
  new_threshold REAL,

  -- 연관 데이터
  related_feedback_ids TEXT,           -- JSON 배열
  related_fp_case_ids TEXT,            -- JSON 배열

  -- 성능 지표 (변경 후 측정)
  metrics_before TEXT,                 -- JSON: {precision, recall, f1}
  metrics_after TEXT,                  -- JSON: {precision, recall, f1}

  -- 메타
  created_at TEXT DEFAULT (datetime('now')),
  created_by TEXT,
  approved_by TEXT,
  approved_at TEXT
);

CREATE INDEX idx_pv_pattern ON pattern_versions(pattern_id);
CREATE INDEX idx_pv_version ON pattern_versions(version);
CREATE INDEX idx_pv_change_type ON pattern_versions(change_type);

-- ============================================
-- 4. exception_suggestions 테이블 (자동 제안)
-- ============================================
CREATE TABLE IF NOT EXISTS exception_suggestions (
  id TEXT PRIMARY KEY,
  pattern_id TEXT NOT NULL,

  -- 제안 내용
  exception_type TEXT NOT NULL,        -- keyword / regex / context / domain
  exception_value TEXT NOT NULL,

  -- 근거
  matched_text TEXT,                   -- 오탐 텍스트
  fp_count INTEGER DEFAULT 0,          -- 관련 오탐 수
  related_fp_ids TEXT,                 -- JSON: 관련 오탐 케이스 ID들

  -- 신뢰도
  confidence REAL,                     -- 0.0 ~ 1.0

  -- 상태
  status TEXT DEFAULT 'suggested',     -- suggested / approved / rejected

  -- 처리 정보
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_comment TEXT,

  -- 승인 시 생성된 예외 ID
  created_exception_id TEXT,

  -- 메타
  created_at TEXT DEFAULT (datetime('now')),
  source_type TEXT DEFAULT 'auto'      -- auto / manual
);

CREATE INDEX idx_es_pattern ON exception_suggestions(pattern_id);
CREATE INDEX idx_es_status ON exception_suggestions(status);
CREATE INDEX idx_es_confidence ON exception_suggestions(confidence DESC);
