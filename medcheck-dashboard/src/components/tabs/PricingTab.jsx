import { useState, useEffect } from 'react';
import { API_BASE } from '../../lib/config';

function formatPrice(price) {
  if (!price) return '-';
  if (price >= 10000) return (price / 10000).toFixed(0) + '만원';
  return price.toLocaleString() + '원';
}

export default function PricingTab() {
  const [stats, setStats] = useState(null);
  const [procedures, setProcedures] = useState([]);
  const [targetAreas, setTargetAreas] = useState([]);
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedProcedure, setSelectedProcedure] = useState(null);
  const [detail, setDetail] = useState(null);
  const [compare, setCompare] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, procRes, areaRes] = await Promise.all([
          fetch(`${API_BASE}/v2/prices/stats`).then(r => r.json()),
          fetch(`${API_BASE}/v1/procedures?hasPrice=true`).then(r => r.json()),
          fetch(`${API_BASE}/v1/target-areas`).then(r => r.json()),
        ]);
        if (statsRes.success) setStats(statsRes.data);
        if (procRes.success) setProcedures(procRes.data || []);
        if (areaRes.success) setTargetAreas(areaRes.data || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, []);

  const loadDetail = async (id) => {
    setSelectedProcedure(id);
    try {
      const res = await fetch(`${API_BASE}/v1/procedures/${id}`);
      const data = await res.json();
      if (data.success) setDetail(data.data);
    } catch (e) { console.error(e); }
  };

  const loadCompare = async (procId) => {
    let url = `${API_BASE}/v2/prices/compare/${procId}`;
    if (selectedArea) url += `?targetArea=${selectedArea}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) setCompare(data.data);
    } catch (e) { console.error(e); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-1">시술 가격</h2>
      <p className="text-sm text-text-secondary mb-6">부위별 시술 가격 분석 및 비교</p>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-text-secondary mb-1">총 가격 데이터</p>
          <p className="text-2xl font-bold text-accent">{stats?.summary?.totalRecords || 0}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-text-secondary mb-1">시술 종류</p>
          <p className="text-2xl font-bold text-emerald-400">{stats?.summary?.totalProcedures || 0}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-text-secondary mb-1">스크린샷</p>
          <p className="text-2xl font-bold text-purple-400">{stats?.summary?.totalScreenshots || 0}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-text-secondary mb-1">매핑 대기</p>
          <p className="text-2xl font-bold text-amber-400">{stats?.pendingMappings || 0}</p>
        </div>
      </div>

      {/* Area filter */}
      <div className="mb-4">
        <select
          value={selectedArea}
          onChange={e => setSelectedArea(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
        >
          <option value="">전체 부위</option>
          {targetAreas.map(a => (
            <option key={a.code} value={a.code}>{a.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* Procedure list (3/5) */}
        <div className="col-span-3 bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3">시술 목록 ({procedures.length})</h3>
          <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
            {procedures.map(p => (
              <button
                key={p.id}
                onClick={() => { loadDetail(p.id); loadCompare(p.id); }}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                  selectedProcedure === p.id ? 'bg-accent-muted' : 'hover:bg-navy-800/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-primary">{p.name}</span>
                  <span className="text-xs text-text-secondary">{p.category}</span>
                </div>
                {p.priceRange && (
                  <p className="text-xs text-text-secondary mt-0.5">
                    {formatPrice(p.priceRange.min)} ~ {formatPrice(p.priceRange.max)}
                  </p>
                )}
              </button>
            ))}
            {procedures.length === 0 && (
              <p className="text-sm text-text-secondary text-center py-8">등록된 시술 가격이 없습니다.</p>
            )}
          </div>
        </div>

        {/* Detail panel (2/5) */}
        <div className="col-span-2">
          {detail ? (
            <div className="bg-card rounded-xl border border-border p-5 space-y-4 sticky top-4">
              <h3 className="text-sm font-semibold text-text-primary">{detail.name}</h3>
              <p className="text-xs text-text-secondary">{detail.category}</p>

              {detail.areaPrice && detail.areaPrice.length > 0 && (
                <div>
                  <p className="text-xs text-text-secondary mb-2">부위별 가격</p>
                  <div className="space-y-1.5">
                    {detail.areaPrice.map((ap, i) => (
                      <div key={i} className="flex items-center justify-between bg-navy-800/30 rounded-lg px-3 py-2">
                        <span className="text-xs text-text-primary">{ap.targetArea}</span>
                        <span className="text-xs font-medium text-accent">{formatPrice(ap.price)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {compare && (
                <div>
                  <p className="text-xs text-text-secondary mb-2">가격 비교</p>
                  <div className="space-y-1.5">
                    {(compare.hospitals || []).map((h, i) => (
                      <div key={i} className="flex items-center justify-between bg-navy-800/30 rounded-lg px-3 py-2">
                        <span className="text-xs text-text-primary">{h.name}</span>
                        <span className="text-xs text-text-primary">{formatPrice(h.price)}</span>
                      </div>
                    ))}
                  </div>
                  {compare.stats && (
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <div className="bg-navy-800/30 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-text-secondary">최저</p>
                        <p className="text-xs font-medium text-emerald-400">{formatPrice(compare.stats.min)}</p>
                      </div>
                      <div className="bg-navy-800/30 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-text-secondary">평균</p>
                        <p className="text-xs font-medium text-text-primary">{formatPrice(compare.stats.avg)}</p>
                      </div>
                      <div className="bg-navy-800/30 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-text-secondary">최고</p>
                        <p className="text-xs font-medium text-red-400">{formatPrice(compare.stats.max)}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border p-8 text-center">
              <p className="text-3xl mb-3">💰</p>
              <p className="text-sm text-text-secondary">시술을 선택하면 상세 가격을 확인할 수 있습니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
