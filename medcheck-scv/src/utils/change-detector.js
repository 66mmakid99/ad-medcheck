/**
 * Change Detector - Hash-based Change Detection Module
 * 목표: 변경된 페이지만 분석하여 80% 비용 절감
 * 
 * MD5 해시를 사용하여 콘텐츠 변경 감지
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// 캐시 파일 경로
const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'cache');
const CACHE_FILE = 'page_hashes.json';

/**
 * 콘텐츠의 MD5 해시 생성
 * @param {string} content - 해시할 콘텐츠
 * @returns {string} - MD5 해시
 */
function getHash(content) {
  return crypto.createHash('md5').update(content, 'utf8').digest('hex');
}

/**
 * 정규화된 해시 생성 (공백/날짜 무시)
 * @param {string} content - 해시할 콘텐츠
 * @returns {string} - 정규화된 MD5 해시
 */
function getNormalizedHash(content) {
  // 날짜/시간 패턴 제거 (자주 변경되는 부분)
  const normalized = content
    .replace(/\d{4}[-\/]\d{2}[-\/]\d{2}/g, '')  // YYYY-MM-DD
    .replace(/\d{2}:\d{2}(:\d{2})?/g, '')       // HH:MM:SS
    .replace(/\s+/g, ' ')                        // 공백 정규화
    .trim();
  
  return getHash(normalized);
}

/**
 * 캐시 디렉토리 확인/생성
 */
function ensureCacheDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * 캐시 로드
 * @returns {Object} - { url: { hash, lastChecked, lastChanged } }
 */
function loadCache() {
  ensureCacheDir();
  const cachePath = path.join(DATA_DIR, CACHE_FILE);
  
  if (fs.existsSync(cachePath)) {
    try {
      return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    } catch (e) {
      console.warn('Cache file corrupted, starting fresh');
      return {};
    }
  }
  return {};
}

/**
 * 캐시 저장
 * @param {Object} cache - 캐시 객체
 */
function saveCache(cache) {
  ensureCacheDir();
  const cachePath = path.join(DATA_DIR, CACHE_FILE);
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
}

/**
 * 콘텐츠 변경 여부 확인
 * @param {string} url - 페이지 URL
 * @param {string} newContent - 새 콘텐츠
 * @param {Object} options - 옵션
 * @returns {Object} - { changed, hash, isNew, lastChanged }
 */
function hasChanged(url, newContent, options = {}) {
  const { 
    useNormalizedHash = true,
    autoSave = true 
  } = options;
  
  const cache = loadCache();
  const newHash = useNormalizedHash 
    ? getNormalizedHash(newContent) 
    : getHash(newContent);
  
  const now = new Date().toISOString();
  const cached = cache[url];
  
  if (!cached) {
    // 새로운 URL
    cache[url] = {
      hash: newHash,
      lastChecked: now,
      lastChanged: now,
      checkCount: 1
    };
    
    if (autoSave) saveCache(cache);
    
    return {
      changed: true,
      hash: newHash,
      isNew: true,
      lastChanged: now
    };
  }
  
  const changed = cached.hash !== newHash;
  
  // 캐시 업데이트
  cache[url] = {
    hash: changed ? newHash : cached.hash,
    lastChecked: now,
    lastChanged: changed ? now : cached.lastChanged,
    previousHash: changed ? cached.hash : cached.previousHash,
    checkCount: (cached.checkCount || 0) + 1
  };
  
  if (autoSave) saveCache(cache);
  
  return {
    changed,
    hash: newHash,
    isNew: false,
    lastChanged: cache[url].lastChanged,
    previousHash: cached.hash
  };
}

/**
 * 특정 URL의 캐시 정보 조회
 * @param {string} url - URL
 * @returns {Object|null} - 캐시 정보 또는 null
 */
function getCacheInfo(url) {
  const cache = loadCache();
  return cache[url] || null;
}

/**
 * 특정 URL 캐시 삭제
 * @param {string} url - URL
 */
function invalidateCache(url) {
  const cache = loadCache();
  if (cache[url]) {
    delete cache[url];
    saveCache(cache);
  }
}

/**
 * 전체 캐시 초기화
 */
function clearCache() {
  saveCache({});
}

/**
 * 캐시 통계
 * @returns {Object} - 통계 정보
 */
function getCacheStats() {
  const cache = loadCache();
  const urls = Object.keys(cache);
  
  if (urls.length === 0) {
    return {
      totalUrls: 0,
      oldestCheck: null,
      newestCheck: null
    };
  }
  
  const checks = urls.map(url => cache[url].lastChecked).sort();
  
  return {
    totalUrls: urls.length,
    oldestCheck: checks[0],
    newestCheck: checks[checks.length - 1],
    avgCheckCount: urls.reduce((sum, url) => sum + (cache[url].checkCount || 1), 0) / urls.length
  };
}

/**
 * 배치 변경 감지 (여러 URL 한번에)
 * @param {Array} items - [{ url, content }, ...]
 * @returns {Object} - { changed: [], unchanged: [], stats }
 */
function batchCheckChanges(items) {
  const cache = loadCache();
  const results = {
    changed: [],
    unchanged: [],
    newItems: []
  };
  
  const now = new Date().toISOString();
  
  for (const item of items) {
    const { url, content } = item;
    const newHash = getNormalizedHash(content);
    const cached = cache[url];
    
    if (!cached) {
      // 새로운 URL
      cache[url] = {
        hash: newHash,
        lastChecked: now,
        lastChanged: now,
        checkCount: 1
      };
      results.newItems.push({ url, hash: newHash });
      results.changed.push({ url, hash: newHash, isNew: true });
    } else if (cached.hash !== newHash) {
      // 변경됨
      cache[url] = {
        hash: newHash,
        lastChecked: now,
        lastChanged: now,
        previousHash: cached.hash,
        checkCount: (cached.checkCount || 0) + 1
      };
      results.changed.push({ 
        url, 
        hash: newHash, 
        previousHash: cached.hash,
        isNew: false 
      });
    } else {
      // 변경 없음
      cache[url].lastChecked = now;
      cache[url].checkCount = (cached.checkCount || 0) + 1;
      results.unchanged.push({ url, hash: cached.hash });
    }
  }
  
  saveCache(cache);
  
  return {
    ...results,
    stats: {
      total: items.length,
      changed: results.changed.length,
      unchanged: results.unchanged.length,
      newItems: results.newItems.length,
      changeRate: Math.round((results.changed.length / items.length) * 100)
    }
  };
}

module.exports = {
  getHash,
  getNormalizedHash,
  hasChanged,
  getCacheInfo,
  invalidateCache,
  clearCache,
  getCacheStats,
  batchCheckChanges,
  loadCache,
  saveCache
};
