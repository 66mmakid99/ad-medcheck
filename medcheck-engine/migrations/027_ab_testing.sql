-- Migration 027: A/B 테스트 프레임워크 (자동 개선 Phase 3)

CREATE TABLE IF NOT EXISTS ab_tests (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,

    -- 실험 대상
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,

    -- 변경 내용
    control_value TEXT,
    treatment_value TEXT,

    -- 트래픽 분배
    traffic_percent INTEGER DEFAULT 50,

    -- 기간
    start_date TEXT,
    end_date TEXT,
    started_at TEXT,

    -- 상태
    status TEXT DEFAULT 'draft',

    -- 성공 기준
    min_sample_size INTEGER DEFAULT 100,
    significance_level REAL DEFAULT 0.05,

    -- 결과
    recommendation TEXT,
    p_value REAL,
    last_evaluated_at TEXT,

    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ab_tests_status ON ab_tests(status);

CREATE TABLE IF NOT EXISTS ab_test_results (
    id TEXT PRIMARY KEY,
    test_id TEXT NOT NULL,
    group_name TEXT NOT NULL,
    is_correct INTEGER DEFAULT 0,
    is_false_positive INTEGER DEFAULT 0,
    is_false_negative INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ab_test_results_test_id ON ab_test_results(test_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_results_group ON ab_test_results(test_id, group_name);
