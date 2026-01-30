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
    { id: 'pricing', name: '💰 시술가격', badge: priceAlerts.length },
    { id: 'alerts', name: '🔔 가격알림', badge: priceAlerts.filter(a => !a.is_read).length },
    { id: 'mapping', name: '🔄 매핑승인', badge: mappingCandidates.length },
    { id: 'fp', name: '🔴 오탐', badge: fpStats.summary?.pending || 0 },
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
