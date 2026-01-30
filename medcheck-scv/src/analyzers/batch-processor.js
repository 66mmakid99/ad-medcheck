/**
 * Batch Processor - Anthropic Batch API Module
 * 목표: Batch API로 50% 추가 비용 절감
 * 
 * Batch API는 24시간 이내 처리, 50% 할인
 * 대량 처리 시 유용
 */

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

// 배치 상태 저장 경로
const BATCH_STATE_DIR = path.join(__dirname, '..', '..', 'data', 'batches');

// 모델 설정
const DEFAULT_MODEL = 'claude-haiku-4-5-20241022';

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
 * 시스템 프롬프트 (price-analyzer와 동일)
 */
const SYSTEM_PROMPT = `당신은 병원 가격 정보 추출 전문가입니다.
주어진 텍스트에서 시술 가격 정보를 정확하게 추출하여 JSON으로 반환하세요.

추출 규칙:
1. 가격이 명시된 시술만 추출
2. "문의", "상담" 등 가격 미표기는 price: null
3. 이벤트/할인 가격은 isEvent: true
4. 단위(회, 샷, cc, 부위)를 정확히 구분

출력 형식 (JSON만 출력):
{
  "prices": [
    {
      "procedure": "시술명",
      "price": 숫자 또는 null,
      "unit": "회/샷/cc/부위",
      "targetArea": "부위",
      "isEvent": boolean,
      "notes": "비고"
    }
  ],
  "confidence": 0-100,
  "extractedCount": 숫자
}`;

/**
 * 배치 디렉토리 확인/생성
 */
function ensureBatchDir() {
  if (!fs.existsSync(BATCH_STATE_DIR)) {
    fs.mkdirSync(BATCH_STATE_DIR, { recursive: true });
  }
}

/**
 * 배치 요청 생성
 * @param {Array} requests - [{ id, preprocessedText, hospitalInfo }, ...]
 * @param {Object} options - 옵션
 * @returns {Object} - 배치 정보
 */
async function createBatch(requests, options = {}) {
  const {
    model = DEFAULT_MODEL,
    maxTokens = 1000
  } = options;

  if (!requests || requests.length === 0) {
    throw new Error('No requests provided');
  }

  const anthropic = getClient();

  // 배치 요청 형식 변환
  const batchRequests = requests.map(req => ({
    custom_id: req.id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    params: {
      model,
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `병원: ${req.hospitalInfo?.name || 'Unknown'}
주소: ${req.hospitalInfo?.address || 'Unknown'}

가격 페이지 내용:
${req.preprocessedText}`
        }
      ]
    }
  }));

  try {
    const batch = await anthropic.batches.create({
      requests: batchRequests
    });

    // 배치 상태 저장
    saveBatchState(batch.id, {
      id: batch.id,
      status: batch.processing_status,
      createdAt: new Date().toISOString(),
      totalRequests: requests.length,
      model,
      requestIds: batchRequests.map(r => r.custom_id)
    });

    return {
      batchId: batch.id,
      status: batch.processing_status,
      totalRequests: requests.length,
      estimatedCompletion: '24시간 이내'
    };

  } catch (error) {
    throw new Error(`Failed to create batch: ${error.message}`);
  }
}

/**
 * 배치 상태 확인
 * @param {string} batchId - 배치 ID
 * @returns {Object} - 상태 정보
 */
async function checkBatchStatus(batchId) {
  const anthropic = getClient();

  try {
    const batch = await anthropic.batches.retrieve(batchId);

    const status = {
      batchId: batch.id,
      status: batch.processing_status,
      createdAt: batch.created_at,
      endedAt: batch.ended_at,
      expiresAt: batch.expires_at,
      requestCounts: {
        total: batch.request_counts?.total || 0,
        succeeded: batch.request_counts?.succeeded || 0,
        errored: batch.request_counts?.errored || 0,
        canceled: batch.request_counts?.canceled || 0,
        expired: batch.request_counts?.expired || 0,
        processing: batch.request_counts?.processing || 0
      }
    };

    // 로컬 상태 업데이트
    updateBatchState(batchId, status);

    return status;

  } catch (error) {
    throw new Error(`Failed to check batch status: ${error.message}`);
  }
}

/**
 * 배치 결과 조회
 * @param {string} batchId - 배치 ID
 * @returns {Array} - 결과 배열
 */
async function getBatchResults(batchId) {
  const anthropic = getClient();

  try {
    // 먼저 상태 확인
    const batch = await anthropic.batches.retrieve(batchId);
    
    if (batch.processing_status !== 'ended') {
      return {
        status: batch.processing_status,
        message: `Batch not completed yet. Status: ${batch.processing_status}`,
        results: null
      };
    }

    // 결과 파일 URL 확인
    if (!batch.results_url) {
      return {
        status: 'ended',
        message: 'No results available',
        results: null
      };
    }

    // 결과 스트리밍 (Anthropic SDK가 지원하는 경우)
    // 현재 SDK에서는 직접 다운로드 필요할 수 있음
    const results = [];
    
    // SDK v0.30+ 에서 results() 메서드 사용
    if (typeof anthropic.batches.results === 'function') {
      const stream = await anthropic.batches.results(batchId);
      
      for await (const result of stream) {
        results.push(parseResultItem(result));
      }
    }

    // 결과 저장
    saveBatchResults(batchId, results);

    return {
      status: 'completed',
      totalResults: results.length,
      results
    };

  } catch (error) {
    throw new Error(`Failed to get batch results: ${error.message}`);
  }
}

/**
 * 결과 아이템 파싱
 */
function parseResultItem(item) {
  try {
    const content = item.result?.message?.content?.[0]?.text || '';
    
    // JSON 추출
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                      content.match(/```\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      parsed = { raw: content, parseError: true };
    }

    return {
      customId: item.custom_id,
      success: item.result?.type === 'succeeded',
      data: parsed,
      usage: item.result?.message?.usage
    };
  } catch (e) {
    return {
      customId: item.custom_id,
      success: false,
      error: e.message
    };
  }
}

/**
 * 배치 취소
 * @param {string} batchId - 배치 ID
 */
async function cancelBatch(batchId) {
  const anthropic = getClient();

  try {
    const batch = await anthropic.batches.cancel(batchId);
    updateBatchState(batchId, { status: 'canceling' });
    return { batchId, status: batch.processing_status };
  } catch (error) {
    throw new Error(`Failed to cancel batch: ${error.message}`);
  }
}

/**
 * 활성 배치 목록 조회
 */
async function listActiveBatches() {
  const anthropic = getClient();

  try {
    const batches = await anthropic.batches.list({ limit: 20 });
    
    return batches.data.map(b => ({
      id: b.id,
      status: b.processing_status,
      createdAt: b.created_at,
      requestCounts: b.request_counts
    }));
  } catch (error) {
    throw new Error(`Failed to list batches: ${error.message}`);
  }
}

/**
 * 배치 상태 저장
 */
function saveBatchState(batchId, state) {
  ensureBatchDir();
  const filePath = path.join(BATCH_STATE_DIR, `${batchId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

/**
 * 배치 상태 업데이트
 */
function updateBatchState(batchId, updates) {
  ensureBatchDir();
  const filePath = path.join(BATCH_STATE_DIR, `${batchId}.json`);
  
  let state = {};
  if (fs.existsSync(filePath)) {
    state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  
  state = { ...state, ...updates, updatedAt: new Date().toISOString() };
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

/**
 * 배치 결과 저장
 */
function saveBatchResults(batchId, results) {
  ensureBatchDir();
  const filePath = path.join(BATCH_STATE_DIR, `${batchId}_results.json`);
  fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
}

/**
 * 로컬 배치 상태 조회
 */
function getLocalBatchState(batchId) {
  const filePath = path.join(BATCH_STATE_DIR, `${batchId}.json`);
  
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return null;
}

/**
 * 모든 로컬 배치 목록
 */
function listLocalBatches() {
  ensureBatchDir();
  
  const files = fs.readdirSync(BATCH_STATE_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('_results'));
  
  return files.map(f => {
    const content = fs.readFileSync(path.join(BATCH_STATE_DIR, f), 'utf8');
    return JSON.parse(content);
  });
}

/**
 * 배치 비용 추정
 * @param {number} requestCount - 요청 수
 * @param {number} avgInputTokens - 평균 입력 토큰
 * @param {number} avgOutputTokens - 평균 출력 토큰
 * @returns {Object} - 비용 추정
 */
function estimateBatchCost(requestCount, avgInputTokens = 500, avgOutputTokens = 300) {
  // Haiku 4.5: $1/1M input, $5/1M output (Batch는 50% 할인)
  const inputCostPerMillion = 0.5;   // $1 * 0.5
  const outputCostPerMillion = 2.5;  // $5 * 0.5
  
  const totalInputTokens = requestCount * avgInputTokens;
  const totalOutputTokens = requestCount * avgOutputTokens;
  
  const inputCost = (totalInputTokens / 1_000_000) * inputCostPerMillion;
  const outputCost = (totalOutputTokens / 1_000_000) * outputCostPerMillion;
  
  const regularCost = (totalInputTokens / 1_000_000) * 1 + (totalOutputTokens / 1_000_000) * 5;
  
  return {
    requestCount,
    estimatedInputTokens: totalInputTokens,
    estimatedOutputTokens: totalOutputTokens,
    batchCost: (inputCost + outputCost).toFixed(4),
    regularCost: regularCost.toFixed(4),
    savings: (regularCost - inputCost - outputCost).toFixed(4),
    savingsPercent: '50%'
  };
}

module.exports = {
  createBatch,
  checkBatchStatus,
  getBatchResults,
  cancelBatch,
  listActiveBatches,
  listLocalBatches,
  getLocalBatchState,
  estimateBatchCost,
  DEFAULT_MODEL
};
