# MADMEDCHECK 가격 DB - Phase 3 구현 가이드

## 📦 Phase 3 내용

| # | 파일 | 설명 |
|---|------|------|
| 1 | `06_price_alerts.sql` | 가격 알림 테이블 + 알림 로그 |
| 2 | `alerts.ts` | 알림 구독/관리 API |
| 3 | `analytics.ts` | 가격 분석 API (대시보드용) |

---

## 🚀 설치 순서

### 1단계: 파일 복사

```
medcheck-engine/
├── schema/
│   └── 06_price_alerts.sql      ← 새로 추가
│
└── src/routes/
    ├── alerts.ts                 ← 새로 추가
    └── analytics.ts              ← 새로 추가
```

### 2단계: index.ts에 라우터 추가

상단 import:
```typescript
import alerts from './routes/alerts';
import analytics from './routes/analytics';
```

app.route 추가:
```typescript
app.route('/api/alerts', alerts);
app.route('/api/analytics', analytics);
```

### 3단계: DB 마이그레이션

```bash
wrangler d1 execute medcheck-db --file=./schema/06_price_alerts.sql --remote
```

### 4단계: 빌드 & 배포

```bash
npm run build
wrangler deploy
```

---

## 📡 새로운 API

### 🔔 알림 API (`/api/alerts`)

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/alerts` | GET | 알림 목록 |
| `/api/alerts` | POST | 알림 구독 |
| `/api/alerts/:id` | GET | 알림 상세 |
| `/api/alerts/:id` | PUT | 알림 수정 |
| `/api/alerts/:id` | DELETE | 알림 삭제 |
| `/api/alerts/check` | POST | 알림 조건 체크 (배치용) |
| `/api/alerts/logs/recent` | GET | 발송 이력 |

### 📊 분석 API (`/api/analytics`)

| 엔드포인트 | 설명 |
|-----------|------|
| `/api/analytics/overview` | 전체 현황 (대시보드 메인) |
| `/api/analytics/procedures` | 시술별 가격 분석 |
| `/api/analytics/regions` | 지역별 가격 분석 |
| `/api/analytics/trends` | 가격 트렌드 (시계열) |
| `/api/analytics/fair-price` | 적정 시세 분석 |
| `/api/analytics/hospitals/ranking` | 병원 가격 랭킹 |
| `/api/analytics/b2b/position` | B2B: 우리 병원 포지셔닝 |
| `/api/analytics/b2b/competitors` | B2B: 경쟁 병원 분석 |

---

## 🎯 주요 기능

### 1. 가격 알림 구독

**요청:**
```json
POST /api/alerts
{
  "userEmail": "user@example.com",
  "procedureId": "PROC-LIFT-HIFU-001",
  "procedureName": "울쎄라",
  "sigungu": "강남구",
  "alertType": "below_threshold",
  "thresholdPricePerUnit": 2500,
  "alertChannel": "email",
  "frequency": "realtime"
}
```

**알림 타입:**
- `price_drop`: 가격 하락 시
- `price_rise`: 가격 상승 시 (B2B 경쟁 모니터링)
- `new_price`: 새 가격 등록 시
- `below_threshold`: 기준가 이하 시 (소비자용)
- `competitor`: 경쟁 병원 가격 변동 시

### 2. 대시보드 개요

**요청:**
```
GET /api/analytics/overview
```

**응답:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_prices": 1250,
      "total_hospitals": 320,
      "total_procedures": 45,
      "avg_price_per_unit": 2850
    },
    "today": 45,
    "weeklyTrend": [...],
    "unitDistribution": [...],
    "regionDistribution": [...]
  }
}
```

### 3. 적정 시세 분석

**요청:**
```
GET /api/analytics/fair-price?procedureId=PROC-LIFT-HIFU-001&sigungu=강남구
```

**응답:**
```json
{
  "success": true,
  "data": [{
    "procedure_name": "울쎄라",
    "sigungu": "강남구",
    "sample_count": 50,
    "avg_price_per_unit": 2800,
    "fair_price_low": 2240,
    "fair_price_mid": 2800,
    "fair_price_high": 3360
  }]
}
```

### 4. B2B 병원 포지셔닝

**요청:**
```
GET /api/analytics/b2b/position?hospitalId=HOSP-001
```

**응답:**
```json
{
  "success": true,
  "data": {
    "hospital": {
      "hospital_name": "강남뷰티의원",
      "sigungu": "강남구"
    },
    "procedures": [{
      "procedure_name": "울쎄라",
      "price_per_unit": 2500,
      "regionAvg": 2800,
      "rank": 5,
      "vsAvgPercent": -10.7,
      "priceGrade": "😊 저렴"
    }],
    "summary": {
      "totalProcedures": 10,
      "cheaperThanAvg": 7,
      "expensiveThanAvg": 3
    }
  }
}
```

### 5. 병원 가격 랭킹

**요청:**
```
GET /api/analytics/hospitals/ranking?procedureId=PROC-LIFT-HIFU-001&sigungu=강남구&order=asc
```

**응답:**
```json
{
  "success": true,
  "data": {
    "rankings": [
      { "rank": 1, "hospital_name": "A의원", "price_per_unit": 2000, "priceGrade": "💰 매우 저렴" },
      { "rank": 2, "hospital_name": "B의원", "price_per_unit": 2300, "priceGrade": "😊 저렴" }
    ],
    "regionAvg": 2800
  }
}
```

---

## 💰 가격 등급 기준

| 등급 | 조건 | 의미 |
|------|------|------|
| 💰 매우 저렴 | < 70% | 지역 평균의 70% 미만 |
| 😊 저렴 | 70~85% | 지역 평균의 70~85% |
| ✅ 적정 | 85~115% | 지역 평균의 85~115% |
| ⚠️ 비쌈 | 115~130% | 지역 평균의 115~130% |
| 🚨 매우 비쌈 | > 130% | 지역 평균의 130% 초과 |

---

## ✅ 전체 완료 현황

| Phase | 내용 | 상태 |
|-------|------|------|
| 1 | 단위(dim_units), 가격(fact_prices), 기본 API | ✅ |
| 2 | 지역(dim_regions), 시술별칭, 집계 뷰 | ✅ |
| 3 | 알림 시스템, 분석 API, B2B API | ✅ |

---

## 🔜 다음 단계

1. **대시보드 UI** - React 대시보드에 가격 분석 탭 추가
2. **OCR 연동** - 실제 가격 데이터 수집
3. **이메일 발송** - 알림 실제 발송 (Resend/SendGrid)
