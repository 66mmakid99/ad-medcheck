import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import PriceAnalytics from './PriceAnalytics';
import AeoGeoDashboard from './AeoGeoDashboard';
import ViralDashboard from './ViralDashboard';

// ============================================
// MEDCHECK Engine 대시보드 v2.0 - 레퍼런스 스타일
// 사이드바 + 라이트 테마 + 차트 위젯
// ============================================

const API_BASE = 'https://medcheck-engine.mmakid.workers.dev';

export default function MedCheckDashboard() {
  const [activeTab, setActiveTab] = useState('home');
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
    { id: 'home', name: '대시보드 홈', icon: '📊' },
    { id: 'analyze', name: 'URL 분석', icon: '🔍' },
    { id: 'adcheck', name: '에드체크', icon: '✅' },
    { id: 'pricing', name: '시술가격', icon: '💰', badge: priceAlerts.length },
    { id: 'alerts', name: '가격알림', icon: '🔔', badge: priceAlerts.filter(a => !a.is_read).length },
    { id: 'mapping', name: '매핑승인', icon: '🔄', badge: mappingCandidates.length },
    { id: 'patternMgmt', name: '패턴 관리', icon: '🛡️', badge: (fpStats.summary?.pending || 0) + (tricksStats.summary?.total || 0) },
    { id: 'performance', name: '성능', icon: '📈' },
    { id: 'history', name: '이력', icon: '📜' },
    { id: 'priceAnalytics', name: '가격분석', icon: '📊' },
    { id: 'ocr', name: 'OCR 분석', icon: '🖼️' },
    { id: 'crawler', name: '크롤러 현황', icon: '🕷️' },
    { id: 'aeoGeo', name: 'AG MedCheck', icon: '🤖' },
    { id: 'viral', name: 'Viral MedCheck', icon: '📣' },
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
          {activeTab === 'home' && <OverviewPage apiBase={API_BASE} onNavigate={setActiveTab} />}
          {activeTab === 'analyze' && <UrlAnalysisPage apiBase={API_BASE} />}
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
          {activeTab === 'patternMgmt' && (
            <PatternManagementPage apiBase={API_BASE} fpStats={fpStats} suggestions={suggestions} tricksStats={tricksStats} onRefresh={loadAllData} />
          )}
          {activeTab === 'performance' && <PerformanceTab apiBase={API_BASE} />}
          {activeTab === 'history' && <HistoryTab apiBase={API_BASE} />}
          {activeTab === 'priceAnalytics' && <PriceAnalytics />}
          {activeTab === 'ocr' && <OcrTab apiBase={API_BASE} />}
          {activeTab === 'crawler' && <CrawlerTab apiBase={API_BASE} />}
          {activeTab === 'aeoGeo' && <AeoGeoDashboard />}
          {activeTab === 'viral' && <ViralDashboard />}
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
// 라인 차트 (SVG) - 간단한 인라인 차트용
// ============================================
function SvgLineChart({ data = [], height = 200 }) {
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
// 대시보드 홈 (Overview)
// ============================================
function OverviewPage({ apiBase, onNavigate }) {
  const [ocrResults, setOcrResults] = useState([]);
  const [accuracyStats, setAccuracyStats] = useState(null);
  const [crawlerStatus, setCrawlerStatus] = useState(null);
  const [analysisStats, setAnalysisStats] = useState(null);
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // 신규 통합 요약 API (기존 5개 호출 → 1개로 통합)
      const summaryRes = await fetch(`${apiBase}/v1/dashboard/summary`);
      const summaryData = await summaryRes.json();
      if (summaryData.success) {
        const d = summaryData.data;
        // 크롤러 상태 매핑
        setCrawlerStatus({
          schedulerOnline: d.crawler?.online,
          mode: d.crawler?.mode || 'cloud',
          lastHeartbeat: d.crawler?.lastHeartbeat,
          lastCrawl: d.recentBatch ? { started_at: d.recentBatch.started_at } : null,
          todaySummary: { runs: d.recentBatch ? 1 : 0 },
        });
        // 분석 통계 매핑
        setAnalysisStats({
          total: d.today?.analyzed || 0,
          violations: d.today?.violations || 0,
          avgScore: d.today?.avgScore || 0,
          clean: (d.today?.analyzed || 0) - (d.today?.violations || 0),
          byDate: [],
          gradeDistribution: d.gradeDistribution || [],
        });
        // 최근 분석 결과를 테이블에 표시
        setOcrResults((d.recentResults || []).map(r => ({
          id: r.hospital_name,
          extracted_text: r.hospital_name,
          grade: r.grade,
          violations: r.violation_count,
          analyzed_at: r.analyzed_at,
          url: r.url_analyzed,
          grade_emoji: r.grade_emoji,
          clean_score: r.clean_score,
        })));
        // 정확도는 신규 API에서 아직 미제공 → 기본값
        setAccuracyStats(null);
      }
      // 헬스체크는 유지
      fetch(`${apiBase}/v1/health`).then(r => r.json()).then(d => setHealthData(d)).catch(() => {});
    } catch (e) {
      console.error('Dashboard load error:', e);
    }
    setLoading(false);
  };

  const formatTime = (ts) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // 오늘/어제 위반 수 계산
  const byDate = analysisStats?.byDate || [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const todayData = byDate.find(d => d.date === todayStr);
  const yesterdayData = byDate.find(d => d.date === yesterdayStr);
  const todayViolations = todayData?.violations || 0;
  const delta = todayViolations - (yesterdayData?.violations || 0);

  // 정확도
  const overallAcc = accuracyStats?.overall?.accuracy ?? null;
  const regexAcc = accuracyStats?.byMode?.find(m => m.mode === 'regex')?.accuracy;
  const hybridAcc = accuracyStats?.byMode?.find(m => m.mode === 'hybrid')?.accuracy;

  // 크롤러
  const isOnline = crawlerStatus?.schedulerOnline;
  const lastCrawlTime = crawlerStatus?.lastCrawl?.started_at;

  // 차트 데이터 (최근 7일)
  const chartData = byDate.map(d => ({
    date: d.date.slice(5), // MM-DD
    total: d.count || 0,
    violations: d.violations || 0,
  })).reverse();

  // 등급 배지
  const gradeBadge = (g) => {
    const map = {
      S: 'bg-cyan-100 text-cyan-700', A: 'bg-emerald-100 text-emerald-700',
      B: 'bg-blue-100 text-blue-700', C: 'bg-yellow-100 text-yellow-700',
      D: 'bg-orange-100 text-orange-700', F: 'bg-red-100 text-red-700',
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[g] || 'bg-slate-100 text-slate-600'}`}>{g || '-'}</span>;
  };

  const modeBadge = (m) => m === 'hybrid'
    ? <span className="px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700">hybrid</span>
    : <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">regex</span>;

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="bg-white rounded-2xl h-28 border border-slate-200" />)}
        </div>
        <div className="bg-white rounded-2xl h-64 border border-slate-200" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl h-72 border border-slate-200" />
          <div className="bg-white rounded-2xl h-72 border border-slate-200" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ━━━ 1. 핵심 지표 카드 4개 ━━━ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 카드 1: 오늘 위반 탐지 */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center text-2xl shrink-0">🛡️</div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">오늘 위반 탐지</div>
            <div className="text-2xl font-bold text-slate-800 mt-0.5">{todayViolations}건</div>
            <div className={`text-xs mt-0.5 font-medium ${delta > 0 ? 'text-red-500' : delta < 0 ? 'text-emerald-500' : 'text-slate-400'}`}>
              {delta !== 0 ? `전일 대비 ${delta > 0 ? '+' : ''}${delta}건` : '전일 동일'}
            </div>
          </div>
        </div>

        {/* 카드 2: AI 분석 정확도 */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-2xl shrink-0">🎯</div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">AI 분석 정확도</div>
            <div className="text-2xl font-bold text-slate-800 mt-0.5">
              {overallAcc != null ? `${Math.round(overallAcc)}%` : '—'}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              regex {regexAcc != null ? `${Math.round(regexAcc)}%` : '-'} / hybrid {hybridAcc != null ? `${Math.round(hybridAcc)}%` : '-'}
            </div>
          </div>
        </div>

        {/* 카드 3: 크롤러 상태 */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-2xl shrink-0">🕷️</div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">크롤러 상태</div>
            <div className={`text-2xl font-bold mt-0.5 ${isOnline ? 'text-emerald-600' : 'text-slate-600'}`}>
              {isOnline ? '온라인' : crawlerStatus?.mode === 'cloud' ? '⏰ Cron 대기' : '오프라인'}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              마지막 실행: {formatTime(lastCrawlTime)} {crawlerStatus?.mode === 'cloud' && '(클라우드)'}
            </div>
          </div>
        </div>

        {/* 카드 4: 서비스 현황 */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-2xl shrink-0">🚀</div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">서비스 현황</div>
            <div className="mt-1.5">
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-indigo-500 h-2 rounded-full" style={{ width: '33%' }} />
              </div>
            </div>
            <div className="text-xs text-slate-600 font-medium mt-1">수비수 서비스 1/3 출시</div>
            <div className="text-xs text-slate-400 mt-0.5">
              위반 탐지 <span className="text-emerald-500">✓</span> | AEO/GEO <span className="text-amber-500">🔜</span> | 마케팅 <span className="text-amber-500">🔜</span>
            </div>
          </div>
        </div>
      </div>

      {/* ━━━ 2. 최근 위반 탐지 목록 ━━━ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">최근 위반 탐지</h3>
          <button
            onClick={() => onNavigate('analyze')}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
          >
            전체 보기 <span>→</span>
          </button>
        </div>
        {ocrResults.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-sm text-slate-400">위반 탐지 기록이 없습니다</p>
            <p className="text-xs text-slate-300 mt-1">OCR 분석을 실행하면 여기에 결과가 표시됩니다</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="text-left p-3 pl-6 font-medium text-slate-500 text-xs uppercase tracking-wider">시간</th>
                  <th className="text-left p-3 font-medium text-slate-500 text-xs uppercase tracking-wider">병원</th>
                  <th className="text-center p-3 font-medium text-slate-500 text-xs uppercase tracking-wider">등급</th>
                  <th className="text-center p-3 font-medium text-slate-500 text-xs uppercase tracking-wider">청정지수</th>
                  <th className="text-center p-3 font-medium text-slate-500 text-xs uppercase tracking-wider">위반 수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ocrResults.map((r, i) => (
                  <tr key={r.id || i} className={`${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'} hover:bg-blue-50/30 transition-colors`}>
                    <td className="p-3 pl-6 text-sm text-slate-500">{formatTime(r.analyzed_at)}</td>
                    <td className="p-3 text-sm font-medium text-slate-700">{r.extracted_text}</td>
                    <td className="text-center">{gradeBadge(r.grade)}</td>
                    <td className="p-3 text-center text-sm font-medium">{r.clean_score || '-'}점</td>
                    <td className="p-3 text-center text-sm text-red-500 font-medium">{r.violations || 0}건</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ━━━ 3. 하단 2-column ━━━ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 좌측: 주간 탐지 추이 차트 */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">주간 탐지 추이</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px' }}
                  labelFormatter={(v) => `날짜: ${v}`}
                />
                <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} name="전체 분석" />
                <Line type="monotone" dataKey="violations" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} name="위반 탐지" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex flex-col items-center justify-center">
              <div className="text-3xl mb-2">📈</div>
              <p className="text-sm text-slate-400">데이터 수집 중</p>
              <p className="text-xs text-slate-300 mt-1">분석 결과가 쌓이면 차트가 표시됩니다</p>
            </div>
          )}
        </div>

        {/* 우측: 시스템 상태 요약 */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">시스템 상태</h3>
          <div className="space-y-3">
            {/* 크롤러 */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center text-lg">🕷️</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-700">클라우드 크롤러</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Cron: 매일 09:00 KST
                  <span className="mx-1.5">·</span>
                  큐 대기: {analysisStats?.gradeDistribution ? '활성' : '확인 중'}
                </div>
              </div>
              <div className={`w-2.5 h-2.5 rounded-full ${crawlerStatus?.mode === 'cloud' || isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            </div>

            {/* API 상태 */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center text-lg">🌐</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-700">API 서버</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {healthData?.status === 'ok' || healthData?.status === 'healthy'
                    ? 'MedCheck Engine 정상 작동 중'
                    : '상태 확인 필요'}
                </div>
              </div>
              <div className={`w-2.5 h-2.5 rounded-full ${healthData ? 'bg-emerald-400' : 'bg-red-400'}`} />
            </div>

            {/* 분석 패턴 */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center text-lg">📋</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-700">분석 패턴</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  전체 156개 패턴 활성
                  <span className="mx-1.5">·</span>
                  32개 카테고리
                </div>
              </div>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            </div>

            {/* 분석 통계 */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center text-lg">📊</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-700">누적 분석</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  총 {analysisStats?.total || 0}건 분석
                  <span className="mx-1.5">·</span>
                  위반 {analysisStats?.violations || 0}건
                  <span className="mx-1.5">·</span>
                  양호 {analysisStats?.clean || 0}건
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 통합: URL 분석 페이지 (단건 + 배치)
// ============================================
function UrlAnalysisPage({ apiBase }) {
  const [subTab, setSubTab] = useState('single');

  const tabs = [
    { id: 'single', label: '단건 분석' },
    { id: 'batch', label: '배치 분석' },
  ];

  return (
    <div>
      <div className="border-b border-slate-200 mb-6">
        <div className="flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                subTab === tab.id
                  ? 'border-blue-500 text-blue-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      {subTab === 'single' && <AnalyzeTab apiBase={apiBase} />}
      {subTab === 'batch' && <BatchAnalyzeTab apiBase={apiBase} />}
    </div>
  );
}

// ============================================
// 통합: 패턴 관리 페이지 (예외/오탐 + 꼼수)
// ============================================
function PatternManagementPage({ apiBase, fpStats, suggestions, tricksStats, onRefresh }) {
  const [subTab, setSubTab] = useState('exception');

  const tabs = [
    { id: 'exception', label: '예외/오탐', badge: fpStats.summary?.pending || 0 },
    { id: 'tricks', label: '꼼수 패턴', badge: tricksStats.summary?.total || 0 },
  ];

  return (
    <div>
      <div className="border-b border-slate-200 mb-6">
        <div className="flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                subTab === tab.id
                  ? 'border-blue-500 text-blue-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              {tab.label}
              {tab.badge > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                  subTab === tab.id ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
                }`}>{tab.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>
      {subTab === 'exception' && (
        <FalsePositiveTab apiBase={apiBase} fpStats={fpStats} suggestions={suggestions} onRefresh={onRefresh} />
      )}
      {subTab === 'tricks' && <TricksTab apiBase={apiBase} tricksStats={tricksStats} />}
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
  const [mode, setMode] = useState('text'); // 'text' | 'url'
  const [url, setUrl] = useState('');
  const [hospitalName, setHospitalName] = useState('');

  const analyze = async () => {
    if (mode === 'text' && !text.trim()) return;
    if (mode === 'url' && !url.trim()) return;
    setLoading(true);
    try {
      let res;
      if (mode === 'url') {
        // URL 분석 (파이프라인 → DB 저장)
        res = await fetch(`${apiBase}/v1/pipeline/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, hospitalName: hospitalName || undefined, enableAI })
        });
        const data = await res.json();
        if (data.success && data.analysis) {
          setResult({
            grade: data.analysis.grade,
            score: { cleanScore: data.analysis.cleanScore, gradeInfo: { emoji: data.analysis.gradeEmoji, status: data.analysis.gradeLabel || data.analysis.grade } },
            violationCount: data.analysis.violationCount,
            violations: data.analysis.violations,
            rawViolationCount: data.analysis.rawViolationCount,
            filteredCount: data.analysis.filteredCount,
            aiVerification: data.analysis.aiVerification,
            meta: data.meta,
          });
        } else {
          setResult({ error: data.error?.message || '분석 실패' });
        }
      } else {
        // 기존 텍스트 분석 유지
        res = await fetch(`${apiBase}/v1/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, enableAI, options: { detailed: true } })
        });
        const data = await res.json();
        if (data.success) setResult(data.data);
      }
    } catch (e) {
      console.error(e);
      setResult({ error: '네트워크 오류' });
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
          {/* 모드 토글 */}
          <div className="flex gap-2 mb-4">
            <button onClick={() => setMode('text')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'text' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              📝 텍스트 분석
            </button>
            <button onClick={() => setMode('url')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'url' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              🌐 URL 분석
            </button>
          </div>
          {mode === 'url' ? (
            <div className="space-y-3">
              <input value={url} onChange={e => setUrl(e.target.value)}
                placeholder="https://example-hospital.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              <input value={hospitalName} onChange={e => setHospitalName(e.target.value)}
                placeholder="병원명 (선택 - 입력 시 DB에 저장)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            </div>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="분석할 광고 텍스트를 입력하세요..."
              className="w-full h-40 bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          )}
          <div className="flex items-center justify-between mt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enableAI}
                onChange={(e) => setEnableAI(e.target.checked)}
                className="w-5 h-5 rounded border-slate-300 text-blue-500 focus:ring-blue-400"
              />
              <span className="text-slate-600">AI 2차 검증 (Gemini)</span>
            </label>
            <button
              onClick={analyze}
              disabled={loading || (mode === 'text' ? !text.trim() : !url.trim())}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-medium shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? '분석 중...' : mode === 'url' ? 'URL 분석하기' : '분석하기'}
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
                {result?.rawViolationCount != null && (
                  <div className="flex justify-between p-3 bg-emerald-50 rounded-lg">
                    <span className="text-slate-500">오탐 필터링</span>
                    <span className="font-bold text-emerald-600">
                      {result.rawViolationCount}건 → {result.rawViolationCount - (result.filteredCount || 0)}건
                      ({result.filteredCount || 0}건 제거)
                    </span>
                  </div>
                )}
                {result?.aiVerification?.verified && (
                  <div className="flex justify-between p-3 bg-purple-50 rounded-lg">
                    <span className="text-slate-500">AI 검증</span>
                    <span className="font-bold text-purple-600">
                      확정 {result.aiVerification.confirmedCount}건 / 오탐 {result.aiVerification.falsePositiveCount}건
                    </span>
                  </div>
                )}
                {result?.error && (
                  <div className="flex justify-between p-3 bg-red-50 rounded-lg">
                    <span className="text-red-500">{result.error}</span>
                  </div>
                )}
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
      let url = `${apiBase}/v1/dashboard/hospitals?limit=100`;
      if (filter.grade) url += `&grade=${filter.grade}`;

      const resultsRes = await fetch(url).then(r => r.json());
      if (resultsRes.success) {
        // data가 배열일 수도, {hospitals:[], pagination:{}} 객체일 수도 있음
        const items = Array.isArray(resultsRes.data)
          ? resultsRes.data
          : (resultsRes.data?.hospitals || resultsRes.data?.results || []);
        setHospitals(items);
        const total = resultsRes.data?.pagination?.total || items.length;
        setStats({ total });
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const loadHospitalDetail = async (id) => {
    try {
      const res = await fetch(`${apiBase}/v1/analysis-history/${id}`);
      const data = await res.json();
      if (data.success && data.data?.length > 0) {
        const latest = data.data[0];
        setHospitalDetail({
          ...latest,
          violations: typeof latest.violations_json === 'string'
            ? JSON.parse(latest.violations_json || '[]')
            : (latest.violations_json || []),
        });
        setSelectedHospital(id);
      } else {
        // fallback: 목록에서 직접 찾기
        const h = hospitals.find(h => h.id === id || h.hospital_id === id);
        if (h) {
          setHospitalDetail({
            ...h,
            violations: typeof h.violations_json === 'string'
              ? JSON.parse(h.violations_json || '[]')
              : (h.violations || []),
          });
          setSelectedHospital(id);
        }
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
                  key={h.id || h.hospital_id || i}
                  onClick={() => loadHospitalDetail(h.hospital_id || h.id)}
                  className={`p-4 cursor-pointer transition-colors ${selectedHospital === (h.hospital_id || h.id) ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-800">{h.hospital_name}</p>
                      <p className="text-slate-400 text-sm">{h.region || `${h.sido || ''} ${h.sigungu || ''}`.trim() || '-'}</p>
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
        <SvgLineChart />
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

// ============================================
// OCR 분석 탭
// ============================================
function OcrTab({ apiBase }) {
  const [subTab, setSubTab] = useState('results'); // results | analyze | accuracy | fpManage
  const [results, setResults] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, limit: 20, offset: 0, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [filterGrade, setFilterGrade] = useState('');
  const [filterMode, setFilterMode] = useState('');
  const [selectedResult, setSelectedResult] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [feedbackMap, setFeedbackMap] = useState({});

  // 분석 폼
  const [imageUrl, setImageUrl] = useState('');
  const [analysisMode, setAnalysisMode] = useState('hybrid');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

  // 정확도
  const [accuracyStats, setAccuracyStats] = useState(null);
  const [accuracyPeriod, setAccuracyPeriod] = useState('all');
  const [fpPatterns, setFpPatterns] = useState([]);
  const [accuracyLoading, setAccuracyLoading] = useState(false);

  // 패턴 관리
  const [fpManageData, setFpManageData] = useState([]);
  const [fpManageLoading, setFpManageLoading] = useState(false);
  const [fpTogglingId, setFpTogglingId] = useState(null);

  const gradeColors = {
    'S': { bg: 'bg-cyan-100', text: 'text-cyan-700' },
    'A': { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    'B': { bg: 'bg-blue-100', text: 'text-blue-700' },
    'C': { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    'D': { bg: 'bg-orange-100', text: 'text-orange-700' },
    'F': { bg: 'bg-red-100', text: 'text-red-700' }
  };

  useEffect(() => { loadResults(); }, [filterGrade, filterMode]);
  useEffect(() => { if (subTab === 'accuracy') loadAccuracy(); }, [subTab, accuracyPeriod]);
  useEffect(() => { if (subTab === 'fpManage') loadFpManage(); }, [subTab]);

  const loadResults = async (offset = 0) => {
    setLoading(true);
    try {
      let url = `${apiBase}/api/ocr/results?limit=20&offset=${offset}`;
      if (filterGrade) url += `&grade=${filterGrade}`;
      if (filterMode) url += `&analysisMode=${filterMode}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setResults(data.data.results || []);
        setPagination(data.data.pagination || { total: 0, limit: 20, offset, hasMore: false });
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadDetail = async (id) => {
    setSelectedResult(id);
    setDetailLoading(true);
    try {
      const [detailRes, feedbackRes] = await Promise.all([
        fetch(`${apiBase}/api/ocr/results/${id}`).then(r => r.json()),
        fetch(`${apiBase}/api/ocr/results/${id}/feedback`).then(r => r.json()),
      ]);
      if (detailRes.success) setDetailData(detailRes.data);
      if (feedbackRes.success) {
        const map = {};
        (feedbackRes.data || []).forEach(fb => { map[fb.violation_index] = fb.human_judgment; });
        setFeedbackMap(map);
      }
    } catch (e) { console.error(e); }
    setDetailLoading(false);
  };

  const submitFeedback = async (violationIndex, humanJudgment) => {
    try {
      const res = await fetch(`${apiBase}/api/ocr/results/${selectedResult}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ violationIndex, humanJudgment })
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackMap(prev => ({ ...prev, [violationIndex]: humanJudgment }));
      }
    } catch (e) { console.error(e); }
  };

  const runAnalysis = async () => {
    if (!imageUrl.trim()) return;
    setAnalyzing(true);
    setAnalysisResult(null);
    try {
      const endpoint = analysisMode === 'hybrid' ? '/api/ocr/analyze-hybrid' : '/api/ocr/analyze';
      const res = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl })
      });
      const data = await res.json();
      if (data.success) {
        setAnalysisResult(data.data);
        loadResults();
      }
    } catch (e) { console.error(e); }
    setAnalyzing(false);
  };

  const loadAccuracy = async () => {
    setAccuracyLoading(true);
    try {
      const [statsRes, fpRes] = await Promise.all([
        fetch(`${apiBase}/api/ocr/accuracy/stats?period=${accuracyPeriod}`).then(r => r.json()),
        fetch(`${apiBase}/api/ocr/accuracy/false-positives?limit=10`).then(r => r.json()),
      ]);
      if (statsRes.success) setAccuracyStats(statsRes.data);
      if (fpRes.success) setFpPatterns(fpRes.data?.byPattern || []);
    } catch (e) { console.error(e); }
    setAccuracyLoading(false);
  };

  const loadFpManage = async () => {
    setFpManageLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/ocr/fp-patterns`);
      const d = await res.json();
      if (d.success) setFpManageData(d.data || []);
    } catch (e) { console.error(e); }
    setFpManageLoading(false);
  };

  const toggleFpPattern = async (patternId, currentAction) => {
    const newAction = currentAction === 'suppress' ? 'normal' : 'suppress';
    setFpTogglingId(patternId);
    try {
      await fetch(`${apiBase}/api/ocr/fp-patterns/${encodeURIComponent(patternId)}/suppress`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: newAction }),
      });
      await loadFpManage();
    } catch (e) { console.error(e); }
    setFpTogglingId(null);
  };

  return (
    <div className="space-y-6">
      {/* 서브탭 */}
      <div className="flex gap-2">
        {[
          { id: 'results', label: '분석 결과', icon: '📋' },
          { id: 'analyze', label: '이미지 분석', icon: '🔍' },
          { id: 'accuracy', label: 'AI 정확도', icon: '🎯' },
          { id: 'fpManage', label: '패턴 관리', icon: '⚙️' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              subTab === tab.id
                ? 'bg-white text-slate-800 shadow-md border border-slate-200'
                : 'text-slate-500 hover:bg-white/60 hover:text-slate-700'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ========== 결과 목록 서브탭 ========== */}
      {subTab === 'results' && (
        <div className="space-y-4">
          {/* 필터 */}
          <div className="flex gap-3 items-center">
            <select
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">전체 등급</option>
              {['S','A','B','C','D','F'].map(g => <option key={g} value={g}>{g} 등급</option>)}
            </select>
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">전체 모드</option>
              <option value="regex">정규식</option>
              <option value="hybrid">하이브리드</option>
            </select>
            <button onClick={() => loadResults()} className="px-4 py-2.5 bg-blue-500 text-white rounded-xl text-sm hover:bg-blue-600 transition-colors">
              🔄 새로고침
            </button>
            <span className="text-sm text-slate-400 ml-auto">총 {pagination.total}건</span>
          </div>

          <div className="grid grid-cols-5 gap-6">
            {/* 결과 목록 테이블 (3/5) */}
            <div className="col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {loading ? (
                <div className="p-12 text-center text-slate-400">로딩 중...</div>
              ) : results.length === 0 ? (
                <div className="p-12 text-center text-slate-400">OCR 분석 결과가 없습니다</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left p-4 font-medium text-slate-600">이미지</th>
                      <th className="text-center p-4 font-medium text-slate-600">등급</th>
                      <th className="text-center p-4 font-medium text-slate-600">위반수</th>
                      <th className="text-center p-4 font-medium text-slate-600">모드</th>
                      <th className="text-left p-4 font-medium text-slate-600">분석일시</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {results.map((row, i) => (
                      <tr
                        key={row.id}
                        onClick={() => loadDetail(row.id)}
                        className={`cursor-pointer transition-colors ${
                          selectedResult === row.id ? 'bg-blue-50' :
                          i % 2 === 0 ? 'bg-white hover:bg-blue-50/50' : 'bg-blue-50/30 hover:bg-blue-50/50'
                        }`}
                      >
                        <td className="p-4">
                          <span className="text-slate-700 truncate block max-w-[200px]" title={row.image_url}>
                            {row.image_url === 'base64' ? '(Base64)' : row.image_url?.split('/').pop()?.slice(0, 30) || row.image_url}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`px-2.5 py-1 text-xs font-bold rounded-lg ${gradeColors[row.grade]?.bg || 'bg-slate-100'} ${gradeColors[row.grade]?.text || 'text-slate-600'}`}>
                            {row.grade || '-'}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`font-bold ${row.violation_count > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {row.violation_count}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                            row.analysis_mode === 'hybrid' ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {row.analysis_mode || 'regex'}
                          </span>
                        </td>
                        <td className="p-4 text-slate-500 text-xs">
                          {row.created_at ? new Date(row.created_at).toLocaleString('ko-KR') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {/* 페이지네이션 */}
              {pagination.total > pagination.limit && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                  <button
                    onClick={() => loadResults(Math.max(0, pagination.offset - pagination.limit))}
                    disabled={pagination.offset === 0}
                    className="px-3 py-1.5 text-sm bg-slate-100 rounded-lg disabled:opacity-40 hover:bg-slate-200 transition-colors"
                  >
                    ← 이전
                  </button>
                  <span className="text-sm text-slate-500">
                    {pagination.offset + 1}-{Math.min(pagination.offset + pagination.limit, pagination.total)} / {pagination.total}
                  </span>
                  <button
                    onClick={() => loadResults(pagination.offset + pagination.limit)}
                    disabled={!pagination.hasMore}
                    className="px-3 py-1.5 text-sm bg-slate-100 rounded-lg disabled:opacity-40 hover:bg-slate-200 transition-colors"
                  >
                    다음 →
                  </button>
                </div>
              )}
            </div>

            {/* 상세 패널 (2/5) */}
            <div className="col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 max-h-[700px] overflow-y-auto">
              {!selectedResult ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12">
                  <div className="text-5xl mb-4">📄</div>
                  <p className="text-slate-400">목록에서 결과를 선택하세요</p>
                </div>
              ) : detailLoading ? (
                <div className="text-center py-12 text-slate-400">로딩 중...</div>
              ) : detailData ? (
                <div className="space-y-4">
                  {/* 상단 요약 */}
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-800">분석 상세</h4>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-lg ${gradeColors[detailData.grade]?.bg} ${gradeColors[detailData.grade]?.text}`}>
                        {detailData.grade}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                        detailData.analysis_mode === 'hybrid' ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {detailData.analysis_mode || 'regex'}
                      </span>
                    </div>
                  </div>

                  {/* OCR 텍스트 */}
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <p className="text-xs font-medium text-slate-500 mb-1">추출 텍스트</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap max-h-32 overflow-y-auto">{detailData.extracted_text || '(없음)'}</p>
                  </div>

                  {/* Hybrid 요약 (hybrid 모드인 경우) */}
                  {detailData.analysis_mode === 'hybrid' && detailData.hybridVerifications && (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-blue-50 rounded-lg p-2 text-center border border-blue-100">
                        <p className="text-lg font-bold text-blue-700">{detailData.hybridVerifications?.length || 0}</p>
                        <p className="text-xs text-blue-500">패턴 매칭</p>
                      </div>
                      <div className="bg-emerald-50 rounded-lg p-2 text-center border border-emerald-100">
                        <p className="text-lg font-bold text-emerald-700">{detailData.violation_count || 0}</p>
                        <p className="text-xs text-emerald-500">AI 확정</p>
                      </div>
                      <div className="bg-yellow-50 rounded-lg p-2 text-center border border-yellow-100">
                        <p className="text-lg font-bold text-yellow-700">{detailData.falsePositiveCandidates?.length || 0}</p>
                        <p className="text-xs text-yellow-500">오탐 후보</p>
                      </div>
                    </div>
                  )}

                  {/* 위반 항목 */}
                  <div>
                    <h5 className="font-semibold text-slate-700 mb-2">위반 항목 ({(detailData.violations || []).length}건)</h5>
                    {(detailData.violations || []).length === 0 ? (
                      <p className="text-sm text-slate-400 py-4 text-center">위반 항목 없음</p>
                    ) : (
                      <div className="space-y-2">
                        {(detailData.violations || []).map((v, i) => (
                          <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="flex items-start gap-2">
                              <span className={`px-2 py-0.5 text-xs font-bold rounded-lg shrink-0 ${
                                v.severity === 'critical' ? 'bg-red-100 text-red-600' :
                                v.severity === 'major' ? 'bg-orange-100 text-orange-600' :
                                'bg-yellow-100 text-yellow-600'
                              }`}>{v.severity}</span>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-800 text-sm">{v.description || v.category}</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  매칭: "<span className="text-red-500">{v.matchedText}</span>"
                                </p>
                                {v.patternId && <p className="text-xs text-slate-400 mt-0.5">{v.patternId} · {v.category}</p>}
                                {/* AI confidence (hybrid) */}
                                {v.aiConfidence !== undefined && (
                                  <div className="flex items-center gap-2 mt-1">
                                    <div className="flex-1 bg-slate-200 rounded-full h-1.5">
                                      <div
                                        className={`h-1.5 rounded-full ${v.aiConfidence >= 70 ? 'bg-emerald-500' : 'bg-yellow-500'}`}
                                        style={{ width: `${v.aiConfidence}%` }}
                                      />
                                    </div>
                                    <span className={`text-xs font-medium ${v.aiConfidence >= 70 ? 'text-emerald-600' : 'text-yellow-600'}`}>
                                      {v.aiConfidence}%
                                    </span>
                                  </div>
                                )}
                                {v.aiReasoning && <p className="text-xs text-slate-400 mt-1 italic">{v.aiReasoning}</p>}
                              </div>
                            </div>
                            {/* 피드백 버튼 */}
                            <div className="flex gap-1.5 mt-2 ml-8">
                              {[
                                { key: 'correct', label: '정확', icon: '✅', active: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
                                { key: 'false_positive', label: '오탐', icon: '❌', active: 'bg-red-100 text-red-700 border-red-200' },
                                { key: 'missed', label: '누락', icon: '⚠️', active: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
                              ].map(fb => (
                                <button
                                  key={fb.key}
                                  onClick={() => submitFeedback(i, fb.key)}
                                  className={`px-2 py-1 text-xs rounded-lg border transition-all ${
                                    feedbackMap[i] === fb.key
                                      ? fb.active + ' font-bold'
                                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                  }`}
                                >
                                  {fb.icon} {fb.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 오탐 후보 (hybrid) */}
                  {detailData.analysis_mode === 'hybrid' && (detailData.falsePositiveCandidates || []).length > 0 && (
                    <div>
                      <h5 className="font-semibold text-yellow-700 mb-2">오탐 후보 ({detailData.falsePositiveCandidates.length}건)</h5>
                      <div className="space-y-2">
                        {detailData.falsePositiveCandidates.map((v, i) => (
                          <div key={i} className="p-3 bg-yellow-50 rounded-xl border border-yellow-100">
                            <div className="flex items-start gap-2">
                              <span className="px-2 py-0.5 text-xs font-bold rounded-lg bg-yellow-200 text-yellow-700 shrink-0">FP?</span>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-700 text-sm">{v.description || v.category}</p>
                                <p className="text-xs text-slate-500 mt-0.5">매칭: "<span className="text-yellow-600">{v.matchedText}</span>"</p>
                                {v.aiConfidence !== undefined && (
                                  <span className="text-xs text-yellow-600 font-medium">AI 확신도: {v.aiConfidence}%</span>
                                )}
                                {v.aiReasoning && <p className="text-xs text-slate-400 mt-1 italic">{v.aiReasoning}</p>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-slate-400 pt-2 border-t border-slate-100">
                    처리시간: {detailData.processing_time_ms}ms
                    {detailData.ai_processing_time_ms > 0 && ` (AI: ${detailData.ai_processing_time_ms}ms)`}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* ========== 이미지 분석 서브탭 ========== */}
      {subTab === 'analyze' && (
        <div className="grid grid-cols-2 gap-6">
          {/* 입력 폼 */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-4">🖼️ 이미지 OCR 분석</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">이미지 URL</label>
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/ad-image.jpg"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">분석 모드</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setAnalysisMode('regex')}
                    className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium border transition-all ${
                      analysisMode === 'regex'
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    📝 정규식 Only
                    <p className="text-xs mt-1 opacity-70">빠른 패턴 매칭</p>
                  </button>
                  <button
                    onClick={() => setAnalysisMode('hybrid')}
                    className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium border transition-all ${
                      analysisMode === 'hybrid'
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-transparent'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    🤖 하이브리드 (AI)
                    <p className="text-xs mt-1 opacity-70">정규식 + AI 검증</p>
                  </button>
                </div>
              </div>
              <button
                onClick={runAnalysis}
                disabled={analyzing || !imageUrl.trim()}
                className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-medium shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {analyzing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    분석 중...
                  </span>
                ) : '분석 실행'}
              </button>
            </div>
          </div>

          {/* 결과 표시 */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            {analysisResult ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800">분석 결과</h4>
                  <span className={`px-3 py-1.5 text-sm font-bold rounded-lg ${gradeColors[analysisResult.grade]?.bg} ${gradeColors[analysisResult.grade]?.text}`}>
                    {analysisResult.grade} 등급
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                    <p className={`text-2xl font-bold ${analysisResult.violationCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {analysisResult.violationCount}
                    </p>
                    <p className="text-xs text-slate-500">위반 항목</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                    <p className="text-2xl font-bold text-slate-700">{analysisResult.processingTimeMs}ms</p>
                    <p className="text-xs text-slate-500">처리 시간</p>
                  </div>
                </div>

                {analysisResult.analysisMode === 'hybrid' && analysisResult.hybridAnalysis && (
                  <div className="bg-purple-50 rounded-xl p-3 border border-purple-100">
                    <p className="text-xs font-medium text-purple-600 mb-1">AI 검증 결과</p>
                    <div className="flex justify-between text-sm">
                      <span>패턴 매칭: <b>{analysisResult.hybridAnalysis.totalPatternMatches}</b></span>
                      <span>AI 확정: <b className="text-emerald-600">{analysisResult.hybridAnalysis.confirmedCount}</b></span>
                      <span>오탐 후보: <b className="text-yellow-600">{analysisResult.hybridAnalysis.falsePositiveCandidateCount}</b></span>
                    </div>
                  </div>
                )}

                {/* OCR 텍스트 */}
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-xs font-medium text-slate-500 mb-1">추출 텍스트</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap max-h-24 overflow-y-auto">{analysisResult.extractedText || '(없음)'}</p>
                </div>

                {/* 위반 목록 */}
                {(analysisResult.violations || []).length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {analysisResult.violations.map((v, i) => (
                      <div key={i} className="p-2.5 bg-red-50 rounded-lg border border-red-100 text-sm">
                        <span className={`px-1.5 py-0.5 text-xs font-bold rounded ${
                          v.severity === 'critical' ? 'bg-red-200 text-red-700' : 'bg-orange-200 text-orange-700'
                        }`}>{v.severity}</span>
                        <span className="ml-2 text-slate-700">{v.description || v.category}</span>
                        <p className="text-xs text-slate-500 mt-1">"{v.matchedText}"</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-12">
                <div className="text-5xl mb-4">🖼️</div>
                <p className="text-slate-400">이미지 URL을 입력하고<br/>분석 버튼을 누르세요</p>
                <p className="text-xs text-slate-300 mt-2">Gemini OCR → 패턴 매칭 → AI 검증</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========== AI 정확도 서브탭 ========== */}
      {subTab === 'accuracy' && (
        <div className="space-y-6">
          {/* 기간 필터 */}
          <div className="flex gap-2">
            {[
              { id: 'all', label: '전체' },
              { id: '30d', label: '30일' },
              { id: '7d', label: '7일' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setAccuracyPeriod(p.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  accuracyPeriod === p.id
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {accuracyLoading ? (
            <div className="text-center py-12 text-slate-400">로딩 중...</div>
          ) : accuracyStats ? (
            <>
              {/* 전체 정확도 큰 카드 */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm text-center col-span-1">
                  <p className={`text-5xl font-bold ${
                    accuracyStats.overall.accuracy >= 80 ? 'text-emerald-600' :
                    accuracyStats.overall.accuracy >= 60 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {accuracyStats.overall.accuracy}%
                  </p>
                  <p className="text-slate-500 mt-2">전체 정확도</p>
                  <p className="text-xs text-slate-400 mt-1">{accuracyStats.overall.total}건 피드백</p>
                </div>
                <StatCard title="정탐 (Correct)" value={accuracyStats.overall.correctCount} color="emerald" />
                <StatCard title="오탐 (FP)" value={accuracyStats.overall.falsePositiveCount} color="red" />
                <StatCard title="누락 (Missed)" value={accuracyStats.overall.missedCount} color="yellow" />
              </div>

              {/* 모드별 비교 */}
              {accuracyStats.byMode.length > 0 && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <h4 className="font-bold text-slate-800 mb-4">📊 분석 모드별 정확도 비교</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {accuracyStats.byMode.map(mode => (
                      <div key={mode.mode} className={`rounded-xl p-4 border ${
                        mode.mode === 'hybrid' ? 'bg-purple-50 border-purple-100' : 'bg-slate-50 border-slate-100'
                      }`}>
                        <div className="flex items-center justify-between mb-3">
                          <span className={`px-2.5 py-1 text-xs font-bold rounded-lg ${
                            mode.mode === 'hybrid' ? 'bg-purple-200 text-purple-700' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {mode.mode === 'hybrid' ? '🤖 하이브리드' : '📝 정규식'}
                          </span>
                          <span className="text-2xl font-bold text-slate-800">{mode.accuracy}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2.5">
                          <div
                            className={`h-2.5 rounded-full ${mode.mode === 'hybrid' ? 'bg-purple-500' : 'bg-slate-500'}`}
                            style={{ width: `${mode.accuracy}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-2 text-xs text-slate-500">
                          <span>정탐 {mode.correctCount}</span>
                          <span>오탐 {mode.falsePositiveCount}</span>
                          <span>총 {mode.total}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* FP 패턴 Top 10 */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                  <h4 className="font-bold text-slate-800">🚨 오탐 빈도 Top 패턴</h4>
                </div>
                {fpPatterns.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">오탐 데이터가 없습니다</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left p-4 font-medium text-slate-600">#</th>
                        <th className="text-left p-4 font-medium text-slate-600">패턴 ID</th>
                        <th className="text-left p-4 font-medium text-slate-600">카테고리</th>
                        <th className="text-center p-4 font-medium text-slate-600">FP 횟수</th>
                        <th className="text-left p-4 font-medium text-slate-600">매칭 텍스트 샘플</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {fpPatterns.map((row, i) => (
                        <tr key={row.pattern_id} className={i % 2 === 0 ? 'bg-white' : 'bg-red-50/30'}>
                          <td className="p-4 text-slate-400">{i + 1}</td>
                          <td className="p-4 font-mono text-slate-700 text-xs">{row.pattern_id}</td>
                          <td className="p-4 text-slate-600">{row.category || '-'}</td>
                          <td className="p-4 text-center">
                            <span className="px-2.5 py-1 bg-red-100 text-red-600 text-xs font-bold rounded-lg">{row.fp_count}</span>
                          </td>
                          <td className="p-4 text-slate-500 text-xs truncate max-w-[200px]">{row.sample_texts || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* 카테고리별 정확도 */}
              {accuracyStats.byCategory.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-100">
                    <h4 className="font-bold text-slate-800">📂 카테고리별 정확도</h4>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left p-4 font-medium text-slate-600">카테고리</th>
                        <th className="text-center p-4 font-medium text-slate-600">정확도</th>
                        <th className="text-center p-4 font-medium text-slate-600">정탐</th>
                        <th className="text-center p-4 font-medium text-slate-600">오탐</th>
                        <th className="text-center p-4 font-medium text-slate-600">총 건수</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {accuracyStats.byCategory.map((row, i) => (
                        <tr key={row.category} className={i % 2 === 0 ? 'bg-white' : 'bg-blue-50/30'}>
                          <td className="p-4 text-slate-700 font-medium">{row.category}</td>
                          <td className="p-4 text-center">
                            <span className={`font-bold ${row.accuracy >= 80 ? 'text-emerald-600' : row.accuracy >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {row.accuracy}%
                            </span>
                          </td>
                          <td className="p-4 text-center text-emerald-600">{row.correctCount}</td>
                          <td className="p-4 text-center text-red-600">{row.falsePositiveCount}</td>
                          <td className="p-4 text-center text-slate-500">{row.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">정확도 데이터가 없습니다</div>
          )}
        </div>
      )}

      {/* ========== 패턴 관리 서브탭 ========== */}
      {subTab === 'fpManage' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-800">패턴별 FP 학습 현황</h3>
              <p className="text-sm text-slate-500 mt-1">피드백 기반 FP 비율 + 패턴 활성/비활성 관리</p>
            </div>
            <button onClick={loadFpManage} className="px-4 py-2 text-sm bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
              새로고침
            </button>
          </div>

          {fpManageLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : fpManageData.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
              피드백이 있는 패턴이 없습니다. OCR 분석 후 피드백을 남기면 여기에 표시됩니다.
            </div>
          ) : (
            <>
              {/* 요약 카드 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                  <div className="text-sm text-slate-500 mb-1">피드백 있는 패턴</div>
                  <div className="text-2xl font-bold text-slate-700">{fpManageData.length}개</div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                  <div className="text-sm text-slate-500 mb-1">FP 50%+ (주의 필요)</div>
                  <div className="text-2xl font-bold text-red-600">{fpManageData.filter(p => p.fpRate >= 0.5).length}개</div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                  <div className="text-sm text-slate-500 mb-1">비활성 패턴</div>
                  <div className="text-2xl font-bold text-amber-600">{fpManageData.filter(p => p.action === 'suppress').length}개</div>
                </div>
              </div>

              {/* 패턴 테이블 */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left p-4 font-medium text-slate-600">패턴 ID</th>
                        <th className="text-left p-4 font-medium text-slate-600">카테고리</th>
                        <th className="text-center p-4 font-medium text-slate-600">FP 비율</th>
                        <th className="text-center p-4 font-medium text-slate-600">FP / 전체</th>
                        <th className="text-center p-4 font-medium text-slate-600">감점</th>
                        <th className="text-center p-4 font-medium text-slate-600">상태</th>
                        <th className="text-center p-4 font-medium text-slate-600">토글</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {fpManageData.map((p, i) => {
                        const fpPct = Math.round(p.fpRate * 100);
                        const isHighFp = p.fpRate >= 0.5;
                        const isSuppressed = p.action === 'suppress';
                        return (
                          <tr key={p.patternId} className={`${isHighFp ? 'bg-red-50/50' : i % 2 === 0 ? 'bg-white' : 'bg-blue-50/30'}`}>
                            <td className="p-4">
                              <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">{p.patternId}</span>
                            </td>
                            <td className="p-4 text-slate-600">{p.category || '-'}</td>
                            <td className="p-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${fpPct >= 50 ? 'bg-red-500' : fpPct >= 30 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                    style={{ width: `${Math.min(fpPct, 100)}%` }}
                                  />
                                </div>
                                <span className={`text-xs font-bold ${fpPct >= 50 ? 'text-red-600' : fpPct >= 30 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                  {fpPct}%
                                </span>
                              </div>
                            </td>
                            <td className="p-4 text-center text-slate-500 text-xs">{p.fpCount} / {p.totalFeedback}</td>
                            <td className="p-4 text-center">
                              {p.confidencePenalty > 0 ? (
                                <span className="text-xs text-red-500 font-medium">-{Math.round(p.confidencePenalty * 100)}</span>
                              ) : (
                                <span className="text-xs text-slate-300">-</span>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              {isSuppressed ? (
                                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">비활성</span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">활성</span>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              <button
                                onClick={() => toggleFpPattern(p.patternId, p.action)}
                                disabled={fpTogglingId === p.patternId}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                  isSuppressed
                                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                                    : 'bg-red-50 hover:bg-red-100 text-red-700'
                                }`}
                              >
                                {fpTogglingId === p.patternId ? '...' : isSuppressed ? '활성화' : '비활성화'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// 크롤러 현황 탭
// ============================================
function CrawlerTab({ apiBase }) {
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triggerRegion, setTriggerRegion] = useState('서울');
  const [triggerAi, setTriggerAi] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState(null);
  const [stopping, setStopping] = useState(false);
  const [runningJobs, setRunningJobs] = useState([]);
  const [cancellingJob, setCancellingJob] = useState(null);
  const [expandedLog, setExpandedLog] = useState(null);
  const [logDetail, setLogDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(null);
  const [lastViolationsOpen, setLastViolationsOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [lastRefresh, setLastRefresh] = useState(null);

  // 1초 타이머 (실행 중인 작업 경과시간 표시용)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadStatus = async () => {
    try {
      const res = await fetch(`${apiBase}/v1/dashboard/summary`);
      const d = await res.json();
      if (d.success) {
        setStatus({
          schedulerOnline: d.data.crawler?.online,
          mode: d.data.crawler?.mode || 'cloud',
          lastHeartbeat: d.data.crawler?.lastHeartbeat,
          lastCrawl: d.data.recentBatch ? { started_at: d.data.recentBatch.started_at } : null,
          queue: d.data.queue,
          recentBatch: d.data.recentBatch,
          todaySummary: { runs: d.data.recentBatch ? 1 : 0, completed: d.data.recentBatch?.status === 'completed' ? 1 : 0 },
          pendingTriggers: d.data.queue?.pending || 0,
        });
      }
    } catch (e) { /* ignore */ }
  };

  const loadLogs = async () => {
    try {
      const res = await fetch(`${apiBase}/v1/crawl-batches?limit=30`);
      const d = await res.json();
      if (d.success) setLogs(d.data || []);
    } catch (e) { /* ignore */ }
  };

  const loadRunningJobs = async () => {
    // 클라우드 모드에서는 running jobs API 불필요 (Cron이 관리)
    setRunningJobs([]);
  };

  const loadLogDetail = async (logId) => {
    if (loadingDetail === logId) return;
    setLoadingDetail(logId);
    try {
      const res = await fetch(`${apiBase}/api/crawler/logs/${logId}`);
      const d = await res.json();
      if (d.success) setLogDetail(d.data);
    } catch (e) { /* ignore */ }
    setLoadingDetail(null);
  };

  const loadAll = async () => {
    await Promise.all([loadStatus(), loadLogs(), loadRunningJobs()]);
    setLastRefresh(new Date());
  };

  // 적응형 폴링: 실행 중 작업이 있으면 5초, 없으면 15초
  const hasRunning = runningJobs.length > 0;
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadAll();
      setLoading(false);
    };
    init();
    const interval = setInterval(loadAll, hasRunning ? 5000 : 15000);
    return () => clearInterval(interval);
  }, [hasRunning]);

  const handleTrigger = async () => {
    setTriggering(true);
    setTriggerResult(null);
    try {
      const res = await fetch(`${apiBase}/v1/dashboard/trigger-crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const d = await res.json();
      if (d.success) {
        setTriggerResult({ type: 'success', message: '클라우드 크롤링이 시작되었습니다' });
        setTimeout(loadAll, 5000);
      } else {
        setTriggerResult({ type: 'error', message: d.error || '트리거 실패' });
      }
    } catch (e) {
      setTriggerResult({ type: 'error', message: '네트워크 오류' });
    }
    setTriggering(false);
  };

  const handleShutdown = async () => {
    if (!confirm('스케줄러를 종료하시겠습니까?\n실행 중인 작업이 있으면 완료 후 종료됩니다.')) return;
    setStopping(true);
    try {
      const res = await fetch(`${apiBase}/api/crawler/shutdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const d = await res.json();
      if (d.success) {
        setTriggerResult({ type: 'success', message: '종료 요청 전송 완료 (최대 30초 후 반영)' });
        setTimeout(loadAll, 5000);
      }
    } catch (e) {
      setTriggerResult({ type: 'error', message: '종료 요청 실패' });
    }
    setStopping(false);
  };

  const handleCancelJob = async (jobId) => {
    if (!confirm('이 작업을 중지하시겠습니까?')) return;
    setCancellingJob(jobId);
    try {
      const res = await fetch(`${apiBase}/api/crawler/jobs/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      const d = await res.json();
      if (d.success) {
        setTriggerResult({ type: 'success', message: d.data.message });
        setTimeout(loadAll, 3000);
      }
    } catch (e) {
      setTriggerResult({ type: 'error', message: '작업 중지 요청 실패' });
    }
    setCancellingJob(null);
  };

  // 경과시간 (라이브)
  const formatElapsed = (startedAt) => {
    if (!startedAt) return '-';
    const elapsed = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    if (h > 0) return `${h}시간 ${m}분 ${s}초`;
    if (m > 0) return `${m}분 ${s}초`;
    return `${s}초`;
  };

  const formatDuration = (sec) => {
    if (!sec && sec !== 0) return '-';
    if (sec < 60) return `${sec}초`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}분 ${s}초` : `${m}분`;
  };

  const formatTime = (ts) => {
    if (!ts) return '-';
    const d = new Date(ts);
    return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatTimeShort = (ts) => {
    if (!ts) return '-';
    const d = new Date(ts);
    return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' });
  };

  const statusConfig = {
    running:          { bg: 'bg-blue-100',    text: 'text-blue-700',    label: '실행 중',  icon: '⏳' },
    completed:        { bg: 'bg-emerald-100', text: 'text-emerald-700', label: '완료',     icon: '✅' },
    failed:           { bg: 'bg-red-100',     text: 'text-red-700',     label: '실패',     icon: '❌' },
    cancel_requested: { bg: 'bg-orange-100',  text: 'text-orange-700',  label: '취소 중',  icon: '🛑' },
  };
  const statusBadge = (s) => {
    const c = statusConfig[s] || { bg: 'bg-slate-100', text: 'text-slate-600', label: s, icon: '·' };
    return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>{c.icon} {c.label}</span>;
  };

  const typeBadge = (t) => t === 'scheduled'
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-indigo-100 text-indigo-700">🕐 예약</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700">👆 수동</span>;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-slate-400">크롤러 상태 로딩 중...</p>
      </div>
    );
  }

  const isOnline = status?.schedulerOnline;
  const last = status?.lastCrawl;
  const today = status?.todaySummary || {};
  const successRate = today.runs > 0 ? Math.round(((today.completed || 0) / today.runs) * 100) : 0;
  const pending = status?.pendingTriggers || 0;

  return (
    <div className="space-y-5">
      {/* ━━━ 1. 스케줄러 ON/OFF 배너 ━━━ */}
      <div className={`rounded-2xl border shadow-sm overflow-hidden ${
        isOnline ? 'border-emerald-200' : 'border-slate-200'
      }`}>
        <div className={`px-6 py-5 flex items-center justify-between ${
          isOnline
            ? 'bg-gradient-to-r from-emerald-50 via-emerald-50/50 to-white'
            : 'bg-gradient-to-r from-slate-100 via-slate-50 to-white'
        }`}>
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-sm ${
              isOnline ? 'bg-emerald-100 border border-emerald-200' : 'bg-slate-200 border border-slate-300'
            }`}>
              {isOnline ? '🟢' : '⚫'}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className={`text-lg font-bold ${isOnline ? 'text-emerald-700' : 'text-slate-500'}`}>
                  스케줄러 {isOnline ? 'ON' : 'OFF'}
                </h2>
                {isOnline && <div className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse" />}
              </div>
              {isOnline ? (
                <div className="mt-1 space-y-0.5">
                  <p className="text-sm text-slate-600">
                    PID <span className="font-mono font-medium">{status?.schedulerInfo?.pid || '-'}</span>
                    <span className="mx-2 text-slate-300">|</span>
                    실행 중 <span className="font-medium">{status?.schedulerInfo?.runningJobs || 0}</span>
                    <span className="mx-2 text-slate-300">|</span>
                    대기 <span className="font-medium">{status?.schedulerInfo?.queuedJobs || 0}</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    다음 예약: {formatTime(status?.schedulerInfo?.nextScheduledRun)}
                    <span className="mx-2 text-slate-300">·</span>
                    하트비트: {formatTimeShort(status?.lastHeartbeat)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-400 mt-1">로컬 스케줄러가 실행되고 있지 않습니다</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isOnline ? (
              <button
                onClick={handleShutdown}
                disabled={stopping}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-red-500 hover:bg-red-600 text-white transition-all shadow-sm disabled:opacity-50 active:scale-95"
              >
                {stopping ? '종료 요청 중...' : '스케줄러 끄기'}
              </button>
            ) : (
              <div className="text-right">
                <code className="text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded-lg px-4 py-2 block">
                  npm run scheduler:start
                </code>
                <p className="text-xs text-slate-400 mt-1.5">로컬 터미널에서 실행</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ━━━ 알림 메시지 ━━━ */}
      {triggerResult && (
        <div className={`px-4 py-3 rounded-xl text-sm flex items-center gap-2 ${
          triggerResult.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          <span>{triggerResult.type === 'success' ? '✅' : '❌'}</span>
          {triggerResult.message}
          <button onClick={() => setTriggerResult(null)} className="ml-auto text-lg opacity-50 hover:opacity-100">&times;</button>
        </div>
      )}

      {/* ━━━ 2. 오늘 통계 카드 ━━━ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: '오늘 실행', value: `${today.runs || 0}회`, sub: `완료 ${today.completed || 0} · 실패 ${today.failed || 0}`, color: 'blue', icon: '🔄' },
          { label: '분석 병원', value: `${today.totalHospitals || 0}개`, sub: '오늘 총 분석 대상', color: 'indigo', icon: '🏥' },
          { label: '위반 탐지', value: `${today.totalViolations || 0}건`, sub: '오늘 총 위반 감지', color: 'red', icon: '⚠️' },
          { label: '성공률', value: `${successRate}%`, sub: today.runs > 0 ? `${today.completed || 0}/${today.runs}` : '실행 없음', color: 'emerald', icon: '📊' },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{card.label}</span>
              <span className="text-lg">{card.icon}</span>
            </div>
            <div className={`text-2xl font-bold text-${card.color}-600`}>{card.value}</div>
            <div className="text-xs text-slate-400 mt-1">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* ━━━ 3. 실행 중인 작업 (라이브) ━━━ */}
      {runningJobs.length > 0 && (
        <div className="bg-white rounded-2xl border border-blue-200 shadow-sm overflow-hidden">
          <div className="px-6 py-3 border-b border-blue-100 bg-gradient-to-r from-blue-50 to-white flex items-center justify-between">
            <h3 className="text-sm font-semibold text-blue-700 flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
              실행 중인 작업 ({runningJobs.length})
            </h3>
            <span className="text-xs text-blue-400">5초마다 자동 갱신</span>
          </div>
          <div className="divide-y divide-slate-100">
            {runningJobs.map((job) => {
              const elapsed = Math.max(0, Math.floor((now - new Date(job.started_at).getTime()) / 1000));
              const isCancelReq = job.status === 'cancel_requested';
              return (
                <div key={job.id} className={`px-6 py-4 ${isCancelReq ? 'bg-orange-50/50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        isCancelReq ? 'bg-orange-100' : 'bg-blue-100'
                      }`}>
                        {isCancelReq
                          ? <span className="text-lg">🛑</span>
                          : <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-700 font-mono">{job.job_id}</span>
                          {typeBadge(job.type)}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                          <span>📍 {job.region || '-'}</span>
                          <span>시작: {formatTime(job.started_at)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className={`text-lg font-bold font-mono ${isCancelReq ? 'text-orange-600' : 'text-blue-600'}`}>
                          {formatElapsed(job.started_at)}
                        </div>
                        <div className="text-xs text-slate-400">경과 시간</div>
                      </div>
                      {job.status === 'running' && (
                        <button
                          onClick={() => handleCancelJob(job.job_id)}
                          disabled={cancellingJob === job.job_id}
                          className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-500 hover:bg-red-600 text-white transition-all shadow-sm disabled:opacity-50 active:scale-95"
                        >
                          {cancellingJob === job.job_id ? '요청 중...' : '중지'}
                        </button>
                      )}
                      {isCancelReq && (
                        <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200">
                          취소 처리 중...
                        </span>
                      )}
                    </div>
                  </div>
                  {/* 파이프라인 단계 표시 */}
                  <div className="mt-3 flex items-center gap-1 text-xs">
                    {['CSV 로드', '분석 실행', '결과 전송'].map((step, i) => {
                      const active = i === 1; // 실행 중이면 분석 단계
                      const done = i === 0;
                      return (
                        <React.Fragment key={step}>
                          <div className={`px-2.5 py-1 rounded-md ${
                            done ? 'bg-emerald-100 text-emerald-700' :
                            active ? 'bg-blue-100 text-blue-700 font-medium' :
                            'bg-slate-100 text-slate-400'
                          }`}>
                            {done ? '✓ ' : active ? '▶ ' : ''}{step}
                          </div>
                          {i < 2 && <span className="text-slate-300">→</span>}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ━━━ 실시간 진행 상황 (activeJob) ━━━ */}
      {status?.activeJob && (
        <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden">
          <div className="px-6 py-3 border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-white flex items-center justify-between">
            <h3 className="text-sm font-semibold text-indigo-700 flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-pulse" />
              실시간 분석 진행
            </h3>
            <span className="text-xs text-indigo-400">5초마다 자동 갱신</span>
          </div>
          <div className="px-6 py-4 space-y-4">
            {/* 프로그레스 바 */}
            {(() => {
              const aj = status.activeJob;
              const pct = aj.totalCount > 0 ? Math.round((aj.processedCount / aj.totalCount) * 100) : 0;
              return (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">진행률</span>
                    <span className="font-bold text-indigo-600">{pct}% ({aj.processedCount}/{aj.totalCount})</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div className="bg-gradient-to-r from-indigo-500 to-blue-500 h-3 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="text-xs text-slate-400 mb-1">현재 병원</div>
                      <div className="text-sm font-semibold text-slate-700 truncate">{aj.currentHospital || '-'}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-red-50 border border-red-100">
                      <div className="text-xs text-red-400 mb-1">위반 탐지</div>
                      <div className="text-sm font-bold text-red-600">{aj.foundViolations || 0}건</div>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                      <div className="text-xs text-emerald-400 mb-1">분석 완료</div>
                      <div className="text-sm font-bold text-emerald-600">{aj.processedCount || 0}개</div>
                    </div>
                    <div className="p-3 rounded-xl bg-orange-50 border border-orange-100">
                      <div className="text-xs text-orange-400 mb-1">실패</div>
                      <div className="text-sm font-bold text-orange-600">{aj.failedCount || 0}개</div>
                    </div>
                  </div>
                  {/* 최근 로그 */}
                  {aj.recentLogs && aj.recentLogs.length > 0 && (
                    <div className="mt-2">
                      <div className="text-xs text-slate-400 mb-2">최근 처리 로그</div>
                      <div className="space-y-1">
                        {aj.recentLogs.slice().reverse().map((log, idx) => (
                          <div key={idx} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${
                            log.status === 'error' ? 'bg-red-50 text-red-600' :
                            log.violations > 0 ? 'bg-amber-50 text-amber-700' :
                            'bg-slate-50 text-slate-600'
                          }`}>
                            <span>{log.status === 'error' ? '✗' : log.violations > 0 ? '⚠️' : '✓'}</span>
                            <span className="font-medium truncate flex-1">{log.hospital}</span>
                            {log.grade && log.grade !== '-' && <span className="px-1.5 py-0.5 rounded bg-white border text-xs">{log.grade}</span>}
                            {log.violations > 0 && <span className="text-red-500 font-medium">위반 {log.violations}건</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ━━━ 대기 트리거 알림 ━━━ */}
      {pending > 0 && (
        <div className="px-4 py-3 rounded-xl text-sm bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-2">
          <span>⏳</span>
          대기 중인 트리거 <span className="font-bold">{pending}건</span> — 스케줄러가 곧 처리합니다
        </div>
      )}

      {/* ━━━ 4. 수동 실행 + 스케줄 정보 ━━━ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">👆 수동 크롤링 실행</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs text-slate-500 mb-1 block">지역</label>
                <select
                  value={triggerRegion}
                  onChange={(e) => setTriggerRegion(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-colors"
                >
                  {['서울','경기','부산','대구','인천','광주','대전'].map(r =>
                    <option key={r} value={r}>{r}</option>
                  )}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500 mb-1 block">옵션</label>
                <label className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                  <input type="checkbox" checked={triggerAi} onChange={(e) => setTriggerAi(e.target.checked)} className="rounded" />
                  <span className="text-sm text-slate-600">AI 분석</span>
                </label>
              </div>
            </div>
            <button
              onClick={handleTrigger}
              disabled={triggering || !isOnline}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] ${
                isOnline
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {triggering ? '트리거 등록 중...' : isOnline ? '크롤링 시작' : '스케줄러 오프라인'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">🕐 스케줄 정보</h3>
          {status?.schedulerInfo ? (
            <div className="space-y-3">
              {(status.schedulerInfo.schedules || []).map((s, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-indigo-50/50 border border-indigo-100">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-sm">🔄</div>
                  <div>
                    <div className="text-sm font-medium text-indigo-700">{s}</div>
                    <div className="text-xs text-indigo-400">매일 · 서울 · 자동 실행</div>
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">다음 실행</span>
                  <span className="font-medium text-slate-700">{formatTime(status.schedulerInfo.nextScheduledRun)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-slate-400">스케줄러가 오프라인입니다</p>
              <p className="text-xs text-slate-300 mt-1">스케줄러를 시작하면 자동 스케줄이 활성화됩니다</p>
            </div>
          )}
        </div>
      </div>

      {/* ━━━ 5. 마지막 크롤링 결과 ━━━ */}
      {last && (
        <div className={`rounded-2xl p-6 border shadow-sm ${
          last.status === 'completed' ? 'bg-emerald-50/30 border-emerald-200' :
          last.status === 'failed' ? 'bg-red-50/30 border-red-200' :
          'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              📋 마지막 크롤링 결과
            </h3>
            {statusBadge(last.status)}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {[
              { label: '지역', value: last.region || '-', icon: '📍' },
              { label: '유형', value: last.type === 'scheduled' ? '예약' : '수동', icon: last.type === 'scheduled' ? '🕐' : '👆' },
              { label: '시작 시간', value: formatTime(last.started_at), icon: '🕑' },
              { label: '소요시간', value: formatDuration(last.duration_seconds), icon: '⏱️' },
              { label: '분석 병원', value: `${last.hospitals_analyzed || last.hospitals_total || 0}개`, icon: '🏥' },
              { label: '위반 탐지', value: `${last.violations_found || 0}건`, icon: '⚠️', clickable: (last.violations_found || 0) > 0 },
            ].map(item => (
              <div key={item.label}
                className={item.clickable ? 'cursor-pointer hover:bg-white/50 rounded-lg p-1 -m-1 transition-colors' : ''}
                onClick={() => {
                  if (item.clickable) {
                    if (!lastViolationsOpen && last.id) loadLogDetail(last.id);
                    setLastViolationsOpen(!lastViolationsOpen);
                  }
                }}
              >
                <div className="text-xs text-slate-500 flex items-center gap-1 mb-1">{item.icon} {item.label}</div>
                <div className={`text-sm font-semibold ${item.clickable ? 'text-red-600 underline decoration-dotted' : 'text-slate-700'}`}>
                  {item.value}
                  {item.clickable && <span className="text-xs ml-1">{lastViolationsOpen ? '▲' : '▼'}</span>}
                </div>
              </div>
            ))}
          </div>
          {last.error_details && (
            <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-100 text-xs text-red-600 font-mono">
              {last.error_details}
            </div>
          )}
          {/* 위반 상세 펼침 */}
          {lastViolationsOpen && logDetail && logDetail.id === last.id && (
            <div className="mt-4 border-t border-slate-200 pt-4 space-y-3">
              {logDetail.hospitals && logDetail.hospitals.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-2">분석 병원 ({logDetail.hospitals.length}개)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {logDetail.hospitals.map((h, i) => (
                      <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border ${
                        h.violationCount > 0 ? 'bg-red-50 border-red-200 text-red-700 font-medium' : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}>
                        {h.name}
                        {h.grade && h.grade !== '-' && <span className="opacity-60">({h.grade})</span>}
                        {h.violationCount > 0 && <span className="text-red-500">{h.violationCount}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {logDetail.violations && logDetail.violations.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-red-500 mb-2">위반 상세 ({logDetail.violations.length}건)</div>
                  <div className="space-y-1.5">
                    {logDetail.violations.map((v, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-xs">
                        <span className="font-semibold text-red-700 min-w-[80px] truncate">{v.hospitalName}</span>
                        <span className="text-slate-400">|</span>
                        <span className="text-slate-700 flex-1 truncate">{v.patternName}</span>
                        {v.matchedText && (
                          <>
                            <span className="text-slate-400">|</span>
                            <span className="text-red-600 font-mono truncate max-w-[200px]">'{v.matchedText}'</span>
                          </>
                        )}
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          v.severity === 'critical' ? 'bg-red-200 text-red-800' :
                          v.severity === 'major' ? 'bg-orange-200 text-orange-800' :
                          'bg-yellow-200 text-yellow-800'
                        }`}>
                          {v.severity === 'critical' ? '위험' : v.severity === 'major' ? '중요' : '경미'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(!logDetail.violations || logDetail.violations.length === 0) && (!logDetail.hospitals || logDetail.hospitals.length === 0) && (
                <div className="text-center py-4 text-xs text-slate-400">
                  상세 데이터가 아직 저장되지 않았습니다. 다음 크롤링부터 기록됩니다.
                </div>
              )}
            </div>
          )}
          {lastViolationsOpen && loadingDetail === last.id && (
            <div className="mt-4 text-center py-4 text-xs text-slate-400">
              <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              상세 데이터 로딩 중...
            </div>
          )}
        </div>
      )}

      {/* ━━━ 6. 실행 이력 테이블 (확장 가능) ━━━ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-slate-700">📜 실행 이력</h3>
            <span className="text-xs text-slate-400">{logs.length}건</span>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-xs text-slate-400">
                갱신: {lastRefresh.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <button
              onClick={loadAll}
              className="px-3 py-1.5 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors font-medium"
            >
              🔄 새로고침
            </button>
          </div>
        </div>
        {logs.length === 0 ? (
          <div className="p-16 text-center">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-sm text-slate-400">실행 이력이 없습니다</p>
            <p className="text-xs text-slate-300 mt-1">크롤링을 실행하면 여기에 기록됩니다</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="text-left p-3 pl-6 font-medium text-slate-500 text-xs uppercase tracking-wider"></th>
                  <th className="text-left p-3 font-medium text-slate-500 text-xs uppercase tracking-wider">시간</th>
                  <th className="text-center p-3 font-medium text-slate-500 text-xs uppercase tracking-wider">유형</th>
                  <th className="text-center p-3 font-medium text-slate-500 text-xs uppercase tracking-wider">지역</th>
                  <th className="text-center p-3 font-medium text-slate-500 text-xs uppercase tracking-wider">병원수</th>
                  <th className="text-center p-3 font-medium text-slate-500 text-xs uppercase tracking-wider">위반</th>
                  <th className="text-center p-3 font-medium text-slate-500 text-xs uppercase tracking-wider">소요시간</th>
                  <th className="text-center p-3 pr-6 font-medium text-slate-500 text-xs uppercase tracking-wider">상태</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const isExpanded = expandedLog === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        className={`cursor-pointer transition-colors ${
                          isExpanded ? 'bg-blue-50/50' : i % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/30 hover:bg-slate-50'
                        }`}
                        onClick={() => {
                          if (isExpanded) {
                            setExpandedLog(null);
                            setLogDetail(null);
                          } else {
                            setExpandedLog(log.id);
                            loadLogDetail(log.id);
                          }
                        }}
                      >
                        <td className="p-3 pl-6 text-slate-400 text-xs">
                          {isExpanded ? '▼' : '▶'}
                        </td>
                        <td className="p-3 text-slate-700 font-medium">{formatTime(log.started_at)}</td>
                        <td className="p-3 text-center">{typeBadge(log.type)}</td>
                        <td className="p-3 text-center text-slate-600">{log.region || '-'}</td>
                        <td className="p-3 text-center">
                          <span className="text-slate-700 font-semibold">{log.hospitals_analyzed || 0}</span>
                          {log.hospitals_total > 0 && log.hospitals_total !== log.hospitals_analyzed && (
                            <span className="text-slate-400 text-xs">/{log.hospitals_total}</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`font-semibold ${(log.violations_found || 0) > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                            {log.violations_found || 0}
                          </span>
                        </td>
                        <td className="p-3 text-center text-slate-500">{formatDuration(log.duration_seconds)}</td>
                        <td className="p-3 pr-6 text-center">{statusBadge(log.status)}</td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="bg-slate-50/80 px-6 py-4 border-t border-slate-100">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                              <div>
                                <span className="text-slate-400 block mb-0.5">Job ID</span>
                                <span className="text-slate-700 font-mono font-medium">{log.job_id || '-'}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block mb-0.5">Trigger ID</span>
                                <span className="text-slate-700 font-mono font-medium">{log.trigger_id || '-'}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block mb-0.5">시작</span>
                                <span className="text-slate-700">{formatTime(log.started_at)}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block mb-0.5">완료</span>
                                <span className="text-slate-700">{formatTime(log.completed_at)}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block mb-0.5">전체 병원</span>
                                <span className="text-slate-700 font-medium">{log.hospitals_total || 0}개</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block mb-0.5">분석 완료</span>
                                <span className="text-slate-700 font-medium">{log.hospitals_analyzed || 0}개</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block mb-0.5">오류 수</span>
                                <span className={`font-medium ${(log.error_count || 0) > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                  {log.error_count || 0}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block mb-0.5">Log ID</span>
                                <span className="text-slate-700 font-mono text-xs">{log.id}</span>
                              </div>
                            </div>
                            {log.error_details && (
                              <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-100">
                                <span className="text-xs text-red-500 font-medium block mb-1">오류 상세</span>
                                <pre className="text-xs text-red-600 font-mono whitespace-pre-wrap">{log.error_details}</pre>
                              </div>
                            )}
                            {/* 병원 + 위반 상세 */}
                            {logDetail && logDetail.id === log.id && (
                              <div className="mt-4 space-y-3 border-t border-slate-200 pt-3">
                                {logDetail.hospitals && logDetail.hospitals.length > 0 && (
                                  <div>
                                    <div className="text-xs font-semibold text-slate-500 mb-2">분석 병원 ({logDetail.hospitals.length}개)</div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {logDetail.hospitals.map((h, idx) => (
                                        <span key={idx} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border ${
                                          h.violationCount > 0 ? 'bg-red-50 border-red-200 text-red-700 font-medium' : 'bg-white border-slate-200 text-slate-600'
                                        }`}>
                                          {h.name}
                                          {h.grade && h.grade !== '-' && <span className="opacity-60">({h.grade})</span>}
                                          {h.violationCount > 0 && <span className="text-red-500">{h.violationCount}</span>}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {logDetail.violations && logDetail.violations.length > 0 && (
                                  <div>
                                    <div className="text-xs font-semibold text-red-500 mb-2">위반 상세 ({logDetail.violations.length}건)</div>
                                    <div className="space-y-1">
                                      {logDetail.violations.map((v, idx) => (
                                        <div key={idx} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-xs">
                                          <span className="font-semibold text-red-700 min-w-[80px] truncate">{v.hospitalName}</span>
                                          <span className="text-slate-300">|</span>
                                          <span className="text-slate-700 flex-1 truncate">{v.patternName}</span>
                                          {v.matchedText && (
                                            <>
                                              <span className="text-slate-300">|</span>
                                              <span className="text-red-600 font-mono truncate max-w-[200px]">'{v.matchedText}'</span>
                                            </>
                                          )}
                                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${
                                            v.severity === 'critical' ? 'bg-red-200 text-red-800' :
                                            v.severity === 'major' ? 'bg-orange-200 text-orange-800' :
                                            'bg-yellow-200 text-yellow-800'
                                          }`}>
                                            {v.severity === 'critical' ? '위험' : v.severity === 'major' ? '중요' : '경미'}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {(!logDetail.hospitals || logDetail.hospitals.length === 0) && (!logDetail.violations || logDetail.violations.length === 0) && (
                                  <div className="text-center py-3 text-xs text-slate-400">
                                    상세 데이터가 아직 저장되지 않았습니다.
                                  </div>
                                )}
                              </div>
                            )}
                            {loadingDetail === log.id && (
                              <div className="mt-3 text-center py-3 text-xs text-slate-400">
                                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-1" />
                                상세 로딩 중...
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
