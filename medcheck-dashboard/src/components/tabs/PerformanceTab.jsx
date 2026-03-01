import { useState, useEffect } from 'react';
import { API_BASE } from '../../lib/config';

function MiniCard({ label, value, sub, color = 'accent' }) {
  const colors = {
    accent: 'text-accent',
    green: 'text-emerald-400',
    red: 'text-red-400',
    purple: 'text-purple-400',
  };
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <p className="text-xs text-text-secondary mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colors[color] || colors.accent}`}>{value}</p>
      {sub && <p className="text-xs text-text-secondary mt-1">{sub}</p>}
    </div>
  );
}

function ConfidenceBar({ value, size = 'sm' }) {
  const pct = Math.round((value || 0) * 100);
  const color = pct >= 90 ? 'bg-emerald-400' : pct >= 70 ? 'bg-amber-400' : 'bg-red-400';
  const h = size === 'sm' ? 'h-1.5' : 'h-2.5';
  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 ${h} bg-navy-700/40 rounded-full overflow-hidden`}>
        <div className={`${h} ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-text-secondary w-10 text-right">{pct}%</span>
    </div>
  );
}

export default function PerformanceTab() {
  const [report, setReport] = useState(null);
  const [flagged, setFlagged] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [aggregating, setAggregating] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState(null);
  const [patternDetail, setPatternDetail] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [repRes, flagRes, patRes] = await Promise.all([
        fetch(`${API_BASE}/v1/performance/report`).then(r => r.json()),
        fetch(`${API_BASE}/v1/performance/flagged`).then(r => r.json()),
        fetch(`${API_BASE}/v1/performance/patterns?limit=50`).then(r => r.json()),
      ]);
      if (repRes.success) setReport(repRes.data);
      if (flagRes.success) setFlagged(flagRes.data || []);
      if (patRes.success) setPatterns(patRes.data || []);
    } catch (e) {
      console.error(e);
      setError('성능 데이터를 불러오지 못했습니다.');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const loadPatternDetail = async (id) => {
    setSelectedPattern(id);
    try {
      const res = await fetch(`${API_BASE}/v1/performance/patterns/${id}`);
      const data = await res.json();
      if (data.success) setPatternDetail(data.data);
    } catch (e) { console.error(e); }
  };

  const runAggregate = async () => {
    setAggregating(true);
    try {
      await fetch(`${API_BASE}/v1/performance/aggregate`, { method: 'POST' });
      await load();
    } catch (e) { console.error(e); }
    setAggregating(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card rounded-xl border border-red-500/20 p-10 text-center">
        <p className="text-3xl mb-3">⚠️</p>
        <p className="text-sm text-red-400 mb-3">{error}</p>
        <button onClick={load} className="px-4 py-2 bg-accent text-white rounded-lg text-sm">다시 시도</button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-text-primary mb-1">분석 성능</h2>
          <p className="text-sm text-text-secondary">패턴별 정확도 추적 및 저성능 패턴 모니터링</p>
        </div>
        <button
          onClick={runAggregate}
          disabled={aggregating}
          className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-light transition-colors disabled:opacity-50"
        >
          {aggregating ? '집계 중...' : '성능 집계 실행'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <MiniCard label="전체 정확도" value={`${((report?.accuracy || 0) * 100).toFixed(1)}%`} color={report?.accuracy >= 0.9 ? 'green' : 'red'} />
        <MiniCard label="총 분석 건수" value={report?.totalAnalyses || 0} color="accent" />
        <MiniCard label="저성능 패턴" value={flagged.length} color={flagged.length > 0 ? 'red' : 'green'} />
        <MiniCard label="평균 신뢰도" value={`${((report?.avgConfidence || 0) * 100).toFixed(1)}%`} color="purple" />
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* Pattern list (3/5) */}
        <div className="col-span-3 space-y-4">
          {/* Flagged patterns */}
          {flagged.length > 0 && (
            <div className="bg-card rounded-xl border border-red-500/20 p-4">
              <h3 className="text-sm font-semibold text-red-400 mb-3">저성능 패턴 ({flagged.length})</h3>
              <div className="space-y-2">
                {flagged.map(p => (
                  <button
                    key={p.pattern_id}
                    onClick={() => loadPatternDetail(p.pattern_id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                      selectedPattern === p.pattern_id ? 'bg-red-500/10 border border-red-500/30' : 'hover:bg-navy-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-text-secondary">{p.pattern_id}</span>
                      <span className="text-xs text-red-400">{p.flag_reason}</span>
                    </div>
                    <ConfidenceBar value={p.accuracy} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* All patterns */}
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-3">패턴 성능 ({patterns.length})</h3>
            <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
              {patterns.map(p => (
                <button
                  key={p.pattern_id}
                  onClick={() => loadPatternDetail(p.pattern_id)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    selectedPattern === p.pattern_id ? 'bg-accent-muted' : 'hover:bg-navy-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-text-secondary">{p.pattern_id}</span>
                    <div className="flex items-center gap-3 text-xs text-text-secondary">
                      <span>TP:{p.true_positives || 0}</span>
                      <span>FP:{p.false_positives || 0}</span>
                      <span>분석:{p.total_detections || 0}</span>
                    </div>
                  </div>
                  <ConfidenceBar value={p.accuracy} />
                </button>
              ))}
              {patterns.length === 0 && (
                <p className="text-sm text-text-secondary text-center py-8">성능 데이터가 없습니다. 집계를 실행해 주세요.</p>
              )}
            </div>
          </div>
        </div>

        {/* Detail panel (2/5) */}
        <div className="col-span-2">
          {patternDetail ? (
            <div className="bg-card rounded-xl border border-border p-5 sticky top-4">
              <h3 className="text-sm font-semibold text-text-primary mb-4">
                {patternDetail.pattern_id} 상세
              </h3>

              <div className="space-y-4">
                <div>
                  <p className="text-xs text-text-secondary mb-1">정확도</p>
                  <ConfidenceBar value={patternDetail.accuracy} size="lg" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-navy-800/30 rounded-lg p-3">
                    <p className="text-xs text-text-secondary">정탐(TP)</p>
                    <p className="text-lg font-bold text-emerald-400">{patternDetail.true_positives || 0}</p>
                  </div>
                  <div className="bg-navy-800/30 rounded-lg p-3">
                    <p className="text-xs text-text-secondary">오탐(FP)</p>
                    <p className="text-lg font-bold text-red-400">{patternDetail.false_positives || 0}</p>
                  </div>
                  <div className="bg-navy-800/30 rounded-lg p-3">
                    <p className="text-xs text-text-secondary">미탐(FN)</p>
                    <p className="text-lg font-bold text-amber-400">{patternDetail.false_negatives || 0}</p>
                  </div>
                  <div className="bg-navy-800/30 rounded-lg p-3">
                    <p className="text-xs text-text-secondary">총 탐지</p>
                    <p className="text-lg font-bold text-text-primary">{patternDetail.total_detections || 0}</p>
                  </div>
                </div>

                {patternDetail.category && (
                  <div>
                    <p className="text-xs text-text-secondary mb-1">카테고리</p>
                    <p className="text-sm text-text-primary">{patternDetail.category}</p>
                  </div>
                )}

                {patternDetail.last_updated && (
                  <div>
                    <p className="text-xs text-text-secondary mb-1">마지막 업데이트</p>
                    <p className="text-sm text-text-primary">
                      {new Date(patternDetail.last_updated).toLocaleString('ko-KR')}
                    </p>
                  </div>
                )}

                {patternDetail.is_flagged === 1 && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    <p className="text-xs text-red-400 font-medium">저성능 플래그</p>
                    <p className="text-sm text-text-secondary mt-1">{patternDetail.flag_reason || '정확도 기준 미달'}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border p-8 text-center">
              <p className="text-3xl mb-3">📈</p>
              <p className="text-sm text-text-secondary">패턴을 선택하면 상세 성능을 확인할 수 있습니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
