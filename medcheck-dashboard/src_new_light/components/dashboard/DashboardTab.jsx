import { useApp } from '../../contexts/AppContext';

// 등급별 색상 (라이트 테마)
const gradeColors = {
  S: { bg: '#06b6d4', light: '#ecfeff', text: '#0891b2' },
  A: { bg: '#10b981', light: '#ecfdf5', text: '#059669' },
  B: { bg: '#3b82f6', light: '#eff6ff', text: '#2563eb' },
  C: { bg: '#eab308', light: '#fefce8', text: '#ca8a04' },
  D: { bg: '#f97316', light: '#fff7ed', text: '#ea580c' },
  F: { bg: '#ef4444', light: '#fef2f2', text: '#dc2626' },
};

const weatherEmojis = { S: '☀️', A: '🌤️', B: '⛅', C: '🌥️', D: '🌧️', F: '⛈️' };

export default function DashboardTab() {
  const { state, actions } = useApp();
  const { analysisResults, user } = state;
  const { single, batch } = analysisResults;
  
  // 통계 계산
  const totalAnalyzed = batch.length + (single ? 1 : 0);
  const gradeDistribution = batch.reduce((acc, item) => {
    const grade = item.result?.grade || 'F';
    acc[grade] = (acc[grade] || 0) + 1;
    return acc;
  }, {});
  
  const avgCleanScore = batch.length > 0
    ? Math.round(batch.reduce((sum, item) => sum + (item.result?.cleanScore || 0), 0) / batch.length)
    : (single?.cleanScore || 0);
  
  const totalViolations = batch.reduce((sum, item) => 
    sum + (item.result?.violations?.length || 0), 0
  ) + (single?.violations?.length || 0);
  
  // 등급별 퍼센트
  const gradePercent = (grade) => {
    if (totalAnalyzed === 0) return 0;
    return Math.round(((gradeDistribution[grade] || 0) / totalAnalyzed) * 100);
  };

  return (
    <div className="space-y-6">
      {/* 상단 통계 카드 (원형 진행률 스타일) */}
      <div className="grid grid-cols-5 gap-4">
        <StatCardCircle
          title="분석 완료"
          value={totalAnalyzed}
          unit="건"
          percent={100}
          color="#3b82f6"
        />
        <StatCardCircle
          title="청정지수"
          value={avgCleanScore}
          unit="점"
          percent={avgCleanScore}
          color="#10b981"
        />
        <StatCardCircle
          title="위반 건수"
          value={totalViolations}
          unit="건"
          percent={totalViolations > 0 ? Math.min(totalViolations * 10, 100) : 0}
          color="#f97316"
        />
        <StatCardCircle
          title="S/A 등급"
          value={gradePercent('S') + gradePercent('A')}
          unit="%"
          percent={gradePercent('S') + gradePercent('A')}
          color="#06b6d4"
        />
        <StatCardGauge
          title="컴플라이언스"
          value={avgCleanScore}
          color={avgCleanScore >= 70 ? '#10b981' : avgCleanScore >= 40 ? '#eab308' : '#ef4444'}
        />
      </div>
      
      {/* 메인 콘텐츠 영역 */}
      <div className="grid grid-cols-3 gap-6">
        {/* 좌측: 청정지수 추이 차트 */}
        <div className="col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-slate-800">Statistic Graph</h3>
              <p className="text-sm text-slate-500">청정지수 추이</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-slate-800">{avgCleanScore}</span>
              <span className="text-sm text-emerald-500">+{Math.random() > 0.5 ? '3.44' : '1.88'}%</span>
            </div>
          </div>
          
          {/* 라인 차트 (SVG) */}
          <LineChart data={batch} />
          
          <button 
            onClick={() => actions.setTab('analyze')}
            className="mt-4 w-full py-2 text-sm text-slate-500 hover:text-blue-600 text-right"
          >
            DETAILED ANALYSIS →
          </button>
        </div>
        
        {/* 우측: 도넛 차트 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-800">Statistic Graph</h3>
              <p className="text-sm text-slate-500">등급 분포</p>
            </div>
            <select className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded px-2 py-1">
              <option>All stats</option>
            </select>
          </div>
          
          <DonutChart distribution={gradeDistribution} total={totalAnalyzed} />
          
          {/* 범례 */}
          <div className="mt-4 space-y-2">
            {['S', 'A', 'B', 'C', 'D', 'F'].map(grade => (
              <div key={grade} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: gradeColors[grade].bg }}
                  />
                  <span className="text-slate-600">{grade} 등급</span>
                </div>
                <span className="text-slate-800 font-medium">{gradeDistribution[grade] || 0}건</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* 하단 영역 */}
      <div className="grid grid-cols-3 gap-6">
        {/* 최근 분석 테이블 */}
        <div className="col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-800">Statistic Graph</h3>
              <p className="text-sm text-slate-500">최근 분석 결과</p>
            </div>
            <div className="flex gap-2">
              <select className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                <option>All stats</option>
              </select>
              <select className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                <option>All categories</option>
              </select>
            </div>
          </div>
          
          <ResultTable results={batch} single={single} onSelect={(r) => {
            actions.setSingleResult(r);
            actions.setTab('violations');
          }} />
        </div>
        
        {/* 스파크라인 카드들 */}
        <div className="space-y-4">
          <SparklineCard
            label="위반 추이"
            value={totalViolations}
            change="+12%"
            positive={false}
            color="#ef4444"
          />
          <SparklineCard
            label="분석 건수"
            value={totalAnalyzed}
            change="+34.4%"
            positive={true}
            color="#3b82f6"
          />
          <SparklineCard
            label="개선율"
            value="67"
            unit="%"
            change="+8%"
            positive={true}
            color="#10b981"
          />
        </div>
      </div>
      
      {/* 분석 없을 때 */}
      {!single && batch.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
          <div className="text-6xl mb-4">📊</div>
          <h4 className="text-xl font-bold text-slate-800 mb-2">데이터가 없습니다</h4>
          <p className="text-slate-500 mb-6">URL이나 텍스트를 분석해서 대시보드를 채워보세요</p>
          <button
            onClick={() => actions.setTab('analyze')}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl transition-colors"
          >
            🔍 분석 시작하기
          </button>
        </div>
      )}
    </div>
  );
}

// 원형 진행률 카드
function StatCardCircle({ title, value, unit, percent, color }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;
  
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500 mb-1">{title}</p>
          <p className="text-2xl font-bold text-slate-800">
            {value}<span className="text-sm text-slate-400 ml-1">{unit}</span>
          </p>
        </div>
        <div className="relative w-20 h-20">
          <svg className="w-20 h-20 -rotate-90">
            <circle
              cx="40" cy="40" r={radius}
              stroke="#e2e8f0" strokeWidth="6" fill="none"
            />
            <circle
              cx="40" cy="40" r={radius}
              stroke={color} strokeWidth="6" fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-700">
            {percent}%
          </span>
        </div>
      </div>
    </div>
  );
}

// 게이지 카드
function StatCardGauge({ title, value, color }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
      <p className="text-sm text-slate-500 mb-3">{title}</p>
      <div className="relative h-16 flex items-end justify-center">
        <svg viewBox="0 0 100 50" className="w-full h-full">
          {/* 배경 반원 */}
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none" stroke="#e2e8f0" strokeWidth="8"
          />
          {/* 값 표시 */}
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={`${value * 1.26} 126`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute bottom-0 text-lg font-bold text-slate-800">{value}%</span>
      </div>
    </div>
  );
}

// 라인 차트
function LineChart({ data }) {
  const height = 200;
  const width = 600;
  const padding = 40;
  
  // 데이터가 없으면 더미 데이터
  const scores = data.length > 0 
    ? data.slice(-12).map(d => d.result?.cleanScore || 50)
    : [65, 70, 68, 75, 72, 78, 80, 77, 85, 82, 88, 85];
  
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const maxScore = Math.max(...scores, 100);
  const minScore = Math.min(...scores, 0);
  const range = maxScore - minScore || 1;
  
  const points = scores.map((score, i) => {
    const x = padding + (i / (scores.length - 1)) * (width - padding * 2);
    const y = height - padding - ((score - minScore) / range) * (height - padding * 2);
    return { x, y, score };
  });
  
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length-1].x} ${height - padding} L ${padding} ${height - padding} Z`;
  
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48">
      {/* 그리드 라인 */}
      {[0, 25, 50, 75, 100].map(v => {
        const y = height - padding - (v / 100) * (height - padding * 2);
        return (
          <g key={v}>
            <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#e2e8f0" strokeDasharray="4" />
            <text x={padding - 10} y={y + 4} textAnchor="end" className="text-xs fill-slate-400">{v}</text>
          </g>
        );
      })}
      
      {/* X축 레이블 */}
      {months.slice(0, scores.length).map((m, i) => {
        const x = padding + (i / (scores.length - 1)) * (width - padding * 2);
        return (
          <text key={m} x={x} y={height - 10} textAnchor="middle" className="text-xs fill-slate-400">{m}</text>
        );
      })}
      
      {/* 영역 채우기 */}
      <defs>
        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#areaGradient)" />
      
      {/* 라인 */}
      <path d={linePath} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      
      {/* 데이터 포인트 */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="4" fill="white" stroke="#10b981" strokeWidth="2" />
      ))}
    </svg>
  );
}

// 도넛 차트
function DonutChart({ distribution, total }) {
  const size = 160;
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  
  const grades = ['S', 'A', 'B', 'C', 'D', 'F'];
  let offset = 0;
  
  return (
    <div className="relative flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {total > 0 ? grades.map(grade => {
          const count = distribution[grade] || 0;
          const percent = count / total;
          const dash = percent * circumference;
          const currentOffset = offset;
          offset += dash;
          
          if (count === 0) return null;
          
          return (
            <circle
              key={grade}
              cx={size/2} cy={size/2} r={radius}
              fill="none"
              stroke={gradeColors[grade].bg}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-currentOffset}
              className="transition-all duration-500"
            />
          );
        }) : (
          <circle
            cx={size/2} cy={size/2} r={radius}
            fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth}
          />
        )}
      </svg>
      <div className="absolute text-center">
        <p className="text-3xl font-bold text-slate-800">{total}</p>
        <p className="text-xs text-slate-500">총 분석</p>
      </div>
    </div>
  );
}

// 결과 테이블
function ResultTable({ results, single, onSelect }) {
  const allResults = [
    ...(single ? [{ url: single.url || '텍스트 분석', result: single }] : []),
    ...results.slice(0, 7)
  ];
  
  if (allResults.length === 0) {
    return <p className="text-slate-400 text-center py-8">분석 결과가 없습니다</p>;
  }
  
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-50">
            <th className="text-left py-3 px-4 text-xs font-medium text-slate-500">#</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-slate-500">URL</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-slate-500">등급</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-slate-500">점수</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-slate-500">위반</th>
          </tr>
        </thead>
        <tbody>
          {allResults.map((item, i) => {
            const grade = item.result?.grade || 'F';
            const colors = gradeColors[grade];
            const isOdd = i % 2 === 1;
            
            return (
              <tr 
                key={i}
                onClick={() => item.result && onSelect(item.result)}
                className={`cursor-pointer transition-colors ${
                  isOdd ? 'bg-blue-50/50' : 'bg-white'
                } hover:bg-blue-100/50`}
              >
                <td className="py-3 px-4">
                  <span 
                    className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: colors.bg }}
                  >
                    {i + 1}
                  </span>
                </td>
                <td className="py-3 px-4 text-sm text-slate-700 max-w-[200px] truncate">
                  {item.url}
                </td>
                <td className="py-3 px-4">
                  <span 
                    className="px-2 py-1 rounded text-xs font-bold"
                    style={{ backgroundColor: colors.light, color: colors.text }}
                  >
                    {grade}
                  </span>
                </td>
                <td className="py-3 px-4 text-sm font-medium text-slate-800">
                  {item.result?.cleanScore || 0}점
                </td>
                <td className="py-3 px-4 text-sm text-slate-600">
                  {item.result?.violations?.length || 0}건
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// 스파크라인 카드
function SparklineCard({ label, value, unit = '', change, positive, color }) {
  // 랜덤 스파크라인 데이터
  const sparkData = Array.from({ length: 20 }, () => Math.random() * 50 + 25);
  const max = Math.max(...sparkData);
  const min = Math.min(...sparkData);
  
  const points = sparkData.map((v, i) => {
    const x = (i / (sparkData.length - 1)) * 120;
    const y = 30 - ((v - min) / (max - min)) * 25;
    return `${x},${y}`;
  }).join(' ');
  
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">
            {value}<span className="text-sm text-slate-400">{unit}</span>
          </p>
        </div>
        <span className={`text-xs font-medium ${positive ? 'text-emerald-500' : 'text-red-500'}`}>
          {change}
        </span>
      </div>
      
      <svg viewBox="0 0 120 35" className="w-full h-10">
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
