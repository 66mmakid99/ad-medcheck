# CLAUDE.md - AD-MEDCHECK Project Guide

## Project Overview

**AD-MEDCHECK (MADMEDCHECK)** is a Medical Advertisement Compliance Analysis System for Korean medical advertisements. It automatically detects and analyzes potential violations of Korean medical advertising laws (의료법) and related regulations.

**Current Version:** Engine v1.4.0 / Dashboard v1.3.0
**Language:** Korean (한국어) with English documentation
**License:** ISC
**Last Updated:** 2026-01-31

### Core Value Proposition

1. **Violation Detection** - Analyze medical advertisements for regulatory violations
2. **Price Analysis** - Track and compare medical procedure pricing across hospitals
3. **False Positive Management** - Continuously improve detection accuracy
4. **Competitive Intelligence** - Monitor competitor pricing and market trends

---

## Deployment URLs

| Service | URL | Platform | Status |
|---------|-----|----------|--------|
| **MedCheck Engine** | `https://medcheck-engine.mmakid.workers.dev` | Cloudflare Workers | Running |
| **Dashboard** | `https://a8c05117.ad-medcheck.pages.dev` | Cloudflare Pages | Running |

---

## Repository Structure

```
ad-medcheck/
├── CLAUDE.md                      # This file (AI assistant guide)
├── README.md                      # Project overview
├── docs/
│   └── MEDCHECK_Engine_Enhancement_Design.md
│
├── medcheck-engine/               # Core Analysis Engine (Cloudflare Workers)
│   ├── src/
│   │   ├── index.ts               # Hono app (1,456 lines, all APIs)
│   │   ├── types/index.ts         # TypeScript type definitions
│   │   ├── api/routes/            # API route handlers
│   │   │   ├── analyze.ts         # Violation analysis
│   │   │   ├── patterns.ts        # Pattern management
│   │   │   ├── false-positives.ts # FP management
│   │   │   ├── feedback.ts
│   │   │   └── validation.ts
│   │   ├── core/                  # Core modules
│   │   │   ├── parser.ts
│   │   │   ├── normalizer.ts
│   │   │   ├── logger.ts
│   │   │   └── tracer.ts
│   │   ├── modules/
│   │   │   ├── violation-detector/
│   │   │   │   ├── index.ts
│   │   │   │   ├── pattern-matcher.ts
│   │   │   │   └── rule-engine.ts
│   │   │   └── ai-analyzer/
│   │   │       ├── index.ts
│   │   │       ├── context-analyzer.ts
│   │   │       └── llm-client.ts
│   │   ├── services/               # 자동 개선 시스템 (v1.4.0)
│   │   │   ├── performance-tracker.ts  # 패턴 성능 추적
│   │   │   └── auto-learner.ts         # 자동 학습 모듈
│   │   ├── adapters/
│   │   │   ├── ocr-adapter.ts     # OCR 이미지 분석
│   │   │   └── scv-adapter.ts
│   │   └── db/
│   │       ├── d1.ts
│   │       ├── schema.sql
│   │       └── schema.d1.sql
│   ├── patterns/
│   │   └── patterns.json          # 156 violation patterns
│   ├── migrations/
│   │   ├── 003_pricing_module.sql
│   │   ├── 004_pricing_v2_upgrade.sql
│   │   ├── 005_crawl_status.sql
│   │   ├── 006_collected_hospitals_and_sessions.sql
│   │   ├── 007_extracted_prices.sql
│   │   └── 008_feedback_system.sql    # 자동 개선 시스템 (v1.4.0)
│   ├── dashboard/                 # Dashboard JSX (dev reference)
│   ├── package.json
│   ├── tsconfig.json
│   └── wrangler.toml
│
├── medcheck-scv/                  # Crawler (Local execution)
│   ├── src/
│   │   ├── crawler.js             # Public API crawler
│   │   ├── api-client.js
│   │   ├── enrichers/
│   │   │   ├── naver-place.js     # Naver Place URL collector
│   │   │   ├── google-search.js   # Google Search URL collector
│   │   │   └── enrich-pipeline.js # Auto pipeline v2.0
│   │   ├── analyzers/
│   │   │   ├── batch-processor.js
│   │   │   └── price-analyzer.js
│   │   └── utils/
│   │       ├── html-preprocessor.js
│   │       └── change-detector.js
│   ├── output/                    # Crawl results (CSV/JSON)
│   └── package.json
│
├── medcheck-dashboard/            # React Dashboard (Cloudflare Pages)
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── components/
│   │       └── MedCheckDashboard.jsx  # v1.3.0 (1,628 lines)
│   ├── package.json               # React 19 + Vite 7 + Tailwind 4
│   └── vite.config.js
│
└── migrations/
    └── 002_fp_tricks.sql
```

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Engine Runtime | Cloudflare Workers |
| API Framework | Hono v4.x |
| Language | TypeScript 5.x, JavaScript |
| Database | Cloudflare D1 (SQLite) |
| Dashboard | React 19 + Vite 7 + Tailwind 4 |
| Dashboard Hosting | Cloudflare Pages |
| Crawler | Node.js + Axios + Cheerio |
| AI (Optional) | Claude 3 Haiku / Gemini 1.5 Flash |

---

## Dashboard Features (10 Tabs)

| Tab | Name | Description |
|-----|------|-------------|
| 📊 | Overview | Stats: price records, procedures, screenshots, alerts |
| 🔄 | Crawl Status | Real-time crawl monitoring (5s polling), start analysis |
| 🔍 | Analyze | Text analysis with AI option |
| 📁 | Batch Analysis | CSV upload → bulk analysis → download results |
| 📋 | Patterns | 156 violation patterns, filter, search |
| 💰 | Pricing | Procedure prices by area, hospital comparison, screenshots |
| 🔔 | Price Alerts | Competitor price change detection, screenshot comparison |
| 🔄 | Mapping Approval | Approve/reject unmapped procedure names |
| ⚠️ | Exceptions/FP | False positive stats, exception suggestions |
| 🎭 | Tricks | Evasion pattern management |

---

## Auto Pipeline

### Flow
```
naver-place.js --auto-google
       ↓
google-search.js --auto-analyze
       ↓
enrich-pipeline.js (MedCheck Analysis)
       ↓
Dashboard real-time update (5s polling)
```

### Commands
```bash
# Full auto pipeline
cd medcheck-scv
node src/enrichers/naver-place.js --input output/hospitals_서울.csv --auto-google

# Analysis only
node src/enrichers/enrich-pipeline.js --input output/hospitals_google.csv --enable-ai
```

---

## Development Commands

```bash
# Engine - Development server
cd medcheck-engine && npm run dev

# Engine - Deploy
cd medcheck-engine && npm run deploy

# Dashboard - Development server
cd medcheck-dashboard && npm run dev

# Dashboard - Build (for Pages deploy)
cd medcheck-dashboard && npm run build

# Crawler - Seoul hospitals
cd medcheck-scv && npm run crawl:seoul
```

---

## D1 SQL Migration Rules

Cloudflare D1 has limited SQLite feature support. Follow these rules strictly:

### Prohibited (DO NOT USE)
| Feature | Reason |
|---------|--------|
| `CREATE TRIGGER` | D1 does not support triggers |
| `CREATE VIEW` | D1 does not support views |
| `FOREIGN KEY` | D1 ignores foreign key constraints |
| Multi-row `INSERT VALUES` | Use separate INSERT statements |
| `CHECK (..., NULL)` | Use `IS NULL OR IN (...)` instead |

### Allowed
| Feature | Example |
|---------|---------|
| `CREATE TABLE IF NOT EXISTS` | Standard table creation |
| `CREATE INDEX IF NOT EXISTS` | Index creation |
| `INSERT OR IGNORE` | Safe insert with conflict handling |
| `DROP TABLE IF EXISTS` | Safe table removal |

### Example Migration
```sql
-- Good: Separate INSERT statements
INSERT OR IGNORE INTO settings (key, value) VALUES ('key1', 'val1');
INSERT OR IGNORE INTO settings (key, value) VALUES ('key2', 'val2');

-- Bad: Multi-row INSERT
INSERT INTO settings (key, value) VALUES ('key1', 'val1'), ('key2', 'val2');

-- Good: NULL check
CHECK (col IS NULL OR col IN ('a', 'b', 'c'))

-- Bad: NULL in IN clause
CHECK (col IN ('a', 'b', 'c', NULL))
```

---

## API Reference (50+ endpoints)

### Analysis API
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Engine info |
| GET | `/v1/health` | Health check |
| POST | `/v1/analyze` | Text analysis |
| POST | `/v1/analyze-url` | URL analysis |

### Pattern Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/patterns` | List patterns |
| GET | `/v1/patterns/:id` | Pattern details |
| GET | `/v1/patterns/categories` | Categories |
| GET | `/v1/patterns/stats/summary` | Pattern stats |

### False Positive Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/false-positives` | List FP cases |
| POST | `/v1/false-positives` | Report FP |
| GET | `/v1/exception-suggestions` | Auto-suggestions |
| POST | `/v1/patterns/:id/exceptions` | Add exception |

### Pricing API (v2)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/procedures` | List procedures |
| GET | `/v1/procedures/:id` | Procedure with area prices |
| GET | `/v1/target-areas` | Body area codes |
| POST | `/v2/prices` | Register price (auto-mapping) |
| GET | `/v2/prices` | List price records |
| GET | `/v2/prices/stats` | Price statistics |
| GET | `/v2/prices/compare/:procedureId` | Compare prices |

### Crawl Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/crawl-status/active` | Active crawl jobs |
| POST | `/v1/crawl-status` | Update crawl status |
| GET | `/v1/crawl-sessions` | Session list |
| POST | `/v1/crawl-sessions` | Create session |
| GET | `/v1/collected-hospitals` | Collected hospitals |
| POST | `/v1/collected-hospitals/analyze` | Start batch analysis |

### Analysis Results
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/analysis-results` | Results list |
| GET | `/v1/analysis-results/stats` | Analysis stats |
| POST | `/v1/analysis-results` | Save result |

### Price Alerts & Monitoring
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/price-alerts` | Price change alerts |
| GET | `/v1/price-alerts/:id` | Alert detail (with screenshots) |
| POST | `/v1/price-alerts/mark-read` | Mark as read |
| GET | `/v1/competitor-settings/:hospitalId` | Competitor settings |
| POST | `/v1/competitor-settings/:hospitalId` | Save settings |

### Screenshots
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/screenshots` | Store screenshot |
| GET | `/v1/screenshots/:id` | Get screenshot |
| GET | `/v1/hospitals/:hospitalId/screenshots` | Hospital screenshots |

### Mapping Candidates
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/mapping-candidates` | List candidates |
| GET | `/v1/mapping-candidates/:id` | Candidate detail |
| POST | `/v1/mapping-candidates/:id/approve` | Approve mapping |
| POST | `/v1/mapping-candidates/:id/reject` | Reject mapping |

### Feedback API (v1.4.0 확장)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/feedback` | 기본 피드백 (기존) |
| POST | `/v1/feedback/violation` | 위반 탐지 피드백 (확장) |
| POST | `/v1/feedback/price` | 가격 추출 피드백 |
| GET | `/v1/feedback/stats` | 피드백 통계 |
| GET | `/v1/feedback/stats/pattern/:id` | 패턴별 통계 |
| GET | `/v1/feedback/pending` | 검토 대기 피드백 |
| POST | `/v1/feedback/:id/review` | 피드백 검토 처리 |

### Performance Tracking API (v1.4.0 신규)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/performance/patterns` | 패턴 성능 목록 |
| GET | `/v1/performance/patterns/:id` | 패턴별 상세 성능 |
| POST | `/v1/performance/aggregate` | 성능 집계 실행 |
| GET | `/v1/performance/report` | 성능 리포트 |
| GET | `/v1/performance/flagged` | 저성능 패턴 목록 |

### Auto Learning API (v1.4.0 신규)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/learning/candidates` | 학습 후보 목록 |
| GET | `/v1/learning/auto-apply-eligible` | 자동 적용 가능 목록 |
| POST | `/v1/learning/candidates/:id/approve` | 학습 후보 승인 |
| POST | `/v1/learning/candidates/:id/reject` | 학습 후보 거부 |
| POST | `/v1/learning/generate-exceptions` | 예외 후보 생성 트리거 |
| POST | `/v1/learning/extract-patterns` | 패턴 후보 추출 |
| POST | `/v1/learning/learn-mappings` | 매핑 패턴 학습 |
| GET | `/v1/exception-candidates` | 예외 후보 목록 |
| POST | `/v1/exception-candidates/:id/approve` | 예외 후보 승인 |
| POST | `/v1/exception-candidates/:id/reject` | 예외 후보 거부 |

---

## Auto-Improvement System (v1.4.0)

### Architecture
```
[데이터 수집] → [분석 엔진] → [결과 반환] → [사용자 피드백]
                                                    │
                              ┌─────────────────────┴───────────────────┐
                              ▼                                         ▼
                    [성능 추적 서비스]                           [자동 학습 모듈]
                    - 패턴별 정확도                              - 예외 규칙 생성
                    - 맥락별 성능                                - 신뢰도 조정
                    - 저성능 플래그                              - 매핑 패턴 학습
                              │                                         │
                              └─────────────┬───────────────────────────┘
                                            ▼
                                    [자동 개선 적용]
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| PerformanceTracker | `services/performance-tracker.ts` | 패턴 성능 집계/추적 |
| AutoLearner | `services/auto-learner.ts` | 자동 학습/규칙 생성 |
| FeedbackAPI | `api/routes/feedback.ts` | 피드백 수집 API |

### Feedback Types
| Type | Description | Auto-Learning |
|------|-------------|---------------|
| `true_positive` | 정탐 (맞음) | 신뢰도 강화 |
| `false_positive` | 오탐 (잘못 탐지) | 예외 규칙 생성 |
| `false_negative` | 미탐 (놓침) | 새 패턴 후보 |
| `severity_adjust` | 심각도 조정 | 심각도 재학습 |

### Auto-Apply Criteria
| Learning Type | Auto-Apply | Review Required |
|--------------|------------|-----------------|
| 예외 규칙 | 신뢰도 95%+ & 10건+ | 80%+ |
| 신뢰도 조정 | 변동폭 ±10% 이내 | 10%+ |
| 매핑 학습 | 일치 패턴 5건+ | 3건+ |
| 새 패턴 | - | 항상 |

---

## Pattern System

### Overview
- **Total Patterns**: 156
- **Categories**: 32
- **Source**: 보건복지부 '건강한 의료광고, 우리가 함께 만들어요' 2판 (2024)

### Pattern Structure
```json
{
  "id": "P-56-01-001",
  "category": "치료효과보장",
  "subcategory": "100% 완치 표현",
  "pattern": "100%\\s*(완치|치료|성공)",
  "patternType": "regex",
  "keywords": ["100%", "완치"],
  "severity": "critical",
  "legalBasis": "의료법 제56조 제2항 제3호",
  "description": "치료 효과를 100% 보장하는 표현",
  "example": "100% 완치 보장",
  "exceptions": ["100% 소독", "100% 예약제"]
}
```

### Key Categories
| Code | Category | Description |
|------|----------|-------------|
| 01 | 치료효과보장 | Treatment guarantees ("100% 완치") |
| 02 | 부작용부정 | Denying side effects |
| 03 | 최상급표현 | Superlatives ("최고", "최초") |
| 04 | 비교광고 | Competitor comparison |
| 05 | 환자유인 | Patient inducement |
| 19 | 꼼수패턴 | Evasion patterns |
| 21-31 | 진료과목특화 | Specialty-specific (성형, 피부, 치과) |

---

## AI Analysis Module

### Configuration
| Item | Value |
|------|-------|
| Default Model | Claude 3 Haiku |
| Alternative | Gemini 1.5 Flash |
| Max Output Tokens | 1,024 |
| Temperature | 0.3 |
| Max AI Calls/Analysis | 5 |
| Activation | `--enable-ai` flag or dashboard checkbox |

### Cost Estimate
| Model | Cost per Hospital |
|-------|-------------------|
| Claude Haiku | ~₩4.5 |
| Gemini Flash | ~₩1.1 |

### Current Status
- Pattern matching: Fully implemented
- AI analysis: Implemented but NOT tested for accuracy
- OCR: Interface only (NOT IMPLEMENTED)

---

## Database Schema (Key Tables)

| Table | Purpose |
|-------|---------|
| `analysis_logs` | Analysis session records |
| `pattern_hits` | Matched violations |
| `false_positive_cases` | Reported false positives |
| `pattern_exceptions` | Pattern exception rules |
| `procedures` | Procedure catalog |
| `procedure_aliases` | Procedure name aliases |
| `price_records_v2` | Price data (area/shots) |
| `price_screenshots` | Screenshot evidence |
| `price_history` | Price change history |
| `price_change_alerts` | Price alerts |
| `mapping_candidates` | Unmapped procedure names |
| `hospitals` | Hospital master |
| `target_areas` | Body area codes |
| `crawl_sessions` | Crawl sessions |
| `crawl_jobs` | Crawl job status |
| `collected_hospitals` | Collected hospital data |
| `hospital_analysis_results` | Analysis results |
| `ai_decisions` | AI decision records |
| `competitor_settings` | Competitor monitoring |

### 자동 개선 시스템 테이블 (v1.4.0)
| Table | Purpose |
|-------|---------|
| `analysis_feedback_v2` | 확장된 분석 피드백 |
| `pattern_performance` | 패턴별 성능 집계 |
| `context_performance` | 맥락별 성능 |
| `department_performance` | 진료과목별 성능 |
| `price_extraction_feedback` | 가격 추출 피드백 |
| `auto_learning_log` | 자동 학습 로그 |
| `exception_candidates` | 예외 규칙 후보 |
| `mapping_learning_data` | 매핑 학습 데이터 |
| `feedback_settings` | 피드백/학습 설정 |

---

## Development Status

### Completed
- Pattern matching engine (156 patterns)
- Violation analysis API (text/URL)
- False positive management
- Pricing v2 (area-based, screenshots)
- Price change alerts
- Auto pipeline (Naver → Google → Analysis)
- Dashboard deployment (Cloudflare Pages)
- Real-time dashboard integration (5s polling)
- OCR 이미지 분석 시스템 (Phase 1-6)
- **자동 개선 시스템 Phase 1** (v1.4.0)
  - 피드백 인프라 (확장 피드백 수집)
  - 성능 추적 서비스 (패턴별/맥락별/진료과목별)
  - 자동 학습 기초 모듈 (예외 후보 생성, 신뢰도 조정)

### In Progress
- AI Hybrid analysis testing
- Trick pattern collection
- 자동 개선 시스템 Phase 2 (자동 적용 로직)

### Not Implemented
- AI accuracy verification
- CSV output format improvement (user fixing)
- 자동 개선 시스템 Phase 3 (A/B 테스트)

---

## Critical Development Rules

### 1. Evidence-Based Work Only
> **NEVER guess or assume. Always base work on references.**

- Violation criteria: `references/laws/` legal provisions
- Pattern definitions: `references/guidelines/` official guidelines
- Exceptions: `references/cases/` actual case precedents

### 2. Legal Basis Required
Every violation detection must include:
- Relevant legal article (의료법 조항)
- Related guideline
- Similar precedents (if available)

### 3. Conservative Judgment
- Ambiguous cases → "Possible violation"
- Only clear cases → "Violation"
- Always indicate "Human review required"

### 4. Pattern ID Convention
```
P-{LAW}-{CATEGORY}-{SEQUENCE}

Example: P-56-01-001
- P: Pattern
- 56: 의료법 제56조
- 01: Category code
- 001: Sequence number
```

---

## Known Issues

1. **CSV Output Format**: User is fixing manually
2. **AI Analysis Testing**: Accuracy not verified (Pattern vs AI Hybrid)
3. **OCR Not Implemented**: Need Google Vision or similar integration

---

## Recent Commits

```
(pending) feat: 자동 개선 시스템 Phase 1 구현 (피드백 인프라)
020abfd Merge pull request #12
ff9db4b fix: SQL 마이그레이션 문법 수정
d66aec2 feat: OCR 이미지 분석 시스템 완전 구현 (Phase 1-6)
2447982 feat: 자동 파이프라인 완성 (네이버→구글→분석 연속 실행)
```

---

## Korean Medical Ad Law Quick Reference

### 의료법 제56조 (Medical Advertising Regulations)

Key prohibited expressions:
- 치료 효과 보장 (Treatment guarantees)
- 부작용 없음 단정 (No side effects claims)
- 최고/최초/유일 (Superlatives)
- 타 의료기관 비교/비방 (Competitor comparison)
- 허위/과장 광고 (False/exaggerated claims)
- 환자 유인 행위 (Patient inducement)

### Severity Levels
| Level | Korean | Description | Example |
|-------|--------|-------------|---------|
| critical | 심각 | Clear legal violation | "100% 완치 보장" |
| major | 중요 | Likely violation | "부작용 거의 없음" |
| minor | 경미 | Possible concern | "빠른 회복" |

---

## Contact & Resources

- **Source**: 보건복지부 '건강한 의료광고, 우리가 함께 만들어요' 2판 (2024)
- **Pattern Count**: 156 patterns across 32 categories
- **Last Updated**: 2026-01-31

---

*This document is maintained for AI assistant context. For detailed implementation, refer to source code.*
