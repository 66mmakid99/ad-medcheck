/**
 * fetchWithEncoding — 한국 사이트 인코딩 자동 감지 fetch
 * 
 * 파일 위치: medcheck-engine/src/utils/fetch-with-encoding.ts (신규)
 * 
 * 문제: 한국 병원 사이트 60~70%가 EUC-KR 인코딩
 *       response.text()는 UTF-8만 가정 → 한글 깨짐
 * 
 * 해결: ArrayBuffer로 받은 뒤 charset 감지 → 올바른 TextDecoder 사용
 */

/**
 * 인코딩을 자동 감지하여 HTML을 올바르게 디코딩
 */
export async function fetchWithEncoding(url: string, timeoutMs = 25000): Promise<{
  html: string;
  charset: string;
  statusCode: number;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      redirect: 'follow',
    });

    // 1) Content-Type 헤더에서 charset 확인
    let charset = detectCharsetFromHeader(response.headers.get('content-type') || '');

    // 2) 바이너리로 받기
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // 3) 헤더에 charset 없으면 HTML meta 태그에서 찾기
    if (!charset) {
      // 먼저 ASCII 부분만 읽어서 meta charset 검색
      const asciiPreview = new TextDecoder('ascii', { fatal: false }).decode(bytes.slice(0, 4096));
      charset = detectCharsetFromMeta(asciiPreview);
    }

    // 4) 여전히 없으면 바이트 패턴으로 추정
    if (!charset) {
      charset = guessCharsetFromBytes(bytes);
    }

    // 5) 감지된 인코딩으로 디코딩
    const normalizedCharset = normalizeCharset(charset);
    console.log(`[Encoding] ${url.substring(0, 60)}... → ${normalizedCharset}`);

    const html = new TextDecoder(normalizedCharset, { fatal: false }).decode(bytes);

    return {
      html,
      charset: normalizedCharset,
      statusCode: response.status,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Content-Type 헤더에서 charset 추출
 * 예: "text/html; charset=euc-kr" → "euc-kr"
 */
function detectCharsetFromHeader(contentType: string): string | null {
  const match = contentType.match(/charset=["']?([^"';\s]+)/i);
  return match ? match[1].trim() : null;
}

/**
 * HTML meta 태그에서 charset 추출
 * 
 * 지원 패턴:
 *   <meta charset="euc-kr">
 *   <meta http-equiv="Content-Type" content="text/html; charset=euc-kr">
 */
function detectCharsetFromMeta(htmlPreview: string): string | null {
  // <meta charset="...">
  const match1 = htmlPreview.match(/<meta\s+charset=["']?([^"'>\s]+)/i);
  if (match1) return match1[1].trim();

  // <meta http-equiv="Content-Type" content="...charset=...">
  const match2 = htmlPreview.match(
    /<meta\s+http-equiv=["']?Content-Type["']?\s+content=["'][^"']*charset=([^"';\s]+)/i
  );
  if (match2) return match2[1].trim();

  // 순서 반대 (content이 먼저)
  const match3 = htmlPreview.match(
    /<meta\s+content=["'][^"']*charset=([^"';\s]+)["'][^>]*http-equiv=["']?Content-Type/i
  );
  if (match3) return match3[1].trim();

  return null;
}

/**
 * 바이트 패턴으로 인코딩 추정 (최후 수단)
 * 
 * EUC-KR 한글: 0xB0~0xC8 범위의 2바이트
 * UTF-8 한글:  0xE0~0xEF 범위의 3바이트 (한글은 0xEA~0xED)
 */
function guessCharsetFromBytes(bytes: Uint8Array): string {
  let eucKrScore = 0;
  let utf8Score = 0;
  const len = Math.min(bytes.length, 8192);

  for (let i = 0; i < len - 1; i++) {
    const b = bytes[i];

    // EUC-KR 한글 패턴: 첫째 바이트 0xB0~0xC8, 둘째 바이트 0xA1~0xFE
    if (b >= 0xB0 && b <= 0xC8 && bytes[i + 1] >= 0xA1 && bytes[i + 1] <= 0xFE) {
      eucKrScore++;
      i++; // 2바이트 건너뛰기
    }
    // UTF-8 한글 패턴: 0xEA~0xED + 0x80~0xBF + 0x80~0xBF
    else if (b >= 0xEA && b <= 0xED && i + 2 < len
      && bytes[i + 1] >= 0x80 && bytes[i + 1] <= 0xBF
      && bytes[i + 2] >= 0x80 && bytes[i + 2] <= 0xBF) {
      utf8Score++;
      i += 2; // 3바이트 건너뛰기
    }
  }

  // 확실한 패턴이 있으면 선택, 없으면 UTF-8 기본
  if (eucKrScore > 5 && eucKrScore > utf8Score * 2) {
    return 'euc-kr';
  }
  return 'utf-8';
}

/**
 * charset 이름 정규화
 * 한국 사이트에서 사용하는 다양한 이름을 TextDecoder가 인식하는 이름으로 변환
 */
function normalizeCharset(charset: string): string {
  const lower = charset.toLowerCase().replace(/[_-]/g, '');

  // EUC-KR 계열 (가장 흔함)
  if (['euckr', 'ksc5601', 'ksc56011987', 'ksx1001', 'windows949', 'cp949', 'ms949', 'korean'].includes(lower)) {
    return 'euc-kr';
  }

  // UTF-8 계열
  if (['utf8', 'utf8bom'].includes(lower)) {
    return 'utf-8';
  }

  // Shift_JIS (일본 사이트, 혹시)
  if (['shiftjis', 'sjis', 'ms932', 'cp932', 'windows31j'].includes(lower)) {
    return 'shift_jis';
  }

  // 그대로 반환 (TextDecoder가 처리)
  return charset.toLowerCase();
}
