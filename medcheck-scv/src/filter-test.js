/**
 * 필터링 테스트 스크립트
 * 기존 CSV를 읽어서 필터링 결과를 미리보기
 */

const fs = require('fs');
const path = require('path');

// 제외 키워드 (병원명에 다른 진료과가 명시된 경우만)
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

function isSkinClinic(name) {
  if (!name) return false;
  
  // 다른 진료과가 병원명에 명시된 경우 제외
  for (const exclude of EXCLUDE_KEYWORDS) {
    if (name.includes(exclude)) {
      return { pass: false, reason: `제외: ${exclude}` };
    }
  }
  
  // 나머지는 포함 (API에서 피부과로 필터링했으므로)
  return { pass: true, reason: '피부과 등록 의원' };
}

// CSV 파일 찾기
const outputDir = path.join(__dirname, '..', 'output');
const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.csv'));

if (files.length === 0) {
  console.log('CSV 파일이 없습니다.');
  process.exit(1);
}

// 가장 최근 파일 사용
const latestFile = files.sort().reverse()[0];
const csvPath = path.join(outputDir, latestFile);

console.log('='.repeat(60));
console.log('필터링 테스트');
console.log('='.repeat(60));
console.log(`파일: ${latestFile}`);
console.log('');

// CSV 읽기
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split('\n').slice(1).filter(l => l.trim());

let passed = [];
let failed = [];

for (const line of lines) {
  // CSV 파싱 (쉼표가 주소에 포함될 수 있음)
  const match = line.match(/^"?([^",]+)"?,/);
  if (!match) continue;
  
  const name = match[1];
  const result = isSkinClinic(name);
  
  if (result.pass) {
    passed.push({ name, reason: result.reason });
  } else {
    failed.push({ name, reason: result.reason });
  }
}

console.log(`전체: ${lines.length}개`);
console.log(`통과: ${passed.length}개 (${(passed.length/lines.length*100).toFixed(1)}%)`);
console.log(`제외: ${failed.length}개 (${(failed.length/lines.length*100).toFixed(1)}%)`);
console.log('');

// 제외된 병원 샘플
console.log('='.repeat(60));
console.log('제외된 병원 샘플 (50개)');
console.log('='.repeat(60));
failed.slice(0, 50).forEach((item, i) => {
  console.log(`${i+1}. ${item.name} → ${item.reason}`);
});

console.log('');
console.log('='.repeat(60));
console.log('통과한 병원 샘플 (30개)');
console.log('='.repeat(60));
passed.slice(0, 30).forEach((item, i) => {
  console.log(`${i+1}. ${item.name} → ${item.reason}`);
});

// 통계
console.log('');
console.log('='.repeat(60));
console.log('제외 사유별 통계');
console.log('='.repeat(60));
const reasonStats = {};
failed.forEach(item => {
  reasonStats[item.reason] = (reasonStats[item.reason] || 0) + 1;
});
Object.entries(reasonStats)
  .sort((a, b) => b[1] - a[1])
  .forEach(([reason, count]) => {
    console.log(`${reason}: ${count}개`);
  });
