# MADMEDCHECK 가격 DB - Phase 1 구현 가이드

## 📦 구현 내용

### 1. dim_units (단위 마스터 테이블)
시술별 고유 단위를 관리하여 **동일 시술 내 "단위당 가격"** 비교가 가능하도록 합니다.

⚠️ **중요**: 다른 시술 간 단위 환산은 **불가능**합니다!

| 단위 코드 | 한국어 | 시술 | 설명 | OCR 패턴 |
|----------|--------|------|------|----------|
| SHOT | 샷 | HIFU/고주파 | 울쎄라, 울트라포머, 써마지 조사 횟수 | 샷, shot, S |
| JOULE | 줄 | ONDA 전용 | 온다 리프팅 에너지 (1만줄=10kJ) | 줄, 만줄, J, kJ |
| CC | 씨씨 | 필러/주사 | 리쥬란, 쥬베룩 용량 | cc, ml, 씨씨 |
| UNIT | 유닛 | 보톡스 | 보툴리눔 톡신 단위 | 유닛, unit, U |
| AREA | 부위 | 레이저/피부 | 시술 부위 (얼굴, 이마 등) | 부위, 군데 |
| SESSION | 회 | 패키지 | 횟수/회차 | 회, 번, 차 |
| MG | 밀리그램 | 약물 | 용량 | mg |
| VIAL | 바이알 | 주사 | 용기 단위 | 바이알, vial |
| AMPULE | 앰플 | 주사 | 앰플 단위 | 앰플, amp |
| FULL | 전체 | 공통 | 전체 범위 | 전체, 풀, 얼굴전체 |

### 2. fact_prices (가격 팩트 테이블)
OCR로 수집된 모든 가격 데이터를 저장합니다.

**핵심 필드:**
- `price_per_unit`: 단위당 가격 (**자동 계산**)
- `normalized_price_per_unit`: 기준 단위로 환산된 가격

### 3. prices API
OCR 결과를 파싱하여 fact_prices에 저장하는 API입니다.

---

## 🚀 설치 및 배포

### 1단계: 파일 복사
```bash
# medcheck-engine 프로젝트에 파일 복사
cp schema/*.sql ../ad-medcheck/medcheck-engine/schema/
cp src/routes/prices.ts ../ad-medcheck/medcheck-engine/src/routes/
cp src/routes/units.ts ../ad-medcheck/medcheck-engine/src/routes/
cp src/types/index.ts ../ad-medcheck/medcheck-engine/src/types/
```

### 2단계: DB 마이그레이션
```bash
cd medcheck-engine

# dim_units 테이블 생성
wrangler d1 execute madmedcheck-db --file=./schema/01_dim_units.sql

# fact_prices 테이블 생성  
wrangler d1 execute madmedcheck-db --file=./schema/02_fact_prices.sql

# 확인
wrangler d1 execute madmedcheck-db --command="SELECT * FROM dim_units;"
```

### 3단계: 라우터 등록
`src/index.ts`에 추가:
```typescript
import prices from './routes/prices';
import units from './routes/units';

// ...

app.route('/api/prices', prices);
app.route('/api/units', units);
```

### 4단계: 배포
```bash
wrangler deploy
```

---

## 📡 API 사용 예제

### 1. OCR 결과에서 가격 저장

**엔드포인트:** `POST /api/prices/from-ocr`

**요청:**
```json
{
  "rawPriceText": "울쎄라 300샷 79만원",
  "hospitalName": "강남뷰티의원",
  "sigungu": "강남구",
  "dong": "역삼동",
  "procedureNameRaw": "울쎄라",
  "equipmentName": "울쎄라",
  "priceType": "regular",
  "isEvent": false,
  "sourceType": "ocr",
  "ocrConfidence": 0.95
}
```

**응답:**
```json
{
  "success": true,
  "data": {
    "id": "PRICE-20240131-ABC123",
    "parsed": {
      "totalPrice": 790000,
      "quantity": 300,
      "unit": "SHOT",
      "pricePerUnit": 2633
    },
    "normalized": {
      "quantity": 300,
      "unitId": "UNIT-SHOT",
      "pricePerUnit": 2633
    },
    "hospitalName": "강남뷰티의원",
    "procedureMatched": "울쎄라",
    "confidence": 1.0
  }
}
```

### 2. 배치 저장 (여러 가격 한번에)

**엔드포인트:** `POST /api/prices/batch`

**요청:**
```json
{
  "prices": [
    {
      "rawPriceText": "울쎄라 300샷 79만원",
      "hospitalName": "강남뷰티의원",
      "sigungu": "강남구"
    },
    {
      "rawPriceText": "리쥬란 4cc 49만원",
      "hospitalName": "강남뷰티의원",
      "sigungu": "강남구"
    },
    {
      "rawPriceText": "보톡스 100유닛 15만원",
      "hospitalName": "강남뷰티의원",
      "sigungu": "강남구"
    }
  ]
}
```

### 3. 가격 목록 조회

**엔드포인트:** `GET /api/prices`

**쿼리 파라미터:**
| 파라미터 | 설명 | 예시 |
|---------|------|------|
| sigungu | 지역 필터 | 강남구 |
| procedureId | 시술 필터 | PROC-LIFT-001 |
| unitId | 단위 필터 | UNIT-SHOT |
| minPrice | 최소 단위가 | 1000 |
| maxPrice | 최대 단위가 | 5000 |
| isEvent | 이벤트 여부 | true/false |
| sortBy | 정렬 기준 | price_per_unit |
| sortOrder | 정렬 방향 | asc/desc |
| limit | 개수 | 20 |
| offset | 오프셋 | 0 |

**예시:**
```
GET /api/prices?sigungu=강남구&sortBy=price_per_unit&sortOrder=asc&limit=10
```

### 4. 가격 비교

**엔드포인트:** `GET /api/prices/compare`

**쿼리 파라미터:**
- `procedureId`: 시술 ID (필수)
- `sigungu`: 지역 (선택)

**예시:**
```
GET /api/prices/compare?procedureId=PROC-LIFT-001&sigungu=강남구
```

**응답:**
```json
{
  "success": true,
  "data": {
    "procedureId": "PROC-LIFT-001",
    "regionStats": [
      {
        "sigungu": "강남구",
        "sampleCount": 50,
        "avgPricePerUnit": 2800,
        "minPricePerUnit": 2000,
        "maxPricePerUnit": 4000,
        "avgTotalPrice": 850000
      }
    ],
    "hospitalPrices": [
      {
        "hospitalName": "강남뷰티의원",
        "totalPrice": 790000,
        "quantity": 300,
        "pricePerUnit": 2633,
        "isEvent": false
      }
    ]
  }
}
```

### 5. 단위 파싱 테스트

**엔드포인트:** `POST /api/units/parse-test`

**요청:**
```json
{
  "text": "울쎄라 300샷 79만원, 리쥬란 4cc 49만원"
}
```

**응답:**
```json
{
  "success": true,
  "data": {
    "input": "울쎄라 300샷 79만원, 리쥬란 4cc 49만원",
    "matches": [
      {
        "unitId": "UNIT-SHOT",
        "unitCode": "SHOT",
        "unitName": "샷",
        "pattern": "샷",
        "match": "300샷",
        "quantity": 300
      },
      {
        "unitId": "UNIT-CC",
        "unitCode": "CC",
        "unitName": "씨씨",
        "pattern": "cc",
        "match": "4cc",
        "quantity": 4
      }
    ],
    "matchCount": 2
  }
}
```

### 6. 통계 요약

**엔드포인트:** `GET /api/prices/stats/summary`

**응답:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_prices": 1250,
      "unique_hospitals": 320,
      "unique_procedures": 45,
      "unique_regions": 25,
      "avg_price_per_unit": 2850,
      "avg_confidence": 0.92,
      "event_prices": 180,
      "verified_prices": 450
    },
    "recentActivity": [
      { "date": "2024-01-31", "count": 45 },
      { "date": "2024-01-30", "count": 62 }
    ],
    "unitDistribution": [
      { "unit": "샷", "count": 650, "percentage": 52.0 },
      { "unit": "씨씨", "count": 320, "percentage": 25.6 }
    ]
  }
}
```

---

## 💡 핵심 가치

### 동일 시술 내 "단위당 가격" 비교가 가능해집니다!

⚠️ **주의**: 다른 시술 간 단위 비교는 의미가 없습니다!
- 울쎄라(샷) vs ONDA(줄) 비교 ❌
- 울쎄라 A병원(샷) vs 울쎄라 B병원(샷) 비교 ✅

**예시 1: HIFU(샷 단위) 비교**
```
Before:
A병원: 울쎄라 300샷 79만원
B병원: 울쎄라 500샷 100만원
→ 어디가 더 싼지 비교 어려움

After:
A병원: 샷당 2,633원 (300샷 79만원)
B병원: 샷당 2,000원 (500샷 100만원)
→ B병원이 샷당 633원 저렴!
```

**예시 2: ONDA(줄 단위) 비교**
```
Before:
A병원: 온다 6만줄 49만원
B병원: 온다 10만줄 69만원
→ 어디가 더 싼지 비교 어려움

After:
A병원: 1만줄당 81,667원 (6만줄 49만원)
B병원: 1만줄당 69,000원 (10만줄 69만원)
→ B병원이 1만줄당 12,667원 저렴!
```

---

## 📁 파일 구조

```
madmedcheck-price-db/
├── schema/
│   ├── 01_dim_units.sql      # 단위 마스터 테이블
│   └── 02_fact_prices.sql    # 가격 팩트 테이블
├── src/
│   ├── routes/
│   │   ├── prices.ts         # 가격 API
│   │   └── units.ts          # 단위 API
│   ├── types/
│   │   └── index.ts          # 타입 정의
│   └── index.ts              # 메인 라우터
├── migrate.sh                # 마이그레이션 스크립트
└── README.md                 # 이 문서
```

---

## 🔜 다음 단계 (Phase 2)

1. **dim_regions** - 지역 계층 구조 (시도 > 시군구 > 읍면동)
2. **bridge_procedure_aliases** - 시술명 동의어 매핑
3. **가격 변동 이력 트리거** - 가격 변경 자동 추적
4. **agg_region_prices** - 지역별 가격 집계 배치
