/**
 * HTML Preprocessor - Token Optimization Module
 * 목표: 30,000 토큰 → 3,000 토큰 (90% 절감)
 * 
 * HTML을 AI 분석용 최소 텍스트로 변환
 */

const cheerio = require('cheerio');

// 가격 관련 키워드
const PRICE_KEYWORDS = [
  '가격', '비용', '요금', 'price', '원', '만원', '₩', 
  '시술', '이벤트', '할인', '특가', '프로모션',
  '보톡스', '필러', '레이저', '리프팅', '피부', '미백',
  '토닝', '스킨', '케어', '관리', '패키지'
];

// 제거할 태그들
const REMOVE_TAGS = [
  'script', 'style', 'noscript', 'iframe', 'svg', 
  'meta', 'link', 'head', 'header', 'footer', 'nav',
  'aside', 'form', 'button', 'input', 'select'
];

/**
 * HTML을 AI 분석용 최소 텍스트로 변환
 * @param {string} html - 원본 HTML
 * @param {Object} options - 옵션
 * @returns {Object} - { text, stats }
 */
function preprocessHtml(html, options = {}) {
  const {
    maxLength = 3000,
    preserveTables = true,
    extractPriceSections = true
  } = options;

  const originalLength = html.length;
  
  // 1. Cheerio로 파싱
  const $ = cheerio.load(html, {
    decodeEntities: true,
    normalizeWhitespace: true
  });

  // 2. 불필요한 태그 제거
  REMOVE_TAGS.forEach(tag => $(tag).remove());
  
  // 3. 주석 제거
  $('*').contents().filter(function() {
    return this.type === 'comment';
  }).remove();

  // 4. 테이블 추출 (가격표 가능성 높음)
  const tables = [];
  if (preserveTables) {
    $('table').each((i, table) => {
      const tableText = extractTableAsText($, table);
      if (tableText && containsPriceKeyword(tableText)) {
        tables.push(tableText);
      }
    });
  }

  // 5. 가격 관련 섹션 추출
  let priceSections = [];
  if (extractPriceSections) {
    priceSections = extractPriceRelatedSections($);
  }

  // 6. 전체 텍스트 추출 (fallback)
  let fullText = $('body').text() || $.root().text();
  
  // 7. 텍스트 정리
  fullText = cleanText(fullText);

  // 8. 최종 텍스트 조합
  let finalText = '';
  
  // 테이블이 있으면 우선 포함
  if (tables.length > 0) {
    finalText += '=== 가격표 ===\n' + tables.join('\n\n') + '\n\n';
  }
  
  // 가격 관련 섹션 추가
  if (priceSections.length > 0) {
    finalText += '=== 가격 정보 ===\n' + priceSections.join('\n') + '\n\n';
  }
  
  // 나머지 본문 (길이 제한 적용)
  const remainingSpace = maxLength - finalText.length;
  if (remainingSpace > 100 && fullText.length > 0) {
    // 가격 관련 문장 우선 추출
    const priceSentences = extractPriceSentences(fullText);
    if (priceSentences.length > 0) {
      const priceText = priceSentences.join('\n');
      if (priceText.length <= remainingSpace) {
        finalText += priceText;
      } else {
        finalText += priceText.substring(0, remainingSpace);
      }
    } else {
      finalText += fullText.substring(0, remainingSpace);
    }
  }

  // 9. 길이 제한 최종 적용
  if (finalText.length > maxLength) {
    finalText = finalText.substring(0, maxLength) + '...';
  }

  return {
    text: finalText.trim(),
    stats: {
      originalLength,
      processedLength: finalText.length,
      reduction: Math.round((1 - finalText.length / originalLength) * 100),
      tablesFound: tables.length,
      priceSectionsFound: priceSections.length
    }
  };
}

/**
 * 테이블을 텍스트로 변환
 */
function extractTableAsText($, table) {
  const rows = [];
  
  $(table).find('tr').each((i, tr) => {
    const cells = [];
    $(tr).find('th, td').each((j, cell) => {
      const text = $(cell).text().trim();
      if (text) cells.push(text);
    });
    if (cells.length > 0) {
      rows.push(cells.join(' | '));
    }
  });
  
  return rows.join('\n');
}

/**
 * 가격 관련 섹션 추출
 */
function extractPriceRelatedSections($) {
  const sections = [];
  
  // class나 id에 price/cost/fee 관련 문자열이 있는 요소 찾기
  const priceSelectors = [
    '[class*="price"]', '[class*="cost"]', '[class*="fee"]',
    '[class*="가격"]', '[class*="비용"]', '[class*="요금"]',
    '[id*="price"]', '[id*="cost"]', '[id*="fee"]',
    '.price-list', '.price-table', '.treatment-price'
  ];
  
  priceSelectors.forEach(selector => {
    try {
      $(selector).each((i, el) => {
        const text = $(el).text().trim();
        if (text && text.length < 1000 && containsPriceKeyword(text)) {
          sections.push(cleanText(text));
        }
      });
    } catch (e) {
      // 선택자 오류 무시
    }
  });
  
  // 중복 제거
  return [...new Set(sections)];
}

/**
 * 가격 관련 문장 추출
 */
function extractPriceSentences(text) {
  const sentences = text.split(/[.。\n]/);
  const priceSentences = [];
  
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length > 5 && trimmed.length < 200) {
      // 숫자와 가격 키워드가 함께 있는 문장
      if (/\d/.test(trimmed) && containsPriceKeyword(trimmed)) {
        priceSentences.push(trimmed);
      }
    }
  }
  
  return priceSentences;
}

/**
 * 가격 키워드 포함 여부 확인
 */
function containsPriceKeyword(text) {
  const lowerText = text.toLowerCase();
  return PRICE_KEYWORDS.some(keyword => 
    lowerText.includes(keyword.toLowerCase())
  );
}

/**
 * 텍스트 정리
 */
function cleanText(text) {
  return text
    // HTML 엔티티 정리
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // 연속 공백/줄바꿈 정리
    .replace(/\s+/g, ' ')
    // 줄바꿈 정규화
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 빠른 전처리 (Cheerio 없이)
 * HTML이 단순하거나 빠른 처리가 필요할 때 사용
 */
function quickPreprocess(html, maxLength = 3000) {
  let text = html
    // 스크립트, 스타일 제거
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    // 모든 태그 제거
    .replace(/<[^>]+>/g, ' ')
    // HTML 엔티티
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#?\w+;/g, ' ')
    // 공백 정리
    .replace(/\s+/g, ' ')
    .trim();
  
  if (text.length > maxLength) {
    text = text.substring(0, maxLength) + '...';
  }
  
  return text;
}

module.exports = {
  preprocessHtml,
  quickPreprocess,
  containsPriceKeyword,
  cleanText,
  PRICE_KEYWORDS
};
