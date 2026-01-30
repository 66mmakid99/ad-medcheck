# CLAUDE.md - MedCheck Engine Context

> **See also:** [Root CLAUDE.md](../CLAUDE.md) for comprehensive project documentation

## 프로젝트 개요

**MADMEDCHECK**의 핵심 엔진 - 의료광고 위반 분석 시스템 (v1.3.0)

의료법 및 관련 법령을 기반으로 의료광고의 위반 여부를 자동으로 탐지하고 분석하는 엔진입니다.

## 작업 방식

- **바이브코딩 Solo 작업** - Claude와 1:1 협업 개발
- 점진적 구현, 작은 단위로 검증하며 진행
- Cloudflare Workers 환경에서 실행

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                    MedCheck Engine v1.3.0                   │
├─────────────────────────────────────────────────────────────┤
│  API Layer (Hono)                                           │
│  - 분석 API (/v1/analyze)                                   │
│  - 패턴 관리 (/v1/patterns)                                 │
│  - 오탐 관리 (/v1/false-positives)                          │
│  - 가격 API v2 (/v2/prices)                                 │
├─────────────────────────────────────────────────────────────┤
│  Core (공통 기능)                                            │
│  - 텍스트 전처리 (parser, normalizer)                        │
│  - 패턴 매칭 엔진 (pattern-matcher)                          │
│  - 규칙 엔진 (rule-engine)                                   │
│  - 결과 포맷팅                                               │
├─────────────────────────────────────────────────────────────┤
│  Module 1: 위반 탐지 (violation-detector)                    │
│  - 156개 패턴 (32개 카테고리)                                │
│  - 금지 표현 탐지                                            │
│  - 과장/허위 광고 판별                                       │
│  - 법적 근거 매핑 (의료법 제56조 등)                          │
├─────────────────────────────────────────────────────────────┤
│  Module 2: 수가 분석 (pricing v2)                            │
│  - 시술/부위별 가격 분석                                     │
│  - 샷당 단가 계산                                            │
│  - 스크린샷 증빙                                             │
│  - 경쟁사 가격 모니터링                                      │
├─────────────────────────────────────────────────────────────┤
│  AI Layer (ai-analyzer)                                     │
│  - 맥락 분석 (context-analyzer)                              │
│  - LLM 통합 (llm-client)                                    │
│  - OCR 연동 (ocr-adapter)                                   │
└─────────────────────────────────────────────────────────────┘
```

## 디렉토리 구조

```
medcheck-engine/
├── src/
│   ├── index.ts            # 메인 엔트리 (Hono 앱)
│   ├── types/              # 타입 정의
│   ├── api/
│   │   └── routes/         # API 라우트 핸들러
│   ├── core/               # 핵심 유틸리티
│   ├── modules/
│   │   ├── violation-detector/  # 위반 탐지 모듈
│   │   └── ai-analyzer/         # AI 분석 모듈
│   ├── adapters/           # 외부 서비스 어댑터
│   └── db/                 # 데이터베이스 스키마/클라이언트
├── patterns/               # 위반 패턴 정의 (JSON)
├── migrations/             # DB 마이그레이션
├── dashboard/              # React 대시보드 컴포넌트
├── references/             # 근거 자료 (법령, 가이드라인, 사례)
│   ├── laws/               # 법령 원문
│   ├── guidelines/         # 정부/기관 가이드라인
│   └── cases/              # 판례, 행정처분 사례
├── docs/                   # 문서
├── package.json
├── tsconfig.json
└── wrangler.toml           # Cloudflare Workers 설정
```

## 핵심 규칙

### 1. 추측 금지, 근거 기반 작업

> **절대 추측하지 말 것. 반드시 `references/` 폴더의 근거 자료를 기반으로만 작업할 것.**

- 위반 판단 기준: `references/laws/`의 법령 조항
- 패턴 정의: `references/guidelines/`의 공식 가이드라인
- 예외 처리: `references/cases/`의 실제 사례

### 2. 법적 근거 명시

모든 위반 탐지 결과에는 반드시 법적 근거를 포함:
- 해당 법령 조항 (예: 의료법 제56조 제2항 제3호)
- 관련 가이드라인
- 유사 판례/처분 사례 (있는 경우)

### 3. 보수적 판단

- 애매한 경우 → "위반 가능성 있음 (possible)"
- 확실한 경우만 → "위반 (violation)"
- 항상 사람의 최종 검토 필요 명시

## 입출력 형식

### Input (크롤링 데이터)

```typescript
interface ModuleInput {
  source: string;      // 출처 URL
  content: string;     // 광고 텍스트
  images?: string[];   // 이미지 URL (선택)
  metadata?: {
    hospitalName?: string;
    department?: string;
    adType?: string;   // blog, sns, website, ad
  };
}
```

### Output (분석 결과)

```typescript
interface ModuleOutput {
  violations: ViolationResult[];  // 위반 탐지 결과
  prices?: PriceResult[];         // 수가 분석 결과
  summary: string;                // 요약
  confidence: number;             // 신뢰도 (0-1)
}

interface ViolationResult {
  type: ViolationType;      // 위반 유형
  status: ViolationStatus;  // violation, likely, possible, clean
  severity: 'high' | 'medium' | 'low';
  matchedText: string;
  description: string;
  legalBasis: LegalBasis[];
  confidence: number;
  patternId?: string;       // P-56-XX-XXX 형식
}
```

## 개발 명령어

```bash
npm run dev    # 개발 모드 실행 (wrangler dev)
npm run build  # TypeScript 빌드 (esbuild)
npm run deploy # 빌드 후 배포 (wrangler deploy)
```

## 주요 API 엔드포인트

### 분석 API

```
GET  /                          # 엔진 정보
GET  /v1/health                 # 헬스체크
POST /v1/analyze                # 광고 분석
```

### 패턴 관리

```
GET  /v1/patterns               # 패턴 목록
GET  /v1/patterns/:id           # 패턴 상세
GET  /v1/patterns/:id/exceptions    # 패턴 예외 목록
POST /v1/patterns/:id/exceptions    # 예외 추가
GET  /v1/patterns/:id/versions      # 버전 이력
```

### 오탐 관리

```
GET  /v1/false-positives        # 오탐 목록
POST /v1/false-positives        # 오탐 신고
PATCH /v1/false-positives/:id   # 상태 변경
GET  /v1/exception-suggestions  # 자동 제안 목록
POST /v1/exception-suggestions/:id/approve  # 제안 승인
```

### 가격 API (v2)

```
GET  /v1/procedures             # 시술 목록
GET  /v1/procedures/:id         # 시술 상세 (부위별 가격 포함)
GET  /v1/target-areas           # 부위 목록
POST /v2/prices                 # 가격 등록 (자동 매핑)
GET  /v2/prices                 # 가격 목록
GET  /v2/prices/stats           # 가격 통계
GET  /v2/prices/compare/:id     # 가격 비교
GET  /v1/price-alerts           # 가격 변동 알림
```

## 패턴 ID 규칙

```
P-{법조항}-{카테고리}-{순번}

예: P-56-01-001
- P: Pattern
- 56: 의료법 제56조
- 01: 카테고리 (치료효과보장)
- 001: 순번
```

## 현재 상태 (v1.3.0)

### 완료된 기능
- [x] 위반 탐지 엔진 (156개 패턴)
- [x] 오탐 관리 시스템
- [x] 가격 분석 v2 (부위별 단가)
- [x] 스크린샷 증빙
- [x] 매핑 승인 시스템
- [x] 가격 변동 알림

### 진행 중
- [ ] AI 하이브리드 분석
- [ ] 꼼수 패턴 수집

### 예정
- [ ] 마케팅 트렌드 모니터링
- [ ] 자동화 파이프라인

---

*MedCheck Engine v1.3.0 | 2026-01*
