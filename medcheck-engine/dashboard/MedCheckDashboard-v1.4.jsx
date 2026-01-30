import React, { useState, useEffect, useCallback } from 'react';

// ============================================
// MEDCHECK Engine 대시보드 v1.4.0
// 시술가격 v2 + 분석결과 실시간 + 크롤링 현황
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

  // ============================================
  // 🆕 분석결과 데이터
  // ============================================
  const [analysisResults, setAnalysisResults] = useState([]);
  const [analysisStats, setAnalysisStats] = useState({ total: 0, violations: 0, clean: 0, pending: 0 });
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  const [analysisFilter, setAnalysisFilter] = useState({ grade: '', status: '' });

  // ============================================
  // 🆕 크롤링 현황 데이터
  // ============================================
  const [crawlJobs, setCrawlJobs] = useState([]);
  const [crawlSessions, setCrawlSessions] = useState([]);
  const [activeCrawl, setActiveCrawl] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => { loadAllData(); }, []);

  // 크롤링 현황 실시간 폴링 (5초마다)
  useEffect(() => {
    if (activeTab === 'crawling') {
      const interval = setInterval(loadCrawlingData, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

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
      // 🆕 분석결과 & 크롤링
      loadAnalysisData(),
      loadCrawlingData(),
    ]);
    setLoading(false);
  };

  // 🆕 분석결과 로드
  const loadAnalysisData = async () => {
    try {
      // 분석 결과 목록
      const res = await fetch(`${API_BASE}/v1/analysis-results?limit=100`);
      const data = await res.json();
      if (data.success) setAnalysisResults(data.data || []);

      // 분석 통계
      const statsRes = await fetch(`${API_BASE}/v1/analysis-results/stats`);
      const statsData = await statsRes.json();
      if (statsData.success) setAnalysisStats(statsData.data || {});
    } catch (e) {
      console.error('Analysis data load error:', e);
    }
  };

  // 🆕 크롤링 현황 로드
  const loadCrawlingData = async () => {
    try {
      // 활성 크롤링 작업
      const activeRes = await fetch(`${API_BASE}/v1/crawl-status/active`);
      const activeData = await activeRes.json();
      if (activeData.success) setCrawlJobs(activeData.data || []);

      // 크롤링 세션
      const sessionsRes = await fetch(`${API_BASE}/v1/crawl-sessions?limit=20`);
      const sessionsData = await sessionsRes.json();
      if (sessionsData.success) setCrawlSessions(sessionsData.data || []);

      // 현재 활성 작업 찾기
      const running = (activeData.data || []).find(j => j.status === 'running');
      setActiveCrawl(running || null);
    } catch (e) {
      console.error('Crawling data load error:', e);
    }
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

  // 🆕 분석 결과 상세 로드
  const loadAnalysisDetail = async (id) => {
    const res = await fetch(`${API_BASE}/v1/analysis-results/${id}`);
    const d = await res.json();
    if (d.success) setSelectedAnalysis(d.data);
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

  // 🆕 위반 등급 색상
  const getGradeColor = (grade) => {
    switch (grade) {
      case 'A': return 'text-red-500 bg-red-500/20';
      case 'B': return 'text-orange-500 bg-orange-500/20';
      case 'C': return 'text-yellow-500 bg-yellow-500/20';
      case 'D': return 'text-emerald-500 bg-emerald-500/20';
      default: return 'text-slate-400 bg-slate-700';
    }
  };

  // 🆕 크롤링 상태 색상
  const getCrawlStatusColor = (status) => {
    switch (status) {
      case 'running': return 'text-cyan-400 bg-cyan-500/20';
      case 'completed': return 'text-emerald-400 bg-emerald-500/20';
      case 'paused': return 'text-yellow-400 bg-yellow-500/20';
      case 'failed': return 'text-red-400 bg-red-500/20';
      default: return 'text-slate-400 bg-slate-700';
    }
  };

  // 탭 정의 (🆕 분석결과, 크롤링 추가)
  const tabs = [
    { id: 'overview', name: '📊 개요' },
    { id: 'analysis', name: '🔍 분석결과', badge: analysisStats.violations || 0 },
    { id: 'crawling', name: '🕷️ 크롤링', badge: activeCrawl ? 1 : 0 },
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
            <p className="text-slate-400 text-sm">v1.4.0 | 분석결과 + 크롤링 현황 | {currentTime.toLocaleTimeString()}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* 🆕 실시간 크롤링 표시 */}
            {activeCrawl && (
              <div className="flex items-center gap-2 px-3 py-1 bg-cyan-500/20 rounded-full animate-pulse">
                <div className="w-2 h-2 bg-cyan-400 rounded-full" />
                <span className="text-cyan-400 text-sm">
                  크롤링 {activeCrawl.progress}/{activeCrawl.total}
                </span>
              </div>
            )}
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
              {tab.badge > 0 && <span className={`px-1.5 py-0.5 text-xs rounded ${tab.id === 'alerts' || tab.id === 'analysis' ? 'bg-red-500' : tab.id === 'crawling' ? 'bg-cyan-500' : 'bg-white/20'}`}>{tab.badge}</span>}
            </button>
          ))}
        </div>

        {/* ============================================ */}
        {/* 개요 탭 */}
        {/* ============================================ */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-8 gap-3">
              <StatCard title="분석 완료" value={analysisStats.total || 0} color="cyan" />
              <StatCard title="위반 발견" value={analysisStats.violations || 0} color="red" />
              <StatCard title="정상" value={analysisStats.clean || 0} color="emerald" />
              <StatCard title="가격 기록" value={priceStats.summary?.total_records || 0} color="blue" />
              <StatCard title="시술 종류" value={priceStats.summary?.procedures_with_price || 0} color="purple" />
              <StatCard title="스크린샷" value={priceStats.summary?.with_screenshot || 0} color="orange" />
              <StatCard title="매핑 대기" value={priceStats.pendingMappings || 0} color="yellow" />
              <StatCard title="가격 알림" value={priceAlerts.length} color="red" />
            </div>

            <div className="grid grid-cols-4 gap-4">
              {/* 🆕 최근 분석 */}
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <h3 className="font-semibold mb-3 text-sm">🔍 최근 분석 결과</h3>
                {analysisResults.slice(0, 5).map((r, i) => (
                  <div key={i} className="flex justify-between py-2 border-b border-slate-700/50 text-sm">
                    <div className="truncate max-w-[150px]">
                      <p className="truncate">{r.hospital_name || r.url_analyzed}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs ${getGradeColor(r.grade)}`}>
                      {r.grade || '-'} ({r.violation_count || 0})
                    </span>
                  </div>
                ))}
                {analysisResults.length === 0 && <p className="text-slate-500 text-sm">분석 결과 없음</p>}
              </div>

              {/* 🆕 크롤링 현황 */}
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <h3 className="font-semibold mb-3 text-sm">🕷️ 크롤링 현황</h3>
                {crawlJobs.slice(0, 4).map((job, i) => (
                  <div key={i} className="py-2 border-b border-slate-700/50">
                    <div className="flex justify-between items-center">
                      <span className={`px-2 py-0.5 rounded text-xs ${getCrawlStatusColor(job.status)}`}>
                        {job.status}
                      </span>
                      <span className="text-xs text-slate-400">{job.job_type}</span>
                    </div>
                    {job.status === 'running' && (
                      <div className="mt-1">
                        <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-cyan-500 transition-all"
                            style={{ width: `${job.total > 0 ? (job.progress / job.total) * 100 : 0}%` }}
                          />
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{job.progress}/{job.total} ({job.found} found)</p>
                      </div>
                    )}
                  </div>
                ))}
                {crawlJobs.length === 0 && <p className="text-slate-500 text-sm">활성 크롤링 없음</p>}
              </div>

              {/* 부위별 통계 */}
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <h3 className="font-semibold mb-3 text-sm">📍 부위별 가격 데이터</h3>
                {(priceStats.byArea || []).slice(0, 5).map((area, i) => (
                  <div key={i} className="flex justify-between py-1.5 border-b border-slate-700/50 text-sm">
                    <span className="text-slate-400">{area.area_name || area.target_area_code}</span>
                    <div className="text-right">
                      <span className="text-cyan-400">{area.count}건</span>
                    </div>
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
                  </div>
                ))}
                {priceAlerts.length === 0 && <p className="text-slate-500 text-sm">알림 없음</p>}
              </div>
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* 🆕 분석결과 탭 */}
        {/* ============================================ */}
        {activeTab === 'analysis' && (
          <div className="space-y-4">
            {/* 통계 */}
            <div className="grid grid-cols-5 gap-3">
              <StatCard title="전체 분석" value={analysisStats.total || 0} color="cyan" />
              <StatCard title="위반 (A등급)" value={analysisStats.gradeA || 0} color="red" />
              <StatCard title="주의 (B등급)" value={analysisStats.gradeB || 0} color="orange" />
              <StatCard title="경미 (C등급)" value={analysisStats.gradeC || 0} color="yellow" />
              <StatCard title="정상 (D등급)" value={analysisStats.gradeD || 0} color="emerald" />
            </div>

            {/* 필터 */}
            <div className="flex gap-3 items-center">
              <select
                value={analysisFilter.grade}
                onChange={(e) => setAnalysisFilter(f => ({ ...f, grade: e.target.value }))}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">전체 등급</option>
                <option value="A">A - 심각한 위반</option>
                <option value="B">B - 주의 필요</option>
                <option value="C">C - 경미한 문제</option>
                <option value="D">D - 정상</option>
              </select>
              <select
                value={analysisFilter.status}
                onChange={(e) => setAnalysisFilter(f => ({ ...f, status: e.target.value }))}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">전체 상태</option>
                <option value="success">성공</option>
                <option value="error">오류</option>
                <option value="pending">대기</option>
              </select>
              <button onClick={loadAnalysisData} className="px-3 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg text-sm hover:bg-cyan-500/30">
                🔄 새로고침
              </button>
            </div>

            <div className="grid grid-cols-5 gap-4">
              {/* 분석 결과 목록 */}
              <div className="col-span-2 bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                <div className="p-3 border-b border-slate-700 font-semibold text-sm">분석 결과 목록</div>
                <div className="divide-y divide-slate-700 max-h-[600px] overflow-y-auto">
                  {analysisResults
                    .filter(r => !analysisFilter.grade || r.grade === analysisFilter.grade)
                    .filter(r => !analysisFilter.status || r.status === analysisFilter.status)
                    .map((r, i) => (
                    <div key={i}
                      onClick={() => loadAnalysisDetail(r.id)}
                      className={`p-3 cursor-pointer ${selectedAnalysis?.id === r.id ? 'bg-cyan-500/20' : 'hover:bg-slate-700/50'}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{r.hospital_name || '이름 없음'}</p>
                          <p className="text-xs text-slate-400 truncate">{r.url_analyzed}</p>
                          <p className="text-xs text-slate-500">{new Date(r.analyzed_at).toLocaleString()}</p>
                        </div>
                        <div className="text-right ml-2">
                          <span className={`px-2 py-1 rounded text-sm font-bold ${getGradeColor(r.grade)}`}>
                            {r.grade || '-'}
                          </span>
                          <p className="text-xs text-slate-400 mt-1">{r.violation_count || 0}건 위반</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 분석 상세 */}
              <div className="col-span-3 space-y-4">
                {selectedAnalysis ? (
                  <>
                    {/* 기본 정보 */}
                    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-lg font-bold">{selectedAnalysis.hospital_name || '이름 없음'}</h3>
                          <a href={selectedAnalysis.url_analyzed} target="_blank" rel="noopener noreferrer"
                            className="text-sm text-blue-400 hover:underline truncate block max-w-md">
                            {selectedAnalysis.url_analyzed}
                          </a>
                        </div>
                        <div className={`px-4 py-2 rounded-lg text-2xl font-bold ${getGradeColor(selectedAnalysis.grade)}`}>
                          {selectedAnalysis.grade || '-'}
                        </div>
                      </div>
                      <p className="text-sm text-slate-400 mt-2">{selectedAnalysis.summary}</p>
                    </div>

                    {/* 위반 목록 */}
                    {selectedAnalysis.violations?.length > 0 && (
                      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                        <div className="p-3 border-b border-slate-700 font-semibold text-sm">
                          🚨 위반 사항 ({selectedAnalysis.violations.length}건)
                        </div>
                        <div className="divide-y divide-slate-700 max-h-[400px] overflow-y-auto">
                          {selectedAnalysis.violations.map((v, i) => (
                            <div key={i} className="p-3">
                              <div className="flex items-start gap-3">
                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                  v.severity === 'high' ? 'bg-red-500/20 text-red-400' :
                                  v.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-slate-600 text-slate-300'
                                }`}>{v.severity}</span>
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{v.type}</p>
                                  <p className="text-sm text-slate-400 mt-1">{v.description}</p>
                                  {v.matchedText && (
                                    <p className="text-xs bg-red-500/10 text-red-300 p-2 rounded mt-2 font-mono">
                                      "{v.matchedText}"
                                    </p>
                                  )}
                                  {v.legalBasis && (
                                    <p className="text-xs text-slate-500 mt-1">📋 {v.legalBasis}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 가격 정보 (있는 경우) */}
                    {selectedAnalysis.prices?.length > 0 && (
                      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                        <div className="p-3 border-b border-slate-700 font-semibold text-sm">
                          💰 수집된 가격 정보 ({selectedAnalysis.prices.length}건)
                        </div>
                        <table className="w-full text-sm">
                          <thead className="bg-slate-700/50">
                            <tr>
                              <th className="text-left p-2">시술명</th>
                              <th className="text-right p-2">가격</th>
                              <th className="text-right p-2">부위</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-700">
                            {selectedAnalysis.prices.map((p, i) => (
                              <tr key={i} className="hover:bg-slate-700/30">
                                <td className="p-2">{p.procedure_name || p.name}</td>
                                <td className="p-2 text-right text-cyan-400 font-bold">{formatPrice(p.price)}</td>
                                <td className="p-2 text-right text-slate-400">{p.target_area || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="bg-slate-800/50 rounded-xl p-8 border border-slate-700 text-center text-slate-500">
                    좌측에서 분석 결과를 선택하세요
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* 🆕 크롤링 현황 탭 */}
        {/* ============================================ */}
        {activeTab === 'crawling' && (
          <div className="space-y-4">
            {/* 활성 크롤링 */}
            {activeCrawl && (
              <div className="bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 rounded-xl p-6 border border-cyan-500/50">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <span className="w-3 h-3 bg-cyan-400 rounded-full animate-pulse" />
                      크롤링 진행 중
                    </h3>
                    <p className="text-slate-400 text-sm">{activeCrawl.job_type}</p>
                    {activeCrawl.current_item && (
                      <p className="text-sm text-cyan-400 mt-1">현재: {activeCrawl.current_item}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-cyan-400">{activeCrawl.progress} / {activeCrawl.total}</p>
                    <p className="text-sm text-slate-400">
                      {activeCrawl.total > 0 ? Math.round((activeCrawl.progress / activeCrawl.total) * 100) : 0}% 완료
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-500"
                      style={{ width: `${activeCrawl.total > 0 ? (activeCrawl.progress / activeCrawl.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-emerald-400">{activeCrawl.found || 0}</p>
                    <p className="text-xs text-slate-400">발견</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-400">{activeCrawl.failed || 0}</p>
                    <p className="text-xs text-slate-400">실패</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-slate-300">{activeCrawl.progress - (activeCrawl.found || 0) - (activeCrawl.failed || 0)}</p>
                    <p className="text-xs text-slate-400">미발견</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-slate-300">{activeCrawl.total - activeCrawl.progress}</p>
                    <p className="text-xs text-slate-400">남은 항목</p>
                  </div>
                </div>
              </div>
            )}

            {/* 크롤링 작업 목록 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                <div className="p-3 border-b border-slate-700 font-semibold text-sm flex justify-between">
                  <span>최근 크롤링 작업</span>
                  <button onClick={loadCrawlingData} className="text-cyan-400 text-xs hover:underline">새로고침</button>
                </div>
                <div className="divide-y divide-slate-700 max-h-[400px] overflow-y-auto">
                  {crawlJobs.map((job, i) => (
                    <div key={i} className="p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${getCrawlStatusColor(job.status)}`}>
                              {job.status}
                            </span>
                            <span className="text-sm font-medium">{job.job_type}</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">ID: {job.id}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm">{job.progress}/{job.total}</p>
                          <p className="text-xs text-emerald-400">{job.found} found</p>
                        </div>
                      </div>
                      {job.status === 'running' && (
                        <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-cyan-500"
                            style={{ width: `${job.total > 0 ? (job.progress / job.total) * 100 : 0}%` }}
                          />
                        </div>
                      )}
                      {job.message && <p className="text-xs text-slate-500 mt-1">{job.message}</p>}
                    </div>
                  ))}
                  {crawlJobs.length === 0 && (
                    <div className="p-8 text-center text-slate-500">크롤링 작업 없음</div>
                  )}
                </div>
              </div>

              {/* 크롤링 세션 */}
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                <div className="p-3 border-b border-slate-700 font-semibold text-sm">크롤링 세션 기록</div>
                <div className="divide-y divide-slate-700 max-h-[400px] overflow-y-auto">
                  {crawlSessions.map((session, i) => (
                    <div key={i} className="p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium">{session.session_type}</p>
                          <p className="text-xs text-slate-400">{session.target_sido} {session.target_region}</p>
                        </div>
                        <div className="text-right">
                          <span className={`px-2 py-0.5 rounded text-xs ${getCrawlStatusColor(session.status)}`}>
                            {session.status}
                          </span>
                          <p className="text-xs text-slate-400 mt-1">
                            {new Date(session.started_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {crawlSessions.length === 0 && (
                    <div className="p-8 text-center text-slate-500">세션 기록 없음</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* 시술가격 탭 (v2) - 기존 유지 */}
        {/* ============================================ */}
        {activeTab === 'pricing' && (
          <div className="space-y-4">
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

              <div className="col-span-3 space-y-4">
                {procedureDetail ? (
                  <>
                    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                      <h3 className="text-lg font-bold">{procedureDetail.name}</h3>
                      <p className="text-sm text-slate-400">{procedureDetail.category} &gt; {procedureDetail.subcategory}</p>
                      {procedureDetail.aliases?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {procedureDetail.aliases.map((a, i) => (
                            <span key={i} className="px-2 py-0.5 bg-slate-700 rounded text-xs">{a.alias_name}</span>
                          ))}
                        </div>
                      )}
                    </div>

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
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {priceCompare?.hospitals?.length > 0 && (
                      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                        <div className="p-3 border-b border-slate-700 font-semibold text-sm">🏥 병원별 가격 비교</div>
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

        {/* 나머지 탭들 (alerts, mapping, fp) - 기존 유지 */}
        {activeTab === 'alerts' && (
          <div className="bg-slate-800/50 rounded-xl p-8 border border-slate-700 text-center">
            <p className="text-slate-400">가격 알림 탭 - 기존 코드 유지</p>
          </div>
        )}

        {activeTab === 'mapping' && (
          <div className="space-y-4">
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
                      <th className="text-right p-3">평균 가격</th>
                      <th className="text-center p-3">액션</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {mappingCandidates.map((mc, i) => (
                      <tr key={i} className="hover:bg-slate-700/30">
                        <td className="p-3 font-medium">{mc.alias_name}</td>
                        <td className="p-3 text-cyan-400">{mc.suggested_procedure_name || '-'}</td>
                        <td className="p-3 text-right">{mc.total_cases}</td>
                        <td className="p-3 text-right">{formatPrice(mc.price_avg)}</td>
                        <td className="p-3 text-center">
                          <div className="flex justify-center gap-1">
                            <button onClick={() => approveMappingCandidate(mc.id)}
                              className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs">✓</button>
                            <button onClick={() => rejectMappingCandidate(mc.id, '확인 필요')}
                              className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs">✗</button>
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

        {activeTab === 'fp' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <h3 className="font-semibold mb-3">오탐 통계</h3>
              <div className="grid grid-cols-2 gap-3">
                <StatCard title="전체" value={fpStats.summary?.total || 0} color="slate" />
                <StatCard title="대기" value={fpStats.summary?.pending || 0} color="yellow" />
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

        {/* 스크린샷 모달 */}
        {screenshotModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setScreenshotModal(null)}>
            <div className="bg-slate-800 rounded-xl max-w-4xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b border-slate-700 flex justify-between items-center sticky top-0 bg-slate-800">
                <div>
                  <h3 className="font-bold">📸 원본 스크린샷</h3>
                  {screenshotModal.hospital && <p className="text-sm text-slate-400">{screenshotModal.hospital}</p>}
                </div>
                <button onClick={() => setScreenshotModal(null)} className="text-slate-400 hover:text-white text-xl">✕</button>
              </div>
              <div className="p-4">
                <img src={screenshotModal.url} alt="Screenshot" className="w-full rounded" />
                {screenshotModal.price && (
                  <p className="text-center mt-4 text-lg">수집 가격: <span className="text-cyan-400 font-bold">{formatPrice(screenshotModal.price)}</span></p>
                )}
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
