import React, { useState, useEffect } from 'react';
import PriceAnalytics from './PriceAnalytics';

// ============================================
// MEDCHECK Engine 대시보드 v2.0 - 레퍼런스 스타일
// 사이드바 + 라이트 테마 + 차트 위젯
// ============================================

const API_BASE = 'https://medcheck-engine.mmakid.workers.dev';

export default function MedCheckDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // 기존 데이터
  const [healthData, setHealthData] = useState(null);
  const [fpStats, setFpStats] = useState({ byType: [], summary: {} });
  const [suggestions, setSuggestions] = useState([]);
  const [tricks, setTricks] = useState([]);
  const [tricksStats, setTricksStats] = useState({ summary: {} });

  // 시술가격 v2 데이터
  const [priceStats, setPriceStats] = useState({ summary: {}, byArea: [], pendingMappings: 0 });
  const [procedures, setProcedures] = useState([]);
  const [selectedProcedure, setSelectedProcedure] = useState(null);
  const [procedureDetail, setProcedureDetail] = useState(null);
  const [targetAreas, setTargetAreas] = useState([]);
  const [selectedArea, setSelectedArea] = useState('');
  const [priceCompare, setPriceCompare] = useState(null);

  // 매핑 후보
  const [mappingCandidates, setMappingCandidates] = useState([]);

  // 가격 알림
  const [priceAlerts, setPriceAlerts] = useState([]);
  const [selectedAlert, setSelectedAlert] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    setLoading(true);
    await Promise.all([
      fetch(`${API_BASE}/v1/health`).then(r => r.json()).then(d => setHealthData(d)).catch(() => { }),
      fetch(`${API_BASE}/v1/false-positives/stats`).then(r => r.json()).then(d => d.success && setFpStats(d.data || {})).catch(() => { }),
      fetch(`${API_BASE}/v1/exception-suggestions?status=pending`).then(r => r.json()).then(d => d.success && setSuggestions(d.data || [])).catch(() => { }),
      fetch(`${API_BASE}/v1/tricks/stats`).then(r => r.json()).then(d => d.success && setTricksStats(d.data || {})).catch(() => { }),
      fetch(`${API_BASE}/v2/prices/stats`).then(r => r.json()).then(d => d.success && setPriceStats(d.data || {})).catch(() => { }),
      fetch(`${API_BASE}/v1/procedures?hasPrice=true`).then(r => r.json()).then(d => d.success && setProcedures(d.data || [])).catch(() => { }),
      fetch(`${API_BASE}/v1/target-areas`).then(r => r.json()).then(d => d.success && setTargetAreas(d.data || [])).catch(() => { }),
      fetch(`${API_BASE}/v1/mapping-candidates?status=pending_review`).then(r => r.json()).then(d => d.success && setMappingCandidates(d.data || [])).catch(() => { }),
      fetch(`${API_BASE}/v1/price-alerts?isRead=false`).then(r => r.json()).then(d => d.success && setPriceAlerts(d.data || [])).catch(() => { }),
    ]);
    setLoading(false);
  };

  const loadProcedureDetail = async (id) => {
    const res = await fetch(`${API_BASE}/v1/procedures/${id}`);
    const d = await res.json();
    if (d.success) { setProcedureDetail(d.data); setSelectedProcedure(id); }
  };

  const loadPriceCompare = async (procedureId, targetArea) => {
    let url = `${API_BASE}/v2/prices/compare/${procedureId}`;
    if (targetArea) url += `?targetArea=${targetArea}`;
    const res = await fetch(url);
    const d = await res.json();
    if (d.success) setPriceCompare(d.data);
  };

  const loadAlertDetail = async (id) => {
    const res = await fetch(`${API_BASE}/v1/price-alerts/${id}`);
    const d = await res.json();
    if (d.success) setSelectedAlert(d.data);
  };

  const approveMappingCandidate = async (id) => {
    const res = await fetch(`${API_BASE}/v1/mapping-candidates/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if ((await res.json()).success) { alert('✅ 매핑 승인!'); loadAllData(); }
  };

  const rejectMappingCandidate = async (id, reason) => {
    await fetch(`${API_BASE}/v1/mapping-candidates/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
    loadAllData();
  };

  const formatPrice = (price) => {
    if (!price) return '-';
    if (price >= 10000) return (price / 10000).toFixed(0) + '만원';
    return price.toLocaleString() + '원';
  };

  // 사이드바 메뉴
  const menuItems = [
    { id: 'overview', name: '분석', icon: '🔍' },
    { id: 'batch', name: '배치분석', icon: '📁' },
    { id: 'adcheck', name: '에드체크', icon: '✅' },
    { id: 'pricing', name: '시술가격', icon: '💰', badge: priceAlerts.length },
    { id: 'alerts', name: '가격알림', icon: '🔔', badge: priceAlerts.filter(a => !a.is_read).length },
    { id: 'mapping', name: '매핑승인', icon: '🔄', badge: mappingCandidates.length },
    { id: 'fp', name: '예외/오탐', icon: '⚠️', badge: fpStats.summary?.pending || 0 },
    { id: 'tricks', name: '꼼수', icon: '🎭', badge: tricksStats.summary?.total || 0 },
    { id: 'performance', name: '성능', icon: '📈' },
    { id: 'history', name: '이력', icon: '📜' },
    { id: 'priceAnalytics', name: '가격분석', icon: '📊' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500">API 연결 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f4f8] flex">
      {/* ========== 사이드바 ========== */}
      <aside className={`${sidebarCollapsed ? 'w-20' : 'w-60'} bg-gradient-to-b from-[#1a2744] to-[#0d1829] flex flex-col transition-all duration-300 shadow-xl`}>
        {/* 로고 */}
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg">
              M
            </div>
            {!sidebarCollapsed && (
              <div>
                <h1 className="text-white font-bold tracking-tight">MADMEDCHECK</h1>
                <p className="text-slate-400 text-xs">의료광고 컴플라이언스</p>
              </div>
            )}
          </div>
        </div>

        {/* 상태 뱃지 */}
        {!sidebarCollapsed && (
          <div className="mx-4 mt-4 p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-emerald-400 text-sm font-medium">{healthData?.status || 'connected'}</span>
            </div>
          </div>
        )}

        {/* 메뉴 */}
        <nav className="flex-1 p-3 mt-2 overflow-y-auto">
          <ul className="space-y-1">
            {menuItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 group ${
                    activeTab === item.id
                      ? 'bg-white text-slate-800 shadow-lg'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className={`text-xl ${activeTab === item.id ? '' : 'group-hover:scale-110'} transition-transform`}>
                    {item.icon}
                  </span>
                  {!sidebarCollapsed && (
                    <>
                      <span className="text-sm font-medium flex-1">{item.name}</span>
                      {item.badge > 0 && (
                        <span className={`min-w-[20px] h-5 flex items-center justify-center text-xs font-bold rounded-full ${
                          item.id === 'alerts' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* 하단 */}
        <div className="p-4 border-t border-white/10">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full py-2 text-slate-400 hover:text-white text-sm rounded-lg hover:bg-white/5 transition-all"
          >
            {sidebarCollapsed ? '→' : '← 접기'}
          </button>
          {!sidebarCollapsed && (
            <div className="mt-3 text-center">
              <p className="text-slate-500 text-xs">Need Help?</p>
              <p className="text-slate-400 text-xs hover:text-white cursor-pointer">Contact Us</p>
            </div>
          )}
        </div>
      </aside>

      {/* ========== 메인 콘텐츠 ========== */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* 헤더 */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <h2 className="text-xl font-bold text-slate-800">
                {menuItems.find(t => t.id === activeTab)?.name || '대시보드'}
              </h2>
              {/* 필터 드롭다운 */}
              <div className="flex items-center gap-3">
                <select className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option>All stats</option>
                  <option>이번 주</option>
                  <option>이번 달</option>
                </select>
                <select className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option>All categories</option>
                  <option>위반 유형</option>
                  <option>심각도</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* 검색 */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="검색..."
                  className="w-48 text-sm bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              </div>
              <span className="text-slate-400 text-sm">{currentTime.toLocaleTimeString()}</span>
              <button onClick={loadAllData} className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
                🔄
              </button>
              {/* 프로필 */}
              <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                A
              </div>
            </div>
          </div>
        </header>

        {/* 메인 콘텐츠 영역 */}
        <main className="flex-1 overflow-auto p-6">
          {activeTab === 'overview' && <AnalyzeTab apiBase={API_BASE} />}
          {activeTab === 'batch' && <BatchAnalyzeTab apiBase={API_BASE} />}
          {activeTab === 'adcheck' && <AdCheckTab apiBase={API_BASE} />}
          {activeTab === 'pricing' && (
            <PricingTab 
              priceStats={priceStats}
              procedures={procedures}
              targetAreas={targetAreas}
              selectedArea={selectedArea}
              setSelectedArea={setSelectedArea}
              selectedProcedure={selectedProcedure}
              loadProcedureDetail={loadProcedureDetail}
              loadPriceCompare={loadPriceCompare}
              priceCompare={priceCompare}
              formatPrice={formatPrice}
            />
          )}
          {activeTab === 'alerts' && (
            <AlertsTab 
              priceAlerts={priceAlerts}
              selectedAlert={selectedAlert}
              loadAlertDetail={loadAlertDetail}
              formatPrice={formatPrice}
            />
          )}
          {activeTab === 'mapping' && (
            <MappingTab 
              mappingCandidates={mappingCandidates}
              approveMappingCandidate={approveMappingCandidate}
              rejectMappingCandidate={rejectMappingCandidate}
            />
          )}
          {activeTab === 'fp' && (
            <FalsePositiveTab apiBase={API_BASE} fpStats={fpStats} suggestions={suggestions} onRefresh={loadAllData} />
          )}
          {activeTab === 'tricks' && <TricksTab apiBase={API_BASE} tricksStats={tricksStats} />}
          {activeTab === 'performance' && <PerformanceTab apiBase={API_BASE} />}
          {activeTab === 'history' && <HistoryTab apiBase={API_BASE} />}
          {activeTab === 'priceAnalytics' && <PriceAnalytics />}
        </main>
      </div>
    </div>
  );
}

// ============================================
// 원형 진행률 카드 (레퍼런스 스타일)
// ============================================
function CircleStatCard({ title, value, percent, color = '#3b82f6', subtitle }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-slate-500 text-sm mb-1">{title}</p>
          <p className="text-slate-400 text-xs">{subtitle}</p>
        </div>
        <div className="relative w-24 h-24">
          <svg className="w-24 h-24 -rotate-90">
            <circle cx="48" cy="48" r={radius} stroke="#e2e8f0" strokeWidth="8" fill="none" />
            <circle
              cx="48" cy="48" r={radius}
              stroke={color} strokeWidth="8" fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-slate-800">{value}</span>
            <span className="text-xs text-slate-400">{percent}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 일반 StatCard (라이트 테마)
// ============================================
function StatCard({ title, value, color, change }) {
  const styles = {
    cyan: { text: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-100' },
    yellow: { text: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-100' },
    purple: { text: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
    orange: { text: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
    slate: { text: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-100' },
    emerald: { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    blue: { text: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
    red: { text: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' }
  };
  const style = styles[color] || styles.blue;
  
  return (
    <div className={`rounded-2xl p-5 border shadow-sm hover:shadow-md transition-all ${style.bg} ${style.border}`}>
      <p className="text-slate-500 text-sm mb-2">{title}</p>
      <div className="flex items-end justify-between">
        <p className={`text-3xl font-bold ${style.text}`}>{value}</p>
        {change && (
          <span className={`text-sm font-medium ${change.startsWith('+') ? 'text-emerald-500' : 'text-red-500'}`}>
            {change}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================
// 라인 차트 (SVG)
// ============================================
function LineChart({ data = [], height = 200 }) {
  const width = 600;
  const padding = 50;
  
  // 더미 데이터
  const chartData = data.length > 0 ? data : [65, 70, 68, 75, 72, 78, 80, 77, 82, 85, 83, 88];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const maxVal = Math.max(...chartData);
  const minVal = Math.min(...chartData);
  const range = maxVal - minVal || 1;
  
  const points = chartData.map((val, i) => {
    const x = padding + (i / (chartData.length - 1)) * (width - padding * 2);
    const y = height - padding - ((val - minVal) / range) * (height - padding * 2);
    return { x, y, val };
  });
  
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${padding} ${height - padding} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
      {/* 그리드 */}
      {[0, 25, 50, 75, 100].map((v) => {
        const y = height - padding - (v / 100) * (height - padding * 2);
        return (
          <g key={v}>
            <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#e2e8f0" strokeDasharray="4" />
            <text x={padding - 10} y={y + 4} textAnchor="end" className="text-xs" fill="#94a3b8">{v}</text>
          </g>
        );
      })}
      
      {/* X축 */}
      {months.slice(0, chartData.length).map((m, i) => {
        const x = padding + (i / (chartData.length - 1)) * (width - padding * 2);
        return <text key={m} x={x} y={height - 15} textAnchor="middle" className="text-xs" fill="#94a3b8">{m}</text>;
      })}
      
      {/* 영역 */}
      <defs>
        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#areaGradient)" />
      
      {/* 라인 */}
      <path d={linePath} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      
      {/* 포인트 */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="5" fill="white" stroke="#10b981" strokeWidth="3" />
      ))}
    </svg>
  );
}

// ============================================
// 도넛 차트
// ============================================
function DonutChart({ data = {}, size = 180 }) {
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  
  const grades = ['S', 'A', 'B', 'C', 'D', 'F'];
  const colors = {
    S: '#06b6d4', A: '#10b981', B: '#3b82f6',
    C: '#eab308', D: '#f97316', F: '#ef4444'
  };
  
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
  let offset = 0;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        {grades.map((grade) => {
          const count = data[grade] || 0;
          const percent = count / total;
          const dash = percent * circumference;
          const currentOffset = offset;
          offset += dash;
          
          if (count === 0) return null;
          
          return (
            <circle
              key={grade}
              cx={size / 2} cy={size / 2} r={radius}
              fill="none"
              stroke={colors[grade]}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-currentOffset}
              className="transition-all duration-500"
            />
          );
        })}
        {total === 0 && (
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
        )}
      </svg>
      <div className="absolute text-center">
        <p className="text-3xl font-bold text-slate-800">{total}</p>
        <p className="text-sm text-slate-400">총 분석</p>
      </div>
    </div>
  );
}

// ============================================
// 스파크라인 카드
// ============================================
function SparklineCard({ label, value, change, positive = true, color = '#3b82f6' }) {
  const sparkData = Array.from({ length: 20 }, () => Math.random() * 50 + 25);
  const max = Math.max(...sparkData);
  const min = Math.min(...sparkData);
  
  const points = sparkData.map((v, i) => {
    const x = (i / (sparkData.length - 1)) * 120;
    const y = 30 - ((v - min) / (max - min || 1)) * 25;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-slate-500 text-sm">{label}</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
        </div>
        <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${positive ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
          {change}
        </span>
      </div>
      <svg viewBox="0 0 120 35" className="w-full h-10">
        <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ============================================
// 분석 탭 (리디자인)
// ============================================
function AnalyzeTab({ apiBase }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [enableAI, setEnableAI] = useState(false);

  const analyze = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/v1/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, enableAI, options: { detailed: true } })
      });
      const data = await res.json();
      if (data.success) setResult(data.data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const gradeColors = {
    'S': { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200' },
    'A': { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
    'B': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
    'C': { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' },
    'D': { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
    'F': { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' }
  };

  return (
    <div className="space-y-6">
      {/* 상단 통계 카드들 */}
      <div className="grid grid-cols-4 gap-4">
        <CircleStatCard title="분석 완료" value="0" percent={0} color="#3b82f6" subtitle="전체 현황" />
        <CircleStatCard title="청정지수" value="0" percent={0} color="#10b981" subtitle="평균 점수" />
        <CircleStatCard title="위반 건수" value="0" percent={0} color="#f97316" subtitle="총 발견" />
        <CircleStatCard title="S/A 등급" value="0%" percent={0} color="#06b6d4" subtitle="비율" />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* 입력 영역 */}
        <div className="col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">🔍 실시간 광고 분석</h3>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="분석할 광고 텍스트를 입력하세요..."
            className="w-full h-40 bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
          <div className="flex items-center justify-between mt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enableAI}
                onChange={(e) => setEnableAI(e.target.checked)}
                className="w-5 h-5 rounded border-slate-300 text-blue-500 focus:ring-blue-400"
              />
              <span className="text-slate-600">AI 분석 (Claude)</span>
            </label>
            <button
              onClick={analyze}
              disabled={loading || !text.trim()}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-medium shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? '분석 중...' : '분석하기'}
            </button>
          </div>
        </div>

        {/* 결과 미리보기 또는 안내 */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          {result ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-slate-800">분석 결과</h4>
                <span className="text-2xl">{result.score?.gradeInfo?.emoji || '📊'}</span>
              </div>
              <div className={`text-center py-6 rounded-xl border ${gradeColors[result.grade]?.bg} ${gradeColors[result.grade]?.border}`}>
                <p className={`text-5xl font-bold ${gradeColors[result.grade]?.text}`}>{result.grade}</p>
                <p className="text-slate-600 mt-2">{result.score?.gradeInfo?.status || '등급'}</p>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-500">청정지수</span>
                  <span className="font-bold text-slate-800">{result.score?.cleanScore || 0}점</span>
                </div>
                <div className="flex justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-500">위반 항목</span>
                  <span className="font-bold text-red-600">{result.violationCount || 0}건</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center py-8">
              <div className="text-5xl mb-4">📋</div>
              <p className="text-slate-500">텍스트를 입력하고<br/>분석 버튼을 누르세요</p>
            </div>
          )}
        </div>
      </div>

      {/* 위반 상세 */}
      {result?.violations?.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <h4 className="font-bold text-slate-800 mb-4">⚠️ 위반 내역 ({result.violations.length}건)</h4>
          <div className="space-y-3">
            {result.violations.map((v, i) => (
              <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
                <div className="flex items-start gap-3">
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-lg ${
                    v.severity === 'critical' ? 'bg-red-100 text-red-600' :
                    v.severity === 'major' ? 'bg-orange-100 text-orange-600' :
                    'bg-yellow-100 text-yellow-600'
                  }`}>{v.severity}</span>
                  <div className="flex-1">
                    <p className="font-medium text-slate-800">{v.description}</p>
                    <p className="text-slate-500 text-sm mt-1">
                      발견: "<span className="text-red-500 font-medium">{v.matchedText}</span>"
                    </p>
                    {v.suggestion && (
                      <p className="text-blue-600 text-sm mt-2 flex items-center gap-1">
                        💡 {v.suggestion}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// 에드체크 탭
// ============================================
function AdCheckTab({ apiBase }) {
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [hospitalDetail, setHospitalDetail] = useState(null);
  const [filter, setFilter] = useState({ grade: '', sido: '' });
  const [stats, setStats] = useState(null);

  useEffect(() => { loadData(); }, [filter]);

  const loadData = async () => {
    setLoading(true);
    try {
      let url = `${apiBase}/v1/analysis-results?limit=100`;
      if (filter.grade) url += `&grade=${filter.grade}`;
      if (filter.sido) url += `&sido=${filter.sido}`;

      const [resultsRes, statsRes] = await Promise.all([
        fetch(url).then(r => r.json()),
        fetch(`${apiBase}/v1/analysis-results/stats`).then(r => r.json())
      ]);

      if (resultsRes.success) setHospitals(resultsRes.data || []);
      if (statsRes.success) setStats(statsRes.data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const loadHospitalDetail = async (id) => {
    try {
      const res = await fetch(`${apiBase}/v1/analysis-results/${id}`);
      const data = await res.json();
      if (data.success) {
        setHospitalDetail(data.data);
        setSelectedHospital(id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const gradeColors = {
    'S': { bg: 'bg-cyan-100', text: 'text-cyan-700' },
    'A': { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    'B': { bg: 'bg-blue-100', text: 'text-blue-700' },
    'C': { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    'D': { bg: 'bg-orange-100', text: 'text-orange-700' },
    'F': { bg: 'bg-red-100', text: 'text-red-700' }
  };

  // 등급별 분포 계산
  const gradeDistribution = hospitals.reduce((acc, h) => {
    acc[h.grade] = (acc[h.grade] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* 상단 통계 */}
      <div className="grid grid-cols-5 gap-4">
        <CircleStatCard title="전체 병원" value={stats?.total || hospitals.length} percent={100} color="#3b82f6" subtitle="분석 완료" />
        <CircleStatCard title="S/A 등급" value={`${((gradeDistribution['S'] || 0) + (gradeDistribution['A'] || 0))}개`} percent={Math.round(((gradeDistribution['S'] || 0) + (gradeDistribution['A'] || 0)) / (hospitals.length || 1) * 100)} color="#10b981" subtitle="우수" />
        <CircleStatCard title="C 등급" value={`${gradeDistribution['C'] || 0}개`} percent={Math.round((gradeDistribution['C'] || 0) / (hospitals.length || 1) * 100)} color="#eab308" subtitle="주의" />
        <CircleStatCard title="D/F 등급" value={`${(gradeDistribution['D'] || 0) + (gradeDistribution['F'] || 0)}개`} percent={Math.round(((gradeDistribution['D'] || 0) + (gradeDistribution['F'] || 0)) / (hospitals.length || 1) * 100)} color="#ef4444" subtitle="위험" />
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-center">
          <DonutChart data={gradeDistribution} size={120} />
        </div>
      </div>

      {/* 필터 */}
      <div className="flex gap-3">
        <select
          value={filter.grade}
          onChange={(e) => setFilter(f => ({ ...f, grade: e.target.value }))}
          className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
        >
          <option value="">전체 등급</option>
          {['S', 'A', 'B', 'C', 'D', 'F'].map(g => <option key={g} value={g}>{g}등급</option>)}
        </select>
        <button onClick={loadData} className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-medium transition-colors">
          🔄 새로고침
        </button>
      </div>

      {/* 병원 목록 + 상세 */}
      <div className="grid grid-cols-2 gap-6">
        {/* 병원 목록 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <h4 className="font-bold text-slate-800">✅ 병원별 위반 현황</h4>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-400">로딩 중...</div>
          ) : hospitals.length > 0 ? (
            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {hospitals.map((h, i) => (
                <div
                  key={h.id || i}
                  onClick={() => loadHospitalDetail(h.id)}
                  className={`p-4 cursor-pointer transition-colors ${selectedHospital === h.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-800">{h.hospital_name}</p>
                      <p className="text-slate-400 text-sm">{h.sido} {h.sigungu}</p>
                    </div>
                    <div className="text-right">
                      <span className={`px-3 py-1 rounded-lg font-bold text-sm ${gradeColors[h.grade]?.bg} ${gradeColors[h.grade]?.text}`}>
                        {h.grade}
                      </span>
                      <p className="text-slate-400 text-xs mt-1">위반 {h.violation_count || 0}건</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400">분석 결과가 없습니다</div>
          )}
        </div>

        {/* 상세 정보 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <h4 className="font-bold text-slate-800">📋 위반 상세 내역</h4>
          </div>
          {hospitalDetail ? (
            <div className="p-5 space-y-4 max-h-[500px] overflow-y-auto">
              {/* 병원 정보 */}
              <div className="bg-slate-50 rounded-xl p-4">
                <h5 className="font-bold text-lg text-slate-800">{hospitalDetail.hospital_name}</h5>
                <p className="text-slate-500 text-sm">{hospitalDetail.sido} {hospitalDetail.sigungu}</p>
                <div className="flex items-center gap-3 mt-3">
                  <span className={`px-3 py-1.5 rounded-lg font-bold ${gradeColors[hospitalDetail.grade]?.bg} ${gradeColors[hospitalDetail.grade]?.text}`}>
                    {hospitalDetail.grade}등급
                  </span>
                </div>
              </div>

              {/* 위반 요약 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-red-50 rounded-xl p-3 text-center border border-red-100">
                  <p className="text-xs text-red-500">Critical</p>
                  <p className="text-xl font-bold text-red-600">{hospitalDetail.critical_count || 0}</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-3 text-center border border-orange-100">
                  <p className="text-xs text-orange-500">Major</p>
                  <p className="text-xl font-bold text-orange-600">{hospitalDetail.major_count || 0}</p>
                </div>
                <div className="bg-yellow-50 rounded-xl p-3 text-center border border-yellow-100">
                  <p className="text-xs text-yellow-600">Minor</p>
                  <p className="text-xl font-bold text-yellow-700">{hospitalDetail.minor_count || 0}</p>
                </div>
              </div>

              {/* 위반 목록 */}
              {hospitalDetail.violations?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-500">위반 내역:</p>
                  {hospitalDetail.violations.map((v, i) => (
                    <div key={i} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div className="flex items-start gap-2">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                          v.severity === 'critical' ? 'bg-red-100 text-red-600' :
                          v.severity === 'major' ? 'bg-orange-100 text-orange-600' :
                          'bg-yellow-100 text-yellow-600'
                        }`}>{v.severity}</span>
                        <div className="flex-1">
                          <p className="font-medium text-slate-700 text-sm">{v.description || v.pattern_description}</p>
                          {v.matched && <p className="text-slate-400 text-xs mt-1">발견: "{v.matched}"</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400">
              <div className="text-4xl mb-3">👈</div>
              <p>왼쪽에서 병원을 선택하세요</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// 배치분석 탭
// ============================================
function BatchAnalyzeTab({ apiBase }) {
  const [file, setFile] = useState(null);
  const [hospitals, setHospitals] = useState([]);
  const [results, setResults] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [dragOver, setDragOver] = useState(false);
  const [enableAI, setEnableAI] = useState(false);

  const parseCSV = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      console.log('❌ 데이터가 2줄 미만');
      return [];
    }
    
    // 구분자 자동 감지 (탭, 콤마, 세미콜론)
    const firstLine = lines[0];
    let delimiter = ',';
    if (firstLine.includes('\t')) delimiter = '\t';
    else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';
    console.log('🔸 감지된 구분자:', delimiter === '\t' ? 'TAB' : delimiter);
    
    // 헤더 파싱
    const headers = firstLine.split(delimiter).map(h => h.trim().replace(/"/g, '').toLowerCase());
    console.log('📋 CSV 헤더:', headers);
    
    // 더 유연한 컬럼 매칭
    const urlIndex = headers.findIndex(h => 
      h.includes('홈페이지') || h.includes('url') || h.includes('website') || 
      h.includes('링크') || h.includes('link') || h.includes('사이트') || h.includes('웹')
    );
    const nameIndex = headers.findIndex(h => 
      h.includes('병원') || h.includes('이름') || h.includes('name') || 
      h.includes('업체') || h.includes('상호') || h.includes('기관')
    );
    const addrIndex = headers.findIndex(h => h.includes('주소') || h.includes('address') || h.includes('소재지'));
    const sidoIndex = headers.findIndex(h => h.includes('시도') || h.includes('지역') || h.includes('광역'));

    console.log('🔍 컬럼 인덱스 - 이름:', nameIndex, ', URL:', urlIndex, ', 주소:', addrIndex, ', 시도:', sidoIndex);

    // 컬럼을 못 찾으면 첫 번째 줄 데이터로 URL 자동 감지 시도
    let autoUrlIndex = urlIndex;
    let autoNameIndex = nameIndex;
    
    if (lines.length > 1) {
      const firstDataCols = lines[1].split(delimiter).map(c => c.trim().replace(/"/g, ''));
      console.log('📄 첫 번째 데이터 행:', firstDataCols);
      
      // URL 자동 감지: http 포함된 컬럼 찾기
      if (autoUrlIndex === -1) {
        autoUrlIndex = firstDataCols.findIndex(c => c.includes('http') || c.includes('www.'));
        if (autoUrlIndex !== -1) console.log('🔗 URL 자동 감지됨, 인덱스:', autoUrlIndex);
      }
      
      // 이름 자동 감지: 첫 번째 컬럼 (URL이 아닌 경우)
      if (autoNameIndex === -1) {
        autoNameIndex = autoUrlIndex === 0 ? 1 : 0;
        console.log('📝 이름 자동 감지됨, 인덱스:', autoNameIndex);
      }
    }

    const results = lines.slice(1).map((line, idx) => {
      // 동일한 구분자로 파싱
      const cols = line.split(delimiter).map(c => c.trim().replace(/"/g, ''));
      
      return { 
        id: idx, 
        name: cols[autoNameIndex] || cols[0] || '', 
        address: cols[addrIndex] || '', 
        url: cols[autoUrlIndex] || '', 
        sido: cols[sidoIndex] || '' 
      };
    }).filter(h => h.name);
    
    console.log('✅ 최종 파싱 결과:', results.length, '개');
    if (results.length > 0) console.log('📋 첫 번째 항목:', results[0]);
    
    return results;
  };

  const handleFile = async (f) => {
    if (!f) return;
    console.log('파일 선택됨:', f.name);
    setFile(f);
    try {
      const text = await f.text();
      const parsed = parseCSV(text);
      console.log('파싱 결과:', parsed.length, '개 병원');
      setHospitals(parsed);
      setResults([]);
    } catch (e) {
      console.error('파일 읽기 오류:', e);
      alert('파일을 읽을 수 없습니다: ' + e.message);
    }
  };

  const handleInputChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const runAnalysis = async () => {
    if (hospitals.length === 0) return;
    setAnalyzing(true);
    setResults([]);
    setProgress({ current: 0, total: hospitals.length });

    const newResults = [];
    for (let i = 0; i < hospitals.length; i++) {
      const h = hospitals[i];
      setProgress({ current: i + 1, total: hospitals.length });

      if (!h.url) {
        newResults.push({ ...h, status: 'skip', grade: '-', violationCount: 0, summary: '홈페이지 없음' });
        continue;
      }

      try {
        const res = await fetch(`${apiBase}/v1/analyze-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: h.url, enableAI })
        });
        const data = await res.json();
        if (data.success) {
          newResults.push({ ...h, status: 'success', grade: data.data.grade, violationCount: data.data.violationCount, summary: `${data.data.violationCount}건 위반` });
        } else {
          newResults.push({ ...h, status: 'error', grade: '-', violationCount: 0, summary: data.error?.message || '분석 실패' });
        }
      } catch (e) {
        newResults.push({ ...h, status: 'error', grade: '-', violationCount: 0, summary: e.message || '네트워크 오류' });
      }

      setResults([...newResults]);
      await new Promise(r => setTimeout(r, 500));
    }
    setAnalyzing(false);
  };

  const gradeColors = {
    'S': 'bg-cyan-100 text-cyan-700', 'A': 'bg-emerald-100 text-emerald-700',
    'B': 'bg-blue-100 text-blue-700', 'C': 'bg-yellow-100 text-yellow-700',
    'D': 'bg-orange-100 text-orange-700', 'F': 'bg-red-100 text-red-700',
    '-': 'bg-slate-100 text-slate-500'
  };

  return (
    <div className="space-y-6">
      {/* 통계 */}
      {results.length > 0 && !analyzing && (
        <div className="grid grid-cols-6 gap-4">
          <StatCard title="분석 완료" value={results.filter(r => r.status === 'success').length} color="emerald" />
          <StatCard title="URL 없음" value={results.filter(r => r.status === 'skip').length} color="slate" />
          <StatCard title="S/A등급" value={results.filter(r => r.grade === 'S' || r.grade === 'A').length} color="cyan" />
          <StatCard title="B등급" value={results.filter(r => r.grade === 'B').length} color="blue" />
          <StatCard title="C등급" value={results.filter(r => r.grade === 'C').length} color="yellow" />
          <StatCard title="D/F등급" value={results.filter(r => r.grade === 'D' || r.grade === 'F').length} color="red" />
        </div>
      )}

      {/* 파일 업로드 */}
      <div
        className={`bg-white rounded-2xl p-10 border-2 border-dashed transition-all ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="text-center">
          <div className="text-5xl mb-4">📂</div>
          <p className="font-medium text-slate-700 mb-2">CSV 파일을 드래그하거나 클릭하여 업로드</p>
          <p className="text-sm text-slate-400 mb-4">병원명, 홈페이지 URL 컬럼이 포함된 CSV</p>
          <input 
            type="file" 
            accept=".csv,.txt" 
            className="hidden" 
            id="csv-upload-batch"
            onChange={handleInputChange}
          />
          <label 
            htmlFor="csv-upload-batch"
            className="inline-block px-6 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl cursor-pointer text-sm font-medium hover:shadow-lg transition-all"
          >
            파일 선택
          </label>
        </div>
      </div>

      {/* 분석 시작 */}
      {hospitals.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-800">{file?.name}</p>
              <p className="text-sm text-slate-400">{hospitals.length}개 병원 로드됨</p>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={enableAI} onChange={(e) => setEnableAI(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-blue-500" />
                <span className="text-slate-600 text-sm">AI 분석</span>
              </label>
              <button
                onClick={runAnalysis}
                disabled={analyzing}
                className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-blue-500/25 disabled:opacity-50"
              >
                {analyzing ? `분석 중... (${progress.current}/${progress.total})` : '🚀 배치 분석 시작'}
              </button>
            </div>
          </div>
          {analyzing && (
            <div className="mt-4">
              <div className="w-full bg-slate-100 rounded-full h-2.5">
                <div className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2.5 rounded-full transition-all" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
              </div>
              <p className="text-xs text-slate-500 mt-1 text-right">{Math.round((progress.current / progress.total) * 100)}% 완료</p>
            </div>
          )}
        </div>
      )}

      {/* 결과 테이블 */}
      {results.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-4 font-medium text-slate-600">병원명</th>
                <th className="text-left p-4 font-medium text-slate-600">URL</th>
                <th className="text-center p-4 font-medium text-slate-600">등급</th>
                <th className="text-center p-4 font-medium text-slate-600">위반</th>
                <th className="text-left p-4 font-medium text-slate-600">요약</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.map((r, i) => (
                <tr key={i} className={`${i % 2 === 0 ? 'bg-white' : 'bg-blue-50/30'} hover:bg-blue-50 transition-colors`}>
                  <td className="p-4">
                    <p className="font-medium text-slate-800">{r.name}</p>
                    <p className="text-xs text-slate-400">{r.sido}</p>
                  </td>
                  <td className="p-4">
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 text-xs truncate block max-w-[200px]">
                      {r.url}
                    </a>
                  </td>
                  <td className="p-4 text-center">
                    <span className={`px-3 py-1 rounded-lg font-bold text-sm ${gradeColors[r.grade]}`}>{r.grade}</span>
                  </td>
                  <td className="p-4 text-center">
                    <span className={r.violationCount > 0 ? 'text-red-500 font-medium' : 'text-slate-400'}>{r.violationCount}</span>
                  </td>
                  <td className="p-4 text-slate-500 text-sm max-w-[300px] truncate">{r.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PricingTab({ priceStats, procedures, targetAreas, selectedArea, setSelectedArea, selectedProcedure, loadProcedureDetail, loadPriceCompare, priceCompare, formatPrice }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="수집된 가격" value={priceStats.summary?.totalPrices || 0} color="cyan" />
        <StatCard title="시술 종류" value={priceStats.summary?.uniqueProcedures || 0} color="purple" />
        <StatCard title="병원 수" value={priceStats.summary?.uniqueHospitals || 0} color="emerald" />
        <StatCard title="매핑 대기" value={priceStats.pendingMappings || 0} color="yellow" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <span className="font-bold text-slate-800">💰 시술별 가격 현황</span>
            <select value={selectedArea} onChange={(e) => setSelectedArea(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm">
              <option value="">전체 부위</option>
              {targetAreas.map(area => <option key={area.id} value={area.name}>{area.name}</option>)}
            </select>
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {procedures.length > 0 ? procedures.map((proc, i) => (
              <div key={i} className={`p-4 hover:bg-blue-50 cursor-pointer transition-colors ${selectedProcedure === proc.id ? 'bg-blue-50' : ''}`}
                onClick={() => { loadProcedureDetail(proc.id); loadPriceCompare(proc.id, selectedArea); }}>
                <div className="flex justify-between">
                  <div>
                    <p className="font-medium text-slate-800">{proc.name}</p>
                    <p className="text-xs text-slate-400">{proc.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-blue-600 font-semibold">{formatPrice(proc.avgPrice)}</p>
                    <p className="text-xs text-slate-400">{proc.priceCount}건</p>
                  </div>
                </div>
              </div>
            )) : <div className="p-8 text-center text-slate-400">가격 데이터가 없습니다</div>}
          </div>
        </div>

        {priceCompare ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h4 className="font-bold text-slate-800 mb-4">📊 가격 비교</h4>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <StatCard title="최저가" value={formatPrice(priceCompare.stats?.priceRange?.min)} color="emerald" />
              <StatCard title="평균가" value={formatPrice(priceCompare.stats?.priceAvg)} color="blue" />
              <StatCard title="최고가" value={formatPrice(priceCompare.stats?.priceRange?.max)} color="red" />
              <StatCard title="데이터 수" value={priceCompare.stats?.totalRecords || 0} color="slate" />
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {priceCompare.prices?.map((p, i) => (
                <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{p.hospital_name}</p>
                    <p className="text-xs text-slate-400">{p.target_area}</p>
                  </div>
                  <p className="font-semibold text-blue-600">{formatPrice(p.price)}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 flex items-center justify-center">
            <div className="text-center text-slate-400">
              <div className="text-4xl mb-2">👈</div>
              <p>시술을 선택하세요</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// 알림 탭
// ============================================
function AlertsTab({ priceAlerts, selectedAlert, loadAlertDetail, formatPrice }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard title="미확인 알림" value={priceAlerts.filter(a => !a.is_read).length} color="red" />
        <StatCard title="전체 알림" value={priceAlerts.length} color="blue" />
        <StatCard title="오늘 알림" value={priceAlerts.filter(a => new Date(a.created_at).toDateString() === new Date().toDateString()).length} color="emerald" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <span className="font-bold text-slate-800">🔔 알림 목록</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {priceAlerts.length > 0 ? priceAlerts.map((alert) => (
              <div key={alert.id} onClick={() => loadAlertDetail(alert.id)}
                className={`p-4 hover:bg-blue-50 cursor-pointer transition-colors ${selectedAlert?.id === alert.id ? 'bg-blue-50' : ''} ${!alert.is_read ? 'border-l-4 border-l-red-500' : ''}`}>
                <div className="flex items-start gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    alert.alert_type === 'price_drop' ? 'bg-emerald-100 text-emerald-600' :
                    alert.alert_type === 'price_rise' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                  }`}>{alert.alert_type}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{alert.hospital_name}</p>
                    <p className="text-xs text-slate-400">{alert.procedure_name}</p>
                  </div>
                </div>
              </div>
            )) : <div className="p-8 text-center text-slate-400">알림이 없습니다</div>}
          </div>
        </div>

        {selectedAlert ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h4 className="font-bold text-slate-800 mb-4">알림 상세</h4>
            <div className="space-y-3">
              <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span className="text-slate-500">병원</span><span className="font-medium text-slate-800">{selectedAlert.hospital_name}</span></div>
              <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span className="text-slate-500">시술</span><span className="font-medium text-slate-800">{selectedAlert.procedure_name}</span></div>
              <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span className="text-slate-500">이전 가격</span><span className="font-medium text-slate-800">{formatPrice(selectedAlert.old_price)}</span></div>
              <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span className="text-slate-500">변경 가격</span><span className="font-medium text-blue-600">{formatPrice(selectedAlert.new_price)}</span></div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 flex items-center justify-center">
            <div className="text-center text-slate-400"><div className="text-4xl mb-2">👈</div><p>알림을 선택하세요</p></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// 매핑 승인 탭
// ============================================
function MappingTab({ mappingCandidates, approveMappingCandidate, rejectMappingCandidate }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <StatCard title="대기 중" value={mappingCandidates.filter(m => m.status === 'pending_review').length} color="yellow" />
        <StatCard title="전체 후보" value={mappingCandidates.length} color="blue" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <span className="font-bold text-slate-800">🔄 매핑 후보 목록</span>
        </div>
        <div className="divide-y divide-slate-100">
          {mappingCandidates.length > 0 ? mappingCandidates.map((candidate) => (
            <div key={candidate.id} className="p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-medium text-slate-800">{candidate.source_text}</p>
                  <p className="text-sm text-blue-600 mt-1">→ {candidate.suggested_mapping}</p>
                  <p className="text-xs text-slate-400 mt-1">신뢰도: {(candidate.confidence * 100).toFixed(0)}%</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  candidate.status === 'pending_review' ? 'bg-yellow-100 text-yellow-600' :
                  candidate.status === 'approved' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                }`}>{candidate.status}</span>
              </div>
              {candidate.status === 'pending_review' && (
                <div className="flex gap-2">
                  <button onClick={() => approveMappingCandidate(candidate.id)} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm rounded-lg transition-colors">✓ 승인</button>
                  <button onClick={() => rejectMappingCandidate(candidate.id, '부적절')} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg transition-colors">✗ 반려</button>
                </div>
              )}
            </div>
          )) : <div className="p-8 text-center text-slate-400">매핑 후보가 없습니다</div>}
        </div>
      </div>
    </div>
  );
}

// ============================================
// 예외/오탐 탭
// ============================================
function FalsePositiveTab({ apiBase, fpStats, suggestions, onRefresh }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="전체" value={fpStats.summary?.total || 0} color="blue" />
        <StatCard title="대기중" value={fpStats.summary?.pending || 0} color="yellow" />
        <StatCard title="승인됨" value={fpStats.summary?.approved || 0} color="emerald" />
        <StatCard title="반려됨" value={fpStats.summary?.rejected || 0} color="red" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h4 className="font-bold text-slate-800 mb-4">⚠️ 예외 제안 목록</h4>
        {suggestions.length > 0 ? (
          <div className="space-y-3">
            {suggestions.map((s, i) => (
              <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <p className="font-medium text-slate-800">{s.pattern || s.text}</p>
                <p className="text-sm text-slate-500 mt-1">{s.reason}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-slate-400 py-8">대기 중인 제안이 없습니다</p>
        )}
      </div>
    </div>
  );
}

// ============================================
// 꼼수 탭
// ============================================
function TricksTab({ apiBase, tricksStats }) {
  const [tricks, setTricks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${apiBase}/v1/tricks?limit=50`);
        const data = await res.json();
        if (data.success) setTricks(data.data || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [apiBase]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="전체 꼼수" value={tricksStats.summary?.total || 0} color="purple" />
        <StatCard title="활성" value={tricksStats.summary?.active || 0} color="emerald" />
        <StatCard title="비활성" value={tricksStats.summary?.inactive || 0} color="slate" />
        <StatCard title="신규" value={tricksStats.summary?.new || 0} color="cyan" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <span className="font-bold text-slate-800">🎭 꼼수 패턴 목록</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-400">로딩 중...</div>
        ) : tricks.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {tricks.map((trick, i) => (
              <div key={i} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-slate-800">{trick.name || trick.pattern_name}</span>
                  <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${trick.is_active ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                    {trick.is_active ? '활성' : '비활성'}
                  </span>
                </div>
                <p className="text-sm text-slate-500">{trick.description}</p>
                {trick.example && <p className="text-xs text-slate-400 mt-2">예시: "{trick.example}"</p>}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400">등록된 꼼수 패턴이 없습니다</div>
        )}
      </div>
    </div>
  );
}

// ============================================
// 성능 탭
// ============================================
function PerformanceTab({ apiBase }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${apiBase}/v1/performance/report`);
        const data = await res.json();
        if (data.success) setStats(data.data);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [apiBase]);

  if (loading) return <div className="text-center py-12 text-slate-400">로딩 중...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <CircleStatCard title="정확도" value={`${((stats?.accuracy || 0) * 100).toFixed(1)}%`} percent={(stats?.accuracy || 0) * 100} color="#10b981" subtitle="분석 정확도" />
        <CircleStatCard title="처리량" value={stats?.throughput || 0} percent={Math.min((stats?.throughput || 0) / 100 * 100, 100)} color="#3b82f6" subtitle="요청/분" />
        <CircleStatCard title="평균 응답" value={`${stats?.avgResponseMs || 0}ms`} percent={Math.max(100 - (stats?.avgResponseMs || 0) / 10, 0)} color="#8b5cf6" subtitle="응답 시간" />
        <CircleStatCard title="오류율" value={`${((stats?.errorRate || 0) * 100).toFixed(1)}%`} percent={(stats?.errorRate || 0) * 100} color="#ef4444" subtitle="오류 비율" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h4 className="font-bold text-slate-800 mb-4">📊 성능 트렌드</h4>
        <LineChart />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <SparklineCard label="요청 수" value="1,234" change="+12%" positive={true} color="#3b82f6" />
        <SparklineCard label="응답 시간" value="145ms" change="-8%" positive={true} color="#10b981" />
        <SparklineCard label="오류" value="23" change="+3%" positive={false} color="#ef4444" />
      </div>
    </div>
  );
}

// ============================================
// 이력 탭
// ============================================
function HistoryTab({ apiBase }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${apiBase}/v1/learning/candidates?status=approved&limit=100`);
        const data = await res.json();
        if (data.success) setHistory(data.data || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [apiBase]);

  const LEARNING_TYPES = {
    exception_generated: { label: '예외 규칙', icon: '🔵' },
    confidence_adjusted: { label: '신뢰도 조정', icon: '🟢' },
    pattern_suggested: { label: '새 패턴', icon: '🟡' },
    mapping_learned: { label: '매핑 규칙', icon: '🟣' },
    severity_adjusted: { label: '심각도 조정', icon: '🔴' },
    context_modifier_updated: { label: '맥락 보정', icon: '⚪' },
  };

  const groupedHistory = history.reduce((acc, item) => {
    const date = (item.applied_at || item.created_at)?.split('T')[0] || 'unknown';
    if (!acc[date]) acc[date] = [];
    acc[date].push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="이번 주" value={history.filter(h => { const d = new Date(h.applied_at || h.created_at); const now = new Date(); return d >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); }).length} color="blue" />
        <StatCard title="이번 달" value={history.filter(h => { const d = new Date(h.applied_at || h.created_at); const now = new Date(); return d.getMonth() === now.getMonth(); }).length} color="cyan" />
        <StatCard title="자동 적용" value={history.filter(h => h.status === 'auto_applied').length} color="emerald" />
        <StatCard title="수동 적용" value={history.filter(h => h.status === 'approved').length} color="slate" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">로딩 중...</div>
      ) : Object.keys(groupedHistory).length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">이력이 없습니다</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedHistory).map(([date, items]) => (
            <div key={date}>
              <div className="text-sm font-semibold text-slate-500 mb-3 sticky top-0 bg-[#f0f4f8] py-2">
                {new Date(date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
              </div>
              <div className="space-y-3">
                {items.map((item) => {
                  const typeInfo = LEARNING_TYPES[item.learning_type] || { label: item.learning_type, icon: '❓' };
                  return (
                    <div key={item.id} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-start gap-4">
                      <div className="text-2xl">{typeInfo.icon}</div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-semibold text-slate-800">{typeInfo.label}</span>
                            <span className="mx-2 text-slate-300">|</span>
                            <span className="text-slate-500">{item.target_type}</span>
                          </div>
                          <span className="text-xs text-slate-400">{new Date(item.applied_at || item.created_at).toLocaleTimeString('ko-KR')}</span>
                        </div>
                        <div className="text-sm text-slate-500 mt-1">대상: <span className="font-mono text-slate-700">{item.target_id}</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
