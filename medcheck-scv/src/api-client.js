const axios = require('axios');

// API Configuration
const API_BASE = process.env.MEDCHECK_ENGINE_URL || 'https://medcheck-engine.mmakid.workers.dev';
const API_KEY = process.env.MEDCHECK_ENGINE_API_KEY || '';

// ============================================
// 세션 관리
// ============================================

/**
 * 새 크롤링 세션 생성
 * @param {Object} options - { sessionType, targetSido, targetRegion, filterConditions }
 * @returns {Promise<Object>} - { sessionId }
 */
async function createCrawlSession(options) {
  const { sessionType = 'hospital_crawl', targetSido, targetRegion, filterConditions } = options;
  
  try {
    const response = await axios.post(`${API_BASE}/v1/crawl-sessions`, {
      sessionType,
      targetSido,
      targetRegion,
      filterConditions
    }, {
      headers: API_KEY ? { 'X-API-Key': API_KEY } : {}
    });
    
    if (!response.data.success) {
      throw new Error(`API Error: ${response.data.error}`);
    }
    
    console.log(`[API] Created session: ${response.data.data.sessionId}`);
    return response.data.data;
  } catch (error) {
    if (error.response?.status === 404 || error.response?.status === 500) {
      throw new Error(`API unavailable (${error.response.status}): ${error.message}`);
    }
    throw error;
  }
}

/**
 * 세션 완료
 * @param {string} sessionId
 * @param {Object} options - { status, message, outputFile }
 */
async function completeCrawlSession(sessionId, options = {}) {
  const { status = 'completed', message, outputFile } = options;
  
  try {
    const response = await axios.put(`${API_BASE}/v1/crawl-sessions/${sessionId}`, {
      status,
      message,
      outputFile
    }, {
      headers: API_KEY ? { 'X-API-Key': API_KEY } : {}
    });
    
    console.log(`[API] Completed session: ${sessionId}`);
    return response.data;
  } catch (error) {
    console.warn(`[API] Failed to complete session: ${error.message}`);
    // 세션 완료 실패는 치명적이 아니므로 경고만
  }
}

// ============================================
// 병원 데이터 전송
// ============================================

/**
 * 병원 데이터 일괄 전송 (배치)
 * @param {string} crawlSessionId
 * @param {Array} hospitals - 병원 데이터 배열
 * @returns {Promise<Object>} - { count }
 */
async function uploadHospitals(crawlSessionId, hospitals) {
  const BATCH_SIZE = 100;  // 한 번에 100개씩 전송
  const total = hospitals.length;
  let uploaded = 0;
  
  for (let i = 0; i < hospitals.length; i += BATCH_SIZE) {
    const batch = hospitals.slice(i, i + BATCH_SIZE);
    
    try {
      const response = await axios.post(`${API_BASE}/v1/collected-hospitals`, {
        crawlSessionId,
        hospitals: batch
      }, {
        headers: API_KEY ? { 'X-API-Key': API_KEY } : {}
      });
      
      if (!response.data.success) {
        throw new Error(`Upload failed: ${response.data.error}`);
      }
      
      uploaded += batch.length;
      console.log(`[API] Uploaded ${uploaded}/${total} hospitals (${((uploaded/total)*100).toFixed(1)}%)`);
      
      // Rate limit: 100ms between batches
      if (i + BATCH_SIZE < hospitals.length) {
        await sleep(100);
      }
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error('API Key invalid');
      }
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        // 네트워크 오류 시 재시도 (최대 3회)
        console.warn(`[API] Network error, retrying batch ${i/BATCH_SIZE + 1}...`);
        await sleep(2000);
        
        // 한 번만 재시도
        try {
          const response = await axios.post(`${API_BASE}/v1/collected-hospitals`, {
            crawlSessionId,
            hospitals: batch
          }, {
            headers: API_KEY ? { 'X-API-Key': API_KEY } : {}
          });
          
          if (response.data.success) {
            uploaded += batch.length;
            console.log(`[API] Retry successful: ${uploaded}/${total}`);
            continue;
          }
        } catch (retryError) {
          console.error(`[API] Retry failed: ${retryError.message}`);
        }
      }
      
      throw error;
    }
  }
  
  console.log(`[API] Upload complete: ${uploaded}/${total} hospitals`);
  return { count: uploaded };
}

// ============================================
// 유틸리티
// ============================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// Export
// ============================================

module.exports = {
  createCrawlSession,
  completeCrawlSession,
  uploadHospitals
};
