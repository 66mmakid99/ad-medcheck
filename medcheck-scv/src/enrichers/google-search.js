/**
 * 구글 검색으로 병원 홈페이지 URL 수집기
 * 네이버 플레이스에서 못 찾은 병원의 자체 홈페이지 URL 수집
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');

// 설정
const DELAY_MS = 2000;  // 2초 딜레이 (구글은 더 엄격)
const CHECKPOINT_INTERVAL = 30;
const CHECKPOINT_DIR = path.join(__dirname, '..', '..', 'data', 'checkpoints');
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'output');

// 제외할 도메인 (포털/플랫폼)
const EXCLUDE_DOMAINS = [
  'naver.com', 'daum.net', 'google.com', 'youtube.com',
  'facebook.com', 'instagram.com', 'twitter.com',
  'blog.naver.com', 'cafe.naver.com', 'post.naver.com',
  'place.naver.com', 'map.naver.com', 'search.naver.com',
  'modoo.at', 'smartplace.naver.com',
  'gangnam.com', 'hidoc.co.kr', 'gooddoc.co.kr',
  'babyplanet.co.kr', 'seoulguide.com'
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 시군구 추출
 */
function extractDistrict(address) {
  if (!address) return '';
  const match = address.match(/([가-힣]+[시군구])\s/);
  return match ? match[1] : '';
}

/**
 * 도메인이 병원 자체 홈페이지인지 확인
 */
function isValidHospitalDomain(url) {
  if (!url) return false;
  
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    
    // 제외 도메인 체크
    for (const excluded of EXCLUDE_DOMAINS) {
      if (hostname.includes(excluded)) return false;
    }
    
    // 너무 짧은 도메인 제외 (예: a.co)
    if (hostname.length < 6) return false;
    
    return true;
  } catch {
    return false;
  }
}

// SerpAPI 키
const SERPAPI_KEY = process.env.SERPAPI_KEY || 'f62dccabe3e331c60eb068fad7979b1a3c2031aaf0a83b9540f86f29ba25207f';

/**
 * SerpAPI로 구글 검색하여 홈페이지 찾기
 */
async function searchGoogleHomepage(hospitalName, address, retryCount = 0) {
  const district = extractDistrict(address);
  const query = `${hospitalName} ${district} 홈페이지`;
  
  try {
    const response = await axios.get('https://serpapi.com/search', {
      params: {
        q: query,
        location: 'South Korea',
        hl: 'ko',
        gl: 'kr',
        api_key: SERPAPI_KEY
      },
      timeout: 15000
    });

    const data = response.data;
    const foundUrls = new Set();
    
    // 1. organic_results에서 URL 추출
    if (data.organic_results) {
      for (const result of data.organic_results) {
        if (result.link && isValidHospitalDomain(result.link)) {
          foundUrls.add(result.link);
        }
      }
    }
    
    // 2. knowledge_graph에서 website 추출
    if (data.knowledge_graph?.website) {
      const kgUrl = data.knowledge_graph.website;
      if (isValidHospitalDomain(kgUrl)) {
        foundUrls.add(kgUrl);
      }
    }
    
    // 3. local_results에서 website 추출
    if (data.local_results?.places) {
      for (const place of data.local_results.places) {
        if (place.website && isValidHospitalDomain(place.website)) {
          foundUrls.add(place.website);
        }
      }
    }
    
    const urls = Array.from(foundUrls);
    if (urls.length > 0) {
      // 병원명 일부가 URL에 포함된 것 우선
      const hospitalNameLower = hospitalName.toLowerCase().replace(/[^가-힣a-z]/g, '');
      const prioritized = urls.find(url => {
        const hostname = new URL(url).hostname.toLowerCase();
        return hostname.includes(hospitalNameLower.substring(0, 3));
      });
      
      const bestUrl = prioritized || urls[0];
      
      return {
        success: true,
        url: bestUrl,
        domain: new URL(bestUrl).hostname,
        allUrls: urls.slice(0, 3)
      };
    }

    return { success: false, reason: 'no_homepage_found' };
    
  } catch (error) {
    if (retryCount < 2) {
      await sleep(3000);
      return searchGoogleHomepage(hospitalName, address, retryCount + 1);
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
  
  const header = lines[0].replace(/^\uFEFF/, '');
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
        ykiho: values[6] || '',
        naverPlaceUrl: values[7] || '',
        placeId: values[8] || ''
      });
    }
  }
  
  return hospitals;
}

/**
 * CSV 라인 파싱
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
  
  const header = '병원명,주소,전화번호,홈페이지URL,시도,진료과목,YKIHO,네이버플레이스URL,플레이스ID,구글검색URL';
  
  const rows = hospitals.map(h => [
    escape(h.name),
    escape(h.address),
    escape(h.phone),
    escape(h.homepage),
    escape(h.sido),
    escape(h.department),
    escape(h.ykiho),
    escape(h.naverPlaceUrl || ''),
    escape(h.placeId || ''),
    escape(h.googleUrl || '')
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
  const filepath = path.join(CHECKPOINT_DIR, 'google_enricher_checkpoint.json');
  fs.writeFileSync(filepath, JSON.stringify(state, null, 2));
  console.log(`  [Checkpoint] Saved at index ${state.currentIndex}`);
}

/**
 * Checkpoint 로드
 */
function loadCheckpoint() {
  const filepath = path.join(CHECKPOINT_DIR, 'google_enricher_checkpoint.json');
  if (fs.existsSync(filepath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      const age = (Date.now() - new Date(data.timestamp).getTime()) / (1000 * 60 * 60);
      if (age < 24) return data;
    } catch (e) {}
  }
  return null;
}

/**
 * Checkpoint 삭제
 */
function clearCheckpoint() {
  const filepath = path.join(CHECKPOINT_DIR, 'google_enricher_checkpoint.json');
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
}

/**
 * 메인 실행
 */
async function main() {
  program
    .name('google-search-enricher')
    .description('Find hospital homepage URLs via Google search')
    .requiredOption('--input <file>', 'Input CSV file')
    .option('--output <file>', 'Output CSV file')
    .option('--resume', 'Resume from checkpoint')
    .option('--limit <n>', 'Limit number of hospitals', parseInt)
    .option('--skip-existing', 'Skip hospitals with existing homepage/naver URL')
    .parse(process.argv);

  const options = program.opts();
  
  const inputPath = path.isAbsolute(options.input) 
    ? options.input 
    : path.join(OUTPUT_DIR, options.input);
    
  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('구글 검색 홈페이지 수집기');
  console.log('='.repeat(60));
  
  console.log(`\nReading: ${inputPath}`);
  let hospitals = readCSV(inputPath);
  console.log(`Total hospitals: ${hospitals.length}`);
  
  // 홈페이지/네이버플레이스 없는 병원만
  let targetHospitals = options.skipExisting 
    ? hospitals.filter(h => !h.homepage && !h.naverPlaceUrl)
    : hospitals.filter(h => !h.homepage);
  
  console.log(`Target hospitals: ${targetHospitals.length}`);
  
  if (options.limit) {
    targetHospitals = targetHospitals.slice(0, options.limit);
    console.log(`Limited to: ${targetHospitals.length}`);
  }
  
  let startIndex = 0;
  if (options.resume) {
    const checkpoint = loadCheckpoint();
    if (checkpoint) {
      startIndex = checkpoint.currentIndex;
      checkpoint.results.forEach(r => {
        const h = hospitals.find(h => h.ykiho === r.ykiho || h.name === r.name);
        if (h) h.googleUrl = r.googleUrl;
      });
      console.log(`Resuming from index ${startIndex}`);
    }
  }
  
  const results = [];
  let found = 0;
  let notFound = 0;
  
  console.log(`\nStarting from index ${startIndex}...`);
  console.log('-'.repeat(60));
  
  for (let i = startIndex; i < targetHospitals.length; i++) {
    const hospital = targetHospitals[i];
    
    process.stdout.write(`[${i + 1}/${targetHospitals.length}] ${hospital.name.substring(0, 20).padEnd(20)} `);
    
    const result = await searchGoogleHomepage(hospital.name, hospital.address);
    
    if (result.success) {
      hospital.googleUrl = result.url;
      found++;
      console.log(`✓ ${result.domain}`);
    } else {
      notFound++;
      console.log(`✗ ${result.reason}`);
    }
    
    results.push({
      name: hospital.name,
      ykiho: hospital.ykiho,
      googleUrl: hospital.googleUrl || ''
    });
    
    if ((i + 1) % CHECKPOINT_INTERVAL === 0) {
      saveCheckpoint({
        inputFile: options.input,
        currentIndex: i + 1,
        results,
        timestamp: new Date().toISOString()
      });
    }
    
    await sleep(DELAY_MS);
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputFilename = options.output || `hospitals_google_${timestamp}.csv`;
  const outputPath = saveEnrichedCSV(hospitals, outputFilename);
  
  clearCheckpoint();
  
  console.log('\n' + '='.repeat(60));
  console.log('완료!');
  console.log('='.repeat(60));
  console.log(`처리: ${targetHospitals.length}개`);
  console.log(`발견: ${found}개 (${(found/targetHospitals.length*100).toFixed(1)}%)`);
  console.log(`미발견: ${notFound}개`);
  console.log(`저장: ${outputPath}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
