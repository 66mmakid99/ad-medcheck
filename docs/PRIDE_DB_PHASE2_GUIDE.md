# MADMEDCHECK 가격 DB - Phase 2 구현 가이드

## 📦 Phase 2 내용

| # | 파일 | 설명 |
|---|------|------|
| 1 | `03_dim_regions.sql` | 지역 계층 테이블 (시도 > 시군구 > 읍면동) |
| 2 | `04_bridge_procedure_aliases.sql` | 시술명 동의어 매핑 |
| 3 | `05_agg_region_prices.sql` | 지역별 가격 집계 뷰 |
| 4 | `regions.ts` | 지역 API |
| 5 | `aliases.ts` | 시술명 별칭 API |

---

## 🚀 설치 순서

### 1단계: 파일 복사

```
medcheck-engine/
├── schema/
│   ├── 01_dim_units.sql         (Phase 1 - 완료)
│   ├── 02_fact_prices.sql       (Phase 1 - 완료)
│   ├── 03_dim_regions.sql       ← 새로 추가
│   ├── 04_bridge_procedure_aliases.sql  ← 새로 추가
│   └── 05_agg_region_prices.sql ← 새로 추가
│
└── src/routes/
    ├── prices.ts                (Phase 1 - 완료)
    ├── units.ts                 (Phase 1 - 완료)
    ├── regions.ts               ← 새로 추가
    └── aliases.ts               ← 새로 추가
```

### 2단계: index.ts에 라우터 추가

`src/index.ts` 상단 import에 추가:
```typescript
import regions from './routes/regions';
import aliases from './routes/aliases';
```

app.route 부분에 추가:
```typescript
app.route('/api/regions', regions);
app.route('/api/aliases', aliases);
```

### 3단계: DB 마이그레이션

```bash
cd medcheck-engine

# 지역 테이블
wrangler d1 execute medcheck-db --file=./schema/03_dim_regions.sql --remote

# 시술명 별칭 테이블
wrangler d1 execute medcheck-db --file=./schema/04_bridge_procedure_aliases.sql --remote

# 가격 집계 뷰
wrangler d1 execute medcheck-db --file=./schema/05_agg_region_prices.sql --remote
```

### 4단계: 빌드 & 배포

```bash
npm run build
wrangler deploy
```

---

## 📡 새로운 API

### 지역 API

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/regions` | 전체 지역 목록 |
| `GET /api/regions/sido` | 시/도 목록 |
| `GET /api/regions/sigungu?sido=서울특별시` | 시/군/구 목록 |
| `GET /api/regions/dong?sigungu=강남구` | 읍/면/동 목록 |
| `GET /api/regions/search/query?q=역삼` | 지역명 검색 |
| `GET /api/regions/prices/강남구` | 지역별 가격 통계 |

### 시술명 별칭 API

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/aliases` | 전체 별칭 목록 |
| `POST /api/aliases/match` | 텍스트에서 시술명 매칭 ⭐ |
| `POST /api/aliases` | 새 별칭 추가 |
| `GET /api/aliases/equipment` | 장비-시술 매핑 |

---

## 🎯 핵심 기능: 시술명 자동 매칭

**요청:**
```json
POST /api/aliases/match
{
  "text": "울쎄라 300샷 79만원"
}
```

**응답:**
```json
{
  "success": true,
  "data": {
    "input": "울쎄라 300샷 79만원",
    "matches": [
      {
        "alias": "울쎄라",
        "procedureId": "PROC-LIFT-HIFU-001",
        "aliasType": "brand",
        "matchPriority": 100,
        "matchType": "exact"
      }
    ],
    "bestMatch": {
      "alias": "울쎄라",
      "procedureId": "PROC-LIFT-HIFU-001"
    },
    "matchCount": 1
  }
}
```

---

## 📊 초기 데이터

### 지역 (dim_regions)
- 17개 시/도
- 25개 서울 구
- 12개 강남구 동
- 5개 서초구 동

### 시술명 별칭 (bridge_procedure_aliases)
- 울쎄라: 6개 별칭
- 울트라포머: 6개 별칭
- 슈링크: 4개 별칭
- 온다: 7개 별칭
- 써마지: 6개 별칭
- 리쥬란: 6개 별칭
- 보톡스: 10개 별칭

---

## 💡 활용 시나리오

### 1. OCR 텍스트 → 표준 시술 매칭
```
"온다리프팅 6만줄 49만원"
    ↓ /api/aliases/match
{ procedureId: "PROC-LIFT-ONDA-001", alias: "온다리프팅" }
```

### 2. 지역별 가격 비교
```
GET /api/regions/prices/강남구
    ↓
{
  "procedureStats": [
    { "procedure_name": "울쎄라", "avg_price_per_unit": 2800, "sample_count": 50 }
  ]
}
```

### 3. Fair Price (적정 시세)
```sql
SELECT * FROM v_fair_prices WHERE sigungu = '강남구';
-- fair_price_low: 2240원 (평균의 80%)
-- fair_price_mid: 2800원 (평균)
-- fair_price_high: 3360원 (평균의 120%)
```

---

## 🔜 다음 단계 (Phase 3)

1. **가격 알림 시스템** - 특정 시술 가격 변동 알림
2. **대시보드 가격 분석 탭** - 시각화
3. **B2B API** - 병원 컨설팅용 API
