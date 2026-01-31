/**
 * 네이버 플레이스 URL 수집기
 * 홈페이지 URL이 없는 병원의 네이버 플레이스 URL 수집
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');

// 설정
// 딜레이: 3~7초 랜덤 (평균 5초)
const getRandomDelay = () => Math.floor(3000 + Math.random() * 4000);
const CHECKPOINT_INTERVAL = 50;  // 50개마다 저장
const CHECKPOINT_DIR = path.join(__dirname, '..', '..', 'data', 'checkpoints');
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'output');

// API 설정
const API_BASE = process.env.MEDCHECK_API || 'https://medcheck-engine.mmakid.workers.dev';
const REPORT_INTERVAL = 10;  // 10개마다 API 보고

// 네이버 검색 URL
const NAVER_SEARCH_URL = 'https://search.naver.com/search.naver';

/**
 * Sleep 함수
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 크롤링 상태 API로 전송
 */
async function reportCrawlStatus(jobId, data) {
  try {
    await axios.post(`${API_BASE}/v1/crawl-status`, {
      jobId,
      jobType: 'naver_place',
      ...data
    }, { timeout: 5000 });
  } catch (e) {
    // API 실패해도 크롤링은 계속
    console.error(`  [API Report Failed] ${e.message}`);
  }
}

/**
 * 시군구 추출 (주소에서)
 */
function extractDistrict(address) {
  if (!address) return '';
  // "서울특별시 강남구 ..." -> "강남구"
  const match = address.match(/([가-힣]+[시군구])\s/);
  return match ? match[1] : '';
}

/**
 * 네이버 플레이스 검색 (지역검색)
 */
async function searchNaverPlace(hospitalName, address, retryCount = 0) {
  const district = extractDistrict(address);
  const query = `${hospitalName} ${district}`.trim();
  
  try {
    // 방법 1: 네이버 지역검색 (sm=tab_jum)
    const response = await axios.get(NAVER_SEARCH_URL, {
      params: {
        where: 'nexearch',
        sm: 'tab_jum',
        query: query
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://www.naver.com/'
      },
      timeout: 10000
    });

    const html = response.data;
    
    // 패턴 1: place.naver.com/hospital/숫자 또는 place.naver.com/place/숫자
    const placeMatch = html.match(/place\.naver\.com\/(hospital|place|restaurant|cafe)\/(\d+)/);
    if (placeMatch) {
      return {
        success: true,
        url: `https://place.naver.com/${placeMatch[1]}/${placeMatch[2]}`,
        type: placeMatch[1],
        placeId: placeMatch[2]
      };
    }
    
    // 패턴 2: data-sid="숫자" (플레이스 ID)
    const sidMatch = html.match(/data-sid="(\d+)"/);
    if (sidMatch) {
      return {
        success: true,
        url: `https://place.naver.com/place/${sidMatch[1]}`,
        type: 'place',
        placeId: sidMatch[1]
      };
    }
    
    // 패턴 3: "id":"숫자" in JSON
    const jsonIdMatch = html.match(/"id"\s*:\s*"?(\d{8,})"?/);
    if (jsonIdMatch) {
      return {
        success: true,
        url: `https://place.naver.com/place/${jsonIdMatch[1]}`,
        type: 'place',
        placeId: jsonIdMatch[1]
      };
    }
    
    // 패턴 4: naver.me 단축 URL에서 ID 추출
    const naverMeMatch = html.match(/naver\.me\/(\w+)/);
    if (naverMeMatch) {
      return {
        success: true,
        url: `https://naver.me/${naverMeMatch[1]}`,
        type: 'shorturl',
        placeId: naverMeMatch[1]
      };
    }

    return { success: false, reason: 'no_place_found' };
    
  } catch (error) {
    if (retryCount < 2) {
      await sleep(2000);
      return searchNaverPlace(hospitalName, address, retryCount + 1);
    }
    return { success: false, reason: error.message };
  }
}

/**
 * CSV 파일 읽기
 */
function readCSV(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  
  // BOM 제거
  const header = lines[0].replace(/^\uFEFF/, '').split(',');
  
  const hospitals = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length >= 6) {
      hospitals.push({
        name: values[0],
        address: values[1],
        phone: values[2],
        homepage: values[3],
        sido: values[4],
        department: values[5],
        ykiho: values[6] || ''
      });
    }
  }
  
  return hospitals;
}

/**
 * CSV 라인 파싱 (따옴표 처리)
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  
  return result;
}

/**
 * CSV 저장
 */
function saveEnrichedCSV(hospitals, filename) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const filepath = path.join(OUTPUT_DIR, filename);
  
  const escape = (str) => {
    if (!str) return '';
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  
  const header = '병원명,주소,전화번호,홈페이지URL,시도,진료과목,YKIHO,네이버플레이스URL,플레이스ID';
  
  const rows = hospitals.map(h => [
    escape(h.name),
    escape(h.address),
    escape(h.phone),
    escape(h.homepage),
    escape(h.sido),
    escape(h.department),
    escape(h.ykiho),
    escape(h.naverPlaceUrl || ''),
    escape(h.placeId || '')
  ].join(','));
  
  const BOM = '\uFEFF';
  fs.writeFileSync(filepath, BOM + header + '\n' + rows.join('\n'), 'utf8');
  
  return filepath;
}

/**
 * Checkpoint 저장
 */
function saveCheckpoint(state) {
  if (!fs.existsSync(CHECKPOINT_DIR)) {
    fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  }
  
  const filepath = path.join(CHECKPOINT_DIR, 'naver_enricher_checkpoint.json');
  fs.writeFileSync(filepath, JSON.stringify(state, null, 2));
  console.log(`  [Checkpoint] Saved at index ${state.currentIndex}`);
}

/**
 * Checkpoint 로드
 */
function loadCheckpoint() {
  const filepath = path.join(CHECKPOINT_DIR, 'naver_enricher_checkpoint.json');
  
  if (fs.existsSync(filepath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      // 24시간 이내만 유효
      const age = (Date.now() - new Date(data.timestamp).getTime()) / (1000 * 60 * 60);
      if (age < 24) {
        return data;
      }
    } catch (e) {}
  }
  return null;
}

/**
 * Checkpoint 삭제
 */
function clearCheckpoint() {
  const filepath = path.join(CHECKPOINT_DIR, 'naver_enricher_checkpoint.json');
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
  }
}

/**
 * 1시간 후 자동 resume 재시작 기능
 */
async function scheduleResume(options) {
  const RESUME_DELAY_HOURS = 1; // 1시간 후 재시작
  const resumeTime = new Date(Date.now() + RESUME_DELAY_HOURS * 60 * 60 * 1000);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`⏰ 1시간 후 자동 재시작 예약됨`);
  console.log(`예약 시각: ${resumeTime.toLocaleString('ko-KR')}`);
  console.log('='.repeat(60));
  
  // 현재 옵션 저장 (환경변수로)
  const optionsFile = path.join(__dirname, '..', '..', 'data', 'resume_options.json');
  const dataDir = path.dirname(optionsFile);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(optionsFile, JSON.stringify(options, null, 2), 'utf8');
  
  // Node.js 프로세스를 1시간 후 재시작
  setTimeout(() => {
    console.log('\n⏰ 자동 재시작 중...');
    const { spawn } = require('child_process');
    
    // resume 옵션 추가해서 재시작
    const args = process.argv.slice(2).filter(arg => arg !== '--no-resume');
    const resumeArgs = [...args, '--resume', '--no-resume'];
    
    // 현재 노드 프로세스 재시작
    const child = spawn('node', [process.argv[1], ...resumeArgs], {
      detached: true,
      stdio: 'ignore'
    });
    
    // 현재 프로세스 종료
    process.exit(0);
  }, RESUME_DELAY_HOURS * 60 * 60 * 1000);
}

/**
 * 메인 실행
 */
async function main() {
   program
     .name('naver-place-enricher')
     .description('Enrich hospital data with Naver Place URLs')
     .requiredOption('--input <file>', 'Input CSV file')
     .option('--output <file>', 'Output CSV file')
     .option('--resume', 'Resume from checkpoint')
     .option('--limit <n>', 'Limit number of hospitals to process', parseInt)
     .option('--skip-existing', 'Skip hospitals that already have homepage URL')
     .option('--no-resume', 'Disable auto-resume after completion')
     .option('--auto-google', 'Automatically run Google search for unfound hospitals')
     .parse(process.argv);

  const options = program.opts();

  // 입력 파일 확인 (output/ 중복 방지)
  let inputPath = options.input;
  if (!path.isAbsolute(inputPath)) {
    // output/ 또는 output\으로 시작하면 __dirname 기준으로만 연결
    if (inputPath.startsWith('output/') || inputPath.startsWith('output\\')) {
      inputPath = path.join(__dirname, '..', '..', inputPath);
    } else {
      inputPath = path.join(OUTPUT_DIR, inputPath);
    }
  }
    
  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('네이버 플레이스 URL 수집기');
  console.log('='.repeat(60));
  
  // CSV 읽기
  console.log(`\nReading: ${inputPath}`);
  let hospitals = readCSV(inputPath);
  console.log(`Total hospitals: ${hospitals.length}`);
  
  // 홈페이지 없는 병원만 필터링 (옵션)
  let targetHospitals = options.skipExisting 
    ? hospitals.filter(h => !h.homepage)
    : hospitals;
  
  console.log(`Target hospitals (no homepage): ${targetHospitals.length}`);
  
  // Limit 적용
  if (options.limit) {
    targetHospitals = targetHospitals.slice(0, options.limit);
    console.log(`Limited to: ${targetHospitals.length}`);
  }
  
  // Resume 처리
  let startIndex = 0;
  if (options.resume) {
    const checkpoint = loadCheckpoint();
    if (checkpoint) {
      startIndex = checkpoint.currentIndex;
      // 이전 결과 복원
      checkpoint.results.forEach(r => {
        const h = hospitals.find(h => h.ykiho === r.ykiho || h.name === r.name);
        if (h) {
          h.naverPlaceUrl = r.naverPlaceUrl;
          h.placeId = r.placeId;
        }
      });
      console.log(`Resuming from index ${startIndex}`);
    }
  }
  
  // 결과 저장용
  const results = [];
  let found = 0;
  let notFound = 0;
  let errors = 0;
  
  // Job ID 생성
  const jobId = `NAVER-${Date.now()}`;
  const startedAt = new Date().toISOString();
  
  console.log(`\nJob ID: ${jobId}`);
  console.log(`Starting from index ${startIndex}...`);
  console.log('-'.repeat(60));
  
  // 시작 상태 보고
  await reportCrawlStatus(jobId, {
    status: 'running',
    progress: startIndex,
    total: targetHospitals.length,
    found: 0,
    failed: 0,
    startedAt,
    message: '크롤링 시작'
  });
  
  for (let i = startIndex; i < targetHospitals.length; i++) {
    const hospital = targetHospitals[i];
    
    process.stdout.write(`[${i + 1}/${targetHospitals.length}] ${hospital.name.substring(0, 20).padEnd(20)} `);
    
    const result = await searchNaverPlace(hospital.name, hospital.address);
    
    if (result.success) {
      hospital.naverPlaceUrl = result.url;
      hospital.placeId = result.placeId;
      found++;
      console.log(`✓ ${result.url}`);
    } else {
      notFound++;
      console.log(`✗ ${result.reason}`);
    }
    
    results.push({
      name: hospital.name,
      ykiho: hospital.ykiho,
      naverPlaceUrl: hospital.naverPlaceUrl || '',
      placeId: hospital.placeId || ''
    });
    
    // Checkpoint 저장
    if ((i + 1) % CHECKPOINT_INTERVAL === 0) {
      saveCheckpoint({
        inputFile: options.input,
        currentIndex: i + 1,
        results,
        timestamp: new Date().toISOString()
      });
    }
    
    // API 상태 보고 (10개마다)
    if ((i + 1) % REPORT_INTERVAL === 0) {
      await reportCrawlStatus(jobId, {
        status: 'running',
        progress: i + 1,
        total: targetHospitals.length,
        found,
        failed: notFound,
        currentItem: hospital.name,
        startedAt,
        message: `${i + 1}/${targetHospitals.length} 처리 중 (${(found/(i+1)*100).toFixed(1)}% 발견)`
      });
    }
    
    // Rate limit (5~10초 랜덤)
    await sleep(getRandomDelay());
  }
  
  // 결과 저장
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputFilename = options.output || `hospitals_enriched_${timestamp}.csv`;
  const outputPath = saveEnrichedCSV(hospitals, outputFilename);
  
  // Checkpoint 삭제
  clearCheckpoint();
  
  // 완료 상태 보고
  await reportCrawlStatus(jobId, {
    status: 'completed',
    progress: targetHospitals.length,
    total: targetHospitals.length,
    found,
    failed: notFound,
    startedAt,
    message: `완료! ${found}개 발견 (${(found/targetHospitals.length*100).toFixed(1)}%)`
  });
  
   // 통계 출력
   console.log('\n' + '='.repeat(60));
   console.log('네이버 플레이스 검색 완료!');
   console.log('='.repeat(60));
   console.log(`처리: ${targetHospitals.length}개`);
   console.log(`발견: ${found}개 (${(found/targetHospitals.length*100).toFixed(1)}%)`);
   console.log(`미발견: ${notFound}개`);
   console.log(`저장: ${outputPath}`);

   // --auto-google 옵션: 못 찾은 병원 구글 검색으로 자동 전환
   if (options.autoGoogle && notFound > 0) {
     console.log('\n' + '#'.repeat(60));
     console.log('# 2단계: 구글 검색 자동 시작');
     console.log(`# 대상: ${notFound}개 병원 (네이버에서 미발견)`);
     console.log('#'.repeat(60));

     const { spawn } = require('child_process');
     const googleScript = path.join(__dirname, 'google-search.js');

     const googleArgs = [
       googleScript,
       '--input', outputPath,
       '--skip-existing',
       '--auto-analyze'  // 🆕 구글 검색 후 자동으로 분석 실행
     ];

     if (options.limit) googleArgs.push('--limit', options.limit.toString());

     console.log(`\n실행: node ${googleArgs.slice(1).join(' ')}\n`);

     const child = spawn('node', googleArgs, {
       stdio: 'inherit',
       cwd: __dirname
     });

     child.on('close', (code) => {
       if (code === 0) {
         console.log('\n구글 검색 완료!');
       } else {
         console.error(`\n구글 검색 실패 (code: ${code})`);
       }
       process.exit(code);
     });

     return; // 구글 검색이 끝날 때까지 대기
   }

   // 1시간 후 resume 재시작 예약 (--no-resume 옵션이 없을 때)
   if (!options.noResume && !options.autoGoogle) {
     await scheduleResume(options);
   }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
