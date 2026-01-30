/**
 * 병원 URL 수집 파이프라인
 * 1단계: 네이버 플레이스 검색
 * 2단계: 구글 검색 (네이버에서 못 찾은 병원)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'output');

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
 * 가장 최근 enriched 파일 찾기
 */
function findLatestEnrichedFile() {
  if (!fs.existsSync(OUTPUT_DIR)) return null;

  const files = fs.readdirSync(OUTPUT_DIR)
    .filter(f => f.startsWith('hospitals_enriched_') && f.endsWith('.csv'))
    .sort()
    .reverse();

  return files.length > 0 ? path.join(OUTPUT_DIR, files[0]) : null;
}

/**
 * CSV에서 URL 없는 병원 수 카운트
 */
function countMissingUrls(filepath) {
  if (!fs.existsSync(filepath)) return { total: 0, noHomepage: 0, noNaver: 0, noBoth: 0 };

  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());

  let total = 0;
  let noHomepage = 0;
  let noNaver = 0;
  let noBoth = 0;

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length >= 8) {
      total++;
      const homepage = values[3]?.trim();
      const naverUrl = values[7]?.trim();

      if (!homepage) noHomepage++;
      if (!naverUrl) noNaver++;
      if (!homepage && !naverUrl) noBoth++;
    }
  }

  return { total, noHomepage, noNaver, noBoth };
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
 * 메인 파이프라인
 */
async function main() {
  program
    .name('enrich-pipeline')
    .description('Run Naver Place + Google Search pipeline')
    .requiredOption('--input <file>', 'Input CSV file')
    .option('--skip-naver', 'Skip Naver Place search (use existing enriched file)')
    .option('--skip-google', 'Skip Google search')
    .option('--limit <n>', 'Limit number of hospitals per step', parseInt)
    .option('--resume', 'Resume from checkpoint')
    .option('--delay <ms>', 'Custom delay between requests (ms)', parseInt)
    .parse(process.argv);

  const options = program.opts();
  const startTime = Date.now();

  console.log('\n' + '='.repeat(60));
  console.log('병원 URL 수집 파이프라인');
  console.log('='.repeat(60));
  console.log(`시작 시간: ${new Date().toLocaleString('ko-KR')}`);
  console.log(`입력 파일: ${options.input}`);

  // 입력 파일 경로
  const inputPath = path.isAbsolute(options.input)
    ? options.input
    : path.join(OUTPUT_DIR, options.input);

  if (!fs.existsSync(inputPath)) {
    console.error(`입력 파일 없음: ${inputPath}`);
    process.exit(1);
  }

  // 초기 통계
  const initialStats = countMissingUrls(inputPath);
  console.log(`\n[초기 상태]`);
  console.log(`  총 병원: ${initialStats.total}개`);
  console.log(`  홈페이지 없음: ${initialStats.noHomepage}개`);

  let naverOutputFile = null;

  // ============================
  // 1단계: 네이버 플레이스 검색
  // ============================
  if (!options.skipNaver) {
    console.log('\n' + '#'.repeat(60));
    console.log('# 1단계: 네이버 플레이스 검색');
    console.log('#'.repeat(60));

    const naverArgs = [
      '--input', inputPath,
      '--skip-existing'
    ];

    if (options.limit) naverArgs.push('--limit', options.limit.toString());
    if (options.resume) naverArgs.push('--resume');
    naverArgs.push('--no-resume'); // 자동 재시작 비활성화 (파이프라인이 관리)

    try {
      await runScript(path.join(__dirname, 'naver-place.js'), naverArgs);
      naverOutputFile = findLatestEnrichedFile();

      if (naverOutputFile) {
        const naverStats = countMissingUrls(naverOutputFile);
        console.log(`\n[네이버 검색 결과]`);
        console.log(`  네이버 플레이스 발견: ${initialStats.noHomepage - naverStats.noBoth}개`);
        console.log(`  여전히 URL 없음: ${naverStats.noBoth}개`);
      }
    } catch (err) {
      console.error(`네이버 검색 실패: ${err.message}`);
      // 실패해도 계속 진행 (이전 결과 파일 사용)
      naverOutputFile = findLatestEnrichedFile();
    }
  } else {
    console.log('\n[네이버 검색 스킵]');
    naverOutputFile = findLatestEnrichedFile() || inputPath;
  }

  // ============================
  // 2단계: 구글 검색
  // ============================
  if (!options.skipGoogle && naverOutputFile) {
    // 구글 검색 전 통계 확인
    const preGoogleStats = countMissingUrls(naverOutputFile);

    if (preGoogleStats.noBoth > 0) {
      console.log('\n' + '#'.repeat(60));
      console.log('# 2단계: 구글 검색 (네이버에서 못 찾은 병원)');
      console.log('#'.repeat(60));
      console.log(`  대상: ${preGoogleStats.noBoth}개 병원`);

      const googleArgs = [
        '--input', naverOutputFile,
        '--skip-existing'  // 홈페이지/네이버 URL 있는 건 스킵
      ];

      if (options.limit) googleArgs.push('--limit', options.limit.toString());
      if (options.resume) googleArgs.push('--resume');

      try {
        await runScript(path.join(__dirname, 'google-search.js'), googleArgs);
      } catch (err) {
        console.error(`구글 검색 실패: ${err.message}`);
      }
    } else {
      console.log('\n[구글 검색 스킵] - 모든 병원이 URL을 가지고 있음');
    }
  } else if (options.skipGoogle) {
    console.log('\n[구글 검색 스킵 (옵션)]');
  }

  // ============================
  // 최종 통계
  // ============================
  const finalFile = findLatestEnrichedFile() ||
    fs.readdirSync(OUTPUT_DIR)
      .filter(f => f.startsWith('hospitals_google_') && f.endsWith('.csv'))
      .sort()
      .reverse()[0];

  if (finalFile) {
    const finalPath = path.isAbsolute(finalFile) ? finalFile : path.join(OUTPUT_DIR, finalFile);
    const finalStats = countMissingUrls(finalPath);

    const elapsed = Math.round((Date.now() - startTime) / 1000 / 60);

    console.log('\n' + '='.repeat(60));
    console.log('파이프라인 완료!');
    console.log('='.repeat(60));
    console.log(`소요 시간: ${elapsed}분`);
    console.log(`\n[최종 결과]`);
    console.log(`  총 병원: ${finalStats.total}개`);
    console.log(`  URL 확보: ${finalStats.total - finalStats.noBoth}개 (${((finalStats.total - finalStats.noBoth) / finalStats.total * 100).toFixed(1)}%)`);
    console.log(`  URL 미확보: ${finalStats.noBoth}개`);
    console.log(`\n최종 파일: ${finalPath}`);
  }
}

main().catch(err => {
  console.error('Pipeline Error:', err.message);
  process.exit(1);
});
