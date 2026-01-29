# CLAUDE.md - MedCheck Engine Context

## 프로젝트 개요

**MADMEDCHECK**의 핵심 엔진 - 의료광고 위반 분석 시스템

의료법 및 관련 법령을 기반으로 의료광고의 위반 여부를 자동으로 탐지하고 분석하는 엔진입니다.

## 작업 방식

- **바이브코딩 Solo 작업** - Claude와 1:1 협업 개발
- 점진적 구현, 작은 단위로 검증하며 진행

## 아키텍처

모듈형 구조로 설계:

```
┌─────────────────────────────────────────┐
│              MedCheck Engine            │
├─────────────────────────────────────────┤
│  Core (공통 기능)                        │
│  - 텍스트 전처리                         │
│  - 패턴 매칭 엔진                        │
│  - 결과 포맷팅                           │
├─────────────────────────────────────────┤
│  Module 1: 위반 탐지                     │
│  - 금지 표현 탐지                        │
│  - 과장/허위 광고 판별                   │
│  - 법적 근거 매핑                        │
├─────────────────────────────────────────┤
│  Module 2: 수가 분석                     │
│  - 급여/비급여 구분                      │
│  - 적정 수가 비교                        │
│  - 이상 가격 탐지                        │
└─────────────────────────────────────────┘
```

## 디렉토리 구조

```
medcheck-engine/
├── src/              # 소스 코드
├── docs/             # 문서
├── patterns/         # 위반 패턴 정의
└── references/       # 근거 자료 (법령, 가이드라인, 사례)
    ├── laws/         # 법령 원문
    ├── guidelines/   # 정부/기관 가이드라인
    └── cases/        # 판례, 행정처분 사례
```

## 핵심 규칙

### 1. 추측 금지, 근거 기반 작업

> **절대 추측하지 말 것. 반드시 `references/` 폴더의 근거 자료를 기반으로만 작업할 것.**

- 위반 판단 기준: `references/laws/`의 법령 조항
- 패턴 정의: `references/guidelines/`의 공식 가이드라인
- 예외 처리: `references/cases/`의 실제 사례

### 2. 법적 근거 명시

모든 위반 탐지 결과에는 반드시 법적 근거를 포함:
- 해당 법령 조항
- 관련 가이드라인
- 유사 판례/처분 사례 (있는 경우)

### 3. 보수적 판단

- 애매한 경우 "위반 가능성 있음"으로 분류
- 확실한 경우만 "위반"으로 판정
- 항상 사람의 최종 검토 필요 명시

## 입출력 형식

### Input (크롤링 데이터)
```typescript
interface ModuleInput {
  source: string;      // 출처 URL
  content: string;     // 광고 텍스트
  images?: string[];   // 이미지 URL (선택)
  metadata?: object;   // 추가 정보
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
```

## 개발 명령어

```bash
npm run dev    # 개발 모드 실행
npm run build  # TypeScript 빌드
npm start      # 프로덕션 실행
```
