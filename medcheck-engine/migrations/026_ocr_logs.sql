-- Migration 026: OCR 로그 및 검증 테이블
-- schema.d1.sql에만 정의되어 있었으나 numbered migration에 누락

CREATE TABLE IF NOT EXISTS ocr_logs (
    id TEXT PRIMARY KEY,
    analysis_log_id TEXT NOT NULL,

    -- 이미지 정보
    image_url TEXT NOT NULL,
    image_hash TEXT,
    image_size_bytes INTEGER,
    image_width INTEGER,
    image_height INTEGER,

    -- OCR 결과
    extracted_text TEXT,
    text_length INTEGER,
    word_count INTEGER,

    -- 품질 메트릭
    confidence REAL,
    processing_time_ms INTEGER,
    model_used TEXT DEFAULT 'gemini-1.5-flash',
    language_detected TEXT,

    -- 상태
    status TEXT DEFAULT 'completed',
    error_message TEXT,

    -- 품질 플래그
    is_low_quality INTEGER DEFAULT 0,
    needs_validation INTEGER DEFAULT 0,
    validated INTEGER DEFAULT 0,

    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ocr_logs_analysis_log_id ON ocr_logs(analysis_log_id);
CREATE INDEX IF NOT EXISTS idx_ocr_logs_image_hash ON ocr_logs(image_hash);
CREATE INDEX IF NOT EXISTS idx_ocr_logs_needs_validation ON ocr_logs(needs_validation);
CREATE INDEX IF NOT EXISTS idx_ocr_logs_confidence ON ocr_logs(confidence);

CREATE TABLE IF NOT EXISTS ocr_validations (
    id TEXT PRIMARY KEY,
    ocr_log_id TEXT NOT NULL,

    -- 원본 정보
    image_url TEXT NOT NULL,
    ocr_text TEXT NOT NULL,
    ocr_confidence REAL,

    -- 검증 정보
    validation_status TEXT DEFAULT 'pending',
    corrected_text TEXT,
    validator_id TEXT,
    validation_note TEXT,

    -- 우선순위
    priority INTEGER DEFAULT 0,
    reason TEXT,

    -- 시간
    created_at TEXT DEFAULT (datetime('now')),
    validated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ocr_validations_status ON ocr_validations(validation_status);
CREATE INDEX IF NOT EXISTS idx_ocr_validations_priority ON ocr_validations(priority DESC);
