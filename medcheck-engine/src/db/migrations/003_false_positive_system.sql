-- ============================================
-- Phase 5: 오탐 관리 시스템 스키마
-- ============================================

-- ============================================
-- 1. 오탐 케이스 테이블 (false_positive_cases)
-- 확인된 오탐 사례 저장
-- ============================================
CREATE TABLE IF NOT EXISTS false_positive_cases (
    id TEXT PRIMARY KEY,

    -- 패턴 정보
    pattern_id TEXT NOT NULL,
    pattern_name TEXT,

    -- 오탐 텍스트
    matched_text TEXT NOT NULL,
    full_context TEXT,  -- 전체 문맥 (앞뒤 포함)

    -- 오탐 사유
    reason TEXT NOT NULL,  -- 'medical_term', 'context_dependent', 'proper_noun', 'quotation', 'other'
    reason_detail TEXT,

    -- 출처
    source_url TEXT,
    source_type TEXT,  -- 'blog', 'hospital', 'news', 'academic'

    -- 상태
    status TEXT DEFAULT 'pending',  -- 'pending', 'confirmed', 'rejected', 'applied'

    -- 승인 정보
    reported_by TEXT,
    reviewed_by TEXT,
    reviewed_at TEXT,
    review_comment TEXT,

    -- 적용 정보
    applied_to_exception INTEGER DEFAULT 0,  -- 예외 규칙에 반영됨
    exception_id TEXT,  -- 생성된 예외 규칙 ID

    -- 메타데이터
    metadata TEXT,  -- JSON

    -- 시간
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fp_cases_pattern_id ON false_positive_cases(pattern_id);
CREATE INDEX IF NOT EXISTS idx_fp_cases_status ON false_positive_cases(status);
CREATE INDEX IF NOT EXISTS idx_fp_cases_matched_text ON false_positive_cases(matched_text);

-- ============================================
-- 2. 패턴 예외 규칙 테이블 (pattern_exceptions)
-- 특정 패턴의 예외 케이스
-- ============================================
CREATE TABLE IF NOT EXISTS pattern_exceptions (
    id TEXT PRIMARY KEY,

    -- 패턴 정보
    pattern_id TEXT NOT NULL,

    -- 예외 조건
    exception_type TEXT NOT NULL,  -- 'exact_match', 'contains', 'regex', 'context'
    exception_value TEXT NOT NULL,  -- 예외 텍스트 또는 정규식

    -- 컨텍스트 조건 (선택)
    context_before TEXT,  -- 앞에 이 텍스트가 있으면 예외
    context_after TEXT,   -- 뒤에 이 텍스트가 있으면 예외

    -- 예외 사유
    reason TEXT NOT NULL,

    -- 적용 범위
    scope TEXT DEFAULT 'global',  -- 'global', 'hospital_type', 'department'
    scope_value TEXT,  -- scope가 global이 아닌 경우 값

    -- 상태
    is_active INTEGER DEFAULT 1,

    -- 우선순위 (높을수록 먼저 체크)
    priority INTEGER DEFAULT 0,

    -- 출처
    source_case_id TEXT,  -- false_positive_cases에서 생성된 경우

    -- 승인 정보
    created_by TEXT,
    approved_by TEXT,
    approved_at TEXT,

    -- 통계
    applied_count INTEGER DEFAULT 0,  -- 적용된 횟수
    last_applied_at TEXT,

    -- 시간
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (source_case_id) REFERENCES false_positive_cases(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pattern_exceptions_pattern_id ON pattern_exceptions(pattern_id);
CREATE INDEX IF NOT EXISTS idx_pattern_exceptions_is_active ON pattern_exceptions(is_active);
CREATE INDEX IF NOT EXISTS idx_pattern_exceptions_type ON pattern_exceptions(exception_type);

-- ============================================
-- 3. 패턴 버전 테이블 (pattern_versions)
-- 패턴 변경 이력 추적
-- ============================================
CREATE TABLE IF NOT EXISTS pattern_versions (
    id TEXT PRIMARY KEY,

    -- 버전 정보
    version TEXT NOT NULL UNIQUE,
    previous_version TEXT,

    -- 변경 내용
    total_patterns INTEGER NOT NULL,
    added_patterns INTEGER DEFAULT 0,
    removed_patterns INTEGER DEFAULT 0,
    modified_patterns INTEGER DEFAULT 0,

    -- 예외 규칙
    total_exceptions INTEGER DEFAULT 0,
    added_exceptions INTEGER DEFAULT 0,

    -- 변경 로그
    changelog TEXT,  -- JSON array of changes

    -- 배포 정보
    deployed_at TEXT,
    deployed_by TEXT,

    -- 상태
    status TEXT DEFAULT 'draft',  -- 'draft', 'testing', 'deployed', 'rollback'

    -- 테스트 결과
    test_result TEXT,  -- JSON: 테스트 결과 요약

    -- 시간
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pattern_versions_version ON pattern_versions(version);
CREATE INDEX IF NOT EXISTS idx_pattern_versions_status ON pattern_versions(status);

-- ============================================
-- 4. 오탐 피드백 연결 테이블
-- feedback 테이블과 false_positive_cases 연결
-- ============================================
CREATE TABLE IF NOT EXISTS feedback_case_links (
    id TEXT PRIMARY KEY,
    feedback_id TEXT NOT NULL,
    case_id TEXT NOT NULL,

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE CASCADE,
    FOREIGN KEY (case_id) REFERENCES false_positive_cases(id) ON DELETE CASCADE,

    UNIQUE(feedback_id, case_id)
);

-- ============================================
-- 초기 버전 데이터
-- ============================================
INSERT OR IGNORE INTO pattern_versions (id, version, total_patterns, status, deployed_at)
VALUES ('pv-1.0.0', '1.0.0', 156, 'deployed', datetime('now'));
