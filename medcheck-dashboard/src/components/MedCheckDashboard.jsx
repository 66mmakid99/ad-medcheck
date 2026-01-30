import React, { useState, useEffect } from 'react';

// ============================================
// MEDCHECK Engine 대시보드 v1.3.0
// 시술가격 v2: 부위별 단가 + 스크린샷 증빙 + 가격 알림
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
      fetch(`${API_BASE}/v1/health`).then(r => r.json()).then(d => setHealthData(d)).catch(() => {}),
      fetch(`${API_BASE}/v1/false-positives/stats`).then(r => r.json()).then(d => d.success && setFpStats(d.data || {})).catch(() => {}),
      fetch(`${API_BASE}/v1/exception-suggestions?status=pending`).then(r => r.json()).then(d => d.success && setSuggestions(d.data || [])).catch(() => {}),
      fetch(`${API_BASE}/v1/tricks/stats`).then(r => r.json()).then(d => d.success && setTricksStats(d.data || {})).catch(() => {}),
      // v2
      fetch(`${API_BASE}/v2/prices/stats`).then(r => r.json()).then(d => d.success && setPriceStats(d.data || {})).catch(() => {}),
      fetch(`${API_BASE}/v1/procedures?hasPrice=true`).then(r => r.json()).then(d => d.success && setProcedures(d.data || [])).catch(() => {}),
      fetch(`${API_BASE}/v1/target-areas`).then(r => r.json()).then(d => d.success && setTargetAreas(d.data || [])).catch(() => {}),
      fetch(`${API_BASE}/v1/mapping-candidates?status=pending_review`).then(r => r.json()).then(d => d.success && setMappingCandidates(d.data || [])).catch(() => {}),
      fetch(`${API_BASE}/v1/price-alerts?isRead=false`).then(r => r.json()).then(d => d.success && setPriceAlerts(d.data || [])).catch(() => {}),
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

  const tabs = [
    { id: 'overview', name: '📊 개요' },
    { id: 'crawl', name: '🔄 수집현황' },
    { id: 'analyze', name: '🔍 분석' },
    { id: 'batch', name: '📁 배치분석' },
    { id: 'patterns', name: '📋 패턴' },
    { id: 'pricing', name: '💰 시술가격', badge: priceAlerts.length },
    { id: 'alerts', name: '🔔 가격알림', badge: priceAlerts.filter(a => !a.is_read).length },
    { id: 'mapping', name: '🔄 매핑승인', badge: mappingCandidates.length },
    { id: 'fp', name: '⚠️ 예외/오탐', badge: fpStats.summary?.pending || 0 },
    { id: 'tricks', name: '🎭 꼼수', badge: tricksStats.summary?.total || 0 },
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
            <p className="text-slate-400 text-sm">v1.3.0 | 시술가격 v2 | {currentTime.toLocaleTimeString()}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/20 rounded-full">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-emerald-400 text-sm">{healthData?.status || 'connected'}</span>
            </div>
            <button onClick={loadAllData} className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 text-sm">🔄</button>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 mb-4 bg-slate-800/50 p-1 rounded-lg overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all whitespace-nowrap ${
                activeTab === tab.id ? 'bg-gradient-to-r from-cyan-500 to-indigo-500' : 'text-slate-400 hover:bg-slate-700'
              }`}>
              {tab.name}
              {tab.badge > 0 && <span className={`px-1.5 py-0.5 text-xs rounded ${tab.id === 'alerts' ? 'bg-red-500' : 'bg-white/20'}`}>{tab.badge}</span>}
            </button>
          ))}
        </div>

        {/* ============================================ */}
        {/* 개요 탭 */}
        {/* ============================================ */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-6 gap-3">
              <StatCard title="가격 기록" value={priceStats.summary?.total_records || 0} color="cyan" />
              <StatCard title="시술 종류" value={priceStats.summary?.procedures_with_price || 0} color="emerald" />
              <StatCard title="스크린샷" value={priceStats.summary?.with_screenshot || 0} color="blue" />
              <StatCard title="매핑 대기" value={priceStats.pendingMappings || 0} color="yellow" />
              <StatCard title="가격 알림" value={priceAlerts.length} color="red" />
              <StatCard title="완성도" value={`${Math.round(priceStats.summary?.avg_completeness || 0)}%`} color="purple" />
            </div>

            <div className="grid grid-cols-3 gap-4">
              {/* 부위별 통계 */}
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <h3 className="font-semibold mb-3 text-sm">📍 부위별 가격 데이터</h3>
                {(priceStats.byArea || []).slice(0, 6).map((area, i) => (
                  <div key={i} className="flex justify-between py-1.5 border-b border-slate-700/50 text-sm">
                    <span className="text-slate-400">{area.area_name || area.target_area_code}</span>
                    <div className="text-right">
                      <span className="text-cyan-400">{area.count}건</span>
                      {area.avg_per_shot && <span className="text-slate-500 text-xs ml-2">({formatPricePerShot(Math.round(area.avg_per_shot))})</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* 완성도 분포 */}
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <h3 className="font-semibold mb-3 text-sm">📊 데이터 완성도</h3>
                {(priceStats.byCompleteness || []).map((item, i) => (
                  <div key={i} className="flex justify-between py-2 text-sm">
                    <span className={`${item.level === 'complete' ? 'text-emerald-400' : item.level === 'partial' ? 'text-yellow-400' : 'text-red-400'}`}>
                      {item.level === 'complete' ? '✅ 완전' : item.level === 'partial' ? '⚠️ 부분' : '❌ 불완전'}
                    </span>
                    <span className="font-bold">{item.count}건</span>
                  </div>
                ))}
              </div>

              {/* 최근 알림 */}
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <h3 className="font-semibold mb-3 text-sm">🔔 최근 가격 변동</h3>
                {priceAlerts.slice(0, 4).map((alert, i) => (
                  <div key={i} className="py-2 border-b border-slate-700/50">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${alert.price_change_percent < 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                        {alert.price_change_percent > 0 ? '▲' : '▼'} {Math.abs(alert.price_change_percent)}%
                      </span>
                      <span className="text-sm truncate">{alert.competitor_name}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{alert.procedure_name}</p>
                  </div>
                ))}
                {priceAlerts.length === 0 && <p className="text-slate-500 text-sm">알림 없음</p>}
              </div>
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* 수집현황 탭 */}
        {/* ============================================ */}
        {activeTab === 'crawl' && (
          <CrawlStatusTab apiBase={API_BASE} />
        )}

        {/* ============================================ */}
        {/* 시술가격 탭 (v2) */}
        {/* ============================================ */}
        {activeTab === 'pricing' && (
          <div className="space-y-4">
            {/* 필터 */}
            <div className="flex gap-3 items-center">
              <select 
                value={selectedArea} 
                onChange={(e) => setSelectedArea(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">전체 부위</option>
                {targetAreas.map(area => (
                  <option key={area.code} value={area.code}>{area.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-5 gap-4">
              {/* 시술 목록 */}
              <div className="col-span-2 bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                <div className="p-3 border-b border-slate-700 font-semibold text-sm">시술 목록</div>
                <div className="divide-y divide-slate-700 max-h-[500px] overflow-y-auto">
                  {procedures.map((p, i) => (
                    <div key={i} 
                      onClick={() => { loadProcedureDetail(p.id); loadPriceCompare(p.id, selectedArea); }}
                      className={`p-3 cursor-pointer ${selectedProcedure === p.id ? 'bg-cyan-500/20' : 'hover:bg-slate-700/50'}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          <p className="text-xs text-slate-400">{p.category} &gt; {p.subcategory}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-cyan-400 font-bold">{formatPrice(p.avg_price)}</p>
                          <p className="text-xs text-slate-400">{p.price_count}건</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 시술 상세 + 부위별 */}
              <div className="col-span-3 space-y-4">
                {procedureDetail ? (
                  <>
                    {/* 기본 정보 */}
                    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                      <h3 className="text-lg font-bold">{procedureDetail.name}</h3>
                      <p className="text-sm text-slate-400">{procedureDetail.category} &gt; {procedureDetail.subcategory}</p>
                      
                      {/* 별칭 */}
                      {procedureDetail.aliases?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {procedureDetail.aliases.map((a, i) => (
                            <span key={i} className="px-2 py-0.5 bg-slate-700 rounded text-xs">{a.alias_name}</span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 부위별 가격 */}
                    {procedureDetail.pricesByArea?.length > 0 && (
                      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                        <h4 className="font-semibold mb-3 text-sm">📍 부위별 가격</h4>
                        <div className="grid grid-cols-3 gap-3">
                          {procedureDetail.pricesByArea.map((area, i) => (
                            <div key={i} className="p-3 bg-slate-700/50 rounded-lg">
                              <p className="text-xs text-slate-400">{area.target_area_name || area.target_area_code}</p>
                              <p className="text-lg font-bold text-cyan-400">{formatPrice(Math.round(area.avg_price))}</p>
                              <div className="flex justify-between text-xs text-slate-400 mt-1">
                                <span>{formatPrice(area.min_price)} ~ {formatPrice(area.max_price)}</span>
                                <span>{area.record_count}건</span>
                              </div>
                              {area.avg_price_per_shot && (
                                <p className="text-xs text-emerald-400 mt-1">샷당 {formatPricePerShot(Math.round(area.avg_price_per_shot))}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 병원별 비교 (스크린샷 포함) */}
                    {priceCompare?.hospitals?.length > 0 && (
                      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                        <div className="p-3 border-b border-slate-700 font-semibold text-sm flex justify-between">
                          <span>🏥 병원별 가격 비교</span>
                          {priceCompare.stats && (
                            <span className="text-slate-400">
                              샷당 {formatPricePerShot(priceCompare.stats.shotPriceRange?.min)} ~ {formatPricePerShot(priceCompare.stats.shotPriceRange?.max)}
                            </span>
                          )}
                        </div>
                        <table className="w-full text-sm">
                          <thead className="bg-slate-700/50">
                            <tr>
                              <th className="text-left p-2">병원</th>
                              <th className="text-right p-2">가격</th>
                              <th className="text-right p-2">샷수</th>
                              <th className="text-right p-2">샷당</th>
                              <th className="text-center p-2">증빙</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-700">
                            {priceCompare.hospitals.slice(0, 10).map((h, i) => (
                              <tr key={i} className="hover:bg-slate-700/30">
                                <td className="p-2">
                                  <p className="font-medium">{h.hospital_name}</p>
                                  <p className="text-xs text-slate-400">{h.region}</p>
                                </td>
                                <td className="p-2 text-right">
                                  <span className={h.is_event ? 'text-orange-400' : 'text-white'}>
                                    {formatPrice(h.price)} {h.is_event ? '🏷️' : ''}
                                  </span>
                                </td>
                                <td className="p-2 text-right text-slate-400">{h.shot_count || '-'}</td>
                                <td className="p-2 text-right text-cyan-400">{h.price_per_shot ? formatPricePerShot(h.price_per_shot) : '-'}</td>
                                <td className="p-2 text-center">
                                  {h.screenshot_url ? (
                                    <button 
                                      onClick={() => setScreenshotModal({ url: h.screenshot_url, hospital: h.hospital_name, price: h.price })}
                                      className="text-blue-400 hover:text-blue-300"
                                    >📸</button>
                                  ) : <span className="text-slate-500">-</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="bg-slate-800/50 rounded-xl p-8 border border-slate-700 text-center text-slate-500">
                    좌측에서 시술을 선택하세요
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* 가격 알림 탭 */}
        {/* ============================================ */}
        {activeTab === 'alerts' && (
          <div className="grid grid-cols-2 gap-4">
            {/* 알림 목록 */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
              <div className="p-3 border-b border-slate-700 font-semibold text-sm">
                🔔 가격 변동 알림 ({priceAlerts.length})
              </div>
              <div className="divide-y divide-slate-700 max-h-[500px] overflow-y-auto">
                {priceAlerts.length > 0 ? priceAlerts.map((alert, i) => (
                  <div key={i} 
                    onClick={() => loadAlertDetail(alert.id)}
                    className={`p-3 cursor-pointer ${selectedAlert?.id === alert.id ? 'bg-cyan-500/20' : 'hover:bg-slate-700/50'}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-xs rounded font-bold ${
                            alert.price_change_percent < 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                            {alert.price_change_percent > 0 ? '▲' : '▼'} {Math.abs(alert.price_change_percent)}%
                          </span>
                          <span className={`px-1.5 py-0.5 text-xs rounded ${
                            alert.severity === 'urgent' ? 'bg-red-500' : 'bg-yellow-500/50'
                          }`}>{alert.severity}</span>
                        </div>
                        <p className="text-sm font-medium mt-1">{alert.competitor_name}</p>
                        <p className="text-xs text-slate-400">{alert.procedure_name} ({alert.target_area_name || alert.target_area_code})</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm">{formatPrice(alert.previous_price)} → {formatPrice(alert.current_price)}</p>
                        <p className="text-xs text-slate-400">{new Date(alert.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="p-8 text-center text-slate-500">알림 없음</div>
                )}
              </div>
            </div>

            {/* 알림 상세 */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
              <div className="p-3 border-b border-slate-700 font-semibold text-sm">상세 정보</div>
              {selectedAlert ? (
                <div className="p-4 space-y-4">
                  {/* 변경 요약 */}
                  <div className="p-4 bg-slate-700/50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-lg font-bold">{selectedAlert.competitor_name}</p>
                        <p className="text-sm text-slate-400">{selectedAlert.procedure_name}</p>
                      </div>
                      <div className={`text-2xl font-bold ${selectedAlert.price_change_percent < 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {selectedAlert.price_change_percent > 0 ? '+' : ''}{selectedAlert.price_change_percent}%
                      </div>
                    </div>
                  </div>

                  {/* 가격 비교 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-slate-700/50 rounded-lg">
                      <p className="text-xs text-slate-400">변경 전</p>
                      <p className="text-xl font-bold">{formatPrice(selectedAlert.previous_price)}</p>
                      {selectedAlert.previous_shot_count && (
                        <p className="text-xs text-slate-400">{selectedAlert.previous_shot_count}샷 | 샷당 {formatPricePerShot(selectedAlert.previous_price_per_shot)}</p>
                      )}
                    </div>
                    <div className="p-3 bg-slate-700/50 rounded-lg">
                      <p className="text-xs text-slate-400">변경 후</p>
                      <p className="text-xl font-bold text-cyan-400">{formatPrice(selectedAlert.current_price)}</p>
                      {selectedAlert.current_shot_count && (
                        <p className="text-xs text-slate-400">{selectedAlert.current_shot_count}샷 | 샷당 {formatPricePerShot(selectedAlert.current_price_per_shot)}</p>
                      )}
                    </div>
                  </div>

                  {/* 스크린샷 비교 */}
                  <div>
                    <p className="text-xs text-slate-400 mb-2">📸 원본 스크린샷</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="border border-slate-600 rounded-lg overflow-hidden">
                        <div className="bg-slate-700 p-1 text-xs text-center">변경 전</div>
                        {selectedAlert.previous_screenshot_full_url ? (
                          <img src={selectedAlert.previous_screenshot_full_url} alt="이전" className="w-full cursor-pointer hover:opacity-80"
                            onClick={() => setScreenshotModal({ url: selectedAlert.previous_screenshot_full_url, label: '변경 전' })} />
                        ) : (
                          <div className="h-24 flex items-center justify-center text-slate-500 text-sm">스크린샷 없음</div>
                        )}
                      </div>
                      <div className="border border-cyan-500/50 rounded-lg overflow-hidden">
                        <div className="bg-cyan-500/20 p-1 text-xs text-center text-cyan-400">변경 후</div>
                        {selectedAlert.current_screenshot_full_url ? (
                          <img src={selectedAlert.current_screenshot_full_url} alt="현재" className="w-full cursor-pointer hover:opacity-80"
                            onClick={() => setScreenshotModal({ url: selectedAlert.current_screenshot_full_url, label: '변경 후' })} />
                        ) : (
                          <div className="h-24 flex items-center justify-center text-slate-500 text-sm">스크린샷 없음</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* AI 분석 */}
                  {selectedAlert.ai_analysis && (
                    <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
                      <p className="text-xs text-indigo-400 mb-1">🤖 AI 분석</p>
                      <p className="text-sm">{selectedAlert.ai_analysis}</p>
                    </div>
                  )}

                  {/* 원본 페이지 링크 */}
                  {selectedAlert.source_page_url && (
                    <a href={selectedAlert.source_page_url} target="_blank" rel="noopener noreferrer"
                      className="block text-center text-sm text-blue-400 hover:text-blue-300">
                      🔗 원본 페이지 바로가기
                    </a>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500">좌측에서 알림을 선택하세요</div>
              )}
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* 매핑 승인 탭 */}
        {/* ============================================ */}
        {activeTab === 'mapping' && (
          <div className="space-y-4">
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <h3 className="font-semibold mb-2">📋 매핑 승인 조건</h3>
              <div className="grid grid-cols-5 gap-3 text-sm">
                <div className="p-2 bg-slate-700/50 rounded text-center">
                  <p className="text-slate-400">최소 케이스</p>
                  <p className="font-bold">5건 이상</p>
                </div>
                <div className="p-2 bg-slate-700/50 rounded text-center">
                  <p className="text-slate-400">최소 병원</p>
                  <p className="font-bold">3곳 이상</p>
                </div>
                <div className="p-2 bg-slate-700/50 rounded text-center">
                  <p className="text-slate-400">대기 기간</p>
                  <p className="font-bold">7일 이상</p>
                </div>
                <div className="p-2 bg-slate-700/50 rounded text-center">
                  <p className="text-slate-400">가격 범위</p>
                  <p className="font-bold">±40% 이내</p>
                </div>
                <div className="p-2 bg-slate-700/50 rounded text-center">
                  <p className="text-slate-400">유사도</p>
                  <p className="font-bold">70% 이상</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
              <div className="p-3 border-b border-slate-700 font-semibold text-sm">
                🔄 매핑 승인 대기 ({mappingCandidates.length})
              </div>
              {mappingCandidates.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="bg-slate-700/50">
                    <tr>
                      <th className="text-left p-3">발견된 시술명</th>
                      <th className="text-left p-3">추천 매핑</th>
                      <th className="text-right p-3">케이스</th>
                      <th className="text-right p-3">병원 수</th>
                      <th className="text-right p-3">평균 가격</th>
                      <th className="text-right p-3">유사도</th>
                      <th className="text-center p-3">액션</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {mappingCandidates.map((mc, i) => (
                      <tr key={i} className="hover:bg-slate-700/30">
                        <td className="p-3">
                          <p className="font-medium">{mc.alias_name}</p>
                          <p className="text-xs text-slate-400">최초: {new Date(mc.first_seen_at).toLocaleDateString()}</p>
                        </td>
                        <td className="p-3">
                          <p className="text-cyan-400">{mc.suggested_procedure_name || '-'}</p>
                        </td>
                        <td className="p-3 text-right">{mc.total_cases}</td>
                        <td className="p-3 text-right">{mc.unique_hospitals}</td>
                        <td className="p-3 text-right">{formatPrice(mc.price_avg)}</td>
                        <td className="p-3 text-right">
                          <span className={mc.text_similarity >= 70 ? 'text-emerald-400' : 'text-yellow-400'}>
                            {mc.text_similarity || '-'}%
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex justify-center gap-1">
                            <button onClick={() => approveMappingCandidate(mc.id)}
                              className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs hover:bg-emerald-500/30">✓ 승인</button>
                            <button onClick={() => rejectMappingCandidate(mc.id, '확인 필요')}
                              className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs hover:bg-red-500/30">✗</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-slate-500">승인 대기 중인 매핑이 없습니다</div>
              )}
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* 오탐 탭 (간소화) */}
        {/* ============================================ */}
        {activeTab === 'fp' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <h3 className="font-semibold mb-3">오탐 통계</h3>
              <div className="grid grid-cols-2 gap-3">
                <StatCard title="전체" value={fpStats.summary?.total || 0} color="slate" />
                <StatCard title="대기" value={fpStats.summary?.pending || 0} color="yellow" />
                <StatCard title="검토중" value={fpStats.summary?.reviewing || 0} color="blue" />
                <StatCard title="해결" value={fpStats.summary?.resolved || 0} color="emerald" />
              </div>
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
        {/* 분석 탭 */}
        {/* ============================================ */}
        {activeTab === 'analyze' && (
          <AnalyzeTab apiBase={API_BASE} />
        )}

        {/* ============================================ */}
        {/* 배치분석 탭 */}
        {/* ============================================ */}
        {activeTab === 'batch' && (
          <BatchAnalyzeTab apiBase={API_BASE} />
        )}

        {/* ============================================ */}
        {/* 패턴 탭 */}
        {/* ============================================ */}
        {activeTab === 'patterns' && (
          <PatternsTab apiBase={API_BASE} />
        )}

        {/* ============================================ */}
        {/* 꼼수 탭 */}
        {/* ============================================ */}
        {activeTab === 'tricks' && (
          <TricksTab apiBase={API_BASE} tricksStats={tricksStats} />
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
    <div className="grid grid-cols-2 gap-4">
      {/* 입력 */}
      <div className="space-y-4">
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
          <h3 className="font-semibold mb-3">🔍 의료광고 분석</h3>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="분석할 의료광고 텍스트를 입력하세요..."
            className="w-full h-64 bg-slate-700 border border-slate-600 rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-cyan-500"
          />
          <div className="flex items-center justify-between mt-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enableAI}
                onChange={(e) => setEnableAI(e.target.checked)}
                className="rounded"
              />
              <span className="text-slate-400">AI 분석 활성화</span>
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
      </div>

      {/* 결과 */}
      <div className="space-y-4">
        {result ? (
          <>
            {/* 등급 */}
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">분석 결과</p>
                  <p className="text-lg font-bold mt-1">{result.summary}</p>
                </div>
                <div className={`text-4xl font-bold px-4 py-2 rounded-lg ${gradeColors[result.grade]}`}>
                  {result.grade}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="text-center p-2 bg-slate-700/50 rounded">
                  <p className="text-xs text-slate-400">위반 수</p>
                  <p className="text-lg font-bold text-red-400">{result.violationCount}</p>
                </div>
                <div className="text-center p-2 bg-slate-700/50 rounded">
                  <p className="text-xs text-slate-400">점수</p>
                  <p className="text-lg font-bold text-cyan-400">{result.score?.totalScore || 0}</p>
                </div>
                <div className="text-center p-2 bg-slate-700/50 rounded">
                  <p className="text-xs text-slate-400">처리시간</p>
                  <p className="text-lg font-bold text-slate-300">{result.processingTimeMs}ms</p>
                </div>
              </div>
            </div>

            {/* 위반 목록 */}
            {result.violations?.length > 0 && (
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 max-h-80 overflow-y-auto">
                <h4 className="font-semibold mb-3 text-sm">⚠️ 발견된 위반 ({result.violations.length})</h4>
                <div className="space-y-2">
                  {result.violations.map((v, i) => (
                    <div key={i} className="p-3 bg-slate-700/50 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 text-xs rounded ${
                          v.severity === 'high' ? 'bg-red-500/20 text-red-400' :
                          v.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-slate-500/20 text-slate-400'
                        }`}>{v.severity}</span>
                        <span className="text-sm font-medium">{v.type}</span>
                      </div>
                      <p className="text-sm text-slate-300">"{v.matchedText}"</p>
                      <p className="text-xs text-slate-400 mt-1">{v.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="bg-slate-800/50 rounded-xl p-8 border border-slate-700 text-center text-slate-500">
            좌측에 텍스트를 입력하고 분석하기를 클릭하세요
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// 패턴 탭 컴포넌트
// ============================================
function PatternsTab({ apiBase }) {
  const [patterns, setPatterns] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [selectedCategory, search]);

  const loadData = async () => {
    setLoading(true);
    try {
      let url = `${apiBase}/v1/patterns?limit=50`;
      if (selectedCategory) url += `&category=${selectedCategory}`;
      if (search) url += `&search=${search}`;
      
      const [patternsRes, categoriesRes, statsRes] = await Promise.all([
        fetch(url).then(r => r.json()),
        fetch(`${apiBase}/v1/patterns/categories`).then(r => r.json()),
        fetch(`${apiBase}/v1/patterns/stats/summary`).then(r => r.json())
      ]);
      
      if (patternsRes.success) setPatterns(patternsRes.data?.patterns || []);
      if (categoriesRes.success) setCategories(categoriesRes.data?.categories || []);
      if (statsRes.success) setStats(statsRes.data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const severityColors = {
    critical: 'bg-red-500/20 text-red-400',
    major: 'bg-orange-500/20 text-orange-400',
    minor: 'bg-yellow-500/20 text-yellow-400'
  };

  return (
    <div className="space-y-4">
      {/* 통계 */}
      {stats && (
        <div className="grid grid-cols-5 gap-3">
          <StatCard title="전체 패턴" value={stats.total} color="cyan" />
          <StatCard title="Critical" value={stats.bySeverity?.critical || 0} color="red" />
          <StatCard title="Major" value={stats.bySeverity?.major || 0} color="orange" />
          <StatCard title="Minor" value={stats.bySeverity?.minor || 0} color="yellow" />
          <StatCard title="버전" value={stats.version || '-'} color="slate" />
        </div>
      )}

      {/* 필터 */}
      <div className="flex gap-3">
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">전체 카테고리</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.name}>{cat.name} ({cat.patternCount})</option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="패턴 검색..."
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* 패턴 목록 */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-700/50">
            <tr>
              <th className="text-left p-3">카테고리</th>
              <th className="text-left p-3">설명</th>
              <th className="text-center p-3">심각도</th>
              <th className="text-left p-3">법적 근거</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {loading ? (
              <tr><td colSpan={4} className="p-8 text-center text-slate-500">로딩 중...</td></tr>
            ) : patterns.length > 0 ? patterns.map((p, i) => (
              <tr key={i} className="hover:bg-slate-700/30">
                <td className="p-3">
                  <p className="font-medium">{p.category}</p>
                  <p className="text-xs text-slate-400">{p.subcategory}</p>
                </td>
                <td className="p-3 text-slate-300">{p.description}</td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-1 text-xs rounded ${severityColors[p.severity]}`}>
                    {p.severity}
                  </span>
                </td>
                <td className="p-3 text-slate-400 text-xs">{p.legalBasis}</td>
              </tr>
            )) : (
              <tr><td colSpan={4} className="p-8 text-center text-slate-500">패턴이 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================
// 수집현황 탭 컴포넌트
// ============================================
function CrawlStatusTab({ apiBase }) {
   const [jobs, setJobs] = useState([]);
   const [completedJobs, setCompletedJobs] = useState([]);
   const [loading, setLoading] = useState(true);
   const [autoRefresh, setAutoRefresh] = useState(true);
   const [analyzingJobId, setAnalyzingJobId] = useState(null);

   const loadJobs = async () => {
     try {
       const res = await fetch(`${apiBase}/v1/crawl-status/active`);
       const data = await res.json();
       if (data.success) setJobs(data.data || []);
     } catch (e) {
       console.error(e);
     }
     setLoading(false);
   };

   const loadCompletedJobs = async () => {
     try {
       const res = await fetch(`${apiBase}/v1/crawl-sessions?status=completed`);
       const data = await res.json();
       if (data.success) setCompletedJobs(data.data || []);
     } catch (e) {
       console.error(e);
     }
   };

   useEffect(() => {
     loadJobs();
     loadCompletedJobs();
     if (autoRefresh) {
       const interval = setInterval(() => {
         loadJobs();
         loadCompletedJobs();
       }, 5000); // 5초마다 갱신
       return () => clearInterval(interval);
     }
   }, [autoRefresh]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return 'bg-emerald-500/20 text-emerald-400';
      case 'completed': return 'bg-blue-500/20 text-blue-400';
      case 'failed': return 'bg-red-500/20 text-red-400';
      case 'paused': return 'bg-yellow-500/20 text-yellow-400';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  const getJobTypeLabel = (type) => {
    switch (type) {
      case 'naver_place': return '네이버 플레이스';
      case 'google_search': return '구글 검색';
      case 'hospital_crawl': return '병원 크롤링';
      case 'price_crawl': return '가격 수집';
      default: return type;
    }
  };

  const formatTime = (isoString) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

   const formatDuration = (startedAt) => {
     if (!startedAt) return '-';
     const start = new Date(startedAt);
     const now = new Date();
     const diff = Math.floor((now - start) / 1000);
     const mins = Math.floor(diff / 60);
     const secs = diff % 60;
     return `${mins}분 ${secs}초`;
   };

   const startAnalysisFromCrawlSession = async (sessionId) => {
     try {
       setAnalyzingJobId(sessionId);
       
       // 먼저 해당 세션의 병원 목록 조회 (URL이 있는 것만)
       const hospitalsRes = await fetch(`${apiBase}/v1/collected-hospitals?crawlSessionId=${sessionId}&hasUrl=true&limit=100`);
       const hospitalsData = await hospitalsRes.json();
       
       if (!hospitalsData.success || !hospitalsData.data || hospitalsData.data.length === 0) {
         alert('분석 가능한 병원(홈페이지 URL 있는)이 없습니다.');
         setAnalyzingJobId(null);
         return;
       }
       
       // 분석 시작 (모든 병원 일괄 분석)
       const analyzeRes = await fetch(`${apiBase}/v1/collected-hospitals/analyze`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           crawlSessionId: sessionId,
           hospitalIds: hospitalsData.data.map(h => h.id),
           enableAI: false  // 기본은 AI 비활성화
         })
       });
       const analyzeData = await analyzeRes.json();
       
       if (analyzeData.success) {
         alert(`분석 시작! ${analyzeData.data.length || hospitalsData.data.length}개 병원 분석 중...`);
         // 5초 후 새로고침
         setTimeout(() => {
           loadJobs();
           loadCompletedJobs();
         }, 5000);
       } else {
         alert(`분석 시작 실패: ${analyzeData.error || '알 수 없는 오류'}`);
       }
     } catch (e) {
       console.error(e);
       alert(`오류: ${e.message}`);
     } finally {
       setAnalyzingJobId(null);
     }
   };

   return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">🔄 실시간 수집 현황</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            <span className="text-slate-400">자동 새로고침 (5초)</span>
          </label>
          <button
            onClick={loadJobs}
            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm"
          >
            🔄 새로고침
          </button>
        </div>
      </div>

      {/* 작업 목록 */}
      {loading ? (
        <div className="bg-slate-800/50 rounded-xl p-8 border border-slate-700 text-center">
          <div className="w-8 h-8 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-slate-400">로딩 중...</p>
        </div>
      ) : jobs.length > 0 ? (
        <div className="space-y-4">
          {jobs.map((job, i) => (
            <div key={i} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              {/* 작업 헤더 */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 text-xs rounded ${getStatusColor(job.status)}`}>
                      {job.status === 'running' ? '🟢 실행 중' : job.status === 'completed' ? '✅ 완료' : job.status}
                    </span>
                    <span className="text-sm font-medium">{getJobTypeLabel(job.job_type)}</span>
                  </div>
                  <p className="text-xs text-slate-400">ID: {job.id}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="text-slate-400">시작: {formatTime(job.started_at)}</p>
                  <p className="text-slate-400">경과: {formatDuration(job.started_at)}</p>
                </div>
              </div>

              {/* 진행률 바 */}
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span>{job.progress?.toLocaleString()} / {job.total?.toLocaleString()}</span>
                  <span>{job.total > 0 ? ((job.progress / job.total) * 100).toFixed(1) : 0}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-3">
                  <div 
                    className={`h-3 rounded-full transition-all ${job.status === 'running' ? 'bg-gradient-to-r from-cyan-500 to-indigo-500' : 'bg-blue-500'}`}
                    style={{ width: `${job.total > 0 ? (job.progress / job.total) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* 통계 */}
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div className="bg-slate-700/50 rounded p-2 text-center">
                  <p className="text-xs text-slate-400">처리</p>
                  <p className="text-lg font-bold text-white">{job.progress?.toLocaleString()}</p>
                </div>
                <div className="bg-slate-700/50 rounded p-2 text-center">
                  <p className="text-xs text-slate-400">발견</p>
                  <p className="text-lg font-bold text-emerald-400">{job.found?.toLocaleString()}</p>
                </div>
                <div className="bg-slate-700/50 rounded p-2 text-center">
                  <p className="text-xs text-slate-400">실패</p>
                  <p className="text-lg font-bold text-red-400">{job.failed?.toLocaleString()}</p>
                </div>
                <div className="bg-slate-700/50 rounded p-2 text-center">
                  <p className="text-xs text-slate-400">발견율</p>
                  <p className="text-lg font-bold text-cyan-400">
                    {job.progress > 0 ? ((job.found / job.progress) * 100).toFixed(1) : 0}%
                  </p>
                </div>
              </div>

              {/* 현재 항목 & 메시지 */}
              {job.current_item && (
                <p className="text-sm text-slate-400 mb-1">
                  현재: <span className="text-white">{job.current_item}</span>
                </p>
              )}
              {job.message && (
                <p className="text-sm text-slate-500">{job.message}</p>
              )}
            </div>
          ))}
        </div>
       ) : (
         <div className="bg-slate-800/50 rounded-xl p-8 border border-slate-700 text-center">
           <div className="text-4xl mb-3">📭</div>
           <p className="text-slate-400 mb-2">실행 중인 수집 작업이 없습니다</p>
           <p className="text-slate-500 text-sm">터미널에서 크롤러를 실행하면 여기에 표시됩니다</p>
           <div className="mt-4 p-3 bg-slate-700/50 rounded-lg text-left">
             <p className="text-xs text-slate-400 mb-1">실행 명령어 예시:</p>
             <code className="text-xs text-cyan-400">
               node src/enrichers/naver-place.js --input "output/hospitals.csv" --skip-existing
             </code>
           </div>
         </div>
       )}

       {/* ============================================ */}
       {/* 최근 완료된 크롤링 분석 시작 */}
       {/* ============================================ */}
       {completedJobs.length > 0 && (
         <div className="space-y-4 mt-8">
           <h3 className="text-lg font-semibold">🎯 최근 완료된 크롤링</h3>
           
           {completedJobs.map((job, i) => (
             <div key={i} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
               {/* 헤더 */}
               <div className="flex justify-between items-start mb-3">
                 <div>
                   <div className="flex items-center gap-2 mb-1">
                     <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">✅ 완료</span>
                     <span className="text-sm font-medium">{getJobTypeLabel(job.job_type)}</span>
                   </div>
                   <p className="text-xs text-slate-400">ID: {job.id}</p>
                 </div>
                 <div className="text-right text-sm">
                   <p className="text-slate-400">{new Date(job.completed_at).toLocaleDateString()}</p>
                   <p className="text-slate-500">{formatTime(job.completed_at)}</p>
                 </div>
               </div>

               {/* 통계 */}
               <div className="grid grid-cols-3 gap-3 mb-4">
                 <StatCard title="수집된 병원" value={job.total_hospitals || 0} color="cyan" />
                 <StatCard title="필터링된 병원" value={job.filtered_hospitals || 0} color="emerald" />
                 <StatCard title="성공" value={job.success_count || 0} color="blue" />
               </div>

               {/* 액션: 분석 시작 버튼 */}
               <div className="flex gap-2">
                 <button
                   onClick={() => startAnalysisFromCrawlSession(job.id)}
                   disabled={analyzingJobId === job.id}
                   className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-lg text-sm font-medium hover:from-cyan-400 disabled:opacity-50"
                 >
                   {analyzingJobId === job.id ? '⏳ 분석 시작 중...' : '🚀 분석 시작'}
                 </button>
               </div>
             </div>
           ))}
         </div>
       )}
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
      // Handle CSV with quoted fields
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

  const handleFile = (f) => {
    if (!f || !f.name.endsWith('.csv')) {
      alert('CSV 파일만 업로드 가능합니다.');
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const parsed = parseCSV(text);
      setHospitals(parsed);
      setResults([]);
    };
    reader.readAsText(f, 'UTF-8');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    handleFile(f);
  };

  const handleFileInput = (e) => {
    const f = e.target.files[0];
    handleFile(f);
  };

  const hospitalsWithUrl = hospitals.filter(h => h.url && h.url.startsWith('http'));

  const startAnalysis = async () => {
    if (hospitalsWithUrl.length === 0) return;
    
    setAnalyzing(true);
    setResults([]);
    setProgress({ current: 0, total: hospitalsWithUrl.length });
    
    const newResults = [];
    
    for (let i = 0; i < hospitalsWithUrl.length; i++) {
      const hospital = hospitalsWithUrl[i];
      setProgress({ current: i + 1, total: hospitalsWithUrl.length });
      
      try {
        const res = await fetch(`${apiBase}/v1/analyze-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: hospital.url, enableAI })
        });
        const data = await res.json();
        
        if (data.success) {
          newResults.push({
            ...hospital,
            grade: data.data.grade,
            violationCount: data.data.violationCount,
            summary: data.data.summary,
            violations: data.data.violations || [],
            status: 'success'
          });
        } else {
          newResults.push({
            ...hospital,
            grade: '-',
            violationCount: 0,
            summary: data.error || '분석 실패',
            violations: [],
            status: 'error'
          });
        }
      } catch (err) {
        newResults.push({
          ...hospital,
          grade: '-',
          violationCount: 0,
          summary: err.message || '네트워크 오류',
          violations: [],
          status: 'error'
        });
      }
      
      setResults([...newResults]);
      
      // Rate limit: 500ms between requests
      if (i < hospitalsWithUrl.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    
    setAnalyzing(false);
  };

  const downloadResults = () => {
    if (results.length === 0) return;
    
    const headers = ['병원명', 'URL', '등급', '위반수', '요약', '위반내용'];
    const rows = results.map(r => [
      r.name,
      r.url,
      r.grade,
      r.violationCount,
      r.summary,
      r.violations.map(v => v.type).join('; ')
    ]);
    
    const csv = [headers, ...rows].map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `분석결과_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
      {/* 업로드 영역 */}
      <div className="grid grid-cols-2 gap-4">
        <div 
          className={`bg-slate-800/50 rounded-xl p-6 border-2 border-dashed transition-colors ${
            dragOver ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-600'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="text-center">
            <div className="text-4xl mb-3">📁</div>
            <p className="text-slate-300 mb-2">CSV 파일을 드래그하거나 클릭하여 업로드</p>
            <p className="text-slate-500 text-sm mb-4">크롤러 출력 CSV 파일 (병원명, 홈페이지URL 포함)</p>
            <input 
              type="file" 
              accept=".csv" 
              onChange={handleFileInput}
              className="hidden"
              id="csv-upload"
            />
            <label 
              htmlFor="csv-upload"
              className="inline-block px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg cursor-pointer text-sm"
            >
              파일 선택
            </label>
          </div>
        </div>

        {/* 파일 정보 */}
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
          <h3 className="font-semibold mb-3 text-sm">📊 파일 정보</h3>
          {file ? (
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-slate-700">
                <span className="text-slate-400">파일명</span>
                <span className="text-cyan-400">{file.name}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-700">
                <span className="text-slate-400">전체 병원</span>
                <span>{hospitals.length}개</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-700">
                <span className="text-slate-400">URL 있음</span>
                <span className="text-emerald-400">{hospitalsWithUrl.length}개</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-400">URL 없음</span>
                <span className="text-slate-500">{hospitals.length - hospitalsWithUrl.length}개</span>
              </div>
              
              <div className="pt-3 border-t border-slate-700">
                <label className="flex items-center gap-2 text-sm mb-3">
                  <input
                    type="checkbox"
                    checked={enableAI}
                    onChange={(e) => setEnableAI(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-slate-400">AI 분석 활성화 (비용 발생)</span>
                </label>
                <button
                  onClick={startAnalysis}
                  disabled={analyzing || hospitalsWithUrl.length === 0}
                  className="w-full px-4 py-2 bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {analyzing ? `분석 중... (${progress.current}/${progress.total})` : `분석 시작 (${hospitalsWithUrl.length}개)`}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-500 py-8">
              CSV 파일을 업로드하세요
            </div>
          )}
        </div>
      </div>

      {/* 진행률 */}
      {analyzing && (
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
          <div className="flex justify-between text-sm mb-2">
            <span>분석 진행률</span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-cyan-500 to-indigo-500 h-2 rounded-full transition-all"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* 결과 테이블 */}
      {results.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
          <div className="p-3 border-b border-slate-700 flex justify-between items-center">
            <span className="font-semibold text-sm">📋 분석 결과 ({results.length}개)</span>
            <button
              onClick={downloadResults}
              className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded text-sm hover:bg-emerald-500/30"
            >
              📥 CSV 다운로드
            </button>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-700/50 sticky top-0">
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
                  <tr key={i} className={`hover:bg-slate-700/30 ${r.status === 'error' ? 'opacity-60' : ''}`}>
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
                  <span className={`px-2 py-0.5 text-xs rounded ${
                    trick.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'
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
