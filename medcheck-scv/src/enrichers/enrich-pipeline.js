/**
 * 병원 URL 수집 + 분석 파이프라인 v2.0
 * 1단계: 네이버 플레이스 검색
 * 2단계: 구글 검색 (네이버에서 못 찾은 병원)
 * 3단계: MedCheck Engine 분석 (위반 탐지)
 *
 * 🆕 대시보드 실시간 연동:
 * - 크롤링 상태 실시간 업데이트
 * - 분석 결과 API 자동 전송
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { program } = require('commander');

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'output');
const API_BASE = process.env.MEDCHECK_API || 'https://medcheck-engine.mmakid.workers.dev';

// 분석 설정
const ANALYZE_DELAY_MS = 2000;  // 분석 간 딜레이 (2초)
const ANALYZE_BATCH_SIZE = 10;  // 배치 크기

// 파이프라인 상태
let currentJobId = null;
let currentSessionId = null;

// 실시간 진행 추적
let totalViolations = 0;
let recentLogEntries = [];       // 최대 5건
let hospitalsDetailList = [];    // 분석한 병원 목록
let violationsDetailList = [];   // 위반 상세 목록

/**
 * Sleep 함수
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 🆕 크롤링 상태 업데이트 (대시보드 실시간)
 */
async function updateCrawlStatus(status) {
  if (!currentJobId) {
    currentJobId = `PIPELINE-${Date.now()}`;
  }

  try {
    await axios.post(`${API_BASE}/v1/crawl-status`, {
      jobId: currentJobId,
      jobType: status.jobType || 'full_pipeline',
      status: status.status || 'running',
      progress: status.progress || 0,
      total: status.total || 0,
      found: status.found || 0,
      failed: status.failed || 0,
      currentItem: status.currentItem || null,
      startedAt: status.startedAt || new Date().toISOString(),
      message: status.message || null,
      violationsFound: status.violationsFound || totalViolations,
      recentLogs: status.recentLogs || recentLogEntries
    }, { timeout: 5000 });
  } catch (e) {
    // API 오류는 무시 (로컬 실행 계속)
  }
}

/**
 * 🆕 크롤링 세션 생성
 */
async function createCrawlSession(sessionType, targetSido) {
  try {
    const res = await axios.post(`${API_BASE}/v1/crawl-sessions`, {
      sessionType,
      targetSido,
      targetRegion: ''
    }, { timeout: 5000 });

    if (res.data.success) {
      currentSessionId = res.data.data.sessionId;
      return currentSessionId;
    }
  } catch (e) {
    // 세션 생성 실패해도 계속
  }
  return null;
}

/**
 * 🆕 분석 결과 API 전송
 */
async function sendAnalysisResult(result) {
  try {
    await axios.post(`${API_BASE}/v1/analysis-results`, {
      crawlSessionId: currentSessionId,
      hospitalId: result.hospitalId || null,
      hospitalName: result.name,
      urlAnalyzed: result.analyzedUrl,
      grade: result.grade || '-',
      violationCount: result.violationCount || 0,
      summary: result.summary || '',
      violations: result.violations || [],
      status: result.status || 'success'
    }, { timeout: 10000 });
  } catch (e) {
    // API 전송 실패해도 계속
  }
}

/**
 * 자식 프로세스 실행 (Promise)
 */
function runScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`실행: node ${path.basename(scriptPath)} ${args.join(' ')}`);
    console.log('='.repeat(60));

    const child = spawn('node', [scriptPath, ...args], {
      stdio: 'inherit',
      cwd: path.dirname(scriptPath)
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * 가장 최근 enriched/google 파일 찾기
 */
function findLatestFile(prefix) {
  if (!fs.existsSync(OUTPUT_DIR)) return null;

  const files = fs.readdirSync(OUTPUT_DIR)
    .filter(f => f.startsWith(prefix) && f.endsWith('.csv'))
    .sort()
    .reverse();

  return files.length > 0 ? path.join(OUTPUT_DIR, files[0]) : null;
}

/**
 * CSV 파일 읽기
 */
function readCSV(filepath) {
  if (!fs.existsSync(filepath)) return [];

  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  const hospitals = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length >= 6) {
      hospitals.push({
        name: values[0],
        address: values[1],
        phone: values[2],
        homepage: values[3]?.trim() || '',
        sido: values[4],
        department: values[5],
        ykiho: values[6] || '',
        naverPlaceUrl: values[7]?.trim() || '',
        placeId: values[8] || '',
        googleUrl: values[9]?.trim() || ''
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
 * CSV에서 URL 통계
 */
function getUrlStats(hospitals) {
  let total = hospitals.length;
  let hasHomepage = 0;
  let hasNaver = 0;
  let hasGoogle = 0;
  let hasAnyUrl = 0;

  for (const h of hospitals) {
    if (h.homepage) hasHomepage++;
    if (h.naverPlaceUrl) hasNaver++;
    if (h.googleUrl) hasGoogle++;
    if (h.homepage || h.naverPlaceUrl || h.googleUrl) hasAnyUrl++;
  }

  return { total, hasHomepage, hasNaver, hasGoogle, hasAnyUrl, noUrl: total - hasAnyUrl };
}

/**
 * MedCheck Engine으로 URL 분석
 */
async function analyzeUrl(url, enableAI = false) {
  try {
    const response = await axios.post(`${API_BASE}/v1/analyze-url`, {
      url,
      enableAI
    }, { timeout: 30000 });

    return response.data;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 분석 결과 CSV 저장
 */
function saveAnalysisCSV(results, filename) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const filepath = path.join(OUTPUT_DIR, filename);

  const escape = (str) => {
    if (!str) return '';
    str = String(str);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = '병원명,주소,전화번호,분석URL,시도,진료과목,등급,위반수,위반요약,분석상태';

  const rows = results.map(r => [
    escape(r.name),
    escape(r.address),
    escape(r.phone),
    escape(r.analyzedUrl),
    escape(r.sido),
    escape(r.department),
    escape(r.grade || '-'),
    r.violationCount || 0,
    escape(r.summary || ''),
    escape(r.status)
  ].join(','));

  const BOM = '\uFEFF';
  fs.writeFileSync(filepath, BOM + header + '\n' + rows.join('\n'), 'utf8');

  return filepath;
}

/**
 * 분석 결과 JSON 저장
 */
function saveAnalysisJSON(results, filename) {
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(results, null, 2), 'utf8');
  return filepath;
}

/**
 * 메인 파이프라인
 */
async function main() {
  program
    .name('enrich-pipeline')
    .description('Run Naver Place + Google Search + MedCheck Analysis pipeline')
    .requiredOption('--input <file>', 'Input CSV file')
    .option('--skip-naver', 'Skip Naver Place search')
    .option('--skip-google', 'Skip Google search')
    .option('--skip-analyze', 'Skip MedCheck analysis')
    .option('--analyze-only', 'Only run analysis (use existing URL file)')
    .option('--limit <n>', 'Limit number of hospitals per step', parseInt)
    .option('--analyze-limit <n>', 'Limit number of hospitals to analyze', parseInt)
    .option('--resume', 'Resume from checkpoint')
    .option('--enable-ai', 'Enable AI analysis (costs more)')
    .option('--url-file <file>', 'Use specific file for analysis (with --analyze-only)')
    .parse(process.argv);

  const options = program.opts();
  const startTime = Date.now();

  console.log('\n' + '='.repeat(60));
  console.log('병원 URL 수집 + 분석 파이프라인 v2.0');
  console.log('='.repeat(60));
  console.log(`시작 시간: ${new Date().toLocaleString('ko-KR')}`);
  console.log(`입력 파일: ${options.input}`);
  console.log(`AI 분석: ${options.enableAi ? 'ON' : 'OFF'}`);
  console.log(`대시보드 연동: ${API_BASE}`);

  // 🆕 세션 생성 및 초기 상태 전송
  const sido = options.input.match(/서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주/)?.[0] || '전국';
  await createCrawlSession('full_pipeline', sido);
  await updateCrawlStatus({
    jobType: 'full_pipeline',
    status: 'running',
    progress: 0,
    total: 0,
    message: `파이프라인 시작: ${options.input}`,
    startedAt: new Date().toISOString()
  });

  // 입력 파일 경로 (output/ 중복 방지)
  let inputPath = options.input;
  if (!path.isAbsolute(inputPath)) {
    // output/으로 시작하면 그대로 사용, 아니면 OUTPUT_DIR 추가
    if (inputPath.startsWith('output/') || inputPath.startsWith('output\\')) {
      inputPath = path.join(__dirname, '..', '..', inputPath);
    } else {
      inputPath = path.join(OUTPUT_DIR, inputPath);
    }
  }

  if (!options.analyzeOnly && !fs.existsSync(inputPath)) {
    console.error(`입력 파일 없음: ${inputPath}`);
    process.exit(1);
  }

  let urlFile = options.urlFile || inputPath;

  // ============================
  // 1단계: 네이버 플레이스 검색
  // ============================
  if (!options.skipNaver && !options.analyzeOnly) {
    console.log('\n' + '#'.repeat(60));
    console.log('# 1단계: 네이버 플레이스 검색');
    console.log('#'.repeat(60));

    const naverArgs = [
      '--input', inputPath,
      '--skip-existing',
      '--no-resume'
    ];

    if (options.limit) naverArgs.push('--limit', options.limit.toString());
    if (options.resume) naverArgs.push('--resume');

    try {
      await runScript(path.join(__dirname, 'naver-place.js'), naverArgs);
      urlFile = findLatestFile('hospitals_enriched_') || urlFile;
    } catch (err) {
      console.error(`네이버 검색 실패: ${err.message}`);
      urlFile = findLatestFile('hospitals_enriched_') || urlFile;
    }
  }

  // ============================
  // 2단계: 구글 검색
  // ============================
  if (!options.skipGoogle && !options.analyzeOnly) {
    const hospitals = readCSV(urlFile);
    const stats = getUrlStats(hospitals);

    if (stats.noUrl > 0) {
      console.log('\n' + '#'.repeat(60));
      console.log('# 2단계: 구글 검색 (URL 없는 병원)');
      console.log(`# 대상: ${stats.noUrl}개 병원`);
      console.log('#'.repeat(60));

      const googleArgs = [
        '--input', urlFile,
        '--skip-existing'
      ];

      if (options.limit) googleArgs.push('--limit', options.limit.toString());
      if (options.resume) googleArgs.push('--resume');

      try {
        await runScript(path.join(__dirname, 'google-search.js'), googleArgs);
        urlFile = findLatestFile('hospitals_google_') || urlFile;
      } catch (err) {
        console.error(`구글 검색 실패: ${err.message}`);
      }
    } else {
      console.log('\n[구글 검색 스킵] - 모든 병원이 URL을 가지고 있음');
    }
  }

  // ============================
  // 3단계: MedCheck Engine 분석
  // ============================
  if (!options.skipAnalyze) {
    console.log('\n' + '#'.repeat(60));
    console.log('# 3단계: MedCheck Engine 위반 분석');
    console.log('#'.repeat(60));

    // 분석할 파일 결정
    if (options.urlFile) {
      urlFile = path.isAbsolute(options.urlFile)
        ? options.urlFile
        : path.join(OUTPUT_DIR, options.urlFile);
    }

    console.log(`분석 대상 파일: ${urlFile}`);

    const hospitals = readCSV(urlFile);
    const stats = getUrlStats(hospitals);

    console.log(`\n[URL 현황]`);
    console.log(`  총 병원: ${stats.total}개`);
    console.log(`  URL 확보: ${stats.hasAnyUrl}개 (${(stats.hasAnyUrl / stats.total * 100).toFixed(1)}%)`);
    console.log(`  - 공식 홈페이지: ${stats.hasHomepage}개`);
    console.log(`  - 네이버 플레이스: ${stats.hasNaver}개`);
    console.log(`  - 구글 검색: ${stats.hasGoogle}개`);

    // URL이 있는 병원만 필터링
    let targetHospitals = hospitals.filter(h => h.homepage || h.naverPlaceUrl || h.googleUrl);

    // 분석 제한
    if (options.analyzeLimit) {
      targetHospitals = targetHospitals.slice(0, options.analyzeLimit);
    }

    console.log(`\n분석 대상: ${targetHospitals.length}개`);
    console.log('-'.repeat(60));

    const analysisResults = [];
    let analyzed = 0;
    let success = 0;
    let failed = 0;
    let gradeA = 0, gradeB = 0, gradeC = 0, gradeD = 0, gradeF = 0;

    // 상세 추적 초기화
    totalViolations = 0;
    recentLogEntries = [];
    hospitalsDetailList = [];
    violationsDetailList = [];

    for (let i = 0; i < targetHospitals.length; i++) {
      const hospital = targetHospitals[i];

      // 분석할 URL 결정 (우선순위: 홈페이지 > 구글 > 네이버)
      const urlToAnalyze = hospital.homepage || hospital.googleUrl || hospital.naverPlaceUrl;
      const hospitalName = hospital.name || urlToAnalyze?.replace(/https?:\/\//, '').split('/')[0] || '미확인 병원';

      process.stdout.write(`[${i + 1}/${targetHospitals.length}] ${hospitalName.substring(0, 20).padEnd(20)} `);

      try {
        const result = await analyzeUrl(urlToAnalyze, options.enableAi);

        if (result.success && result.data) {
          const data = result.data;
          success++;

          // 등급 카운트
          switch (data.grade) {
            case 'A': gradeA++; break;
            case 'B': gradeB++; break;
            case 'C': gradeC++; break;
            case 'D': gradeD++; break;
            case 'F': gradeF++; break;
          }

          const vCount = data.violationCount || 0;
          totalViolations += vCount;

          console.log(`✓ ${data.grade}등급 (위반 ${vCount}건)`);

          const resultData = {
            ...hospital,
            name: hospitalName,
            analyzedUrl: urlToAnalyze,
            grade: data.grade,
            violationCount: vCount,
            summary: data.summary || '',
            violations: data.violations || [],
            status: 'success'
          };
          analysisResults.push(resultData);

          // 병원 상세 추적
          hospitalsDetailList.push({
            name: hospitalName,
            url: urlToAnalyze,
            grade: data.grade,
            violationCount: vCount
          });

          // 위반 상세 추적
          if (data.violations && data.violations.length > 0) {
            for (const v of data.violations) {
              violationsDetailList.push({
                hospitalName: hospitalName,
                patternName: v.description || v.type || '알 수 없음',
                matchedText: v.matchedText || v.matched_text || '',
                category: v.category || '',
                grade: data.grade || '-',
                severity: v.severity || 'medium'
              });
            }
          }

          // 최근 로그 (최대 5건)
          recentLogEntries.push({
            time: new Date().toISOString(),
            hospital: hospitalName,
            grade: data.grade,
            violations: vCount,
            status: 'success'
          });
          if (recentLogEntries.length > 5) recentLogEntries.shift();

          // 🆕 분석 결과 API 전송
          await sendAnalysisResult(resultData);
        } else {
          failed++;
          console.log(`✗ ${result.error || 'analysis failed'}`);

          const resultData = {
            ...hospital,
            name: hospitalName,
            analyzedUrl: urlToAnalyze,
            grade: '-',
            violationCount: 0,
            summary: result.error || 'Analysis failed',
            violations: [],
            status: 'error'
          };
          analysisResults.push(resultData);
          await sendAnalysisResult(resultData);

          hospitalsDetailList.push({
            name: hospitalName,
            url: urlToAnalyze,
            grade: '-',
            violationCount: 0
          });

          recentLogEntries.push({
            time: new Date().toISOString(),
            hospital: hospitalName,
            grade: '-',
            violations: 0,
            status: 'error'
          });
          if (recentLogEntries.length > 5) recentLogEntries.shift();
        }
      } catch (err) {
        failed++;
        console.log(`✗ ${err.message}`);

        const resultData = {
          ...hospital,
          name: hospitalName,
          analyzedUrl: urlToAnalyze,
          grade: '-',
          violationCount: 0,
          summary: err.message,
          violations: [],
          status: 'error'
        };
        analysisResults.push(resultData);
        await sendAnalysisResult(resultData);

        hospitalsDetailList.push({
          name: hospitalName,
          url: urlToAnalyze,
          grade: '-',
          violationCount: 0
        });

        recentLogEntries.push({
          time: new Date().toISOString(),
          hospital: hospitalName,
          grade: '-',
          violations: 0,
          status: 'error'
        });
        if (recentLogEntries.length > 5) recentLogEntries.shift();
      }

      analyzed++;

      // 실시간 상태 업데이트 (매 병원마다)
      await updateCrawlStatus({
        jobType: 'analysis',
        status: 'running',
        progress: analyzed,
        total: targetHospitals.length,
        found: success,
        failed: failed,
        currentItem: hospitalName,
        message: `분석 중: ${analyzed}/${targetHospitals.length}`,
        violationsFound: totalViolations,
        recentLogs: recentLogEntries
      });

      // 딜레이
      if (i < targetHospitals.length - 1) {
        await sleep(ANALYZE_DELAY_MS);
      }
    }

    // 분석 결과 저장
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const csvPath = saveAnalysisCSV(analysisResults, `analysis_results_${timestamp}.csv`);
    const jsonPath = saveAnalysisJSON(analysisResults, `analysis_results_${timestamp}.json`);

    console.log('\n' + '-'.repeat(60));
    console.log('[분석 결과]');
    console.log(`  분석: ${analyzed}개`);
    console.log(`  분석 완료: ${analyzed}`);
    console.log(`  성공: ${success}개 (${(success / analyzed * 100).toFixed(1)}%)`);
    console.log(`  실패: ${failed}개`);
    console.log(`  총 병원: ${targetHospitals.length}개`);
    console.log(`  위반: ${totalViolations}`);
    console.log('\n[등급 분포]');
    console.log(`  A등급 (양호): ${gradeA}개`);
    console.log(`  B등급 (경미): ${gradeB}개`);
    console.log(`  C등급 (주의): ${gradeC}개`);
    console.log(`  D등급 (심각): ${gradeD}개`);
    console.log(`  F등급 (위험): ${gradeF}개`);
    console.log(`\n저장:`);
    console.log(`  CSV: ${csvPath}`);
    console.log(`  JSON: ${jsonPath}`);

    // 구조화된 결과 출력 (scheduler에서 파싱)
    console.log('\n__PIPELINE_RESULT_JSON__');
    console.log(JSON.stringify({
      hospitalsTotal: targetHospitals.length,
      hospitalsAnalyzed: analyzed,
      violationsFound: totalViolations,
      errorCount: failed,
      hospitalsDetail: hospitalsDetailList,
      violationsDetail: violationsDetailList
    }));
    console.log('__PIPELINE_RESULT_END__');

    // 분석 완료 상태 전송
    await updateCrawlStatus({
      jobType: 'analysis',
      status: 'completed',
      progress: analyzed,
      total: analyzed,
      found: success,
      failed: failed,
      violationsFound: totalViolations,
      recentLogs: recentLogEntries,
      message: JSON.stringify({
        timestamp,
        grades: { A: gradeA, B: gradeB, C: gradeC, D: gradeD, F: gradeF }
      })
    });
  }

  // ============================
  // 최종 요약
  // ============================
  const elapsed = Math.round((Date.now() - startTime) / 1000 / 60);

  console.log('\n' + '='.repeat(60));
  console.log('파이프라인 완료!');
  console.log('='.repeat(60));
  console.log(`총 소요 시간: ${elapsed}분`);
  console.log(`종료 시간: ${new Date().toLocaleString('ko-KR')}`);
  console.log(`대시보드에서 결과를 확인하세요: ${API_BASE.replace('medcheck-engine.mmakid.workers.dev', 'dashboard')}`);

  // 🆕 최종 완료 상태 전송
  await updateCrawlStatus({
    jobType: 'full_pipeline',
    status: 'completed',
    progress: 100,
    total: 100,
    message: `파이프라인 완료 (${elapsed}분 소요)`
  });
}

main().catch(err => {
  console.error('Pipeline Error:', err.message);
  process.exit(1);
});
