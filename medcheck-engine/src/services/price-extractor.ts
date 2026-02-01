// ================================================================
// MADMEDCHECK - OCR 가격 추출 & 저장 서비스
// ================================================================
// 위치: src/services/price-extractor.ts
// 용도: OCR 텍스트에서 가격 정보 추출 → fact_prices 저장
// ================================================================

import type { D1Database } from '@cloudflare/workers-types';

// ================================================================
// 타입 정의
// ================================================================

interface ExtractedPrice {
  procedureName: string;
  totalPrice: number;
  quantity: number | null;
  unitCode: string | null;
  pricePerUnit: number | null;
  isEvent: boolean;
  eventName: string | null;
  rawText: string;
}

interface PriceExtractionResult {
  success: boolean;
  extractedPrices: ExtractedPrice[];
  savedCount: number;
  errors: string[];
}

interface SavePriceParams {
  hospitalId?: string;
  hospitalName?: string;
  sido?: string;
  sigungu?: string;
  sourceType: 'ocr' | 'manual' | 'crawl';
  sourceUrl?: string;
  ocrConfidence?: number;
}

// ================================================================
// 가격 추출 정규식 패턴
// ================================================================

const PRICE_PATTERNS = {
  // 가격 패턴: 79만원, 790,000원, 79만, 100만원, 1,500,000원
  price: /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(만\s*원|천\s*원|원|만)/gi,
  
  // 수량+단위 패턴: 300샷, 6만줄, 100유닛, 2cc
  quantityUnit: /(\d+(?:\.\d+)?)\s*(만\s*)?(샷|shot|줄|joule|j|유닛|unit|u|cc|ml|씨씨|부위|회|번|차|mg|바이알|vial|앰플|amp)/gi,
  
  // 이벤트 키워드
  event: /(이벤트|특가|할인|프로모션|기간\s*한정|선착순|오픈\s*기념)/i,
};

// 단위 코드 매핑
const UNIT_MAPPING: Record<string, string> = {
  '샷': 'UNIT-SHOT',
  'shot': 'UNIT-SHOT',
  '줄': 'UNIT-JOULE',
  'joule': 'UNIT-JOULE',
  'j': 'UNIT-JOULE',
  '유닛': 'UNIT-UNIT',
  'unit': 'UNIT-UNIT',
  'u': 'UNIT-UNIT',
  'cc': 'UNIT-CC',
  'ml': 'UNIT-CC',
  '씨씨': 'UNIT-CC',
  '부위': 'UNIT-AREA',
  '회': 'UNIT-SESSION',
  '번': 'UNIT-SESSION',
  '차': 'UNIT-SESSION',
  'mg': 'UNIT-MG',
  '바이알': 'UNIT-VIAL',
  'vial': 'UNIT-VIAL',
  '앰플': 'UNIT-AMPULE',
  'amp': 'UNIT-AMPULE',
};

// ================================================================
// 메인 함수: OCR 텍스트에서 가격 추출
// ================================================================

export async function extractPricesFromOCR(
  ocrText: string,
  db: D1Database
): Promise<ExtractedPrice[]> {
  const prices: ExtractedPrice[] = [];
  
  // 줄 단위로 분석
  const lines = ocrText.split(/[\n\r]+/).filter(line => line.trim());
  
  for (const line of lines) {
    const extracted = await extractPriceFromLine(line, db);
    if (extracted) {
      prices.push(extracted);
    }
  }
  
  return prices;
}

// ================================================================
// 한 줄에서 가격 정보 추출
// ================================================================

async function extractPriceFromLine(
  line: string,
  db: D1Database
): Promise<ExtractedPrice | null> {
  // 1. 가격 추출
  const priceMatch = extractPrice(line);
  if (!priceMatch) return null;
  
  // 2. 수량 + 단위 추출
  const quantityUnit = extractQuantityUnit(line);
  
  // 3. 시술명 매칭
  const procedureName = await matchProcedureName(line, db);
  
  // 4. 이벤트 여부
  const isEvent = PRICE_PATTERNS.event.test(line);
  const eventMatch = line.match(PRICE_PATTERNS.event);
  
  // 5. 단위당 가격 계산
  let pricePerUnit: number | null = null;
  if (quantityUnit && quantityUnit.quantity > 0) {
    pricePerUnit = Math.round(priceMatch / quantityUnit.quantity);
  }
  
  return {
    procedureName: procedureName || '미확인 시술',
    totalPrice: priceMatch,
    quantity: quantityUnit?.quantity ?? null,
    unitCode: quantityUnit?.unitCode ?? null,
    pricePerUnit,
    isEvent,
    eventName: eventMatch ? eventMatch[0] : null,
    rawText: line.trim(),
  };
}

// ================================================================
// 가격 추출
// ================================================================

function extractPrice(text: string): number | null {
  const matches = [...text.matchAll(PRICE_PATTERNS.price)];
  if (matches.length === 0) return null;
  
  // 가장 큰 가격을 메인 가격으로 (보통 총액)
  let maxPrice = 0;
  
  for (const match of matches) {
    const numStr = match[1].replace(/,/g, '');
    const unit = match[2].replace(/\s/g, '');
    let price = parseFloat(numStr);
    
    if (unit.includes('만')) {
      price *= 10000;
    } else if (unit.includes('천')) {
      price *= 1000;
    }
    
    if (price > maxPrice) {
      maxPrice = price;
    }
  }
  
  return maxPrice > 0 ? maxPrice : null;
}

// ================================================================
// 수량 + 단위 추출
// ================================================================

function extractQuantityUnit(text: string): { quantity: number; unitCode: string } | null {
  const matches = [...text.matchAll(PRICE_PATTERNS.quantityUnit)];
  if (matches.length === 0) return null;
  
  for (const match of matches) {
    let quantity = parseFloat(match[1]);
    const isMan = match[2]?.includes('만');  // 6만줄
    const unitText = match[3].toLowerCase();
    
    if (isMan) {
      quantity *= 10000;
    }
    
    const unitCode = UNIT_MAPPING[unitText];
    if (unitCode) {
      return { quantity, unitCode };
    }
  }
  
  return null;
}

// ================================================================
// 시술명 매칭 (별칭 DB 활용)
// ================================================================

async function matchProcedureName(
  text: string,
  db: D1Database
): Promise<string | null> {
  try {
    // 모든 별칭 가져오기
    const aliases = await db.prepare(`
      SELECT alias, procedure_name, match_priority
      FROM bridge_procedure_aliases
      WHERE is_active = 1
      ORDER BY match_priority DESC, length(alias) DESC
    `).all<{ alias: string; procedure_name: string; match_priority: number }>();
    
    const textLower = text.toLowerCase();
    
    for (const row of aliases.results || []) {
      if (textLower.includes(row.alias.toLowerCase())) {
        // 사용 횟수 증가
        await db.prepare(`
          UPDATE bridge_procedure_aliases 
          SET usage_count = usage_count + 1 
          WHERE alias = ?
        `).bind(row.alias).run();
        
        return row.procedure_name;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Procedure matching error:', error);
    return null;
  }
}

// ================================================================
// 추출된 가격을 DB에 저장
// ================================================================

export async function savePricesToDB(
  prices: ExtractedPrice[],
  params: SavePriceParams,
  db: D1Database
): Promise<{ savedCount: number; errors: string[] }> {
  let savedCount = 0;
  const errors: string[] = [];
  
  for (const price of prices) {
    try {
      const id = `PRICE-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      
      // 시술 ID 찾기
      const procedure = await db.prepare(`
        SELECT procedure_id FROM bridge_procedure_aliases
        WHERE procedure_name = ? LIMIT 1
      `).bind(price.procedureName).first<{ procedure_id: string }>();
      
      await db.prepare(`
        INSERT INTO fact_prices (
          id,
          hospital_id,
          hospital_name,
          procedure_id,
          procedure_name_raw,
          procedure_name_matched,
          total_price,
          quantity,
          unit_id,
          price_per_unit,
          is_event,
          event_name,
          sido,
          sigungu,
          source_type,
          source_url,
          ocr_confidence,
          raw_price_text,
          collected_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        id,
        params.hospitalId ?? null,
        params.hospitalName ?? null,
        procedure?.procedure_id ?? null,
        price.rawText,
        price.procedureName,
        price.totalPrice,
        price.quantity,
        price.unitCode,
        price.pricePerUnit,
        price.isEvent ? 1 : 0,
        price.eventName,
        params.sido ?? null,
        params.sigungu ?? null,
        params.sourceType,
        params.sourceUrl ?? null,
        params.ocrConfidence ?? null,
        price.rawText
      ).run();
      
      savedCount++;
    } catch (error) {
      errors.push(`${price.procedureName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  return { savedCount, errors };
}

// ================================================================
// 통합 함수: OCR → 추출 → 저장
// ================================================================

export async function processOCRAndSavePrices(
  ocrText: string,
  params: SavePriceParams,
  db: D1Database
): Promise<PriceExtractionResult> {
  // 1. 가격 추출
  const extractedPrices = await extractPricesFromOCR(ocrText, db);
  
  if (extractedPrices.length === 0) {
    return {
      success: true,
      extractedPrices: [],
      savedCount: 0,
      errors: ['가격 정보를 찾을 수 없습니다.'],
    };
  }
  
  // 2. DB 저장
  const { savedCount, errors } = await savePricesToDB(extractedPrices, params, db);
  
  return {
    success: savedCount > 0,
    extractedPrices,
    savedCount,
    errors,
  };
}
