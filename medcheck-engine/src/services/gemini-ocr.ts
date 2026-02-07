/**
 * Gemini Vision OCR Service
 * 공통 OCR 유틸리티 - Gemini Flash를 사용한 이미지 텍스트 추출
 */

// ============================================
// OCR 전용 프롬프트
// ============================================

export const OCR_ONLY_PROMPT = `이 이미지에서 모든 텍스트를 추출해주세요.

규칙:
1. 이미지에 보이는 모든 텍스트를 그대로 추출
2. 레이아웃 순서대로 (위→아래, 왼쪽→오른쪽)
3. 가격 정보가 있으면 숫자와 단위 정확히
4. 한글, 영어, 숫자 모두 포함
5. 추출한 텍스트만 출력 (설명 불필요)

텍스트:`;

// ============================================
// Gemini Vision API 호출
// ============================================

export interface GeminiVisionResult {
  text: string;
  confidence: number;
}

export async function callGeminiVision(
  apiKey: string,
  imageData: { url?: string; base64?: string },
  prompt: string
): Promise<GeminiVisionResult> {

  const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  let imagePart: any;

  if (imageData.base64) {
    imagePart = {
      inline_data: {
        mime_type: 'image/jpeg',
        data: imageData.base64
      }
    };
  } else if (imageData.url) {
    try {
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
      const imageBuffer = await imageResponse.arrayBuffer();

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

      imagePart = {
        inline_data: {
          mime_type: contentType.split(';')[0],
          data: base64
        }
      };
    } catch (fetchError: unknown) {
      const msg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.error(`[OCR] Image fetch error: ${msg}`);
      throw new Error(`이미지 가져오기 실패: ${msg}`);
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

  return { text, confidence };
}
