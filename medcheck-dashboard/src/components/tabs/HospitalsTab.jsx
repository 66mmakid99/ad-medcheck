import { useState, useEffect } from 'react';
import { API_BASE } from '../../lib/config';
import GradeBadge from '../ui/GradeBadge';
import SeverityBadge from '../ui/SeverityBadge';

export default function HospitalsTab() {
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [gradeFilter, setGradeFilter] = useState('');

  useEffect(() => { loadData(); }, [gradeFilter]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `${API_BASE}/v1/dashboard/hospitals?limit=100`;
      if (gradeFilter) url += `&grade=${gradeFilter}`;
      const res = await fetch(url).then(r => r.json());
      if (res.success) {
        const items = Array.isArray(res.data) ? res.data : (res.data?.hospitals || res.data?.results || []);
        setHospitals(items);
      }
    } catch (e) {
      console.error(e);
      setError('병원 목록을 불러오지 못했습니다.');
    }
    setLoading(false);
  };

  const loadDetail = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/v1/analysis-history/${id}`);
      const data = await res.json();
      if (data.success && data.data?.length > 0) {
        const latest = data.data[0];
        setDetail({
          ...latest,
          violations: typeof latest.violations_json === 'string'
            ? JSON.parse(latest.violations_json || '[]')
            : (latest.violations_json || []),
        });
        setSelected(id);
      } else {
        const h = hospitals.find(h => (h.hospital_id || h.id) === id);
        if (h) {
          setDetail({
            ...h,
            violations: typeof h.violations_json === 'string'
              ? JSON.parse(h.violations_json || '[]')
              : (h.violations || []),
          });
          setSelected(id);
        }
      }
    } catch (e) { console.error(e); }
  };

  // 등급 분포
  const dist = hospitals.reduce((acc, h) => { acc[h.grade] = (acc[h.grade] || 0) + 1; return acc; }, {});

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-1">병원 관리</h2>
      <p className="text-sm text-text-secondary mb-6">크롤링 대상 병원 목록 및 분석 상태 관리 · {hospitals.length}개</p>

      {/* 등급 분포 카드 */}
      <div className="grid grid-cols-6 gap-3 mb-5">
        {['S','A','B','C','D','F'].map(g => (
          <button key={g} onClick={() => setGradeFilter(gradeFilter === g ? '' : g)}
            className={`bg-card rounded-xl border p-3 text-center transition-all ${gradeFilter === g ? 'border-accent ring-2 ring-accent/20' : 'border-border hover:border-accent/30'}`}>
            <GradeBadge grade={g} size="lg" />
            <p className="text-lg font-bold text-text-primary mt-1.5">{dist[g] || 0}</p>
          </button>
        ))}
      </div>

      {/* 필터 */}
      <div className="flex items-center gap-3 mb-4">
        <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20">
          <option value="">전체 등급</option>
          {['S','A','B','C','D','F'].map(g => <option key={g} value={g}>{g}등급</option>)}
        </select>
        <button onClick={loadData} className="px-3 py-2 bg-accent/10 text-accent rounded-lg text-sm font-medium hover:bg-accent/20 transition-colors">
          🔄 새로고침
        </button>
      </div>

      {/* 목록 + 상세 */}
      <div className="grid grid-cols-2 gap-5">
        {/* 병원 목록 */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface">
            <h4 className="text-sm font-semibold text-text-primary">병원별 위반 현황</h4>
          </div>
          {error ? (
            <div className="p-8 text-center">
              <p className="text-sm text-red-400 mb-2">{error}</p>
              <button onClick={loadData} className="text-xs text-accent hover:underline">다시 시도</button>
            </div>
          ) : loading ? (
            <div className="p-8 text-center text-text-muted">로딩 중...</div>
          ) : hospitals.length > 0 ? (
            <div className="divide-y divide-border max-h-[520px] overflow-y-auto sidebar-scroll">
              {hospitals.map((h, i) => {
                const hId = h.hospital_id || h.id;
                return (
                  <div key={hId || i} onClick={() => loadDetail(hId)}
                    className={`p-3.5 cursor-pointer transition-colors ${selected === hId ? 'bg-accent/[0.06]' : 'hover:bg-accent/[0.03]'}`}>
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{h.hospital_name}</p>
                        <p className="text-xs text-text-muted">{h.region || `${h.sido || ''} ${h.sigungu || ''}`.trim() || '-'}</p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <GradeBadge grade={h.grade} />
                        <p className="text-[11px] text-text-muted mt-1">위반 {h.violation_count || 0}건</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-text-muted">분석 결과가 없습니다</div>
          )}
        </div>

        {/* 상세 */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface">
            <h4 className="text-sm font-semibold text-text-primary">위반 상세 내역</h4>
          </div>
          {detail ? (
            <div className="p-4 space-y-4 max-h-[520px] overflow-y-auto sidebar-scroll">
              <div className="bg-surface rounded-lg p-3.5">
                <h5 className="font-semibold text-text-primary">{detail.hospital_name}</h5>
                <p className="text-xs text-text-muted">{detail.sido} {detail.sigungu}</p>
                <div className="mt-2.5">
                  <GradeBadge grade={detail.grade} size="lg" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="bg-grade-d/5 rounded-lg p-2.5 text-center border border-grade-d/10">
                  <p className="text-[11px] text-grade-d">Critical</p>
                  <p className="text-lg font-bold text-grade-d">{detail.critical_count || 0}</p>
                </div>
                <div className="bg-grade-c/5 rounded-lg p-2.5 text-center border border-grade-c/10">
                  <p className="text-[11px] text-grade-c">Major</p>
                  <p className="text-lg font-bold text-grade-c">{detail.major_count || 0}</p>
                </div>
                <div className="bg-grade-b/5 rounded-lg p-2.5 text-center border border-grade-b/10">
                  <p className="text-[11px] text-grade-b">Minor</p>
                  <p className="text-lg font-bold text-grade-b">{detail.minor_count || 0}</p>
                </div>
              </div>

              {detail.violations?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-text-secondary">위반 내역:</p>
                  {detail.violations.map((v, i) => (
                    <div key={i} className="bg-surface rounded-lg p-3 border border-border">
                      <div className="flex items-start gap-2">
                        <SeverityBadge severity={v.severity} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-text-primary">{v.description || v.pattern_description}</p>
                          {v.matched && <p className="text-[11px] text-text-muted mt-0.5">발견: "{v.matched}"</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-10 text-center text-text-muted">
              <div className="text-3xl mb-2">👈</div>
              <p className="text-sm">왼쪽에서 병원을 선택하세요</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
