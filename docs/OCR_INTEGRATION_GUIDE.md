# OCR 가격 추출 연동 가이드

## 📦 파일 구성

| # | 파일 | 설명 |
|---|------|------|
| 1 | `price-extractor.ts` | 가격 추출 서비스 (핵심 로직) |
| 2 | `ocr-price-endpoints.ts` | OCR 라우트에 추가할 엔드포인트 (참고용) |

---

## 🚀 설치 방법

### 1단계: 파일 복사

```
medcheck-engine/src/
├── services/
│   └── price-extractor.ts    ← 새로 추가
└── routes/
    └── ocr.ts                ← 수정 필요
```

### 2단계: ocr.ts 수정

**상단 import 추가:**
```typescript
import { processOCRAndSavePrices, extractPricesFromOCR } from '../services/price-extractor';
```

**export default ocr; 위에 엔드포인트 추가:**

```typescript
// POST /v1/ocr/extract-prices - OCR + 가격 추출 + 저장
ocr.post('/extract-prices', async (c) => {
  const startTime = Date.now();
  
  try {
    const body = await c.req.json();
    const { 
      image,
      imageUrl,
      hospitalId,
      hospitalName,
      sido,
      sigungu,
      sourceUrl
    } = body;
    
    if (!image && !imageUrl) {
      return c.json({
        success: false,
        error: { code: 'MISSING_IMAGE', message: 'image 또는 imageUrl이 필요합니다.' }
      }, 400);
    }
    
    // 1. Gemini OCR 실행 (기존 함수 활용)
    const geminiResult = await callGeminiOCR(
      image || imageUrl,
      c.env.GEMINI_API_KEY,
      !!imageUrl
    );
    
    if (!geminiResult.success) {
      return c.json({
        success: false,
        error: { code: 'OCR_FAILED', message: geminiResult.error }
      }, 500);
    }
    
    // 2. 가격 추출 & 저장
    const result = await processOCRAndSavePrices(
      geminiResult.text,
      {
        hospitalId,
        hospitalName,
        sido,
        sigungu,
        sourceType: 'ocr',
        sourceUrl,
        ocrConfidence: geminiResult.confidence
      },
      c.env.DB
    );
    
    return c.json({
      success: true,
      data: {
        ocrText: geminiResult.text,
        ocrConfidence: geminiResult.confidence,
        extractedPrices: result.extractedPrices,
        savedCount: result.savedCount,
        errors: result.errors,
        processingTimeMs: Date.now() - startTime
      }
    });
    
  } catch (error: any) {
    return c.json({
      success: false,
      error: { code: 'EXTRACT_ERROR', message: error.message }
    }, 500);
  }
});

// POST /v1/ocr/parse-prices - 텍스트에서 가격 추출 (저장 안 함)
ocr.post('/parse-prices', async (c) => {
  try {
    const { text } = await c.req.json();
    
    if (!text) {
      return c.json({
        success: false,
        error: { code: 'MISSING_TEXT', message: 'text가 필요합니다.' }
      }, 400);
    }
    
    const prices = await extractPricesFromOCR(text, c.env.DB);
    
    return c.json({
      success: true,
      data: {
        input: text,
        extractedPrices: prices,
        count: prices.length
      }
    });
    
  } catch (error: any) {
    return c.json({
      success: false,
      error: { code: 'PARSE_ERROR', message: error.message }
    }, 500);
  }
});
```

### 3단계: 빌드 & 배포

```bash
npm run build
wrangler deploy
```

---

## 📡 새로운 API

### 1. OCR + 가격 추출 + 저장

**요청:**
```json
POST /v1/ocr/extract-prices
{
  "image": "base64...",
  "hospitalName": "강남뷰티의원",
  "sigungu": "강남구",
  "sido": "서울특별시"
}
```

**응답:**
```json
{
  "success": true,
  "data": {
    "ocrText": "울쎄라 300샷 79만원 이벤트...",
    "ocrConfidence": 0.95,
    "extractedPrices": [
      {
        "procedureName": "울쎄라",
        "totalPrice": 790000,
        "quantity": 300,
        "unitCode": "UNIT-SHOT",
        "pricePerUnit": 2633,
        "isEvent": true,
        "eventName": "이벤트",
        "rawText": "울쎄라 300샷 79만원 이벤트"
      }
    ],
    "savedCount": 1,
    "errors": [],
    "processingTimeMs": 1250
  }
}
```

### 2. 텍스트 가격 파싱 (테스트용)

**요청:**
```json
POST /v1/ocr/parse-prices
{
  "text": "울쎄라 300샷 79만원\n온다 6만줄 49만원"
}
```

**응답:**
```json
{
  "success": true,
  "data": {
    "input": "울쎄라 300샷 79만원\n온다 6만줄 49만원",
    "extractedPrices": [
      {
        "procedureName": "울쎄라",
        "totalPrice": 790000,
        "quantity": 300,
        "unitCode": "UNIT-SHOT",
        "pricePerUnit": 2633
      },
      {
        "procedureName": "ONDA 리프팅",
        "totalPrice": 490000,
        "quantity": 60000,
        "unitCode": "UNIT-JOULE",
        "pricePerUnit": 8
      }
    ],
    "count": 2
  }
}
```

---

## 🔄 데이터 흐름

```
이미지 업로드
    ↓
Gemini OCR (텍스트 추출)
    ↓
가격 파싱 (정규식)
    ↓
시술명 매칭 (별칭 DB)
    ↓
fact_prices 저장
    ↓
대시보드에서 분석!
```

---

## 🎯 지원 패턴

### 가격 패턴
- `79만원`, `790,000원`, `79만`, `100만원`
- `1,500,000원`, `50만 원`

### 수량+단위 패턴
- `300샷`, `500shot`
- `6만줄`, `10만 줄`, `60000J`
- `100유닛`, `100unit`
- `2cc`, `2ml`
- `3회`, `5부위`

### 시술명 매칭
- 울쎄라, ulthera, 울쎄라피 → "울쎄라"
- 온다, ONDA, 온다리프팅 → "ONDA 리프팅"
- 써마지, thermage, FLX → "써마지"
- (bridge_procedure_aliases 테이블의 50+ 별칭)

---

## ⚠️ 주의사항

1. **Gemini API Key 필요**: OCR 기능은 GEMINI_API_KEY 환경 변수 필요
2. **시술명 매칭 실패 시**: "미확인 시술"로 저장됨
3. **단위 없는 가격**: quantity, pricePerUnit이 null로 저장됨
