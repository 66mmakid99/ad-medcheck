const axios = require('axios');
const xml2js = require('xml2js');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const { createCrawlSession, uploadHospitals, completeCrawlSession } = require('./api-client');

// ============================================
// Configuration
// ============================================

// API Configuration (환경변수 필수)
const API_KEY = process.env.DATA_GO_KR_API_KEY;
if (!API_KEY) {
  console.error('[ERROR] DATA_GO_KR_API_KEY 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.');
  process.exit(1);
}
const BASE_URL = 'https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList';

// Checkpoint Configuration
const CHECKPOINT_INTERVAL = 10;  // 10페이지마다 저장
const CHECKPOINT_DIR = path.join(__dirname, '..', 'data', 'checkpoints');

// Region Codes
const SIDO_CODES = {
  '서울': '110000',
  '경기': '410000',
  '인천': '280000',
  '부산': '260000',
  '대구': '270000'
};

const REGIONS = {
  '수도권': ['서울', '경기', '인천'],
  '전국': ['서울', '경기', '인천', '부산', '대구']
};

// ============================================
// 피부시술 필터링 키워드
// ============================================

// 병원명 키워드 (OR 조건)
const NAME_KEYWORDS = [
  // 진료과목
  '피부', '스킨', '더마', 'skin', 'derma', '성형', '뷰티', 'beauty',
  // 일반
  '클리닉', 'clinic', '에스테틱', '메디컬', '미용'
];

// 시술명 키워드 (OR 조건) - GP도 발견 가능
const PROCEDURE_KEYWORDS = [
  // HIFU
  '울쎄라', '슈링크', '리프테라', '더블로', '하이푸', '울트라포머', 'hifu',
  // RF
  '써마지', '올리지오', '인모드', '토르', '포텐자', '스카렛', '시크릿',
  // 스킨부스터/주사
  '리쥬란', '쥬베룩', '물광', '보톡스', '필러', '스컬트라', '프로파일로',
  '연어주사', '백옥주사', '엑소좀',
  // 레이저
  '피코', '토닝', '프락셀', 'ipl', '클라리티', '스펙트라', '레이저',
  // 리프팅
  '실리프팅', '민트실', 'pdo', '리프팅',
  // 기타
  '제모', '여드름', '모공', '주름', '탄력', '미백', '기미', '잡티'
];

// 진료과목 코드 (피부과=14, 성형외과=09)
const TARGET_DEPT_CODES = ['14', '09'];

// 제외할 병원명 키워드 (병원명에 다른 진료과가 명시된 경우만)
const EXCLUDE_KEYWORDS = [
  // 내과 (병원명에 "내과"가 들어간 경우)
  '내과의원', '내과클리닉',
  // 외과 계열 (성형외과 제외)
  '정형외과', '신경외과', '흉부외과', '심장외과', '외과의원',
  // 기타 진료과
  '이비인후과', '비뇨기과', '비뇨의학과', '산부인과', '부인과의원',
  '소아과', '소아청소년과', '안과의원', '치과의원', '치과', 
  '한의원', '한방의원', '한방병원',
  '정신과', '정신건강의학과', '신경과의원', 
  '재활의학과', '영상의학과', '마취통증의학과',
  '가정의학과', '응급의학과', '직업환경의학과'
];

/**
 * 피부시술 관련 병원인지 필터링 (엄격한 버전)
 * - 다른 진료과 병원명은 무조건 제외
 * - 피부과/성형외과만 포함
 */
function isSkinClinic(hospital) {
  const name = (hospital.name || '');
  const nameLower = name.toLowerCase();
  
  // 1. 제외 키워드 체크 - 다른 진료과는 무조건 제외
  for (const exclude of EXCLUDE_KEYWORDS) {
    if (name.includes(exclude)) {
      return false;  // 피부 키워드 있어도 제외 (정형외과피부과 같은 건 없음)
    }
  }
  
  // 2. 여기까지 왔으면 다른 진료과 아님 → 포함
  // (API에서 이미 피부과 dgsbjtCd=14로 필터링했으므로)
  return true;
}

// 레거시 호환
const DERMA_KEYWORDS = NAME_KEYWORDS;

// ============================================
// Checkpoint Functions (NEW)
// ============================================

/**
 * Checkpoint 디렉토리 확인/생성
 */
function ensureCheckpointDir() {
  if (!fs.existsSync(CHECKPOINT_DIR)) {
    fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  }
}

/**
 * Checkpoint 저장
 * @param {Object} state - 현재 상태
 */
function saveCheckpoint(state) {
  ensureCheckpointDir();
  const checkpointPath = path.join(CHECKPOINT_DIR, `${state.sido}_checkpoint.json`);
  
  const checkpoint = {
    sido: state.sido,
    sidoCd: state.sidoCd,
    pageNo: state.pageNo,
    totalCount: state.totalCount,
    hospitals: state.hospitals,
    timestamp: new Date().toISOString(),
    version: '1.0'
  };
  
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf8');
  console.log(`  [Checkpoint] Saved at page ${state.pageNo} (${state.hospitals.length} hospitals)`);
}

/**
 * Checkpoint 로드
 * @param {string} sido - 시도명
 * @returns {Object|null} - Checkpoint 데이터 또는 null
 */
function loadCheckpoint(sido) {
  const checkpointPath = path.join(CHECKPOINT_DIR, `${sido}_checkpoint.json`);
  
  if (fs.existsSync(checkpointPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
      
      // 24시간 이내 체크포인트만 유효
      const checkpointTime = new Date(data.timestamp);
      const now = new Date();
      const hoursDiff = (now - checkpointTime) / (1000 * 60 * 60);
      
      if (hoursDiff > 24) {
        console.log(`  [Checkpoint] Found but expired (${hoursDiff.toFixed(1)} hours old)`);
        return null;
      }
      
      console.log(`  [Checkpoint] Resuming from page ${data.pageNo} (${data.hospitals.length} hospitals)`);
      return data;
    } catch (e) {
      console.warn(`  [Checkpoint] Failed to load: ${e.message}`);
      return null;
    }
  }
  return null;
}

/**
 * Checkpoint 삭제 (완료 후)
 * @param {string} sido - 시도명
 */
function clearCheckpoint(sido) {
  const checkpointPath = path.join(CHECKPOINT_DIR, `${sido}_checkpoint.json`);
  
  if (fs.existsSync(checkpointPath)) {
    fs.unlinkSync(checkpointPath);
    console.log(`  [Checkpoint] Cleared for ${sido}`);
  }
}

/**
 * 모든 Checkpoint 목록
 * @returns {Array} - Checkpoint 정보 배열
 */
function listCheckpoints() {
  ensureCheckpointDir();
  
  const files = fs.readdirSync(CHECKPOINT_DIR)
    .filter(f => f.endsWith('_checkpoint.json'));
  
  return files.map(f => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(CHECKPOINT_DIR, f), 'utf8'));
      return {
        sido: data.sido,
        pageNo: data.pageNo,
        hospitals: data.hospitals?.length || 0,
        timestamp: data.timestamp
      };
    } catch (e) {
      return { file: f, error: e.message };
    }
  });
}

// ============================================
// Utility Functions
// ============================================

// Utility: Sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Utility: Parse XML to JSON
async function parseXml(xmlString) {
  const parser = new xml2js.Parser({ explicitArray: false });
  return await parser.parseStringPromise(xmlString);
}

// Utility: Check if hospital name contains derma keywords
function isDermaClinic(name) {
  if (!name) return false;
  const lowerName = name.toLowerCase();
  return DERMA_KEYWORDS.some(keyword => lowerName.includes(keyword.toLowerCase()));
}

// ============================================
// API Functions
// ============================================

// API: Fetch hospital list with pagination
async function fetchHospitals(sidoCd, pageNo = 1, numOfRows = 100, retryCount = 0) {
  const maxRetries = 3;
  
  const params = {
    serviceKey: API_KEY,
    sidoCd: sidoCd,
    clCd: '31',        // 의원만
    dgsbjtCd: '14',    // 피부과
    numOfRows: numOfRows,
    pageNo: pageNo
  };

  try {
    const response = await axios.get(BASE_URL, {
      params,
      timeout: 30000,
      headers: {
        'Accept': 'application/xml'
      }
    });

    const result = await parseXml(response.data);
    
    // Check for API error
    if (result.response?.header?.resultCode !== '00') {
      const errorMsg = result.response?.header?.resultMsg || 'Unknown API error';
      throw new Error(`API Error: ${errorMsg}`);
    }

    return result.response?.body;
  } catch (error) {
    if (retryCount < maxRetries) {
      console.log(`  Retry ${retryCount + 1}/${maxRetries} after error: ${error.message}`);
      await sleep(1000 * (retryCount + 1));
      return fetchHospitals(sidoCd, pageNo, numOfRows, retryCount + 1);
    }
    throw error;
  }
}

// ============================================
// Collection Functions
// ============================================

// Process: Collect all hospitals for a region (with Resume support)
async function collectHospitalsForSido(sido, options = {}) {
  const { resume = false, useApi = false } = options;
  
  const sidoCd = SIDO_CODES[sido];
  if (!sidoCd) {
    throw new Error(`Unknown sido: ${sido}`);
  }

  console.log(`\n[${sido}] Starting collection (sidoCd: ${sidoCd})...`);
  
  // API 모드: 세션 생성
  let crawlSessionId = null;
  if (useApi) {
    try {
      const session = await createCrawlSession({
        sessionType: 'hospital_crawl',
        targetSido: sido,
        filterConditions: {
          departments: ['피부과', '성형외과'],
          keywords: PROCEDURE_KEYWORDS
        }
      });
      crawlSessionId = session.sessionId;
      console.log(`[API] Session ID: ${crawlSessionId}`);
    } catch (error) {
      console.warn(`[API] Failed to create session: ${error.message}`);
      console.log(`[API] Falling back to CSV-only mode`);
      useApi = false;
    }
  }
  
  // Resume 모드: Checkpoint 확인
  let hospitals = [];
  let pageNo = 1;
  let totalCount = 0;
  
  if (resume) {
    const checkpoint = loadCheckpoint(sido);
    if (checkpoint) {
      hospitals = checkpoint.hospitals || [];
      pageNo = checkpoint.pageNo + 1;  // 다음 페이지부터
      totalCount = checkpoint.totalCount || 0;
      console.log(`  Resuming: starting from page ${pageNo}`);
    }
  }
  
  let hasMore = true;

  while (hasMore) {
    console.log(`  Fetching page ${pageNo}...`);
    
    const body = await fetchHospitals(sidoCd, pageNo);
    
    if (pageNo === 1 || totalCount === 0) {
      totalCount = parseInt(body?.totalCount || '0', 10);
      console.log(`  Total hospitals found: ${totalCount}`);
    }

    const items = body?.items?.item;
    if (!items) {
      hasMore = false;
      break;
    }

    // Handle single item case (xml2js returns object instead of array)
    const itemList = Array.isArray(items) ? items : [items];
    
    let filteredCount = 0;
    for (const item of itemList) {
      const hospital = {
        name: item.yadmNm || '',
        address: item.addr || '',
        phone: item.telno || '',
        homepage: item.hospUrl || '',
        sido: sido,
        department: '피부과',
        ykiho: item.ykiho || ''
      };
      
       // 피부시술 관련 병원만 필터링
       if (isSkinClinic(hospital)) {
         hospitals.push(hospital);
         filteredCount++;
         
         // API 모드: 실시간 전송 (페이지 단위)
         if (useApi && crawlSessionId) {
           try {
             await uploadHospitals(crawlSessionId, [{
               name: hospital.name,
               address: hospital.address,
               phone: hospital.phone,
               homepage_url: hospital.homepage,
               sido: hospital.sido,
               region: hospital.sido,  // sido를 region으로 사용
               department: hospital.department,
               category: '피부과',
               filtering_status: 'matched',
               source: 'public_api',
               crawl_order: hospitals.length
             }]);
           } catch (error) {
             console.warn(`[API] Upload failed: ${error.message}`);
           }
         }
       }
    }

    console.log(`  Page ${pageNo}: ${filteredCount}/${itemList.length} passed filter (total: ${hospitals.length})`);
    
    // Checkpoint 저장 (CHECKPOINT_INTERVAL 페이지마다)
    if (pageNo % CHECKPOINT_INTERVAL === 0) {
      saveCheckpoint({
        sido,
        sidoCd,
        pageNo,
        totalCount,
        hospitals
      });
    }
    
    // Check if there are more pages
    const numOfRows = 100;
    if (hospitals.length >= totalCount || itemList.length < numOfRows) {
      hasMore = false;
    } else {
      pageNo++;
      await sleep(500); // Rate limit protection
    }
  }

   // 완료 후 Checkpoint 삭제
   clearCheckpoint(sido);
   
   // 저장 완료 후 API 모드면 세션 완료
   if (useApi && crawlSessionId) {
     try {
       await completeCrawlSession(crawlSessionId, {
         status: 'completed',
         message: `Completed ${hospitals.length} hospitals`,
         outputFile: options.json ? `hospitals_${sido}_*.json` : `hospitals_${sido}_*.csv`
       });
     } catch (error) {
       console.warn(`[API] Failed to complete session: ${error.message}`);
     }
   }
   
   console.log(`[${sido}] Collection complete: ${hospitals.length} hospitals`);
   return hospitals;
}

// ============================================
// Output Functions
// ============================================

// Output: Save to CSV
function saveToCSV(hospitals, filename) {
  const outputDir = path.join(__dirname, '..', 'output');
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filepath = path.join(outputDir, filename);
  
  // CSV Header
  const header = '병원명,주소,전화번호,홈페이지URL,시도,진료과목,YKIHO';
  
  // CSV Rows
  const rows = hospitals.map(h => {
    // Escape fields that might contain commas or quotes
    const escape = (str) => {
      if (!str) return '';
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    
    return [
      escape(h.name),
      escape(h.address),
      escape(h.phone),
      escape(h.homepage),
      escape(h.sido),
      escape(h.department),
      escape(h.ykiho)
    ].join(',');
  });

  // UTF-8 BOM for Excel compatibility
  const BOM = '\uFEFF';
  const content = BOM + header + '\n' + rows.join('\n');
  
  fs.writeFileSync(filepath, content, 'utf8');
  console.log(`\nSaved to: ${filepath}`);
  console.log(`Total records: ${hospitals.length}`);
  
  // Stats
  const withHomepage = hospitals.filter(h => h.homepage).length;
  console.log(`With homepage URL: ${withHomepage} (${((withHomepage/hospitals.length)*100).toFixed(1)}%)`);
  
  return filepath;
}

// Output: Save to JSON (for further processing)
function saveToJSON(hospitals, filename) {
  const outputDir = path.join(__dirname, '..', 'output');
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filepath = path.join(outputDir, filename);
  
  const data = {
    generatedAt: new Date().toISOString(),
    totalCount: hospitals.length,
    withHomepage: hospitals.filter(h => h.homepage).length,
    hospitals
  };
  
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\nSaved JSON to: ${filepath}`);
  
  return filepath;
}

// ============================================
// Main CLI
// ============================================

async function main() {
  program
    .name('medcheck-crawler')
    .description('Crawl hospital information from public data API')
    .version('1.1.0')
    .option('--sido <name>', 'Single sido to crawl (e.g., 서울)')
    .option('--region <name>', 'Region to crawl (e.g., 수도권, 전국)')
    .option('--all', 'Crawl all available regions')
    .option('--resume', 'Resume from last checkpoint')
    .option('--list-checkpoints', 'List all available checkpoints')
    .option('--clear-checkpoints', 'Clear all checkpoints')
    .option('--json', 'Also save as JSON format')
    .option('--api', 'Upload results to API (requires MEDCHECK_ENGINE_URL)')
    .parse(process.argv);

  const options = program.opts();
  
  // Checkpoint 목록 표시
  if (options.listCheckpoints) {
    console.log('\nAvailable Checkpoints:');
    const checkpoints = listCheckpoints();
    if (checkpoints.length === 0) {
      console.log('  No checkpoints found.');
    } else {
      checkpoints.forEach(cp => {
        if (cp.error) {
          console.log(`  ${cp.file}: Error - ${cp.error}`);
        } else {
          console.log(`  ${cp.sido}: Page ${cp.pageNo}, ${cp.hospitals} hospitals (${cp.timestamp})`);
        }
      });
    }
    return;
  }
  
  // Checkpoint 전체 삭제
  if (options.clearCheckpoints) {
    ensureCheckpointDir();
    const files = fs.readdirSync(CHECKPOINT_DIR).filter(f => f.endsWith('.json'));
    files.forEach(f => fs.unlinkSync(path.join(CHECKPOINT_DIR, f)));
    console.log(`Cleared ${files.length} checkpoint(s).`);
    return;
  }
  
  // Determine which sidos to crawl
  let sidoList = [];
  
  if (options.sido) {
    if (!SIDO_CODES[options.sido]) {
      console.error(`Unknown sido: ${options.sido}`);
      console.error(`Available: ${Object.keys(SIDO_CODES).join(', ')}`);
      process.exit(1);
    }
    sidoList = [options.sido];
  } else if (options.region) {
    if (!REGIONS[options.region]) {
      console.error(`Unknown region: ${options.region}`);
      console.error(`Available: ${Object.keys(REGIONS).join(', ')}`);
      process.exit(1);
    }
    sidoList = REGIONS[options.region];
  } else if (options.all) {
    sidoList = Object.keys(SIDO_CODES);
  } else {
    console.log('Usage:');
    console.log('  node src/crawler.js --sido 서울           # Single sido');
    console.log('  node src/crawler.js --region 수도권       # Region (서울+경기+인천)');
    console.log('  node src/crawler.js --all                 # All regions');
    console.log('  node src/crawler.js --sido 서울 --resume  # Resume from checkpoint');
    console.log('  node src/crawler.js --list-checkpoints    # List checkpoints');
    console.log('  node src/crawler.js --clear-checkpoints   # Clear all checkpoints');
    console.log('');
    console.log('Options:');
    console.log('  --resume    Resume from last checkpoint if available');
    console.log('  --json      Also save results as JSON format');
    process.exit(0);
  }

  console.log('='.repeat(60));
  console.log('MEDCHECK Hospital Crawler v1.1.0');
  console.log('='.repeat(60));
  console.log(`Target: ${sidoList.join(', ')}`);
  console.log(`Filter: 의원(31) + 피부과(14)`);
  console.log(`Resume mode: ${options.resume ? 'ON' : 'OFF'}`);
  console.log('='.repeat(60));

  // Collect hospitals
   const allHospitals = [];
   
   for (const sido of sidoList) {
     try {
       const hospitals = await collectHospitalsForSido(sido, { 
         resume: options.resume,
         useApi: options.api
       });
       allHospitals.push(...hospitals);
     } catch (error) {
       console.error(`Error collecting ${sido}: ${error.message}`);
      
      // 에러 발생 시 현재까지 수집한 데이터 체크포인트로 저장
      if (allHospitals.length > 0) {
        console.log('  Saving emergency checkpoint...');
        saveCheckpoint({
          sido,
          sidoCd: SIDO_CODES[sido],
          pageNo: 0,
          totalCount: 0,
          hospitals: allHospitals
        });
      }
    }
  }

  // Generate filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sidoTag = sidoList.length === 1 ? sidoList[0] : (options.region || 'all');
  const csvFilename = `hospitals_${sidoTag}_${timestamp}.csv`;
  const jsonFilename = `hospitals_${sidoTag}_${timestamp}.json`;

  // Save results
  if (allHospitals.length > 0) {
    saveToCSV(allHospitals, csvFilename);
    
    if (options.json) {
      saveToJSON(allHospitals, jsonFilename);
    }
  } else {
    console.log('\nNo hospitals found.');
  }

  console.log('\n' + '='.repeat(60));
  console.log('Crawling complete!');
  console.log('='.repeat(60));
}

// Run
main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
