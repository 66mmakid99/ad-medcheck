// ============================================
// OCR 분석 라우터 - Gemini Flash 통합 (v1.1 - URL 직접 전달)
// medcheck-engine/src/routes/ocr.ts
// ============================================

import { Hono } from 'hono';
import { processOCRAndSavePrices, extractPricesFromOCR } from '../services/price-extractor';
const ocr = new Hono<{ Bindings: Env }>();

// ============================================
// 타입 정의
// ============================================

interface Env {
  DB: D1Database;
  GEMINI_API_KEY: string;
}

interface OcrAnalyzeRequest {
  imageUrl?: string;
  imageBase64?: string;
  analyzeViolations?: boolean;
}

// ============================================
// Gemini API 호출 (이미지 URL 직접 전달)
// ============================================

async function callGeminiVision(
  apiKey: string,
  imageData: { url?: string; base64?: string },
  prompt: string
): Promise<{ text: string; confidence: number }> {

  const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  let imagePart: any;

  if (imageData.base64) {
    // Base64 이미지
    imagePart = {
      inline_data: {
        mime_type: 'image/jpeg',
        data: imageData.base64
      }
    };
  } else if (imageData.url) {
    // URL에서 이미지 가져오기 (개선된 방식)
    try {
      console.log(`[OCR] Fetching image from: ${imageData.url}`);

      const imageResponse = await fetch(imageData.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/*',
        },
      });

      if (!imageResponse.ok) {
        throw new Error(`이미지 다운로드 실패: ${imageResponse.status} ${imageResponse.statusText}`);
      }

      const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
      console.log(`[OCR] Image content-type: ${contentType}`);

      const imageBuffer = await imageResponse.arrayBuffer();
      console.log(`[OCR] Image size: ${imageBuffer.byteLength} bytes`);

      if (imageBuffer.byteLength === 0) {
        throw new Error('이미지 데이터가 비어있습니다');
      }

      // ArrayBuffer to Base64 (Workers 호환 방식)
      const uint8Array = new Uint8Array(imageBuffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const base64 = btoa(binary);

      console.log(`[OCR] Base64 length: ${base64.length}`);

      imagePart = {
        inline_data: {
          mime_type: contentType.split(';')[0],
          data: base64
        }
      };
    } catch (fetchError: any) {
      console.error(`[OCR] Image fetch error: ${fetchError.message}`);
      throw new Error(`이미지 가져오기 실패: ${fetchError.message}`);
    }
  } else {
    throw new Error('이미지 URL 또는 Base64 데이터가 필요합니다');
  }

  const requestBody = {
    contents: [{
      parts: [
        imagePart,
        { text: prompt }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
    }
  };

  console.log(`[OCR] Calling Gemini API...`);

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[OCR] Gemini API error: ${response.status} - ${errorText}`);
    throw new Error(`Gemini API 오류: ${response.status} - ${errorText}`);
  }

  const result = await response.json() as any;

  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const confidence = 0.9;

  console.log(`[OCR] Gemini response length: ${text.length}`);

  return { text, confidence };
}

// ============================================
// OCR 프롬프트
// ============================================

const OCR_ONLY_PROMPT = `이 이미지에서 모든 텍스트를 추출해주세요.

규칙:
1. 이미지에 보이는 모든 텍스트를 그대로 추출
2. 레이아웃 순서대로 (위→아래, 왼쪽→오른쪽)
3. 가격 정보가 있으면 숫자와 단위 정확히
4. 한글, 영어, 숫자 모두 포함
5. 추출한 텍스트만 출력 (설명 불필요)

텍스트:`;

const OCR_WITH_ANALYSIS_PROMPT = `이 의료광고 이미지를 분석해주세요.

## 1단계: 텍스트 추출
이미지에서 모든 텍스트를 추출하세요.

## 2단계: 의료광고법 위반 검사
추출된 텍스트에서 다음 위반 유형을 찾으세요:

1. **치료효과보장** (critical): "100% 완치", "확실한 효과", "재발 없음"
2. **부작용부정** (critical): "부작용 없음", "안전 보장", "통증 없음"
3. **최상급표현** (major): "최고", "최초", "유일", "1위", "최저가"
4. **비교광고** (critical): 다른 병원 비방, 타 의료인 비교
5. **환자유인** (major): "무료", "경품", "할인", "이벤트"
6. **전후사진** (major): 시술 전후 비교 사진
7. **허위과장** (critical): 검증 불가능한 수술 건수, 가짜 인증

## 출력 형식 (반드시 JSON만 출력):
{
  "extractedText": "추출된 전체 텍스트",
  "violations": [
    {
      "type": "위반유형",
      "severity": "critical|major|minor",
      "matchedText": "위반 텍스트",
      "description": "설명",
      "patternId": "P-56-XX-XXX"
    }
  ],
  "priceInfo": [
    {
      "procedure": "시술명",
      "price": 숫자,
      "unit": "원|만원",
      "originalText": "원문"
    }
  ]
}`;

// ============================================
// 라우트
// ============================================

// POST /v1/ocr/analyze
ocr.post('/analyze', async (c) => {
  const startTime = Date.now();

  try {
    const body = await c.req.json() as OcrAnalyzeRequest;
    const { imageUrl, imageBase64, analyzeViolations = true } = body;

    if (!imageUrl && !imageBase64) {
      return c.json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'imageUrl 또는 imageBase64가 필요합니다' }
      }, 400);
    }

    const apiKey = c.env.GEMINI_API_KEY;
    if (!apiKey) {
      return c.json({
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Gemini API 키가 설정되지 않았습니다' }
      }, 500);
    }

    const prompt = analyzeViolations ? OCR_WITH_ANALYSIS_PROMPT : OCR_ONLY_PROMPT;

    const geminiResult = await callGeminiVision(
      apiKey,
      { url: imageUrl, base64: imageBase64 },
      prompt
    );

    let result: any = {
      extractedText: geminiResult.text,
      confidence: geminiResult.confidence,
      processingTimeMs: Date.now() - startTime
    };

    // JSON 파싱 시도
    if (analyzeViolations) {
      try {
        const jsonMatch = geminiResult.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          result = {
            ...result,
            extractedText: parsed.extractedText || geminiResult.text,
            violations: parsed.violations || [],
            priceInfo: parsed.priceInfo || [],
          };
        }
      } catch (parseError) {
        console.warn('[OCR] JSON 파싱 실패:', parseError);
      }
    }

    // DB 로깅
    try {
      await c.env.DB.prepare(`
        INSERT INTO ocr_logs (image_url, extracted_text, violation_count, processing_time_ms, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).bind(
        imageUrl || 'base64',
        result.extractedText?.slice(0, 5000),
        result.violations?.length || 0,
        result.processingTimeMs
      ).run();
    } catch (dbError) {
      console.warn('[OCR] DB 로그 저장 실패:', dbError);
    }

    return c.json({
      success: true,
      data: result
    });

  } catch (error: any) {
    console.error('[OCR] 분석 오류:', error);
    return c.json({
      success: false,
      error: {
        code: 'OCR_ERROR',
        message: error.message || 'OCR 분석 중 오류가 발생했습니다'
      }
    }, 500);
  }
});

// POST /v1/ocr/extract
ocr.post('/extract', async (c) => {
  const startTime = Date.now();

  try {
    const body = await c.req.json() as OcrAnalyzeRequest;
    const { imageUrl, imageBase64 } = body;

    if (!imageUrl && !imageBase64) {
      return c.json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'imageUrl 또는 imageBase64가 필요합니다' }
      }, 400);
    }

    const apiKey = c.env.GEMINI_API_KEY;
    if (!apiKey) {
      return c.json({
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Gemini API 키가 설정되지 않았습니다' }
      }, 500);
    }

    const geminiResult = await callGeminiVision(
      apiKey,
      { url: imageUrl, base64: imageBase64 },
      OCR_ONLY_PROMPT
    );

    return c.json({
      success: true,
      data: {
        extractedText: geminiResult.text,
        confidence: geminiResult.confidence,
        processingTimeMs: Date.now() - startTime
      }
    });

  } catch (error: any) {
    return c.json({
      success: false,
      error: { code: 'OCR_ERROR', message: error.message }
    }, 500);
  }
});

// GET /v1/ocr/health
ocr.get('/health', async (c) => {
  const hasApiKey = !!c.env.GEMINI_API_KEY;

  return c.json({
    success: true,
    data: {
      status: hasApiKey ? 'ready' : 'no_api_key',
      provider: 'gemini-2.0-flash',
      features: ['ocr', 'violation_analysis', 'price_extraction'],
      hasApiKey
    }
  });
});

// GET /v1/ocr/stats
ocr.get('/stats', async (c) => {
  try {
    const stats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total_requests,
        AVG(processing_time_ms) as avg_processing_time,
        SUM(violation_count) as total_violations,
        DATE(created_at) as date
      FROM ocr_logs
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `).all();

    return c.json({
      success: true,
      data: stats.results
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: { code: 'DB_ERROR', message: error.message }
    }, 500);
  }
});
// ================================================================
// POST /v1/ocr/extract-prices - OCR + 가격 추출 + 저장
// ================================================================
ocr.post('/extract-prices', async (c) => {
  const startTime = Date.now();

  try {
    const body = await c.req.json();
    const {
      imageUrl,
      imageBase64,
      hospitalId,
      hospitalName,
      sido,
      sigungu,
      sourceUrl
    } = body;

    if (!imageUrl && !imageBase64) {
      return c.json({
        success: false,
        error: { code: 'MISSING_IMAGE', message: 'imageUrl 또는 imageBase64가 필요합니다.' }
      }, 400);
    }

    // 1. Gemini OCR 실행
    const geminiResult = await callGeminiVision(
      c.env.GEMINI_API_KEY,
      { url: imageUrl, base64: imageBase64 },
      'OCR: 이 이미지에서 모든 텍스트를 추출해주세요.'
    );

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

// POST /v1/ocr/parse-prices - 텍스트에서 가격 파싱 (테스트용)
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
export default ocr;
