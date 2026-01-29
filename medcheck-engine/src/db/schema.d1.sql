-- ============================================
-- MedCheck Engine Database Schema
-- Cloudflare D1 (SQLite)
-- ============================================

-- ============================================
-- 1. 분석 로그 테이블 (analysis_logs)
-- ============================================
CREATE TABLE IF NOT EXISTS analysis_logs (
    id TEXT PRIMARY KEY,  -- UUID string

    -- 분석 대상 정보
    source_url TEXT NOT NULL,
    source_type TEXT,  -- 'blog', 'website', 'sns', 'ad'
    hospital_name TEXT,
    department TEXT,

    -- 분석 결과 요약
    violation_count INTEGER DEFAULT 0,
    severity_critical INTEGER DEFAULT 0,
    severity_major INTEGER DEFAULT 0,
    severity_minor INTEGER DEFAULT 0,
    confidence REAL,  -- 0.0 ~ 1.0

    -- 분석 메타데이터
    processing_time_ms INTEGER,
    content_length INTEGER,
    image_count INTEGER DEFAULT 0,
    ocr_used INTEGER DEFAULT 0,  -- boolean: 0/1

    -- 상태
    status TEXT DEFAULT 'completed',  -- 'pending', 'processing', 'completed', 'failed'
    error_code TEXT,
    error_message TEXT,

    -- 버전
    engine_version TEXT,
    pattern_version TEXT,

    -- 시간 (ISO 8601 format)
    analyzed_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analysis_logs_source_url ON analysis_logs(source_url);
CREATE INDEX IF NOT EXISTS idx_analysis_logs_hospital_name ON analysis_logs(hospital_name);
CREATE INDEX IF NOT EXISTS idx_analysis_logs_analyzed_at ON analysis_logs(analyzed_at);
CREATE INDEX IF NOT EXISTS idx_analysis_logs_status ON analysis_logs(status);

-- ============================================
-- 2. 분석 추적 테이블 (analysis_traces)
-- 단계별 상세 기록
-- ============================================
CREATE TABLE IF NOT EXISTS analysis_traces (
    id TEXT PRIMARY KEY,
    analysis_log_id TEXT NOT NULL,

    -- 단계 정보
    step_name TEXT NOT NULL,  -- 'parse', 'normalize', 'pattern_match', 'ocr', 'ai_review', 'price_check'
    step_order INTEGER NOT NULL,

    -- 실행 정보
    started_at TEXT NOT NULL,
    completed_at TEXT,
    duration_ms INTEGER,

    -- 결과
    status TEXT DEFAULT 'running',  -- 'running', 'success', 'failed', 'skipped'
    input_summary TEXT,  -- JSON: 입력 요약
    output_summary TEXT,  -- JSON: 출력 요약

    -- 상세 데이터
    details TEXT,  -- JSON: 단계별 상세 데이터

    -- 에러 정보
    error_code TEXT,
    error_message TEXT,
    error_stack TEXT,

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (analysis_log_id) REFERENCES analysis_logs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_analysis_traces_analysis_log_id ON analysis_traces(analysis_log_id);
CREATE INDEX IF NOT EXISTS idx_analysis_traces_step_name ON analysis_traces(step_name);

-- ============================================
-- 3. OCR 로그 테이블 (ocr_logs)
-- OCR 품질 관리
-- ============================================
CREATE TABLE IF NOT EXISTS ocr_logs (
    id TEXT PRIMARY KEY,
    analysis_log_id TEXT NOT NULL,

    -- 이미지 정보
    image_url TEXT NOT NULL,
    image_hash TEXT,  -- 중복 체크용
    image_size_bytes INTEGER,
    image_width INTEGER,
    image_height INTEGER,

    -- OCR 결과
    extracted_text TEXT,
    text_length INTEGER,
    word_count INTEGER,

    -- 품질 메트릭
    confidence REAL,  -- 전체 신뢰도 0.0 ~ 1.0
    avg_char_confidence REAL,
    min_char_confidence REAL,

    -- 텍스트 영역
    regions_count INTEGER,
    regions_data TEXT,  -- JSON: 영역별 상세 [{x, y, w, h, text, confidence}]

    -- 처리 정보
    ocr_provider TEXT DEFAULT 'gemini',  -- 'gemini', 'tesseract', 'clova'
    processing_time_ms INTEGER,

    -- 상태
    status TEXT DEFAULT 'completed',  -- 'pending', 'completed', 'failed', 'needs_review'
    error_message TEXT,

    -- 품질 플래그
    is_low_quality INTEGER DEFAULT 0,  -- 품질 낮음
    needs_validation INTEGER DEFAULT 0,  -- 검증 필요
    validated INTEGER DEFAULT 0,  -- 검증 완료

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (analysis_log_id) REFERENCES analysis_logs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ocr_logs_analysis_log_id ON ocr_logs(analysis_log_id);
CREATE INDEX IF NOT EXISTS idx_ocr_logs_image_hash ON ocr_logs(image_hash);
CREATE INDEX IF NOT EXISTS idx_ocr_logs_needs_validation ON ocr_logs(needs_validation);
CREATE INDEX IF NOT EXISTS idx_ocr_logs_confidence ON ocr_logs(confidence);

-- ============================================
-- 4. OCR 검증 큐 테이블 (ocr_validations)
-- 사람이 검증해야 할 OCR 결과
-- ============================================
CREATE TABLE IF NOT EXISTS ocr_validations (
    id TEXT PRIMARY KEY,
    ocr_log_id TEXT NOT NULL,

    -- 원본 정보
    image_url TEXT NOT NULL,
    ocr_text TEXT NOT NULL,
    ocr_confidence REAL,

    -- 검증 정보
    validation_status TEXT DEFAULT 'pending',  -- 'pending', 'approved', 'corrected', 'rejected'
    corrected_text TEXT,  -- 수정된 텍스트
    validator_id TEXT,  -- 검증자 ID
    validation_note TEXT,

    -- 우선순위
    priority INTEGER DEFAULT 0,  -- 높을수록 먼저 검증
    reason TEXT,  -- 검증 필요 사유

    -- 시간
    created_at TEXT DEFAULT (datetime('now')),
    validated_at TEXT,

    FOREIGN KEY (ocr_log_id) REFERENCES ocr_logs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ocr_validations_status ON ocr_validations(validation_status);
CREATE INDEX IF NOT EXISTS idx_ocr_validations_priority ON ocr_validations(priority DESC);

-- ============================================
-- 5. 패턴 매칭 기록 테이블 (pattern_hits)
-- ============================================
CREATE TABLE IF NOT EXISTS pattern_hits (
    id TEXT PRIMARY KEY,
    analysis_log_id TEXT NOT NULL,

    -- 패턴 정보
    pattern_id TEXT NOT NULL,
    pattern_category TEXT,
    pattern_subcategory TEXT,

    -- 매칭 정보
    matched_text TEXT NOT NULL,
    text_position INTEGER,
    context_before TEXT,  -- 앞 50자
    context_after TEXT,   -- 뒤 50자

    -- 결과
    severity TEXT NOT NULL,  -- 'critical', 'major', 'minor'
    confidence REAL,
    is_false_positive INTEGER DEFAULT 0,  -- 오탐 여부

    -- 법적 근거
    legal_basis TEXT,

    -- 소스 (텍스트/OCR)
    source_type TEXT DEFAULT 'text',  -- 'text', 'ocr', 'ai'
    ocr_log_id TEXT,  -- OCR에서 발견된 경우

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (analysis_log_id) REFERENCES analysis_logs(id) ON DELETE CASCADE,
    FOREIGN KEY (ocr_log_id) REFERENCES ocr_logs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pattern_hits_analysis_log_id ON pattern_hits(analysis_log_id);
CREATE INDEX IF NOT EXISTS idx_pattern_hits_pattern_id ON pattern_hits(pattern_id);
CREATE INDEX IF NOT EXISTS idx_pattern_hits_severity ON pattern_hits(severity);
CREATE INDEX IF NOT EXISTS idx_pattern_hits_is_false_positive ON pattern_hits(is_false_positive);

-- ============================================
-- 6. 버전 기록 테이블 (versions)
-- ============================================
CREATE TABLE IF NOT EXISTS versions (
    id TEXT PRIMARY KEY,

    -- 버전 정보
    component TEXT NOT NULL,  -- 'engine', 'patterns', 'ocr', 'ai'
    version TEXT NOT NULL,

    -- 변경 내용
    changelog TEXT,
    pattern_count INTEGER,  -- patterns의 경우

    -- 메타데이터
    metadata TEXT,  -- JSON

    -- 시간
    deployed_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),

    UNIQUE(component, version)
);

CREATE INDEX IF NOT EXISTS idx_versions_component ON versions(component);
CREATE INDEX IF NOT EXISTS idx_versions_deployed_at ON versions(deployed_at);

-- ============================================
-- 7. AI 판정 기록 테이블 (ai_decisions)
-- AI 리뷰 결과 및 reasoning 저장
-- ============================================
CREATE TABLE IF NOT EXISTS ai_decisions (
    id TEXT PRIMARY KEY,
    analysis_log_id TEXT NOT NULL,
    pattern_hit_id TEXT,  -- 관련 패턴 매칭

    -- AI 모델 정보
    model TEXT NOT NULL,  -- 'gpt-4', 'claude', 'gemini'
    model_version TEXT,

    -- 입력
    input_text TEXT NOT NULL,
    input_context TEXT,  -- JSON: 추가 컨텍스트

    -- 판정 결과
    decision TEXT NOT NULL,  -- 'violation', 'likely', 'possible', 'clean'
    confidence REAL,

    -- Reasoning (중요!)
    reasoning TEXT NOT NULL,  -- AI의 판단 근거
    reasoning_steps TEXT,  -- JSON: 단계별 reasoning

    -- 법적 근거 분석
    legal_analysis TEXT,  -- JSON: 관련 법령 분석

    -- 토큰 사용량
    input_tokens INTEGER,
    output_tokens INTEGER,

    -- 처리 시간
    processing_time_ms INTEGER,

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (analysis_log_id) REFERENCES analysis_logs(id) ON DELETE CASCADE,
    FOREIGN KEY (pattern_hit_id) REFERENCES pattern_hits(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_decisions_analysis_log_id ON ai_decisions(analysis_log_id);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_decision ON ai_decisions(decision);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_model ON ai_decisions(model);

-- ============================================
-- 8. 패턴 통계 테이블 (pattern_stats)
-- ============================================
CREATE TABLE IF NOT EXISTS pattern_stats (
    pattern_id TEXT PRIMARY KEY,

    -- 통계
    total_matches INTEGER DEFAULT 0,
    true_positives INTEGER DEFAULT 0,
    false_positives INTEGER DEFAULT 0,

    -- 정확도
    precision REAL,  -- TP / (TP + FP)

    -- 최근 매칭
    last_matched_at TEXT,

    -- 시간
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 9. 시스템 메트릭 테이블 (system_metrics)
-- 대시보드용
-- ============================================
CREATE TABLE IF NOT EXISTS system_metrics (
    id TEXT PRIMARY KEY,

    -- 메트릭 정보
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    metric_unit TEXT,

    -- 분류
    category TEXT,  -- 'performance', 'quality', 'usage'

    -- 시간 (집계 단위)
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    period_type TEXT NOT NULL,  -- 'hourly', 'daily', 'weekly', 'monthly'

    -- 메타데이터
    metadata TEXT,  -- JSON

    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_system_metrics_name ON system_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_system_metrics_category ON system_metrics(category);
CREATE INDEX IF NOT EXISTS idx_system_metrics_period ON system_metrics(period_start, period_end);

-- ============================================
-- 초기 데이터
-- ============================================
INSERT OR IGNORE INTO versions (id, component, version, changelog)
VALUES
    ('v-engine-1.0.0', 'engine', '1.0.0', 'Initial release'),
    ('v-patterns-1.0.0', 'patterns', '1.0.0', '156 patterns');
