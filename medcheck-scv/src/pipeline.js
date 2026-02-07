const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// ============================================
// MEDCHECK Pipeline v2.3
// Puppeteer 스크린샷 → OCR 가격 추출
// ============================================

const API_BASE = process.env.MEDCHECK_ENGINE_URL || 'https://medcheck-engine.mmakid.workers.dev';

// ============================================
// 시술 키워드 (200개+)
// ============================================
const BEAUTY_KEYWORDS = [
  '울쎄라', '슈링크', '리프테라', '더블로', '하이푸', '울트라포머', '울핏', '유쎄라',
  'hifu', 'ultraformer', 'doublo', 'ulthera', 'shurink', 'liftera',
  '써마지', '올리지오', '인모드', '포텐자', '시크릿rf', '스카젠', '아그네스',
  '텐써마', '엑실리스', '비바체', '볼뉴머', '스카렛', '인피니',
  'thermage', 'oligio', 'inmode', 'potenza', 'sylfirm', 'agnes', 'scarlet',
  '리쥬란', '쥬베룩', '물광주사', '연어주사', '엑소좀', '스킨부스터',
  '프로파일로', '스컬트라', '엘란쎄', '레디에스', '아기주사', '윤광주사',
  '백옥주사', '신데렐라주사', '비타민주사', '줄기세포',
  'rejuran', 'juvelook', 'exosome', 'profhilo', 'sculptra',
  '보톡스', '보툴리눔', '보툴렉스', '나보타', '제오민', '디스포트',
  '리즈톡스', '코어톡스', '메디톡신', '스킨보톡스', '미소보톡스',
  '턱보톡스', '광대보톡스', '승모근보톡스', '종아리보톡스', '이마보톡스',
  'botox', 'botulinum', 'xeomin', 'dysport',
  '필러', '쥬비덤', '레스틸렌', '벨로테로', '테오시알', '클레비엘',
  '이브아르', '스타일레이지', '프린세스', '볼필러', '턱필러', '코필러',
  '팔자필러', '이마필러', '입술필러', '눈밑필러',
  'filler', 'juvederm', 'restylane', 'belotero',
  '피코레이저', '피코슈어', '피코웨이', '피코플러스', '피코토닝',
  '레이저토닝', '클라리티', '젠틀맥스', '제네시스', '프락셀',
  '스펙트라', '레블라이트', '엑셀브이', '탄소레이저', '블랙돌',
  'pico', 'picolaser', 'picosure', 'picoway', 'fraxel', 'clarity', 'gentlemax',
  'ipl', 'bbl', 'ldm',
  '제모', '레이저제모', '영구제모', '전신제모', '겨드랑이제모', '비키니제모',
  '소프라노', '젠틀레이즈',
  '실리프팅', '민트실', '녹는실', '코그실', '미스코', 'pdo실', 'pcl실', 'plla실',
  '브이리프팅', '아큐리프트', '울쎄라리프팅', '써마지리프팅',
  '여드름', '여드름압출', '여드름치료', 'mts', '더마펜', '아쿠아필', '제트필',
  '모공치료', '흉터치료', '기미', '잡티', '색소', '미백', '화이트닝',
  '지방분해', '지방흡입', '카복시', '윤곽주사', 'lld', '셀룰라이트',
  '복부지방', '팔뚝살', '허벅지',
  '피부과', '피부시술', '피부관리', '안티에이징', '동안', '탄력', '주름',
  '리프팅', '토닝', '레이저', '주사', '시술',
];

const EXCLUDE_KEYWORDS = [
  '한의원', '한방', '정형외과', '내과의원', '소아과', '이비인후과',
  '비뇨기과', '산부인과', '치과', '안과', '정신과', '신경외과',
];

// ============================================
// 설정
// ============================================
const CONFIG = {
  concurrency: 1, // Puppeteer는 1개씩 처리
  delayBetweenRequests: 2000,
  timeout: 30000,
  maxRetries: 1,
  outputDir: path.join(__dirname, '..', 'output', 'analysis_results'),
  screenshotDir: path.join(__dirname, '..', 'output', 'screenshots'),
};

// ============================================
// 유틸리티
// ============================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function log(message, type = 'info') {
  const timestamp = new Date().toISOString().slice(11, 19);
  const prefix = {
    info: '📋',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    progress: '🔄',
    price: '💰',
    skip: '⏭️',
    ocr: '🖼️',
    browser: '🌐',
  }[type] || '📋';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

async function updateCrawlStatus(status) {
  try {
    await axios.post(`${API_BASE}/v1/crawl-status/update`, status, {
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) { }
}

// ============================================
// 시술 키워드 체크
// ============================================

function checkBeautyKeywords(text, hospitalName) {
  if (!text) return { isBeauty: false, matchedKeywords: [] };

  const lowerText = text.toLowerCase();
  const lowerName = (hospitalName || '').toLowerCase();

  for (const exclude of EXCLUDE_KEYWORDS) {
    if (lowerName.includes(exclude)) {
      return {
        isBeauty: false,
        matchedKeywords: [],
        excludeReason: `병원명에 '${exclude}' 포함`
      };
    }
  }

  const matchedKeywords = [];
  for (const keyword of BEAUTY_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      matchedKeywords.push(keyword);
    }
  }

  return {
    isBeauty: matchedKeywords.length >= 2,
    matchedKeywords: matchedKeywords.slice(0, 10),
    matchCount: matchedKeywords.length,
  };
}

// ============================================
// Puppeteer: 브라우저 관리
// ============================================

let browser = null;

async function initBrowser() {
  if (!browser) {
    log('브라우저 시작...', 'browser');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
    });
    log('브라우저 준비 완료!', 'browser');
  }
  return browser;
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    log('브라우저 종료', 'browser');
  }
}

// ============================================
// Puppeteer: 페이지 크롤링 + 스크린샷
// ============================================

async function crawlWithPuppeteer(url, hospitalName) {
  const b = await initBrowser();
  const page = await b.newPage();

  try {
    // URL 정규화
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    // 뷰포트 설정
    await page.setViewport({ width: 1920, height: 1080 });

    // User-Agent 설정
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // 페이지 로드
    await page.goto(normalizedUrl, {
      waitUntil: 'networkidle2',
      timeout: CONFIG.timeout,
    });

    // 추가 대기 (동적 콘텐츠 로딩)
    await sleep(2000);

    // 텍스트 추출
    const bodyText = await page.evaluate(() => {
      return document.body?.innerText || '';
    }).catch(() => '');

    // 스크린샷 (전체 페이지)
    const screenshotBuffer = await page.screenshot({
      fullPage: true,
      type: 'jpeg',
      quality: 80,
    });

    // 스크린샷 저장 (디버깅용)
    const screenshotFilename = `${hospitalName.replace(/[^가-힣a-zA-Z0-9]/g, '_')}_${Date.now()}.jpg`;
    const screenshotPath = path.join(CONFIG.screenshotDir, screenshotFilename);

    if (!fs.existsSync(CONFIG.screenshotDir)) {
      fs.mkdirSync(CONFIG.screenshotDir, { recursive: true });
    }
    fs.writeFileSync(screenshotPath, screenshotBuffer);

    // Base64 변환
    const screenshotBase64 = screenshotBuffer.toString('base64');

    await page.close();

    return {
      success: true,
      url: normalizedUrl,
      bodyText: bodyText.slice(0, 15000),
      screenshotBase64,
      screenshotPath,
      crawledAt: new Date().toISOString(),
    };

  } catch (error) {
    await page.close().catch(() => { });
    return {
      success: false,
      url,
      error: error.message,
    };
  }
}

// ============================================
// OCR: 스크린샷 → Gemini 분석
// ============================================

async function analyzeScreenshot(base64Image, hospitalInfo) {
  try {
    const response = await axios.post(`${API_BASE}/v1/ocr/analyze`, {
      imageBase64: base64Image,
      extractPrices: true,
      hospitalId: hospitalInfo.ykiho,
      hospitalName: hospitalInfo.name,
      sido: hospitalInfo.sido,
      sigungu: hospitalInfo.sigungu,
    }, {
      timeout: 60000, // 스크린샷은 크니까 60초
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.data.success) {
      return {
        success: true,
        text: response.data.data.extractedText,
        priceInfo: response.data.data.priceInfo || [],
        violations: response.data.data.violations || [],
      };
    }
    return { success: false, error: response.data.error };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================
// 가격 저장
// ============================================

async function savePrices(priceInfoList, hospitalInfo) {
  let savedCount = 0;

  for (const priceText of priceInfoList) {
    try {
      // priceInfo가 문자열인 경우 직접 저장 시도
      const rawText = `${priceText.procedure || '시술'} 1회 ${priceText.price}${priceText.unit}`;
      const response = await axios.post(`${API_BASE}/api/prices/from-ocr`, {
        rawPriceText: rawText,
        // hospitalId: hospitalInfo.ykiho,
        hospitalName: hospitalInfo.name,
        sido: hospitalInfo.sido,
        sigungu: hospitalInfo.sigungu,
        sourceType: 'ocr',
        sourceUrl: hospitalInfo.homepage,
      }, {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.data.success) {
        savedCount++;
      }
    } catch (err) {
      console.log('SAVE ERROR:', err.response?.data || err.message);
    }
  }

  return savedCount;
}

// ============================================
// 위반 분석
// ============================================

async function analyzeViolations(text) {
  try {
    const response = await axios.post(`${API_BASE}/v1/analyze`, {
      text: text.slice(0, 10000),
      enableAI: false,
      options: { detailed: true }
    }, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });

    return response.data.success
      ? { success: true, data: response.data.data }
      : { success: false, error: response.data.error };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================
// 메인: 단일 병원 처리
// ============================================

async function processHospital(hospital, index, total) {
  const { name, homepage, ykiho, sido, sigungu, address } = hospital;

  log(`[${index + 1}/${total}] ${name}`, 'progress');

  if (!homepage) {
    log(`  스킵: 홈페이지 없음`, 'skip');
    return { skipped: true, reason: 'no_homepage' };
  }

  // 1. Puppeteer로 크롤링 + 스크린샷
  log(`  🌐 페이지 로딩...`, 'browser');
  const crawlResult = await crawlWithPuppeteer(homepage, name);

  if (!crawlResult.success) {
    log(`  크롤링 실패: ${crawlResult.error}`, 'warning');
    return {
      hospital: name,
      crawlSuccess: false,
      error: crawlResult.error
    };
  }

  log(`  크롤링 완료: ${crawlResult.bodyText.length}자`, 'info');

  // 2. 시술 키워드 체크
  const keywordCheck = checkBeautyKeywords(crawlResult.bodyText, name);

  if (!keywordCheck.isBeauty) {
    const reason = keywordCheck.excludeReason || `시술키워드 ${keywordCheck.matchCount || 0}개`;
    log(`  ⏭️ 스킵: ${reason}`, 'skip');
    return {
      hospital: name,
      skipped: true,
      reason: 'no_beauty_keywords',
    };
  }

  log(`  ✓ 시술키워드 ${keywordCheck.matchCount}개: ${keywordCheck.matchedKeywords.slice(0, 5).join(', ')}`, 'success');

  // 3. 위반 분석 (텍스트 기반)
  const analysisResult = await analyzeViolations(crawlResult.bodyText);
  let grade = '-';
  let violationCount = 0;

  if (analysisResult.success) {
    grade = analysisResult.data.grade;
    violationCount = analysisResult.data.violationCount;
    log(`  위반 분석: ${grade}등급, ${violationCount}건`, 'success');
    // 분석 결과 DB 저장
    try {
      await axios.post(`${API_BASE}/v1/analysis-results`, {
        hospitalId: ykiho,
        hospitalName: name,
        urlAnalyzed: homepage,
        grade: grade,
        violationCount: violationCount,
        violations: analysisResult.data.violations || [],
        sido: sido,
        sigungu: sigungu
      });
    } catch (e) {
      // 저장 실패해도 계속 진행
    }
  }

  // 4. OCR 가격 추출 (스크린샷 기반!)
  log(`  🖼️ OCR 분석 중...`, 'ocr');
  const hospitalInfo = { ykiho, name, homepage, sido, sigungu, address };
  const ocrResult = await analyzeScreenshot(crawlResult.screenshotBase64, hospitalInfo);

  let pricesFound = 0;
  let pricesSaved = 0;

  if (ocrResult.success && ocrResult.priceInfo?.length > 0) {
    pricesFound = ocrResult.priceInfo.length;
    log(`  💰 가격 ${pricesFound}개 발견!`, 'price');
    console.log('DEBUG priceInfo:', JSON.stringify(ocrResult.priceInfo));

    // 가격 저장
    pricesSaved = await savePrices(ocrResult.priceInfo, hospitalInfo);
    log(`  💰 ${pricesSaved}개 저장 완료`, 'price');
  } else {
    log(`  가격 정보 없음`, 'info');
  }

  return {
    hospital: name,
    homepage,
    crawlSuccess: true,
    analysisSuccess: analysisResult.success,
    grade,
    violationCount,
    priceFound: pricesFound,
    priceSaved: pricesSaved,
    screenshotPath: crawlResult.screenshotPath,
    beautyKeywords: keywordCheck.matchedKeywords,
  };
}

// ============================================
// 메인 파이프라인
// ============================================

async function runPipeline(inputFile, options = {}) {
  const { limit = 0, startFrom = 0 } = options;

  log('='.repeat(50), 'info');
  log('MEDCHECK Pipeline v2.3 (Puppeteer + OCR)', 'info');
  log('='.repeat(50), 'info');

  if (!fs.existsSync(inputFile)) {
    log(`파일 없음: ${inputFile}`, 'error');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const allHospitals = data.hospitals || [];

  log(`전체 병원: ${allHospitals.length}개`, 'info');

  let hospitals = allHospitals.filter(h => h.homepage && h.homepage.trim());
  log(`홈페이지 있는 병원: ${hospitals.length}개`, 'info');

  if (startFrom > 0) {
    hospitals = hospitals.slice(startFrom);
    log(`시작 위치: ${startFrom}`, 'info');
  }

  if (limit > 0) {
    hospitals = hospitals.slice(0, limit);
    log(`처리 제한: ${limit}개`, 'info');
  }

  log(`처리 대상: ${hospitals.length}개`, 'info');
  log('='.repeat(50), 'info');

  // 디렉토리 생성
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }
  if (!fs.existsSync(CONFIG.screenshotDir)) {
    fs.mkdirSync(CONFIG.screenshotDir, { recursive: true });
  }

  const startTime = Date.now();
  const allResults = [];
  const stats = {
    total: hospitals.length,
    processed: 0,
    crawlSuccess: 0,
    crawlFailed: 0,
    analysisSuccess: 0,
    skipped: 0,
    skippedNoKeywords: 0,
    byGrade: { A: 0, B: 0, C: 0, D: 0, F: 0 },
    totalPricesFound: 0,
    totalPricesSaved: 0,
  };

  try {
    for (let i = 0; i < hospitals.length; i++) {
      const result = await processHospital(hospitals[i], i, hospitals.length);
      allResults.push(result);
      stats.processed++;

      if (result.skipped) {
        stats.skipped++;
        if (result.reason === 'no_beauty_keywords') {
          stats.skippedNoKeywords++;
        }
      } else if (result.crawlSuccess) {
        stats.crawlSuccess++;
        if (result.analysisSuccess) {
          stats.analysisSuccess++;
          if (result.grade && stats.byGrade[result.grade] !== undefined) {
            stats.byGrade[result.grade]++;
          }
        }
        stats.totalPricesFound += result.priceFound || 0;
        stats.totalPricesSaved += result.priceSaved || 0;
      } else {
        stats.crawlFailed++;
      }

      // 중간 저장
      if (stats.processed % 20 === 0) {
        log(`--- 진행: ${stats.processed}/${hospitals.length} | 가격 ${stats.totalPricesSaved}개 저장 ---`, 'info');
      }

      // 딜레이
      await sleep(CONFIG.delayBetweenRequests);
    }
  } finally {
    // 브라우저 종료
    await closeBrowser();
  }

  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  // 결과 저장
  const outputFile = path.join(CONFIG.outputDir, `pipeline_result_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);
  fs.writeFileSync(outputFile, JSON.stringify({ stats, results: allResults }, null, 2));

  // 최종 통계
  log('='.repeat(50), 'info');
  log('🎉 파이프라인 완료!', 'success');
  log('='.repeat(50), 'info');
  log(`처리 시간: ${duration}분`, 'info');
  log(`전체: ${stats.total}개`, 'info');
  log('--- 필터링 ---', 'info');
  log(`크롤링 성공: ${stats.crawlSuccess}개`, 'info');
  log(`크롤링 실패: ${stats.crawlFailed}개`, 'warning');
  log(`가짜 피부과 스킵: ${stats.skippedNoKeywords}개`, 'skip');
  log('--- 분석 ---', 'info');
  log(`진짜 피부과: ${stats.analysisSuccess}개`, 'success');
  log('--- 등급 ---', 'info');
  log(`A: ${stats.byGrade.A} | B: ${stats.byGrade.B} | C: ${stats.byGrade.C} | D: ${stats.byGrade.D} | F: ${stats.byGrade.F}`, 'info');
  log('--- 가격 (Puppeteer OCR) ---', 'price');
  log(`💰 가격 발견: ${stats.totalPricesFound}개`, 'price');
  log(`💰 가격 저장: ${stats.totalPricesSaved}개`, 'price');
  log(`스크린샷: ${CONFIG.screenshotDir}`, 'info');
  log(`결과: ${outputFile}`, 'info');

  return { stats, results: allResults };
}

// ============================================
// CLI
// ============================================

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
MEDCHECK Pipeline v2.3 (Puppeteer + OCR)
========================================

★ Puppeteer로 실제 브라우저 렌더링 → 스크린샷 → OCR!

사용법:
  node pipeline.js <input.json> [options]

옵션:
  --limit <n>      처리 제한
  --start <n>      시작 위치

예시:
  node pipeline.js hospitals_서울.json --limit 5
  node pipeline.js hospitals_서울.json --start 100 --limit 50
  `);
  process.exit(0);
}

const inputFile = args[0];
const pipelineOptions = {};

for (let i = 1; i < args.length; i++) {
  if (args[i] === '--limit' && args[i + 1]) {
    pipelineOptions.limit = parseInt(args[i + 1]);
    i++;
  } else if (args[i] === '--start' && args[i + 1]) {
    pipelineOptions.startFrom = parseInt(args[i + 1]);
    i++;
  }
}

runPipeline(inputFile, pipelineOptions).catch(error => {
  log(`오류: ${error.message}`, 'error');
  closeBrowser().finally(() => process.exit(1));
});
