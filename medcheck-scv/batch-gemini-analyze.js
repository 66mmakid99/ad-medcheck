/**
 * Gemini Pipeline 배치 분석기
 * 49개 병원을 순차적으로 Gemini+Firecrawl 파이프라인으로 분석
 *
 * Usage: node batch-gemini-analyze.js [--start N] [--limit N] [--delay MS]
 */

const fs = require('fs');
const https = require('https');
const http = require('http');

// ━━━━ 설정 ━━━━
const API_URL = 'https://medcheck-engine.mmakid.workers.dev/v1/pipeline/analyze';
const API_KEY = 'mmc_live_key_2024';
const DELAY_MS = parseInt(process.argv.find(a => a.startsWith('--delay='))?.split('=')[1] || '2000');
const START_IDX = parseInt(process.argv.find(a => a.startsWith('--start='))?.split('=')[1] || '0');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '49');
const TIMEOUT_MS = 90000; // 90초 (gemini-2.0-flash는 보통 15-40초, 대형 사이트 54s 관측)

const hospitals = JSON.parse(fs.readFileSync('output/batch49.json', 'utf8'));
const total = Math.min(hospitals.length, START_IDX + LIMIT) - START_IDX;

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
const resultFile = `output/gemini_batch_${timestamp}.json`;
const csvFile = `output/gemini_batch_${timestamp}.csv`;

// ━━━━ HTTP 요청 함수 ━━━━
function analyzeHospital(url, hospitalName) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ url, hospitalName, mode: 'gemini' });
    const urlObj = new URL(API_URL);

    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: TIMEOUT_MS,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ success: false, error: { code: 'PARSE_ERROR', message: data.substring(0, 200) } });
        }
      });
    });

    req.on('error', (e) => {
      resolve({ success: false, error: { code: 'NETWORK_ERROR', message: e.message } });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: { code: 'TIMEOUT', message: `${TIMEOUT_MS}ms timeout` } });
    });

    req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ━━━━ 메인 ━━━━
async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Gemini Pipeline 배치 분석 시작`);
  console.log(`  대상: ${total}개 병원 (index ${START_IDX}~${START_IDX + total - 1})`);
  console.log(`  딜레이: ${DELAY_MS}ms | 타임아웃: ${TIMEOUT_MS}ms`);
  console.log(`${'='.repeat(60)}\n`);

  const results = [];
  let successCount = 0, failCount = 0;
  const batchStart = Date.now();

  for (let i = START_IDX; i < START_IDX + total; i++) {
    const h = hospitals[i];
    const idx = i - START_IDX + 1;
    const elapsed = ((Date.now() - batchStart) / 1000).toFixed(0);

    process.stdout.write(`[${idx}/${total}] ${h.hospitalName} (${elapsed}s) ... `);

    const startMs = Date.now();
    const result = await analyzeHospital(h.url, h.hospitalName);
    const durationMs = Date.now() - startMs;

    const meta = result.meta || {};
    const audit = result.audit || {};
    const grade = audit.grade || {};

    const entry = {
      index: i,
      hospitalName: h.hospitalName,
      url: h.url,
      success: result.success,
      crawlMethod: meta.crawlMethod || 'unknown',
      textLength: meta.textLength || 0,
      grade: grade.grade || '-',
      cleanScore: grade.cleanScore || 0,
      violationCount: grade.violationCount || 0,
      violations: (audit.finalViolations || []).map(v => ({
        patternId: v.patternId,
        category: v.category,
        severity: v.severity,
        text: (v.originalText || '').substring(0, 80),
      })),
      grayZones: (audit.grayZones || []).length,
      fetchTimeMs: meta.fetchTimeMs || 0,
      geminiTimeMs: meta.geminiTimeMs || 0,
      totalTimeMs: meta.totalTimeMs || durationMs,
      error: result.error ? `${result.error.code}: ${result.error.message}`.substring(0, 100) : null,
    };

    results.push(entry);

    if (result.success) {
      successCount++;
      console.log(`✓ ${entry.grade} (${entry.violationCount}v, ${entry.grayZones}gz) ${entry.crawlMethod} ${(durationMs / 1000).toFixed(1)}s`);
    } else {
      failCount++;
      console.log(`✗ ${entry.error}`);
    }

    // 중간 저장 (5개마다)
    if (idx % 5 === 0 || idx === total) {
      fs.writeFileSync(resultFile, JSON.stringify(results, null, 2));
    }

    // 딜레이
    if (i < START_IDX + total - 1) {
      await sleep(DELAY_MS);
    }
  }

  // ━━━━ 최종 저장 ━━━━
  fs.writeFileSync(resultFile, JSON.stringify(results, null, 2));

  // CSV 저장
  const csvHeader = '번호,병원명,URL,성공,크롤방법,텍스트길이,등급,점수,위반수,그레이존,총시간(초),에러';
  const csvRows = results.map((r, i) =>
    `${i + 1},"${r.hospitalName}","${r.url}",${r.success},${r.crawlMethod},${r.textLength},${r.grade},${r.cleanScore},${r.violationCount},${r.grayZones},${(r.totalTimeMs / 1000).toFixed(1)},"${r.error || ''}"`
  );
  fs.writeFileSync(csvFile, '\uFEFF' + csvHeader + '\n' + csvRows.join('\n'));

  // ━━━━ 요약 ━━━━
  const totalTime = ((Date.now() - batchStart) / 1000).toFixed(0);
  const gradeMap = {};
  results.filter(r => r.success).forEach(r => { gradeMap[r.grade] = (gradeMap[r.grade] || 0) + 1; });
  const firecrawlCount = results.filter(r => r.crawlMethod === 'firecrawl').length;
  const fetchCount = results.filter(r => r.crawlMethod === 'fetch').length;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  배치 분석 완료`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  총 소요: ${totalTime}초 (${(totalTime / 60).toFixed(1)}분)`);
  console.log(`  성공: ${successCount} | 실패: ${failCount}`);
  console.log(`  크롤방법: fetch=${fetchCount} | firecrawl=${firecrawlCount}`);
  console.log(`  등급분포: ${Object.entries(gradeMap).sort().map(([k, v]) => `${k}=${v}`).join(' | ')}`);
  console.log(`  총 위반: ${results.reduce((s, r) => s + r.violationCount, 0)}건`);
  console.log(`  결과파일: ${resultFile}`);
  console.log(`  CSV파일: ${csvFile}`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(console.error);
