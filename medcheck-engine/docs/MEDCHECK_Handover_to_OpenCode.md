# MEDCHECK Engine - OpenCode 인계 문서
## 2026-01-30 작업 현황 및 다음 단계

---

## 📁 프로젝트 위치

```
C:\madmedcheck\ad-medcheck\medcheck-engine\
├── src/
│   └── index.ts              ← API v1.3.0 (배포됨)
├── migrations/
│   ├── 003_pricing_module.sql    ← 실행 완료
│   └── 004_pricing_v2_upgrade.sql ← 실행 완료
├── dashboard/
│   └── MedCheckDashboard-v1.3.jsx
├── patterns/
└── docs/
```

---

## 🚀 배포 현황

| 항목 | 상태 | URL/버전 |
|------|------|----------|
| API | ✅ 배포됨 | https://medcheck-engine.mmakid.workers.dev |
| 버전 | v1.3.0 | 시술가격 v2 포함 |
| DB | Cloudflare D1 | medcheck-db |
| Git | ✅ Push 완료 | github.com/66mmakid99/ad-medcheck |

---

## 🗄️ 현재 DB 테이블 (D1)

### 기존 테이블
- patterns, violations, false_positives, exceptions, tricks 등

### 시술가격 v2 테이블 (004 마이그레이션)
- target_areas (부위 표준화)
- price_records_v2 (부위별 + 샷당 단가)
- price_screenshots (스크린샷 증빙)
- mapping_candidates (매핑 후보)
- procedure_aliases (시술 별칭)
- procedure_packages (복합 시술)
- package_components (복합 구성)
- known_combinations (알려진 복합명)
- collected_procedure_names (원본 시술명)
- price_change_alerts (가격 변동 알림)
- competitor_settings (경쟁사 설정)
- price_watch_settings (알림 설정)
- coldcall_logs (콜드콜 기록)
- price_history (가격 히스토리)
- mapping_approval_settings (승인 조건)
- regulatory_agencies (규제기관 정보)

---

## 🏗️ MADMEDCHECK 서비스 구조

```
MEDCHECK ENGINE (핵심 엔진)
│
├── 의료광고위반 탐지 ─→ AD MEDCHECK (B2B 수비수) ✅ 개발중
│
└── 시술단가 수집 ────→ PRICE MEDCHECK (B2B 공격수) - 6개월 후 런칭

┌────────────────────────────────────────────────────────────────┐
│ 🛡️ 수비수 (B2B)                                               │
│ ├── AD MEDCHECK (의료광고 검증) ✅ 개발중                      │
│ └── AEO/GEO (검색 최적화) - 고도화 예정                        │
│     ※ 바이럴 마케팅 모니터링 삭제됨                            │
│                                                                │
│ ⚔️ 공격수 (B2B)                                               │
│ ├── PRICE MEDCHECK (시술단가 분석) - 6개월 데이터 후 런칭      │
│ └── SCORE MEDCHECK (의료인 실력 평가) - 이후 런칭              │
│                                                                │
│ 🌐 브랜드 PR                                                   │
│ └── 애기피부백과 (wiki.madmedcheck.com) - 크롤링과 동시 오픈!  │
│     ※ AI가 인용하는 신뢰 출처 = 최고의 마케팅                  │
│                                                                │
│ 👥 B2C                                                         │
│ └── 폴센트 컨셉 (가격 알림) - 데이터 충분 시 런칭              │
└────────────────────────────────────────────────────────────────┘
```

---

## 🎯 다음 작업: SCV 크롤러 개발

### 1. 크롤러 기본 구조

```
medcheck-scv/
├── collectors/
│   ├── hira-collector.ts      # 심평원 API 수집
│   ├── naver-matcher.ts       # 네이버 검색 매칭
│   └── price-crawler.ts       # 가격 페이지 크롤링
├── processors/
│   ├── screenshot.ts          # 스크린샷 캡쳐
│   ├── ocr.ts                 # OCR 텍스트 추출
│   └── price-parser.ts        # 가격 파싱
├── api/
│   └── engine-client.ts       # medcheck-engine API 호출
└── config/
    └── targets.ts             # 타겟 지역/진료과 설정
```

### 2. 병원 발견 전략

```
소스 1: 심평원 API
- 피부과/성형외과 기본 정보
- 문제: 홈페이지 URL 없음

소스 2: 비급여 진료비 공개
- 보톡스/필러 항목 있는 의원 = GP도 발견

소스 3: 시술명 검색 (핵심!)
- "강남 울쎄라", "강남 써마지" 등 200+ 키워드
- 네이버 플레이스에서 병원 + 홈페이지 URL 확보
- GP(일반의원)도 시술하면 발견됨!
```

### 3. 검색 키워드 (200+)

```
HIFU: 울쎄라, 울쎄라2, 슈링크, 슈링크유니버스, 리프테라, 더블로, 더블로골드, 
      울트라포머, 울트라포머MPT, 유쎄라, 울핏, 포텐자...

RF: 써마지, 써마지FLX, 써마지CPT, 올리지오, 인모드, 인모드FX, 인모드GFX, 
    텐써마, 엑실리스, 토르RF, 아그네스, 스카렛, 시크릿RF, 인피니, 포텐자, 비바체...

스킨부스터: 리쥬란, 리쥬란힐러, 리쥬란아이, 쥬베룩, 쥬베룩볼륨, 물광주사, 
           연어주사, 핑크주사, 백옥주사, 엑소좀, 프로파일로, 스컬트라...

보톡스: 보톡스, 제오민, 나보타, 보툴렉스, 디스포트, 리즈톡스, 코어톡스...

필러: 쥬비덤, 레스틸렌, 벨로테로, 이브아르, 클레비엘...

레이저: 피코슈어, 피코웨이, 피코플러스, 클라리티, 프락셀, 스펙트라...

바디: 지방분해주사, 쿨스컬프팅, 브이로, 엠스컬프트...
```

---

## 🗄️ DB 설계: 시술명 vs 검색키워드 분리

### 핵심 원칙
- `procedures`: 검증된 공식명만 (장비명/약품명)
- `search_keywords`: 마케팅명, 오타 포함
- 마케팅명은 1:1 매핑 안 되면 `ambiguous` 처리
- AI 자동 검증 (Perplexity + Claude)으로 매핑 승인

### 테이블 구조

```sql
-- 시술/장비 기준 테이블 (검증된 것만)
CREATE TABLE procedures (
  id TEXT PRIMARY KEY,
  official_name TEXT NOT NULL,        -- Ulthera
  korean_name TEXT NOT NULL,          -- 울쎄라
  category TEXT,                      -- HIFU, RF, injection
  manufacturer TEXT,                  -- 머츠
  equipment_type TEXT,                -- equipment, product, drug
  is_verified INTEGER DEFAULT 0,
  verification_source TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 검색 키워드 테이블
CREATE TABLE search_keywords (
  id TEXT PRIMARY KEY,
  keyword TEXT NOT NULL,              -- 울세라, 핑크주사
  keyword_type TEXT,                  -- official, alias, typo, marketing
  mapped_procedure_id TEXT,           -- procedures 연결 (NULL 가능)
  mapping_status TEXT DEFAULT 'pending', 
  -- verified, pending, ambiguous, rejected
  mapping_confidence INTEGER,
  mapping_note TEXT,
  search_count INTEGER DEFAULT 0,
  found_hospitals INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (mapped_procedure_id) REFERENCES procedures(id)
);
```

---

## 🤖 AI 자동 검증 시스템

```
새 키워드 발견 ("연어주사")
    ↓
1️⃣ 텍스트 유사도 분석
   - 95%+ = 오타로 즉시 매핑
   - 70-95% = 추가 검증 필요
   - 70% 미만 = 새로운 시술 or 마케팅명
    ↓
2️⃣ Perplexity 웹 검색
   - "연어주사 성분 제조사 정확한 명칭"
   - 공식명, 제조사, 성분, 연관 시술 추출
    ↓
3️⃣ Claude AI 분석
   - verdict: map_existing / create_new / ambiguous / needs_review
   - confidence: 0-100
   - reasoning: 판단 근거
    ↓
4️⃣ 자동 처리
   - 90%+ → 자동 승인
   - 70-89% → 검토 대기
   - 70% 미만 → ambiguous 처리
```

---

## 📚 애기피부백과 (wiki.madmedcheck.com)

### 목적
- AI가 인용하는 신뢰 출처 = 최고의 마케팅
- AEO/GEO/SEO 완벽 최적화
- PRICE보다 먼저 오픈 (크롤링과 동시 시작)

### 콘텐츠 구조

```
시술 정보
├── 기본 정보 (원리, 제조사)
├── 인증 (FDA, MFDS, CE-MDR, ANVISA, TGA...)
├── 연구 (논문 수, 임상시험, 효과율, 한계점)
├── 부작용 (FDA MAUDE, 피해사례)
├── 법적 분쟁 (판결문, 배상액)
├── 리콜/경고 이력
└── 마케팅명 해설 (핑크주사 = ?)
```

### AI 신뢰 확보 조건
- 출처 명확: FDA, MFDS, PubMed 인용
- 구조화: Schema.org 마크업
- 균형: 장점 + 단점 + 주의사항
- 최신성: 정기 업데이트 + 날짜 표시
- E-E-A-T 충족

---

## 📅 런칭 로드맵

```
[Phase 1] 현재
├── AD MEDCHECK 개발
├── 크롤러 연동
└── 분석 엔진 안정화

[Phase 1.5] 크롤링 시작과 동시
├── 🌐 애기피부백과 오픈 (브랜드 PR)
└── 💰 시술단가 DB 축적 시작 (비공개)

[Phase 2] 6개월 후
└── PRICE MEDCHECK 런칭 (B2B)
    - 6개월 평균 변화 그래프 제공
    - 경쟁사 모니터링
    - AI 가격 전략 제안

[Phase 3] 이후
├── SCORE MEDCHECK 런칭 (B2B)
└── AEO/GEO 고도화

[Phase 4] 데이터 충분 시
└── 폴센트 컨셉 B2C 오픈
```

---

## 🔧 기술 스택

- **API**: Cloudflare Workers + Hono (TypeScript)
- **DB**: Cloudflare D1 (SQLite)
- **AI**: Claude API (맥락 분석), Perplexity API (데이터 수집)
- **크롤러**: Node.js + Puppeteer (권장)
- **대시보드**: React

---

## 📌 중요 메모

1. **시술명 = 장비명/약품명** (검증된 공식명만 procedures에 저장)
2. **마케팅명(핑크주사 등)은 1:1 매핑 안 되면 ambiguous** 처리
3. **부위별 가격 + 샷당 단가** 필수 수집 (같은 울쎄라도 눈가/전체 가격 다름)
4. **스크린샷 증빙** 필수 (헐루시네이션 방지)
5. **바이럴 모니터링 삭제됨**, AEO/GEO만 고도화

---

## ✅ 다음 즉시 작업

1. `medcheck-scv` 폴더 생성
2. 검색 키워드 테이블 생성 + 200개 키워드 입력
3. 네이버 플레이스 검색 수집기 개발
4. 병원 발견 → 홈페이지 URL 확보 → 가격 크롤링 파이프라인

---

*작성: 2026-01-30*
*인계: Claude AI → OpenCode*
