/**
 * MedCheck 크롤러 스케줄러
 * - node-cron: 09:00 / 18:00 KST 자동 크롤링
 * - 30초 폴링: 대시보드 수동 트리거 감지
 * - 60초 하트비트: 엔진에 스케줄러 상태 보고
 * - 데몬 모드: Windows 호환 백그라운드 실행
 */

const { fork } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { program } = require('commander');

// ============================================
// 설정
// ============================================

const API_BASE = process.env.MEDCHECK_API || 'https://medcheck-engine.mmakid.workers.dev';
const SCV_DIR = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(SCV_DIR, 'output');
const LOGS_DIR = path.join(SCV_DIR, 'logs');
const PID_FILE = path.join(SCV_DIR, 'scheduler.pid');
const STOP_FILE = path.join(SCV_DIR, 'scheduler.stop');
const STATUS_FILE = path.join(SCV_DIR, 'scheduler-status.json');

const MAX_CONCURRENT = 3;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 10000, 20000]; // exponential backoff
const POLL_INTERVAL = 30000;   // 30초
const HEARTBEAT_INTERVAL = 60000; // 60초

const SCHEDULES = [
  { cron: '0 9 * * *', label: '오전 9시', region: '서울' },
  { cron: '0 18 * * *', label: '오후 6시', region: '서울' },
];

// ============================================
// 상태
// ============================================

let isRunning = false;
let jobQueue = [];
let runningJobs = [];
let cronJobs = [];
let pollTimer = null;
let heartbeatTimer = null;

// ============================================
// 유틸리티
// ============================================

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function log(level, message, meta = {}) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.toUpperCase()}] ${message}` +
    (Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '');

  console.log(line);

  // 파일 로그
  ensureDir(LOGS_DIR);
  const dateStr = ts.slice(0, 10);
  const logFile = path.join(LOGS_DIR, `scheduler-${dateStr}.log`);
  fs.appendFileSync(logFile, line + '\n');
}

function generateId(prefix = 'JOB') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function findLatestCSV(region) {
  if (!fs.existsSync(OUTPUT_DIR)) return null;

  const files = fs.readdirSync(OUTPUT_DIR)
    .filter(f => f.endsWith('.csv') && f.toLowerCase().includes('hospital'))
    .map(f => ({
      name: f,
      path: path.join(OUTPUT_DIR, f),
      mtime: fs.statSync(path.join(OUTPUT_DIR, f)).mtime.getTime()
    }))
    .sort((a, b) => b.mtime - a.mtime);

  // region 매칭 시도, 없으면 최신 파일
  if (region) {
    const regionFile = files.find(f => f.name.includes(region));
    if (regionFile) return regionFile.path;
  }

  return files.length > 0 ? files[0].path : null;
}

function writeStatus() {
  const nextRun = getNextScheduledRun();
  const status = {
    pid: process.pid,
    isOnline: isRunning,
    startedAt: startedAt,
    runningJobs: runningJobs.length,
    queuedJobs: jobQueue.length,
    nextScheduledRun: nextRun,
    schedules: SCHEDULES.map(s => s.label),
    lastUpdate: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
  } catch (e) { /* ignore */ }
}

let startedAt = null;

function getNextScheduledRun() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hours = [9, 18];

  for (const h of hours) {
    const next = new Date(kst);
    next.setHours(h, 0, 0, 0);
    if (next > kst) {
      return new Date(next.getTime() - 9 * 60 * 60 * 1000).toISOString();
    }
  }

  // 내일 9시
  const tomorrow = new Date(kst);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return new Date(tomorrow.getTime() - 9 * 60 * 60 * 1000).toISOString();
}

// ============================================
// 엔진 API 통신
// ============================================

async function sendHeartbeat() {
  const nextRun = getNextScheduledRun();
  try {
    await axios.post(`${API_BASE}/api/crawler/heartbeat`, {
      pid: process.pid,
      schedules: SCHEDULES.map(s => s.label),
      runningJobs: runningJobs.length,
      queuedJobs: jobQueue.length,
      nextScheduledRun: nextRun,
    }, { timeout: 10000 });
  } catch (e) {
    log('warn', '하트비트 전송 실패', { error: e.message });
  }
  writeStatus();
}

async function sendCrawlLog(logData) {
  try {
    await axios.post(`${API_BASE}/api/crawler/log`, logData, { timeout: 10000 });
  } catch (e) {
    log('warn', '크롤 로그 전송 실패', { error: e.message });
  }
}

async function fetchPendingTriggers() {
  try {
    const res = await axios.get(`${API_BASE}/api/crawler/triggers?status=pending`, { timeout: 10000 });
    if (res.data?.success) return res.data.data || [];
  } catch (e) {
    log('warn', '트리거 폴링 실패', { error: e.message });
  }
  return [];
}

async function ackTrigger(triggerId, jobId) {
  try {
    await axios.post(`${API_BASE}/api/crawler/triggers/${triggerId}/ack`, { jobId }, { timeout: 10000 });
  } catch (e) {
    log('warn', '트리거 ACK 실패', { triggerId, error: e.message });
  }
}

async function completeTrigger(triggerId, status, result) {
  try {
    await axios.post(`${API_BASE}/api/crawler/triggers/${triggerId}/complete`, { status, result }, { timeout: 10000 });
  } catch (e) {
    log('warn', '트리거 완료 전송 실패', { triggerId, error: e.message });
  }
}

// ============================================
// 작업 실행
// ============================================

async function executeJob(job) {
  const { id, type, region, triggerId, enableAi, retryCount = 0 } = job;
  const startTime = Date.now();

  log('info', `작업 시작: ${id}`, { type, region, retry: retryCount });

  runningJobs.push(job);
  writeStatus();

  // 크롤 로그 (시작)
  const logId = generateId('LOG');
  await sendCrawlLog({
    id: logId,
    jobId: id,
    type,
    region,
    status: 'running',
    startedAt: new Date().toISOString(),
    triggerId,
  });

  return new Promise((resolve) => {
    const csvPath = findLatestCSV(region);

    if (!csvPath) {
      log('error', `CSV 파일 없음: ${region}`);
      finishJob(job, logId, startTime, { error: 'CSV 파일을 찾을 수 없습니다' });
      resolve();
      return;
    }

    log('info', `CSV 파일 사용: ${path.basename(csvPath)}`);

    const args = ['--input', csvPath, '--skip-naver', '--skip-google', '--analyze-only'];
    if (enableAi) args.push('--enable-ai');

    const child = fork(
      path.join(__dirname, 'enrichers', 'enrich-pipeline.js'),
      args,
      { cwd: SCV_DIR, silent: true }
    );

    let stdout = '';
    let stderr = '';

    if (child.stdout) child.stdout.on('data', d => { stdout += d.toString(); });
    if (child.stderr) child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('exit', async (code) => {
      if (code === 0) {
        const result = parseResult(stdout);
        await finishJob(job, logId, startTime, { success: true, ...result });
        log('info', `작업 완료: ${id}`, result);
      } else {
        log('error', `작업 실패: ${id}`, { code, stderr: stderr.slice(0, 500) });

        // 재시도
        if (retryCount < MAX_RETRIES) {
          const delay = RETRY_DELAYS[retryCount] || 20000;
          log('info', `재시도 예정: ${id} (${retryCount + 1}/${MAX_RETRIES}, ${delay}ms 후)`);
          removeFromRunning(job);

          setTimeout(() => {
            enqueueJob({ ...job, retryCount: retryCount + 1 });
          }, delay);
        } else {
          await finishJob(job, logId, startTime, {
            error: `${MAX_RETRIES}회 재시도 후 실패`,
            errorDetails: stderr.slice(0, 1000),
          });
        }
      }
      resolve();
    });

    child.on('error', async (err) => {
      log('error', `프로세스 에러: ${id}`, { error: err.message });
      await finishJob(job, logId, startTime, { error: err.message });
      resolve();
    });
  });
}

function parseResult(stdout) {
  // enrich-pipeline.js 출력에서 결과 파싱
  const result = {
    hospitalsTotal: 0,
    hospitalsAnalyzed: 0,
    violationsFound: 0,
    errorCount: 0,
  };

  const totalMatch = stdout.match(/총\s*(\d+)\s*개/);
  if (totalMatch) result.hospitalsTotal = parseInt(totalMatch[1]);

  const analyzedMatch = stdout.match(/분석\s*완료[:\s]*(\d+)/);
  if (analyzedMatch) result.hospitalsAnalyzed = parseInt(analyzedMatch[1]);

  const violationMatch = stdout.match(/위반[:\s]*(\d+)/);
  if (violationMatch) result.violationsFound = parseInt(violationMatch[1]);

  const errorMatch = stdout.match(/실패[:\s]*(\d+)/);
  if (errorMatch) result.errorCount = parseInt(errorMatch[1]);

  return result;
}

async function finishJob(job, logId, startTime, result) {
  const duration = Math.round((Date.now() - startTime) / 1000);
  const status = result.error ? 'failed' : 'completed';

  removeFromRunning(job);

  // 크롤 로그 업데이트
  await sendCrawlLog({
    id: logId,
    jobId: job.id,
    type: job.type,
    region: job.region,
    status,
    startedAt: new Date(startTime).toISOString(),
    completedAt: new Date().toISOString(),
    durationSeconds: duration,
    hospitalsTotal: result.hospitalsTotal || 0,
    hospitalsAnalyzed: result.hospitalsAnalyzed || 0,
    violationsFound: result.violationsFound || 0,
    errorCount: result.errorCount || 0,
    errorDetails: result.error || result.errorDetails || null,
    triggerId: job.triggerId || null,
  });

  // 트리거 완료 보고
  if (job.triggerId) {
    await completeTrigger(job.triggerId, status, result);
  }

  writeStatus();
  processQueue();
}

function removeFromRunning(job) {
  runningJobs = runningJobs.filter(j => j.id !== job.id);
}

// ============================================
// 작업 큐
// ============================================

function enqueueJob(job) {
  jobQueue.push(job);
  log('info', `작업 큐에 추가: ${job.id}`, { queueSize: jobQueue.length });
  writeStatus();
  processQueue();
}

function processQueue() {
  while (runningJobs.length < MAX_CONCURRENT && jobQueue.length > 0) {
    const job = jobQueue.shift();
    executeJob(job);
  }
}

// ============================================
// 트리거 폴링 (30초)
// ============================================

async function pollTriggers() {
  if (!isRunning) return;

  const triggers = await fetchPendingTriggers();

  for (const trigger of triggers) {
    // 종료 트리거 감지
    if (trigger.region === '__SHUTDOWN__') {
      log('info', '대시보드에서 종료 요청 수신');
      await ackTrigger(trigger.id, null);
      await completeTrigger(trigger.id, 'completed', { message: '스케줄러 종료됨' });
      stopScheduler();
      return;
    }

    const jobId = generateId('MANUAL');

    await ackTrigger(trigger.id, jobId);

    enqueueJob({
      id: jobId,
      type: 'manual',
      region: trigger.region || '서울',
      enableAi: trigger.enable_ai === 1,
      triggerId: trigger.id,
      retryCount: 0,
    });

    log('info', `수동 트리거 접수: ${trigger.id}`, { region: trigger.region, jobId });
  }
}

// ============================================
// 스케줄 크론
// ============================================

function setupCron() {
  let cron;
  try {
    cron = require('node-cron');
  } catch (e) {
    log('error', 'node-cron 패키지가 설치되지 않았습니다. npm install node-cron 실행 필요');
    return;
  }

  for (const schedule of SCHEDULES) {
    const task = cron.schedule(schedule.cron, () => {
      log('info', `스케줄 크론 실행: ${schedule.label}`);

      const jobId = generateId('SCHED');
      enqueueJob({
        id: jobId,
        type: 'scheduled',
        region: schedule.region,
        enableAi: false,
        retryCount: 0,
      });
    }, { timezone: 'Asia/Seoul' });

    cronJobs.push(task);
    log('info', `크론 등록: ${schedule.cron} (${schedule.label})`);
  }
}

// ============================================
// 스케줄러 시작/중지
// ============================================

async function startScheduler(options = {}) {
  if (isRunning) {
    log('warn', '스케줄러가 이미 실행 중입니다');
    return;
  }

  // stop 파일 확인 및 제거
  if (fs.existsSync(STOP_FILE)) {
    fs.unlinkSync(STOP_FILE);
  }

  isRunning = true;
  startedAt = new Date().toISOString();

  log('info', '========================================');
  log('info', 'MedCheck 크롤러 스케줄러 시작');
  log('info', `PID: ${process.pid}`);
  log('info', `API: ${API_BASE}`);
  log('info', '========================================');

  // PID 파일
  fs.writeFileSync(PID_FILE, String(process.pid));

  // 크론 설정
  setupCron();

  // 하트비트 시작
  await sendHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

  // 트리거 폴링 시작
  pollTimer = setInterval(pollTriggers, POLL_INTERVAL);

  // graceful shutdown 대비 stop 파일 감시 (2초 간격)
  const stopWatcher = setInterval(() => {
    if (fs.existsSync(STOP_FILE)) {
      log('info', 'Stop 파일 감지 - 종료 중...');
      clearInterval(stopWatcher);
      stopScheduler();
    }
  }, 2000);

  // 상태 파일 기록
  writeStatus();

  log('info', `스케줄: ${SCHEDULES.map(s => s.label).join(', ')}`);
  log('info', `트리거 폴링: ${POLL_INTERVAL / 1000}초 간격`);
  log('info', `하트비트: ${HEARTBEAT_INTERVAL / 1000}초 간격`);

  // 즉시 실행 옵션
  if (options.runNow) {
    const jobId = generateId('INIT');
    enqueueJob({
      id: jobId,
      type: 'manual',
      region: options.region || '서울',
      enableAi: false,
      retryCount: 0,
    });
  }
}

let isShuttingDown = false;

async function stopScheduler() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log('info', '스케줄러 종료 중...');
  isRunning = false;

  // 크론 중지
  cronJobs.forEach(j => j.stop());
  cronJobs = [];

  // 타이머 정리
  if (pollTimer) clearInterval(pollTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);

  // 오프라인 하트비트 (isOnline: false 명시)
  log('info', '오프라인 하트비트 전송 중...');
  try {
    await axios.post(`${API_BASE}/api/crawler/heartbeat`, {
      pid: process.pid,
      isOnline: false,
      schedules: [],
      runningJobs: 0,
      queuedJobs: 0,
      nextScheduledRun: null,
    }, { timeout: 5000 });
    log('info', '오프라인 하트비트 전송 완료');
  } catch (e) {
    log('warn', '오프라인 하트비트 전송 실패', { error: e.message });
  }

  // PID 파일 삭제
  if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  if (fs.existsSync(STOP_FILE)) fs.unlinkSync(STOP_FILE);

  // 상태 파일 업데이트
  writeStatus();

  log('info', '스케줄러 종료 완료');
  process.exit(0);
}

// graceful shutdown - 시그널에서 async 함수가 완료될 때까지 프로세스 유지
function handleShutdownSignal() {
  stopScheduler().catch((e) => {
    log('error', '종료 중 오류', { error: e.message });
    process.exit(1);
  });
}

process.on('SIGINT', handleShutdownSignal);
process.on('SIGTERM', handleShutdownSignal);

// ============================================
// CLI
// ============================================

program
  .name('scheduler')
  .description('MedCheck 크롤러 스케줄러')
  .version('1.0.0');

program
  .command('start')
  .description('스케줄러 시작')
  .option('--daemon', '백그라운드 데몬 모드로 실행')
  .option('--run-now', '시작 후 즉시 크롤링 실행')
  .option('--region <region>', '크롤링 지역', '서울')
  .action(async (options) => {
    if (options.daemon) {
      // 데몬 모드: 별도 프로세스로 fork
      log('info', '데몬 모드로 스케줄러 시작...');

      const child = fork(__filename, ['start', '--region', options.region || '서울'].concat(options.runNow ? ['--run-now'] : []), {
        detached: true,
        stdio: 'ignore',
      });

      child.unref();
      log('info', `데몬 PID: ${child.pid}`);
      console.log(`스케줄러 데몬이 시작되었습니다 (PID: ${child.pid})`);
      process.exit(0);
    } else {
      await startScheduler({
        runNow: options.runNow,
        region: options.region,
      });
    }
  });

program
  .command('stop')
  .description('스케줄러 중지')
  .action(async () => {
    if (!fs.existsSync(PID_FILE)) {
      console.log('실행 중인 스케줄러가 없습니다.');
      process.exit(0);
    }

    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim());

    // stop 파일 생성 → 스케줄러가 2초 이내에 감지하여 graceful 종료
    fs.writeFileSync(STOP_FILE, String(Date.now()));
    console.log(`스케줄러 종료 요청 (PID: ${pid}) - stop 파일 생성됨`);

    // 최대 15초간 PID 파일이 삭제될 때까지 대기 (graceful 종료 확인)
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 1000));
      if (!fs.existsSync(PID_FILE)) {
        console.log('스케줄러가 정상 종료되었습니다.');
        process.exit(0);
      }
    }

    // 타임아웃 → 강제 종료 시도
    console.log('graceful 종료 타임아웃. 강제 종료 시도...');
    try {
      process.kill(pid);
    } catch (e) { /* ignore */ }
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    if (fs.existsSync(STOP_FILE)) fs.unlinkSync(STOP_FILE);
    console.log('스케줄러가 강제 종료되었습니다.');
  });

program
  .command('status')
  .description('스케줄러 상태 확인')
  .action(() => {
    if (!fs.existsSync(STATUS_FILE)) {
      console.log('스케줄러 상태 파일이 없습니다. 한 번도 실행되지 않았을 수 있습니다.');
      process.exit(0);
    }

    const status = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'));

    console.log('\n===== MedCheck 스케줄러 상태 =====');
    console.log(`PID:           ${status.pid || '-'}`);
    console.log(`온라인:        ${status.isOnline ? '✓ 실행 중' : '✗ 오프라인'}`);
    console.log(`시작 시간:     ${status.startedAt || '-'}`);
    console.log(`실행 중 작업:  ${status.runningJobs}`);
    console.log(`대기 작업:     ${status.queuedJobs}`);
    console.log(`다음 예정:     ${status.nextScheduledRun || '-'}`);
    console.log(`스케줄:        ${(status.schedules || []).join(', ')}`);
    console.log(`마지막 업데이트: ${status.lastUpdate}`);
    console.log('=================================\n');
  });

program
  .command('run')
  .description('즉시 크롤링 실행 (스케줄러 없이)')
  .option('--region <region>', '크롤링 지역', '서울')
  .option('--enable-ai', 'AI 분석 활성화')
  .action(async (options) => {
    log('info', '즉시 크롤링 실행 모드');

    const jobId = generateId('ONESHOT');
    const job = {
      id: jobId,
      type: 'manual',
      region: options.region,
      enableAi: options.enableAi || false,
      retryCount: 0,
    };

    await executeJob(job);
    process.exit(0);
  });

program.parse();
