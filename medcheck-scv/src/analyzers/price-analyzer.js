/**
 * Price Analyzer - Claude Haiku AI Analysis Module
 * 목표: Haiku 모델로 가격 정보 추출 (Sonnet 대비 3배 절감)
 * 
 * 비용: Haiku 4.5 - $1/1M input, $5/1M output
 */

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

// 모델 설정 (Haiku 우선 사용 - 비용 최적화)
const MODELS = {
  HAIKU: 'claude-haiku-4-5-20241022',
  SONNET: 'claude-sonnet-4-20250514'  // fallback
};

// 기본 모델
const DEFAULT_MODEL = MODELS.HAIKU;

// 비용 정보 (per 1M tokens)
const COST_PER_MILLION = {
  'claude-haiku-4-5-20241022': { input: 1, output: 5 },
  'claude-sonnet-4-20250514': { input: 3, output: 15 }
};

// 사용량 로그 경로
const USAGE_LOG_PATH = path.join(__dirname, '..', '..', 'logs', 'usage.json');

// Anthropic 클라이언트 (지연 초기화)
let client = null;

/**
 * Anthropic 클라이언트 초기화
 */
function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

/**
 * 시스템 프롬프트
 */
const SYSTEM_PROMPT = `당신은 병원 가격 정보 추출 전문가입니다.
주어진 텍스트에서 시술 가격 정보를 정확하게 추출하여 JSON으로 반환하세요.

추출 규칙:
1. 가격이 명시된 시술만 추출
2. "문의", "상담" 등 가격 미표기는 price: null
3. 이벤트/할인 가격은 isEvent: true
4. 단위(회, 샷, cc, 부위)를 정확히 구분
5. 가격 범위(10~20만원)는 최저가 기준

출력 형식 (JSON만 출력):
{
  "prices": [
    {
      "procedure": "시술명",
      "price": 숫자 또는 null,
      "unit": "회/샷/cc/부위",
      "targetArea": "부위 (있는 경우)",
      "isEvent": boolean,
      "originalPrice": 숫자 또는 null,
      "notes": "비고"
    }
  ],
  "confidence": 0-100,
  "extractedCount": 숫자,
  "hasMorePrices": boolean,
  "currency": "KRW"
}`;

/**
 * 가격 페이지 분석
 * @param {string} preprocessedText - 전처리된 텍스트
 * @param {Object} hospitalInfo - 병원 정보
 * @param {Object} options - 옵션
 * @returns {Object} - 분석 결과
 */
async function analyzePricePage(preprocessedText, hospitalInfo, options = {}) {
  const {
    model = DEFAULT_MODEL,
    maxTokens = 1000,
    temperature = 0
  } = options;

  if (!preprocessedText || preprocessedText.trim().length === 0) {
    return {
      prices: [],
      confidence: 0,
      extractedCount: 0,
      hasMorePrices: false,
      error: 'Empty input text'
    };
  }

  const anthropic = getClient();
  
  const userMessage = `병원: ${hospitalInfo.name || 'Unknown'}
주소: ${hospitalInfo.address || 'Unknown'}
URL: ${hospitalInfo.url || 'N/A'}

가격 페이지 내용:
${preprocessedText}`;

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userMessage }
      ]
    });

    // 사용량 추적
    const usage = trackUsage(response, model);
    
    // 응답 파싱
    const content = response.content[0].text;
    let result;
    
    try {
      // JSON 추출 (마크다운 코드 블록 처리)
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                        content.match(/```\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      result = JSON.parse(jsonStr);
    } catch (parseError) {
      // JSON 파싱 실패 시 기본 응답
      result = {
        prices: [],
        confidence: 0,
        extractedCount: 0,
        hasMorePrices: false,
        parseError: parseError.message,
        rawResponse: content
      };
    }

    return {
      ...result,
      usage,
      model,
      hospitalInfo: {
        name: hospitalInfo.name,
        ykiho: hospitalInfo.ykiho
      }
    };

  } catch (error) {
    return {
      prices: [],
      confidence: 0,
      extractedCount: 0,
      hasMorePrices: false,
      error: error.message,
      hospitalInfo: {
        name: hospitalInfo.name,
        ykiho: hospitalInfo.ykiho
      }
    };
  }
}

/**
 * 사용량 추적 및 비용 계산
 * @param {Object} response - API 응답
 * @param {string} model - 사용 모델
 * @returns {Object} - 사용량 정보
 */
function trackUsage(response, model) {
  const usage = response.usage;
  const costs = COST_PER_MILLION[model] || { input: 3, output: 15 };
  
  const inputCost = (usage.input_tokens / 1_000_000) * costs.input;
  const outputCost = (usage.output_tokens / 1_000_000) * costs.output;
  const totalCost = inputCost + outputCost;
  
  const usageData = {
    timestamp: new Date().toISOString(),
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.input_tokens + usage.output_tokens,
    inputCost: inputCost.toFixed(6),
    outputCost: outputCost.toFixed(6),
    totalCost: totalCost.toFixed(6)
  };
  
  // 로그 저장 (비동기, 실패해도 무시)
  saveUsageLog(usageData).catch(() => {});
  
  return usageData;
}

/**
 * 사용량 로그 저장
 * @param {Object} usage - 사용량 데이터
 */
async function saveUsageLog(usage) {
  const logDir = path.dirname(USAGE_LOG_PATH);
  
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  let logs = [];
  if (fs.existsSync(USAGE_LOG_PATH)) {
    try {
      logs = JSON.parse(fs.readFileSync(USAGE_LOG_PATH, 'utf8'));
    } catch (e) {
      logs = [];
    }
  }
  
  logs.push(usage);
  
  // 최근 1000개만 유지
  if (logs.length > 1000) {
    logs = logs.slice(-1000);
  }
  
  fs.writeFileSync(USAGE_LOG_PATH, JSON.stringify(logs, null, 2));
}

/**
 * 사용량 통계 조회
 * @returns {Object} - 통계 정보
 */
function getUsageStats() {
  if (!fs.existsSync(USAGE_LOG_PATH)) {
    return {
      totalRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0
    };
  }
  
  try {
    const logs = JSON.parse(fs.readFileSync(USAGE_LOG_PATH, 'utf8'));
    
    return {
      totalRequests: logs.length,
      totalInputTokens: logs.reduce((sum, l) => sum + l.inputTokens, 0),
      totalOutputTokens: logs.reduce((sum, l) => sum + l.outputTokens, 0),
      totalCost: logs.reduce((sum, l) => sum + parseFloat(l.totalCost), 0).toFixed(4),
      lastRequest: logs[logs.length - 1]?.timestamp
    };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * 비용 계산 유틸리티
 * @param {number} inputTokens - 입력 토큰 수
 * @param {number} outputTokens - 출력 토큰 수
 * @param {string} model - 모델명
 * @returns {Object} - 비용 정보
 */
function calculateCost(inputTokens, outputTokens, model = DEFAULT_MODEL) {
  const costs = COST_PER_MILLION[model] || { input: 3, output: 15 };
  
  const inputCost = (inputTokens / 1_000_000) * costs.input;
  const outputCost = (outputTokens / 1_000_000) * costs.output;
  
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    model
  };
}

/**
 * 간단한 가격 추출 (AI 없이, 정규식 기반)
 * AI 호출 전 사전 필터링용
 * @param {string} text - 텍스트
 * @returns {Array} - 추출된 가격들
 */
function extractPricesSimple(text) {
  const prices = [];
  
  // 가격 패턴들
  const patterns = [
    // 10만원, 100만원
    /(\d{1,3})만\s*원/g,
    // 100,000원, 1,000,000원
    /(\d{1,3}(?:,\d{3})+)\s*원/g,
    // 10000원
    /(\d{4,7})\s*원/g
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let value = match[1].replace(/,/g, '');
      
      // 만원 단위 변환
      if (match[0].includes('만')) {
        value = parseInt(value) * 10000;
      } else {
        value = parseInt(value);
      }
      
      if (value >= 1000 && value <= 100000000) {
        prices.push({
          value,
          original: match[0],
          index: match.index
        });
      }
    }
  }
  
  return prices;
}

module.exports = {
  analyzePricePage,
  trackUsage,
  getUsageStats,
  calculateCost,
  extractPricesSimple,
  MODELS,
  DEFAULT_MODEL
};
