-- ============================================
-- MedCheck Engine Database Schema
-- Supabase PostgreSQL
-- ============================================

-- 확장 기능 활성화
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- 텍스트 검색용

-- ============================================
-- 1. 분석 로그 테이블 (analysis_logs)
-- ============================================
CREATE TABLE IF NOT EXISTS analysis_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 분석 대상 정보
    source_url TEXT NOT NULL,
    source_type VARCHAR(50),  -- 'blog', 'website', 'sns', 'ad' 등
    hospital_name VARCHAR(255),
    department VARCHAR(100),

    -- 분석 결과 요약
    violation_count INTEGER DEFAULT 0,
    severity_critical INTEGER DEFAULT 0,
    severity_major INTEGER DEFAULT 0,
    severity_minor INTEGER DEFAULT 0,
    confidence DECIMAL(5,4),  -- 0.0000 ~ 1.0000

    -- 분석 메타데이터
    processing_time_ms INTEGER,
    content_length INTEGER,
    image_count INTEGER DEFAULT 0,
    ocr_used BOOLEAN DEFAULT FALSE,

    -- 상태
    status VARCHAR(20) DEFAULT 'completed',  -- 'pending', 'processing', 'completed', 'failed'
    error_code VARCHAR(10),
    error_message TEXT,

    -- 시간
    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_analysis_logs_source_url ON analysis_logs(source_url);
CREATE INDEX idx_analysis_logs_hospital_name ON analysis_logs(hospital_name);
CREATE INDEX idx_analysis_logs_analyzed_at ON analysis_logs(analyzed_at DESC);
CREATE INDEX idx_analysis_logs_status ON analysis_logs(status);
CREATE INDEX idx_analysis_logs_violation_count ON analysis_logs(violation_count DESC);

-- ============================================
-- 2. 위반 상세 테이블 (violations)
-- ============================================
CREATE TABLE IF NOT EXISTS violations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    analysis_log_id UUID NOT NULL REFERENCES analysis_logs(id) ON DELETE CASCADE,

    -- 위반 정보
    pattern_id VARCHAR(20) NOT NULL,
    violation_type VARCHAR(50) NOT NULL,
    category VARCHAR(50),
    subcategory VARCHAR(100),

    -- 탐지 내용
    matched_text TEXT NOT NULL,
    text_position INTEGER,
    context_before TEXT,  -- 매칭 텍스트 앞 50자
    context_after TEXT,   -- 매칭 텍스트 뒤 50자

    -- 심각도 및 상태
    severity VARCHAR(20) NOT NULL,  -- 'critical', 'major', 'minor'
    status VARCHAR(20) DEFAULT 'violation',  -- 'violation', 'likely', 'possible', 'clean'
    confidence DECIMAL(5,4),

    -- 법적 근거
    legal_basis VARCHAR(100),
    legal_description TEXT,

    -- 시간
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_violations_analysis_log_id ON violations(analysis_log_id);
CREATE INDEX idx_violations_pattern_id ON violations(pattern_id);
CREATE INDEX idx_violations_violation_type ON violations(violation_type);
CREATE INDEX idx_violations_severity ON violations(severity);
CREATE INDEX idx_violations_matched_text ON violations USING gin(matched_text gin_trgm_ops);

-- ============================================
-- 3. 가격 분석 테이블 (price_analyses)
-- ============================================
CREATE TABLE IF NOT EXISTS price_analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    analysis_log_id UUID NOT NULL REFERENCES analysis_logs(id) ON DELETE CASCADE,

    -- 가격 정보
    item_name VARCHAR(255) NOT NULL,
    advertised_price DECIMAL(12,0),  -- 원 단위
    original_text TEXT,  -- 원본 가격 텍스트

    -- 분석 결과
    coverage_type VARCHAR(20),  -- 'covered', 'non_covered', 'mixed', 'unknown'
    price_status VARCHAR(20),   -- 'normal', 'high', 'low', 'unknown'
    reference_min DECIMAL(12,0),
    reference_max DECIMAL(12,0),

    -- 메타데이터
    confidence DECIMAL(5,4),
    comment TEXT,

    -- 시간
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_price_analyses_analysis_log_id ON price_analyses(analysis_log_id);
CREATE INDEX idx_price_analyses_item_name ON price_analyses(item_name);
CREATE INDEX idx_price_analyses_price_status ON price_analyses(price_status);

-- ============================================
-- 4. 패턴 통계 테이블 (pattern_stats)
-- ============================================
CREATE TABLE IF NOT EXISTS pattern_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pattern_id VARCHAR(20) NOT NULL UNIQUE,

    -- 통계
    match_count INTEGER DEFAULT 0,
    violation_count INTEGER DEFAULT 0,
    false_positive_count INTEGER DEFAULT 0,

    -- 정확도 메트릭
    precision DECIMAL(5,4),
    last_matched_at TIMESTAMP WITH TIME ZONE,

    -- 시간
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_pattern_stats_pattern_id ON pattern_stats(pattern_id);
CREATE INDEX idx_pattern_stats_match_count ON pattern_stats(match_count DESC);

-- ============================================
-- 5. API 로그 테이블 (api_logs)
-- ============================================
CREATE TABLE IF NOT EXISTS api_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 요청 정보
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    request_body JSONB,

    -- 응답 정보
    status_code INTEGER,
    response_time_ms INTEGER,

    -- 클라이언트 정보
    client_ip VARCHAR(45),
    user_agent TEXT,
    api_key_id VARCHAR(50),

    -- 시간
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_api_logs_endpoint ON api_logs(endpoint);
CREATE INDEX idx_api_logs_created_at ON api_logs(created_at DESC);
CREATE INDEX idx_api_logs_status_code ON api_logs(status_code);

-- ============================================
-- 6. 시스템 상태 테이블 (system_health)
-- ============================================
CREATE TABLE IF NOT EXISTS system_health (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 상태 정보
    component VARCHAR(50) NOT NULL,  -- 'engine', 'db', 'scv', 'ocr'
    status VARCHAR(20) NOT NULL,     -- 'healthy', 'degraded', 'unhealthy'
    message TEXT,

    -- 메트릭
    metrics JSONB,

    -- 시간
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_system_health_component ON system_health(component);
CREATE INDEX idx_system_health_checked_at ON system_health(checked_at DESC);

-- ============================================
-- 트리거: updated_at 자동 갱신
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_analysis_logs_updated_at
    BEFORE UPDATE ON analysis_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pattern_stats_updated_at
    BEFORE UPDATE ON pattern_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS (Row Level Security) 정책
-- 필요 시 활성화
-- ============================================
-- ALTER TABLE analysis_logs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE violations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE price_analyses ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 초기 데이터
-- ============================================
-- 시스템 상태 초기화
INSERT INTO system_health (component, status, message)
VALUES
    ('engine', 'healthy', 'Engine initialized'),
    ('db', 'healthy', 'Database connected')
ON CONFLICT DO NOTHING;
