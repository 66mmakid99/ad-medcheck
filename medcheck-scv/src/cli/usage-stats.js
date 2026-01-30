#!/usr/bin/env node
/**
 * 비용 모니터링 CLI
 * 사용법: node src/cli/usage-stats.js
 */

const fs = require('fs');
const path = require('path');

const USAGE_LOG_PATH = path.join(__dirname, '..', '..', 'logs', 'usage.json');
const CACHE_PATH = path.join(__dirname, '..', '..', 'data', 'cache', 'page_hashes.json');

function formatCurrency(amount) {
  return `$${parseFloat(amount).toFixed(4)}`;
}

function formatNumber(num) {
  return num.toLocaleString();
}

function getUsageStats() {
  if (!fs.existsSync(USAGE_LOG_PATH)) {
    return null;
  }
  
  const logs = JSON.parse(fs.readFileSync(USAGE_LOG_PATH, 'utf8'));
  
  // 오늘/이번주/이번달 필터링
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  const todayLogs = logs.filter(l => l.timestamp.startsWith(today));
  const weekLogs = logs.filter(l => l.timestamp >= weekAgo);
  const monthLogs = logs.filter(l => l.timestamp >= monthAgo);
  
  const calcStats = (arr) => ({
    requests: arr.length,
    inputTokens: arr.reduce((s, l) => s + l.inputTokens, 0),
    outputTokens: arr.reduce((s, l) => s + l.outputTokens, 0),
    cost: arr.reduce((s, l) => s + parseFloat(l.totalCost), 0)
  });
  
  return {
    total: calcStats(logs),
    today: calcStats(todayLogs),
    week: calcStats(weekLogs),
    month: calcStats(monthLogs),
    lastRequest: logs[logs.length - 1]
  };
}

function getCacheStats() {
  if (!fs.existsSync(CACHE_PATH)) {
    return null;
  }
  
  const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  const urls = Object.keys(cache);
  
  return {
    totalUrls: urls.length,
    avgCheckCount: urls.length > 0 
      ? (urls.reduce((s, u) => s + (cache[u].checkCount || 1), 0) / urls.length).toFixed(1)
      : 0
  };
}

function printStats() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 MEDCHECK SCV - 비용 모니터링');
  console.log('='.repeat(60));
  
  const usage = getUsageStats();
  const cache = getCacheStats();
  
  if (!usage) {
    console.log('\n⚠️  사용량 로그가 없습니다. AI 분석을 실행하면 기록됩니다.\n');
  } else {
    console.log('\n💰 API 사용량 & 비용');
    console.log('-'.repeat(40));
    
    console.log(`\n📅 오늘:`);
    console.log(`   요청: ${formatNumber(usage.today.requests)}회`);
    console.log(`   토큰: ${formatNumber(usage.today.inputTokens)} in / ${formatNumber(usage.today.outputTokens)} out`);
    console.log(`   비용: ${formatCurrency(usage.today.cost)}`);
    
    console.log(`\n📅 최근 7일:`);
    console.log(`   요청: ${formatNumber(usage.week.requests)}회`);
    console.log(`   토큰: ${formatNumber(usage.week.inputTokens)} in / ${formatNumber(usage.week.outputTokens)} out`);
    console.log(`   비용: ${formatCurrency(usage.week.cost)}`);
    
    console.log(`\n📅 최근 30일:`);
    console.log(`   요청: ${formatNumber(usage.month.requests)}회`);
    console.log(`   토큰: ${formatNumber(usage.month.inputTokens)} in / ${formatNumber(usage.month.outputTokens)} out`);
    console.log(`   비용: ${formatCurrency(usage.month.cost)}`);
    
    console.log(`\n📅 전체:`);
    console.log(`   요청: ${formatNumber(usage.total.requests)}회`);
    console.log(`   토큰: ${formatNumber(usage.total.inputTokens)} in / ${formatNumber(usage.total.outputTokens)} out`);
    console.log(`   비용: ${formatCurrency(usage.total.cost)}`);
    
    if (usage.lastRequest) {
      console.log(`\n⏰ 마지막 요청: ${usage.lastRequest.timestamp}`);
    }
  }
  
  if (cache) {
    console.log('\n📦 캐시 상태');
    console.log('-'.repeat(40));
    console.log(`   캐시된 URL: ${formatNumber(cache.totalUrls)}개`);
    console.log(`   평균 체크 횟수: ${cache.avgCheckCount}회`);
  }
  
  // 예상 비용 계산
  console.log('\n💡 비용 예측 (Haiku 4.5 기준)');
  console.log('-'.repeat(40));
  console.log('   1,000 페이지 분석: ~$3.00');
  console.log('   Batch API 사용 시: ~$1.50 (50% 할인)');
  console.log('   변경 감지 적용 시: ~$0.30 (80% 절감)');
  
  console.log('\n' + '='.repeat(60) + '\n');
}

// 실행
printStats();
