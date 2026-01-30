# CLAUDE.md - AD-MEDCHECK Project Guide

## Project Overview

**AD-MEDCHECK (MADMEDCHECK)** is a Medical Advertisement Compliance Analysis System for Korean medical advertisements. It automatically detects and analyzes potential violations of Korean medical advertising laws (의료법) and related regulations.

**Current Version:** 1.3.0
**Language:** Korean (한국어) with English documentation
**License:** ISC

### Core Value Proposition

1. **Violation Detection** - Analyze medical advertisements for regulatory violations
2. **Price Analysis** - Track and compare medical procedure pricing across hospitals
3. **False Positive Management** - Continuously improve detection accuracy
4. **Competitive Intelligence** - Monitor competitor pricing and market trends

---

## Repository Structure

```
ad-medcheck/
├── CLAUDE.md                    # This file (project guide)
├── README.md                    # Project overview
├── docs/
│   └── MEDCHECK_Engine_Enhancement_Design.md  # System design document
│
└── medcheck-engine/             # Main application
    ├── src/
    │   ├── index.ts             # Main entry point (Hono app)
    │   ├── types/               # TypeScript type definitions
    │   ├── api/
    │   │   ├── routes/          # API route handlers
    │   │   │   ├── analyze.ts   # Violation analysis endpoints
    │   │   │   ├── patterns.ts  # Pattern management
    │   │   │   ├── feedback.ts  # User feedback
    │   │   │   ├── validation.ts
    │   │   │   └── false-positives.ts  # FP management
    │   │   └── health.ts        # Health check service
    │   ├── core/
    │   │   ├── parser.ts        # Text parsing
    │   │   ├── normalizer.ts    # Text normalization
    │   │   ├── router.ts        # Internal routing
    │   │   ├── logger.ts        # Logging utilities
    │   │   ├── tracer.ts        # Analysis tracing
    │   │   └── error-handler.ts
    │   ├── modules/
    │   │   ├── violation-detector/
    │   │   │   ├── index.ts     # ViolationDetector class
    │   │   │   ├── pattern-matcher.ts
    │   │   │   └── rule-engine.ts
    │   │   └── ai-analyzer/
    │   │       ├── context-analyzer.ts
    │   │       └── llm-client.ts
    │   ├── adapters/
    │   │   ├── ocr-adapter.ts   # OCR integration
    │   │   └── scv-adapter.ts   # SCV integration
    │   └── db/
    │       ├── d1.ts            # Cloudflare D1 client
    │       ├── supabase.ts      # Supabase client
    │       ├── schema.sql       # PostgreSQL schema
    │       ├── schema.d1.sql    # D1 (SQLite) schema
    │       └── migrations/      # Database migrations
    ├── patterns/
    │   └── patterns.json        # 156 violation patterns
    ├── migrations/              # Pricing module migrations
    ├── dashboard/               # React dashboard components
    ├── references/              # Legal references (laws, guidelines, cases)
    ├── docs/
    │   └── ROADMAP.md           # Development roadmap
    ├── package.json
    ├── tsconfig.json
    └── wrangler.toml            # Cloudflare Workers config
```

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Cloudflare Workers |
| Framework | Hono (v4.x) |
| Language | TypeScript (v5.x) |
| Database | Cloudflare D1 (SQLite) / Supabase (PostgreSQL) |
| Build | esbuild |
| Deployment | Wrangler CLI |

---

## Development Commands

```bash
# Navigate to engine directory
cd medcheck-engine

# Install dependencies
npm install

# Development server (local Workers environment)
npm run dev

# Build for production
npm run build

# Deploy to Cloudflare Workers
npm run deploy
```

---

## Architecture

### Module Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MedCheck Engine v1.3.0                   │
├─────────────────────────────────────────────────────────────┤
│  API Layer (Hono)                                           │
│  - /v1/analyze     - Violation analysis                     │
│  - /v1/patterns    - Pattern management                     │
│  - /v1/false-positives - FP reporting & management          │
│  - /v1/procedures  - Procedure catalog                      │
│  - /v2/prices      - Price records (v2 with area/shots)     │
├─────────────────────────────────────────────────────────────┤
│  Core Layer                                                 │
│  - Text normalization & preprocessing                       │
│  - Pattern matching engine (regex + keywords)               │
│  - Rule engine for violation judgment                       │
│  - Result formatting                                        │
├─────────────────────────────────────────────────────────────┤
│  Module 1: Violation Detection                              │
│  - 156 patterns across 32 categories                        │
│  - Legal basis mapping (의료법 제56조 등)                    │
│  - Severity scoring (critical/major/minor)                  │
├─────────────────────────────────────────────────────────────┤
│  Module 2: Price Analysis (v2)                              │
│  - Procedure-area-based pricing                             │
│  - Shot/unit price calculation                              │
│  - Screenshot evidence storage                              │
│  - Competitor price monitoring                              │
├─────────────────────────────────────────────────────────────┤
│  AI Layer                                                   │
│  - Context analysis for ambiguous cases                     │
│  - LLM integration (Claude/GPT/Gemini)                      │
│  - OCR for image text extraction                            │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Input (Crawled Ad) → Parse → Normalize → Pattern Match → AI Review → Score → Output
                              ↓
                         OCR (if images)
                              ↓
                         Price Extract
```

---

## Key Data Types

### Analysis Input

```typescript
interface ModuleInput {
  source: string;      // Source URL
  content: string;     // Ad text content
  images?: string[];   // Image URLs (optional)
  metadata?: {
    hospitalName?: string;
    department?: string;
    adType?: string;   // blog, sns, website, ad
  };
}
```

### Analysis Output

```typescript
interface ModuleOutput {
  violations: ViolationResult[];
  prices?: PriceResult[];
  summary: string;
  confidence: number;  // 0-1
  processingTime?: number;
  analyzedAt: Date;
}

interface ViolationResult {
  type: ViolationType;           // prohibited_expression, exaggeration, etc.
  status: ViolationStatus;       // violation, likely, possible, clean
  severity: 'high' | 'medium' | 'low';
  matchedText: string;
  description: string;
  legalBasis: LegalBasis[];
  confidence: number;
  patternId?: string;
}
```

---

## API Reference

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Engine info |
| GET | `/v1/health` | Health check |
| POST | `/v1/analyze` | Analyze advertisement |
| GET | `/v1/patterns` | List all patterns |
| GET | `/v1/patterns/:id` | Get pattern details |

### False Positive Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/false-positives` | List FP cases |
| POST | `/v1/false-positives` | Report false positive |
| PATCH | `/v1/false-positives/:id` | Update FP status |
| GET | `/v1/exception-suggestions` | Auto-suggested exceptions |
| POST | `/v1/patterns/:id/exceptions` | Add pattern exception |

### Pricing API (v2)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/procedures` | List procedures |
| GET | `/v1/procedures/:id` | Procedure with prices |
| GET | `/v1/target-areas` | Body area codes |
| POST | `/v2/prices` | Register price (with mapping) |
| GET | `/v2/prices` | List price records |
| GET | `/v2/prices/stats` | Price statistics |
| GET | `/v2/prices/compare/:procedureId` | Compare prices |

### Screenshots & Alerts

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/screenshots` | Store screenshot |
| GET | `/v1/price-alerts` | Price change alerts |
| GET | `/v1/competitor-settings/:hospitalId` | Competitor settings |

---

## Pattern System

### Pattern Structure (patterns.json)

```json
{
  "id": "P-56-01-001",
  "category": "치료효과보장",
  "subcategory": "100% 완치 표현",
  "pattern": "100%\\s*(완치|치료|성공|개선|효과)",
  "patternType": "regex",
  "keywords": ["100%", "완치"],
  "severity": "critical",
  "legalBasis": "의료법 제56조 제2항 제3호",
  "description": "치료 효과를 100% 보장하는 표현",
  "example": "100% 완치 보장",
  "suggestion": "'개인에 따라 효과가 다를 수 있습니다' 문구 추가",
  "exceptions": ["100% 소독", "100% 예약제"]
}
```

### Pattern Categories (32 total)

| Code | Category | Description |
|------|----------|-------------|
| 01 | 치료효과보장 | Treatment effect guarantees |
| 02 | 부작용부정 | Denying side effects |
| 03 | 최상급표현 | Superlative expressions |
| 04 | 비교광고 | Comparative advertising |
| 05 | 환자유인 | Patient inducement |
| 06 | 전후사진 | Before/after photos |
| 07 | 신의료기술 | New medical technology |
| 15 | 암시적표현 | Implicit claims |
| 19 | 꼼수패턴 | Evasion patterns |
| ... | ... | (see patterns.json for full list) |

---

## Database Schema Highlights

### Key Tables (D1)

| Table | Purpose |
|-------|---------|
| `analysis_logs` | Analysis session records |
| `pattern_hits` | Matched violations |
| `false_positive_cases` | Reported false positives |
| `pattern_exceptions` | Pattern exception rules |
| `procedures` | Procedure catalog |
| `price_records_v2` | Price data with area/shots |
| `price_screenshots` | Screenshot evidence |
| `mapping_candidates` | Unmapped procedure names |
| `price_change_alerts` | Price monitoring alerts |

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

- Ambiguous cases → "Possible violation" (not "Violation")
- Only clear cases → "Violation"
- Always indicate "Human review required"

### 4. Pattern ID Convention

```
P-{LAW}-{CATEGORY}-{SEQUENCE}

Example: P-56-01-001
- P: Pattern
- 56: 의료법 제56조
- 01: Category code (치료효과보장)
- 001: Sequence number
```

---

## False Positive Management

### FP Types

| Type | Description | Resolution |
|------|-------------|------------|
| `context_dependent` | Meaning changes by context | Add exception rule |
| `domain_specific` | Medical specialty term | Department-specific exception |
| `quotation` | Quote/reference context | Citation detection logic |
| `negation` | Negative context | Negation word detection |
| `education` | Educational content | Education content exception |
| `pattern_too_broad` | Pattern overly generic | Refine pattern |
| `ocr_error` | OCR misread | Improve OCR quality |

### Auto-Suggestion Thresholds

```javascript
const FP_THRESHOLDS = {
  ALERT: 3,        // 3+ cases → alert
  REVIEW: 5,       // 5+ cases → review recommended
  AUTO_SUGGEST: 10 // 10+ cases → auto exception suggestion
};
```

---

## Environment Variables

```toml
# wrangler.toml
[vars]
ENVIRONMENT = "development"  # development | production
ENGINE_VERSION = "1.1.0"
PATTERN_VERSION = "1.0.0"
LOG_LEVEL = "info"           # debug | info | warn | error

[[d1_databases]]
binding = "DB"
database_name = "medcheck-db"
database_id = "<your-database-id>"
```

---

## Testing Guidelines

### Manual Testing

```bash
# Health check
curl http://localhost:8787/v1/health

# Analyze text
curl -X POST http://localhost:8787/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{"content": "100% 완치 보장! 부작용 전혀 없습니다."}'

# Get patterns
curl http://localhost:8787/v1/patterns
```

### Test Cases Priority

1. Critical violations (100% guarantees, no side effects)
2. Superlative claims (최고, 최초, 유일)
3. Edge cases (context-dependent expressions)
4. False positive scenarios

---

## Deployment

```bash
# Build and deploy
cd medcheck-engine
npm run deploy

# Check deployment
wrangler tail  # View logs
```

---

## Roadmap Summary

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 1 | Engine Core | Completed |
| Phase 2 | Pattern DB (156 patterns) | Completed |
| Phase 3 | AI Hybrid Analysis | In Progress |
| Phase 4 | Automation Pipeline | Planned |
| Phase 5 | False Positive Management | Completed |
| Phase 6 | Trick Pattern Collection | In Progress |
| Phase 7 | Marketing Trend Monitoring | Planned |

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
- **Last Updated**: 2026-01-29

---

*This document is auto-generated and maintained for AI assistant context. For detailed implementation, refer to source code and inline documentation.*
