import React, { useState, useEffect } from 'react';
import PriceAnalytics from './PriceAnalytics';

// ============================================
// MEDCHECK Engine 대시보드 v1.4.0
// 개선: 탭 정리 + 에드체크 탭 + 병원별 위반 상세
// ============================================

const API_BASE = 'https://medcheck-engine.mmakid.workers.dev';

export default function MedCheckDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

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

  // 스크린샷 모달
  const [screenshotModal, setScreenshotModal] = useState(null);

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
      // v2
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

  const formatPricePerShot = (price) => {
    if (!price) return '-';
    return price.toLocaleString() + '원/샷';
  };

  // ============================================
  // 탭 구조 개선 - 핵심 기능 위주로 정리
  // ============================================
  const tabs = [
    { id: 'overview', name: '🔍 분석', icon: '🔍' },
    { id: 'batch', name: '📁 배치분석', icon: '📁' },
    { id: 'adcheck', name: '✅ 에드체크', icon: '✅' },  // 패턴 → 에드체크 (병원별 위반 현황)
    { id: 'pricing', name: '💰 시술가격', icon: '💰', badge: priceAlerts.length },
    { id: 'alerts', name: '🔔 가격알림', icon: '🔔', badge: priceAlerts.filter(a => !a.is_read).length },
    { id: 'mapping', name: '🔄 매핑승인', icon: '🔄', badge: mappingCandidates.length },
    { id: 'fp', name: '⚠️ 예외/오탐', icon: '⚠️', badge: fpStats.summary?.pending || 0 },
    { id: 'tricks', name: '🎭 꼼수', icon: '🎭', badge: tricksStats.summary?.total || 0 },
    { id: 'performance', name: '📈 성능', icon: '📈' },
    { id: 'history', name: '📜 이력', icon: '📜' },
    { id: 'priceAnalytics', name: '📊 가격분석', icon: '📊' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">API 연결 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4">
      <div className="max-w-7xl mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">
              AD MEDCHECKER Engine
            </h1>
            <p className="text-slate-400 text-sm">v1.4.0 | 시술가격 v2 | {currentTime.toLocaleTimeString()}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/20 rounded-full">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-emerald-400 text-sm">{healthData?.status || 'connected'}</span>
            </div>
            <button onClick={loadAllData} className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 text-sm">🔄</button>
          </div>
        </div>

        {/* 탭 - 개선된 레이아웃 */}
        <div className="flex gap-1 mb-4 bg-slate-800/50 p-1 rounded-lg overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-gradient-to-r from-cyan-500 to-indigo-500' : 'text-slate-400 hover:bg-slate-700'
                }`}>
              {tab.name}
              {tab.badge > 0 && <span className={`px-1.5 py-0.5 text-xs rounded ${tab.id === 'alerts' ? 'bg-red-500' : 'bg-white/20'}`}>{tab.badge}</span>}
            </button>
          ))}
        </div>

        {/* ============================================ */}
        {/* 개요/분석 탭 */}
        {/* ============================================ */}
        {activeTab === 'overview' && (
          <AnalyzeTab apiBase={API_BASE} />
        )}

        {/* ============================================ */}
        {/* 배치분석 탭 */}
        {/* ============================================ */}
        {activeTab === 'batch' && (
          <BatchAnalyzeTab apiBase={API_BASE} />
        )}

        {/* ============================================ */}
        {/* 에드체크 탭 - 병원별 위반 현황 (NEW!) */}
        {/* ============================================ */}
        {activeTab === 'adcheck' && (
          <AdCheckTab apiBase={API_BASE} />
        )}

        {/* ============================================ */}
        {/* 시술가격 탭 */}
        {/* ============================================ */}
        {activeTab === 'pricing' && (
          <div className="space-y-4">
            {/* 가격 통계 */}
            <div className="grid grid-cols-4 gap-3">
              <StatCard title="수집된 가격" value={priceStats.summary?.totalPrices || 0} color="cyan" />
              <StatCard title="시술 종류" value={priceStats.summary?.uniqueProcedures || 0} color="purple" />
              <StatCard title="병원 수" value={priceStats.summary?.uniqueHospitals || 0} color="emerald" />
              <StatCard title="매핑 대기" value={priceStats.pendingMappings || 0} color="yellow" />
            </div>

            {/* 시술 목록 */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700">
              <div className="p-3 border-b border-slate-700 flex justify-between items-center">
                <span className="font-semibold">💰 시술별 가격 현황</span>
                <select
                  value={selectedArea}
                  onChange={(e) => setSelectedArea(e.target.value)}
                  className="bg-slate-700 border-none rounded px-2 py-1 text-sm"
                >
                  <option value="">전체 부위</option>
                  {targetAreas.map(area => (
                    <option key={area.id} value={area.name}>{area.name}</option>
                  ))}
                </select>
              </div>
              <div className="divide-y divide-slate-700 max-h-96 overflow-y-auto">
                {procedures.length > 0 ? procedures.map((proc, i) => (
                  <div
                    key={i}
                    className={`p-3 hover:bg-slate-700/30 cursor-pointer ${selectedProcedure === proc.id ? 'bg-slate-700/50' : ''}`}
                    onClick={() => { loadProcedureDetail(proc.id); loadPriceCompare(proc.id, selectedArea); }}
                  >
                    <div className="flex justify-between">
                      <div>
                        <p className="font-medium">{proc.name}</p>
                        <p className="text-xs text-slate-400">{proc.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-cyan-400">{formatPrice(proc.avgPrice)}</p>
                        <p className="text-xs text-slate-400">{proc.priceCount}건</p>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="p-8 text-center text-slate-500">가격 데이터가 없습니다</div>
                )}
              </div>
            </div>

            {/* 가격 비교 */}
            {priceCompare && (
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <h3 className="font-semibold mb-3">📊 가격 비교</h3>
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <StatCard title="최저가" value={formatPrice(priceCompare.stats?.priceRange?.min)} color="emerald" />
                  <StatCard title="평균가" value={formatPrice(priceCompare.stats?.priceAvg)} color="cyan" />
                  <StatCard title="최고가" value={formatPrice(priceCompare.stats?.priceRange?.max)} color="red" />
                  <StatCard title="데이터 수" value={priceCompare.stats?.totalRecords || 0} color="slate" />
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {priceCompare.prices?.map((p, i) => (
                    <div key={i} className="flex justify-between items-center p-2 bg-slate-700/30 rounded">
                      <div>
                        <p className="text-sm font-medium">{p.hospital_name}</p>
                        <p className="text-xs text-slate-400">{p.sigungu}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-cyan-400 font-bold">{formatPrice(p.price)}</p>
                        {p.price_per_shot && <p className="text-xs text-slate-400">{formatPricePerShot(p.price_per_shot)}</p>}
                      </div>
                      {p.screenshot_url && (
                        <button
                          onClick={() => setScreenshotModal({ url: p.screenshot_url, hospital: p.hospital_name, price: p.price })}
                          className="ml-2 text-slate-400 hover:text-white"
                        >📸</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================ */}
        {/* 가격 알림 탭 */}
        {/* ============================================ */}
        {activeTab === 'alerts' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <StatCard title="미확인 알림" value={priceAlerts.filter(a => !a.is_read).length} color="red" />
              <StatCard title="전체 알림" value={priceAlerts.length} color="slate" />
              <StatCard title="금일 알림" value={priceAlerts.filter(a => {
                const d = new Date(a.created_at);
                const now = new Date();
                return d.toDateString() === now.toDateString();
              }).length} color="cyan" />
            </div>

            <div className="bg-slate-800/50 rounded-xl border border-slate-700">
              <div className="p-3 border-b border-slate-700 font-semibold">🔔 가격 알림</div>
              <div className="divide-y divide-slate-700 max-h-96 overflow-y-auto">
                {priceAlerts.length > 0 ? priceAlerts.map((alert, i) => (
                  <div key={i} className={`p-3 hover:bg-slate-700/30 ${!alert.is_read ? 'border-l-2 border-red-500' : ''}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{alert.hospital_name}</p>
                        <p className="text-sm text-slate-400">{alert.procedure_name}</p>
                        <p className="text-xs text-slate-500 mt-1">{new Date(alert.created_at).toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-cyan-400 font-bold">{formatPrice(alert.new_price)}</p>
                        {alert.old_price && (
                          <p className="text-xs text-slate-400 line-through">{formatPrice(alert.old_price)}</p>
                        )}
                        <span className={`text-xs px-1 rounded ${alert.change_type === 'decrease' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                          {alert.change_type === 'decrease' ? '▼ 인하' : '▲ 인상'}
                        </span>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="p-8 text-center text-slate-500">알림이 없습니다</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* 매핑 승인 탭 */}
        {/* ============================================ */}
        {activeTab === 'mapping' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <StatCard title="승인 대기" value={mappingCandidates.length} color="yellow" />
              <StatCard title="오늘 처리" value={0} color="emerald" />
            </div>

            <div className="bg-slate-800/50 rounded-xl border border-slate-700">
              <div className="p-3 border-b border-slate-700 font-semibold">🔄 매핑 승인 대기</div>
              <div className="divide-y divide-slate-700">
                {mappingCandidates.length > 0 ? mappingCandidates.map((mc, i) => (
                  <div key={i} className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-medium">{mc.raw_text}</p>
                        <p className="text-sm text-cyan-400">→ {mc.suggested_procedure}</p>
                        <p className="text-xs text-slate-400 mt-1">신뢰도: {(mc.confidence * 100).toFixed(0)}%</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => approveMappingCandidate(mc.id)}
                          className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded text-sm hover:bg-emerald-500/30"
                        >✓ 승인</button>
                        <button
                          onClick={() => rejectMappingCandidate(mc.id, '부정확')}
                          className="px-3 py-1 bg-slate-500/20 text-slate-400 rounded text-sm hover:bg-slate-500/30"
                        >✕ 반려</button>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="p-8 text-center text-slate-500">승인 대기 중인 매핑이 없습니다</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* 예외/오탐 탭 */}
        {/* ============================================ */}
        {activeTab === 'fp' && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <StatCard title="전체" value={fpStats.summary?.total || 0} color="slate" />
              <StatCard title="대기" value={fpStats.summary?.pending || 0} color="yellow" />
              <StatCard title="검토중" value={fpStats.summary?.reviewing || 0} color="blue" />
              <StatCard title="해결" value={fpStats.summary?.resolved || 0} color="emerald" />
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <h3 className="font-semibold mb-3">예외 제안 ({suggestions.length})</h3>
              {suggestions.slice(0, 5).map((s, i) => (
                <div key={i} className="flex justify-between py-2 border-b border-slate-700/50">
                  <span className="text-sm">"{s.exception_value}"</span>
                  <span className="text-cyan-400 text-sm">{s.confidence}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* 꼼수 탭 */}
        {/* ============================================ */}
        {activeTab === 'tricks' && (
          <TricksTab apiBase={API_BASE} tricksStats={tricksStats} />
        )}

        {/* ============================================ */}
        {/* 성능 탭 */}
        {/* ============================================ */}
        {activeTab === 'performance' && (
          <PerformanceTab apiBase={API_BASE} />
        )}

        {/* ============================================ */}
        {/* 이력 탭 */}
        {/* ============================================ */}
        {activeTab === 'history' && (
          <HistoryTab apiBase={API_BASE} />
        )}

        {/* ============================================ */}
        {/* 가격분석 탭 */}
        {/* ============================================ */}
        {activeTab === 'priceAnalytics' && (
          <PriceAnalytics />
        )}

        {/* ============================================ */}
        {/* 스크린샷 모달 */}
        {/* ============================================ */}
        {screenshotModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setScreenshotModal(null)}>
            <div className="bg-slate-800 rounded-xl max-w-4xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b border-slate-700 flex justify-between items-center sticky top-0 bg-slate-800">
                <div>
                  <h3 className="font-bold">📸 원본 스크린샷</h3>
                  {screenshotModal.hospital && <p className="text-sm text-slate-400">{screenshotModal.hospital}</p>}
                  {screenshotModal.label && <p className="text-sm text-cyan-400">{screenshotModal.label}</p>}
                </div>
                <button onClick={() => setScreenshotModal(null)} className="text-slate-400 hover:text-white text-xl">✕</button>
              </div>
              <div className="p-4">
                <img src={screenshotModal.url} alt="Screenshot" className="w-full rounded" />
                {screenshotModal.price && (
                  <p className="text-center mt-4 text-lg">수집 가격: <span className="text-cyan-400 font-bold">{formatPrice(screenshotModal.price)}</span></p>
                )}
              </div>
              <div className="p-4 border-t border-slate-700 text-center text-xs text-slate-400">
                ⚠️ 본 이미지는 자동 수집된 것으로 참고용입니다.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, color }) {
  const colors = {
    cyan: 'text-cyan-400', yellow: 'text-yellow-400', purple: 'text-purple-400',
    orange: 'text-orange-400', slate: 'text-slate-300', emerald: 'text-emerald-400',
    blue: 'text-blue-400', red: 'text-red-400'
  };
  return (
    <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-700/50">
      <p className="text-slate-400 text-xs">{title}</p>
      <p className={`text-xl font-bold ${colors[color]}`}>{value}</p>
    </div>
  );
}

// ============================================
// 분석 탭 컴포넌트
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
    'A': 'text-emerald-400 bg-emerald-500/20',
    'B': 'text-blue-400 bg-blue-500/20',
    'C': 'text-yellow-400 bg-yellow-500/20',
    'D': 'text-orange-400 bg-orange-500/20',
    'F': 'text-red-400 bg-red-500/20'
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
        <h2 className="text-lg font-semibold mb-3">🔍 실시간 광고 분석</h2>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="분석할 광고 텍스트를 입력하세요..."
          className="w-full h-32 bg-slate-700/50 border border-slate-600 rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-cyan-500"
        />
        <div className="flex items-center justify-between mt-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enableAI}
              onChange={(e) => setEnableAI(e.target.checked)}
              className="rounded"
            />
            <span className="text-slate-400">AI 분석 (Claude)</span>
          </label>
          <button
            onClick={analyze}
            disabled={loading || !text.trim()}
            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {loading ? '분석 중...' : '분석하기'}
          </button>
        </div>
      </div>

      {result && (
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">분석 결과</h3>
            <span className={`px-3 py-1 rounded-lg font-bold text-lg ${gradeColors[result.grade]}`}>
              {result.grade}등급
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <StatCard title="위반 항목" value={result.violationCount} color={result.violationCount > 0 ? 'red' : 'emerald'} />
            <StatCard title="Critical" value={result.bySeverity?.critical || 0} color="red" />
            <StatCard title="Major" value={result.bySeverity?.major || 0} color="orange" />
          </div>

          {result.violations?.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-400">위반 내역:</p>
              {result.violations.map((v, i) => (
                <div key={i} className="bg-slate-700/30 rounded-lg p-3 text-sm">
                  <div className="flex items-start gap-2">
                    <span className={`px-1.5 py-0.5 text-xs rounded ${v.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                        v.severity === 'major' ? 'bg-orange-500/20 text-orange-400' :
                          'bg-yellow-500/20 text-yellow-400'
                      }`}>{v.severity}</span>
                    <div>
                      <p className="font-medium">{v.description}</p>
                      <p className="text-slate-400 text-xs mt-1">발견: "{v.matched}"</p>
                      {v.legalBasis && <p className="text-slate-500 text-xs mt-1">근거: {Array.isArray(v.legalBasis) ? v.legalBasis[0]?.article : v.legalBasis}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// 에드체크 탭 - 병원별 위반 현황 (NEW!)
// ============================================
function AdCheckTab({ apiBase }) {
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [hospitalDetail, setHospitalDetail] = useState(null);
  const [filter, setFilter] = useState({ grade: '', sido: '' });
  const [stats, setStats] = useState(null);

  useEffect(() => {
    loadData();
  }, [filter]);

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
    'A': 'text-emerald-400 bg-emerald-500/20',
    'B': 'text-blue-400 bg-blue-500/20',
    'C': 'text-yellow-400 bg-yellow-500/20',
    'D': 'text-orange-400 bg-orange-500/20',
    'F': 'text-red-400 bg-red-500/20'
  };

  return (
    <div className="space-y-4">
      {/* 통계 요약 */}
      <div className="grid grid-cols-6 gap-3">
        <StatCard title="전체 분석" value={stats?.total || 0} color="slate" />
        <StatCard title="A등급" value={stats?.byGrade?.A || 0} color="emerald" />
        <StatCard title="B등급" value={stats?.byGrade?.B || 0} color="blue" />
        <StatCard title="C등급" value={stats?.byGrade?.C || 0} color="yellow" />
        <StatCard title="D등급" value={stats?.byGrade?.D || 0} color="orange" />
        <StatCard title="F등급" value={stats?.byGrade?.F || 0} color="red" />
      </div>

      {/* 필터 */}
      <div className="flex gap-3">
        <select
          value={filter.grade}
          onChange={(e) => setFilter({ ...filter, grade: e.target.value })}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">전체 등급</option>
          <option value="A">A등급 (적합)</option>
          <option value="B">B등급 (경미)</option>
          <option value="C">C등급 (주의)</option>
          <option value="D">D등급 (위반)</option>
          <option value="F">F등급 (심각)</option>
        </select>
        <select
          value={filter.sido}
          onChange={(e) => setFilter({ ...filter, sido: e.target.value })}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">전체 지역</option>
          <option value="서울">서울</option>
          <option value="경기">경기</option>
          <option value="부산">부산</option>
          <option value="대구">대구</option>
          <option value="인천">인천</option>
        </select>
        <button
          onClick={loadData}
          className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
        >
          🔄 새로고침
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* 병원 목록 */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700">
          <div className="p-3 border-b border-slate-700 font-semibold">
            ✅ 병원별 위반 현황 ({hospitals.length}건)
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-500">로딩 중...</div>
          ) : (
            <div className="divide-y divide-slate-700 max-h-[600px] overflow-y-auto">
              {hospitals.length > 0 ? hospitals.map((h, i) => (
                <div
                  key={i}
                  className={`p-3 hover:bg-slate-700/30 cursor-pointer ${selectedHospital === h.id ? 'bg-slate-700/50 border-l-2 border-cyan-500' : ''}`}
                  onClick={() => loadHospitalDetail(h.id)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-medium">{h.hospital_name || h.name}</p>
                      <p className="text-xs text-slate-400">{h.sido} {h.sigungu}</p>
                      {h.homepage && (
                        <a href={h.homepage} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:underline" onClick={(e) => e.stopPropagation()}>
                          {h.homepage.slice(0, 30)}...
                        </a>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-1 rounded font-bold text-sm ${gradeColors[h.grade]}`}>
                        {h.grade}
                      </span>
                      <p className="text-xs text-slate-400 mt-1">위반 {h.violation_count || 0}건</p>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="p-8 text-center text-slate-500">분석 결과가 없습니다</div>
              )}
            </div>
          )}
        </div>

        {/* 상세 정보 */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700">
          <div className="p-3 border-b border-slate-700 font-semibold">
            📋 위반 상세 내역
          </div>
          {hospitalDetail ? (
            <div className="p-4 space-y-4">
              {/* 병원 정보 */}
              <div className="bg-slate-700/30 rounded-lg p-3">
                <h4 className="font-bold text-lg">{hospitalDetail.hospital_name}</h4>
                <p className="text-sm text-slate-400">{hospitalDetail.sido} {hospitalDetail.sigungu}</p>
                {hospitalDetail.homepage && (
                  <a href={hospitalDetail.homepage} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-blue-400 hover:underline">
                    {hospitalDetail.homepage}
                  </a>
                )}
                <div className="flex items-center gap-4 mt-3">
                  <span className={`px-3 py-1 rounded-lg font-bold ${gradeColors[hospitalDetail.grade]}`}>
                    {hospitalDetail.grade}등급
                  </span>
                  <span className="text-slate-400 text-sm">
                    분석일: {new Date(hospitalDetail.analyzed_at || hospitalDetail.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* 위반 요약 */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-red-500/10 rounded-lg p-2 text-center">
                  <p className="text-xs text-red-400">Critical</p>
                  <p className="text-lg font-bold text-red-400">{hospitalDetail.critical_count || 0}</p>
                </div>
                <div className="bg-orange-500/10 rounded-lg p-2 text-center">
                  <p className="text-xs text-orange-400">Major</p>
                  <p className="text-lg font-bold text-orange-400">{hospitalDetail.major_count || 0}</p>
                </div>
                <div className="bg-yellow-500/10 rounded-lg p-2 text-center">
                  <p className="text-xs text-yellow-400">Minor</p>
                  <p className="text-lg font-bold text-yellow-400">{hospitalDetail.minor_count || 0}</p>
                </div>
              </div>

              {/* 위반 목록 */}
              <div className="space-y-2 max-h-[350px] overflow-y-auto">
                <p className="text-sm font-medium text-slate-400">위반 내역:</p>
                {hospitalDetail.violations?.length > 0 ? (
                  hospitalDetail.violations.map((v, i) => (
                    <div key={i} className="bg-slate-700/30 rounded-lg p-3 text-sm">
                      <div className="flex items-start gap-2">
                        <span className={`px-1.5 py-0.5 text-xs rounded whitespace-nowrap ${v.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                            v.severity === 'major' ? 'bg-orange-500/20 text-orange-400' :
                              'bg-yellow-500/20 text-yellow-400'
                          }`}>{v.severity}</span>
                        <div className="flex-1">
                          <p className="font-medium">{v.description || v.pattern_description}</p>
                          {v.matched && <p className="text-slate-400 text-xs mt-1">발견: "{v.matched}"</p>}
                          {v.category && <p className="text-slate-500 text-xs">카테고리: {v.category}</p>}
                          {v.legal_basis && <p className="text-slate-500 text-xs">법적근거: {v.legal_basis}</p>}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 text-sm">위반 내역이 없습니다</p>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500">
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
// 배치분석 탭 컴포넌트
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
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const urlIndex = headers.findIndex(h => h.includes('홈페이지') || h.includes('URL'));
    const nameIndex = headers.findIndex(h => h.includes('병원명'));
    const addrIndex = headers.findIndex(h => h.includes('주소'));
    const sidoIndex = headers.findIndex(h => h.includes('시도'));

    return lines.slice(1).map((line, idx) => {
      const cols = [];
      let current = '';
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          cols.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      cols.push(current.trim());

      return {
        id: idx,
        name: cols[nameIndex] || '',
        address: cols[addrIndex] || '',
        url: cols[urlIndex] || '',
        sido: cols[sidoIndex] || '',
      };
    }).filter(h => h.name);
  };

  const handleFile = async (f) => {
    setFile(f);
    const text = await f.text();
    const parsed = parseCSV(text);
    setHospitals(parsed);
    setResults([]);
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
          newResults.push({
            ...h,
            status: 'success',
            grade: data.data.grade,
            violationCount: data.data.violationCount,
            summary: data.data.summary || `${data.data.violationCount}건 위반`
          });
        } else {
          newResults.push({ ...h, status: 'error', grade: '-', violationCount: 0, summary: data.error });
        }
      } catch (e) {
        newResults.push({ ...h, status: 'error', grade: '-', violationCount: 0, summary: e.message });
      }

      setResults([...newResults]);
      await new Promise(r => setTimeout(r, 500));
    }

    setAnalyzing(false);
  };

  const gradeColors = {
    'A': 'text-emerald-400 bg-emerald-500/20',
    'B': 'text-blue-400 bg-blue-500/20',
    'C': 'text-yellow-400 bg-yellow-500/20',
    'D': 'text-orange-400 bg-orange-500/20',
    'F': 'text-red-400 bg-red-500/20',
    '-': 'text-slate-400 bg-slate-500/20'
  };

  return (
    <div className="space-y-4">
      {/* 파일 업로드 */}
      <div
        className={`bg-slate-800/50 rounded-xl p-8 border-2 border-dashed transition-all ${dragOver ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-700'}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
      >
        <div className="text-center">
          <div className="text-4xl mb-3">📂</div>
          <p className="font-medium mb-2">CSV 파일을 드래그하거나 클릭하여 업로드</p>
          <p className="text-sm text-slate-400">병원명, 홈페이지 URL 컬럼이 포함된 CSV</p>
          <input type="file" accept=".csv" className="hidden" id="csv-upload"
            onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])} />
          <label htmlFor="csv-upload"
            className="inline-block mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg cursor-pointer text-sm">
            파일 선택
          </label>
        </div>
      </div>

      {/* 분석 시작 */}
      {hospitals.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{file?.name}</p>
              <p className="text-sm text-slate-400">{hospitals.length}개 병원 로드됨</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={enableAI} onChange={(e) => setEnableAI(e.target.checked)} className="rounded" />
                <span className="text-slate-400">AI 분석</span>
              </label>
              <button
                onClick={runAnalysis}
                disabled={analyzing}
                className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {analyzing ? `분석 중... (${progress.current}/${progress.total})` : '배치 분석 시작'}
              </button>
            </div>
          </div>
          {analyzing && (
            <div className="mt-3">
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-indigo-500 h-2 rounded-full transition-all"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 결과 테이블 */}
      {results.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-700/50">
              <tr>
                <th className="text-left p-3">병원명</th>
                <th className="text-left p-3">URL</th>
                <th className="text-center p-3">등급</th>
                <th className="text-center p-3">위반</th>
                <th className="text-left p-3">요약</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {results.map((r, i) => (
                <tr key={i} className="hover:bg-slate-700/30">
                  <td className="p-3">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-slate-400">{r.sido}</p>
                  </td>
                  <td className="p-3">
                    <a href={r.url} target="_blank" rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 text-xs truncate block max-w-[200px]">
                      {r.url}
                    </a>
                  </td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-1 rounded font-bold ${gradeColors[r.grade]}`}>
                      {r.grade}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <span className={r.violationCount > 0 ? 'text-red-400' : 'text-slate-400'}>
                      {r.violationCount}
                    </span>
                  </td>
                  <td className="p-3 text-slate-300 text-xs max-w-[300px] truncate">
                    {r.summary}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 통계 요약 */}
      {results.length > 0 && !analyzing && (
        <div className="grid grid-cols-6 gap-3">
          <StatCard title="분석 완료" value={results.filter(r => r.status === 'success').length} color="emerald" />
          <StatCard title="분석 실패" value={results.filter(r => r.status === 'error').length} color="red" />
          <StatCard title="A등급" value={results.filter(r => r.grade === 'A').length} color="emerald" />
          <StatCard title="B등급" value={results.filter(r => r.grade === 'B').length} color="blue" />
          <StatCard title="C등급" value={results.filter(r => r.grade === 'C').length} color="yellow" />
          <StatCard title="D/F등급" value={results.filter(r => r.grade === 'D' || r.grade === 'F').length} color="red" />
        </div>
      )}
    </div>
  );
}

// ============================================
// 꼼수 탭 컴포넌트
// ============================================
function TricksTab({ apiBase, tricksStats }) {
  const [tricks, setTricks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTricks();
  }, []);

  const loadTricks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/v1/tricks?limit=50`);
      const data = await res.json();
      if (data.success) setTricks(data.data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      {/* 통계 */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard title="전체 꼼수" value={tricksStats.summary?.total || 0} color="purple" />
        <StatCard title="활성" value={tricksStats.summary?.active || 0} color="emerald" />
        <StatCard title="비활성" value={tricksStats.summary?.inactive || 0} color="slate" />
        <StatCard title="신규" value={tricksStats.summary?.new || 0} color="cyan" />
      </div>

      {/* 꼼수 목록 */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
        <div className="p-3 border-b border-slate-700 font-semibold text-sm">
          🎭 꼼수 패턴 목록
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-500">로딩 중...</div>
        ) : tricks.length > 0 ? (
          <div className="divide-y divide-slate-700">
            {tricks.map((trick, i) => (
              <div key={i} className="p-4 hover:bg-slate-700/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{trick.name || trick.pattern_name}</span>
                  <span className={`px-2 py-0.5 text-xs rounded ${trick.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'
                    }`}>
                    {trick.is_active ? '활성' : '비활성'}
                  </span>
                </div>
                <p className="text-sm text-slate-400">{trick.description}</p>
                {trick.example && (
                  <p className="text-xs text-slate-500 mt-2">예시: "{trick.example}"</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500">등록된 꼼수 패턴이 없습니다</div>
        )}
      </div>
    </div>
  );
}

// ============================================
// 성능 탭 컴포넌트
// ============================================
function PerformanceTab({ apiBase }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/v1/performance/report`);
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  if (loading) {
    return <div className="text-center py-12 text-slate-500">로딩 중...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <StatCard title="정확도" value={`${(stats?.accuracy * 100 || 0).toFixed(1)}%`} color="cyan" />
        <StatCard title="처리량" value={stats?.throughput || 0} color="emerald" />
        <StatCard title="평균 응답" value={`${stats?.avgResponseMs || 0}ms`} color="blue" />
        <StatCard title="오류율" value={`${(stats?.errorRate * 100 || 0).toFixed(1)}%`} color="red" />
      </div>

      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
        <h3 className="font-semibold mb-3">📊 성능 트렌드</h3>
        <p className="text-slate-400 text-sm">성능 지표 추이 차트가 여기에 표시됩니다.</p>
      </div>
    </div>
  );
}

// ============================================
// 이력 탭 컴포넌트
// ============================================
function HistoryTab({ apiBase }) {
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ learning_type: '', target_type: '' });

  useEffect(() => {
    loadData();
  }, [filter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.learning_type) params.append('learning_type', filter.learning_type);
      if (filter.target_type) params.append('target_type', filter.target_type);
      params.append('limit', '100');

      const [historyRes, statsRes] = await Promise.all([
        fetch(`${apiBase}/v1/learning/candidates?status=approved&${params}`).then(r => r.json()),
        fetch(`${apiBase}/v1/performance/report`).then(r => r.json()),
      ]);

      if (historyRes.success) setHistory(historyRes.data || []);
      if (statsRes.success) setStats(statsRes.data);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
    setLoading(false);
  };

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
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">📜 개선 이력</h2>
          <p className="text-sm text-slate-400">시스템 개선 적용 내역을 확인합니다</p>
        </div>
        <button onClick={loadData} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm">🔄 새로고침</button>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
        <h3 className="font-semibold mb-3 text-sm">개선 효과 요약</h3>
        <div className="grid grid-cols-4 gap-3">
          <StatCard title="이번 주" value={history.filter(h => {
            const d = new Date(h.applied_at || h.created_at);
            const now = new Date();
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            return d >= weekAgo;
          }).length} color="blue" />
          <StatCard title="이번 달" value={history.filter(h => {
            const d = new Date(h.applied_at || h.created_at);
            const now = new Date();
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          }).length} color="cyan" />
          <StatCard title="자동 적용" value={history.filter(h => h.status === 'auto_applied').length} color="emerald" />
          <StatCard title="수동 적용" value={history.filter(h => h.status === 'approved').length} color="slate" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">로딩 중...</div>
      ) : Object.keys(groupedHistory).length === 0 ? (
        <div className="text-center py-12 text-slate-500">이력이 없습니다</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedHistory).map(([date, items]) => (
            <div key={date}>
              <div className="text-sm font-semibold text-slate-400 mb-3 sticky top-0 bg-slate-900 py-2">
                {new Date(date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
              </div>
              <div className="space-y-3">
                {items.map((item) => {
                  const typeInfo = LEARNING_TYPES[item.learning_type] || { label: item.learning_type, icon: '❓' };
                  return (
                    <div key={item.id} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 flex items-start gap-4">
                      <div className="text-2xl">{typeInfo.icon}</div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-semibold">{typeInfo.label}</span>
                            <span className="mx-2 text-slate-600">|</span>
                            <span className="text-slate-400">{item.target_type}</span>
                          </div>
                          <span className="text-xs text-slate-500">{new Date(item.applied_at || item.created_at).toLocaleTimeString('ko-KR')}</span>
                        </div>
                        <div className="text-sm text-slate-400 mt-1">대상: <span className="font-mono text-white">{item.target_id}</span></div>
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
