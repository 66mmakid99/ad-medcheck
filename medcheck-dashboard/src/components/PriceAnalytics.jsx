// ================================================================
// PriceAnalytics.jsx - 가격 분석 대시보드 컴포넌트
// ================================================================
// 위치: medcheck-dashboard/src/components/PriceAnalytics.jsx
// ================================================================

import React, { useState, useEffect } from 'react';

const API_BASE = 'https://medcheck-engine.mmakid.workers.dev';

// 가격 포맷
const formatPrice = (price) => {
  if (!price) return '-';
  return new Intl.NumberFormat('ko-KR').format(price) + '원';
};

// 가격 등급 색상
const getGradeColor = (grade) => {
  if (!grade) return 'text-slate-400';
  if (grade.includes('매우 저렴')) return 'text-emerald-400';
  if (grade.includes('저렴')) return 'text-green-400';
  if (grade.includes('적정')) return 'text-cyan-400';
  if (grade.includes('비쌈') && !grade.includes('매우')) return 'text-orange-400';
  if (grade.includes('매우 비쌈')) return 'text-red-400';
  return 'text-slate-400';
};

export default function PriceAnalytics() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [procedures, setProcedures] = useState([]);
  const [regions, setRegions] = useState([]);
  const [rankings, setRankings] = useState([]);
  
  const [selectedProcedure, setSelectedProcedure] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [activeView, setActiveView] = useState('overview'); // overview, procedures, regions, rankings

  // 데이터 로드
  useEffect(() => {
    loadOverview();
    loadProcedures();
    loadRegions();
  }, []);

  const loadOverview = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/analytics/overview`);
      const data = await res.json();
      if (data.success) {
        setOverview(data.data);
      }
    } catch (error) {
      console.error('Overview load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProcedures = async (sigungu = '') => {
    try {
      const url = sigungu 
        ? `${API_BASE}/api/analytics/procedures?sigungu=${encodeURIComponent(sigungu)}`
        : `${API_BASE}/api/analytics/procedures`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setProcedures(data.data || []);
      }
    } catch (error) {
      console.error('Procedures load error:', error);
    }
  };

  const loadRegions = async (procedureId = '') => {
    try {
      const url = procedureId
        ? `${API_BASE}/api/analytics/regions?procedureId=${encodeURIComponent(procedureId)}`
        : `${API_BASE}/api/analytics/regions`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setRegions(data.data || []);
      }
    } catch (error) {
      console.error('Regions load error:', error);
    }
  };

  const loadRankings = async (procedureId, sigungu = '') => {
    if (!procedureId) return;
    try {
      let url = `${API_BASE}/api/analytics/hospitals/ranking?procedureId=${encodeURIComponent(procedureId)}`;
      if (sigungu) url += `&sigungu=${encodeURIComponent(sigungu)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setRankings(data.data);
      }
    } catch (error) {
      console.error('Rankings load error:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 서브 탭 */}
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        {[
          { id: 'overview', name: '📊 현황', },
          { id: 'procedures', name: '💉 시술별' },
          { id: 'regions', name: '📍 지역별' },
          { id: 'rankings', name: '🏆 랭킹' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeView === tab.id
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {tab.name}
          </button>
        ))}
      </div>

      {/* 현황 뷰 */}
      {activeView === 'overview' && (
        <div className="space-y-4">
          {/* 요약 카드 */}
          <div className="grid grid-cols-4 gap-4">
            <SummaryCard 
              title="총 가격 데이터" 
              value={overview?.summary?.total_prices || 0}
              icon="📊"
              color="cyan"
            />
            <SummaryCard 
              title="수집된 병원" 
              value={overview?.summary?.total_hospitals || 0}
              icon="🏥"
              color="emerald"
            />
            <SummaryCard 
              title="시술 종류" 
              value={overview?.summary?.total_procedures || 0}
              icon="💉"
              color="purple"
            />
            <SummaryCard 
              title="수집 지역" 
              value={overview?.summary?.total_regions || 0}
              icon="📍"
              color="orange"
            />
          </div>

          {/* 오늘 수집 */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <h3 className="font-semibold mb-3">📅 오늘 수집</h3>
            <div className="text-3xl font-bold text-cyan-400">
              {overview?.today || 0}건
            </div>
          </div>

          {/* 주간 트렌드 */}
          {overview?.weeklyTrend?.length > 0 && (
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <h3 className="font-semibold mb-3">📈 최근 7일 수집 추이</h3>
              <div className="flex items-end gap-2 h-32">
                {overview.weeklyTrend.map((day, i) => {
                  const maxCount = Math.max(...overview.weeklyTrend.map(d => d.count));
                  const height = maxCount > 0 ? (day.count / maxCount * 100) : 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs text-slate-400">{day.count}</span>
                      <div 
                        className="w-full bg-cyan-500/50 rounded-t"
                        style={{ height: `${height}%`, minHeight: '4px' }}
                      />
                      <span className="text-xs text-slate-500">
                        {new Date(day.date).toLocaleDateString('ko-KR', { weekday: 'short' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 단위별 분포 */}
          {overview?.unitDistribution?.length > 0 && (
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <h3 className="font-semibold mb-3">📊 단위별 분포</h3>
              <div className="space-y-2">
                {overview.unitDistribution.map((unit, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-20 text-sm text-slate-400">{unit.unit}</span>
                    <div className="flex-1 h-4 bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full"
                        style={{ width: `${unit.percentage}%` }}
                      />
                    </div>
                    <span className="text-sm text-slate-400 w-16 text-right">
                      {unit.count}건 ({unit.percentage}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 데이터 없을 때 */}
          {(!overview?.summary?.total_prices || overview.summary.total_prices === 0) && (
            <div className="bg-slate-800/50 rounded-xl p-8 border border-slate-700 text-center">
              <div className="text-4xl mb-4">📭</div>
              <h3 className="text-lg font-semibold mb-2">아직 가격 데이터가 없습니다</h3>
              <p className="text-slate-400 text-sm">
                OCR API로 가격 이미지를 수집하면 여기에 분석 결과가 표시됩니다.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 시술별 뷰 */}
      {activeView === 'procedures' && (
        <div className="space-y-4">
          {/* 지역 필터 */}
          <div className="flex gap-3 items-center">
            <select
              value={selectedRegion}
              onChange={(e) => {
                setSelectedRegion(e.target.value);
                loadProcedures(e.target.value);
              }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">전체 지역</option>
              <option value="강남구">강남구</option>
              <option value="서초구">서초구</option>
              <option value="송파구">송파구</option>
            </select>
          </div>

          {/* 시술 목록 */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-left p-3 text-sm font-medium text-slate-400">시술명</th>
                  <th className="text-right p-3 text-sm font-medium text-slate-400">샘플수</th>
                  <th className="text-right p-3 text-sm font-medium text-slate-400">평균 단가</th>
                  <th className="text-right p-3 text-sm font-medium text-slate-400">최저</th>
                  <th className="text-right p-3 text-sm font-medium text-slate-400">최고</th>
                  <th className="text-right p-3 text-sm font-medium text-slate-400">이벤트율</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {procedures.length > 0 ? procedures.map((proc, i) => (
                  <tr key={i} className="hover:bg-slate-800/50 cursor-pointer"
                      onClick={() => {
                        setSelectedProcedure(proc.procedure_id);
                        loadRankings(proc.procedure_id, selectedRegion);
                        setActiveView('rankings');
                      }}>
                    <td className="p-3">
                      <div className="font-medium">{proc.procedure_name || proc.procedure_id}</div>
                      <div className="text-xs text-slate-500">{proc.unit_name}</div>
                    </td>
                    <td className="p-3 text-right text-slate-400">{proc.sample_count}건</td>
                    <td className="p-3 text-right font-bold text-cyan-400">{formatPrice(proc.avg_price_per_unit)}</td>
                    <td className="p-3 text-right text-emerald-400">{formatPrice(proc.min_price_per_unit)}</td>
                    <td className="p-3 text-right text-red-400">{formatPrice(proc.max_price_per_unit)}</td>
                    <td className="p-3 text-right text-slate-400">{proc.event_rate}%</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">
                      가격 데이터가 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 지역별 뷰 */}
      {activeView === 'regions' && (
        <div className="space-y-4">
          {/* 지역별 가격 */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-left p-3 text-sm font-medium text-slate-400">지역</th>
                  <th className="text-right p-3 text-sm font-medium text-slate-400">샘플수</th>
                  <th className="text-right p-3 text-sm font-medium text-slate-400">병원수</th>
                  <th className="text-right p-3 text-sm font-medium text-slate-400">평균 단가</th>
                  <th className="text-right p-3 text-sm font-medium text-slate-400">최저</th>
                  <th className="text-right p-3 text-sm font-medium text-slate-400">최고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {regions.length > 0 ? regions.map((region, i) => (
                  <tr key={i} className="hover:bg-slate-800/50">
                    <td className="p-3">
                      <div className="font-medium">{region.sigungu}</div>
                      <div className="text-xs text-slate-500">{region.sido}</div>
                    </td>
                    <td className="p-3 text-right text-slate-400">{region.sample_count}건</td>
                    <td className="p-3 text-right text-slate-400">{region.hospital_count}개</td>
                    <td className="p-3 text-right font-bold text-cyan-400">{formatPrice(region.avg_price_per_unit)}</td>
                    <td className="p-3 text-right text-emerald-400">{formatPrice(region.min_price_per_unit)}</td>
                    <td className="p-3 text-right text-red-400">{formatPrice(region.max_price_per_unit)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">
                      가격 데이터가 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 랭킹 뷰 */}
      {activeView === 'rankings' && (
        <div className="space-y-4">
          {/* 필터 */}
          <div className="flex gap-3 items-center">
            <select
              value={selectedProcedure}
              onChange={(e) => {
                setSelectedProcedure(e.target.value);
                loadRankings(e.target.value, selectedRegion);
              }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">시술 선택</option>
              {procedures.map((p, i) => (
                <option key={i} value={p.procedure_id}>{p.procedure_name || p.procedure_id}</option>
              ))}
            </select>
            <select
              value={selectedRegion}
              onChange={(e) => {
                setSelectedRegion(e.target.value);
                if (selectedProcedure) loadRankings(selectedProcedure, e.target.value);
              }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">전체 지역</option>
              <option value="강남구">강남구</option>
              <option value="서초구">서초구</option>
              <option value="송파구">송파구</option>
            </select>
          </div>

          {/* 평균 가격 */}
          {rankings?.regionAvg && (
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <span className="text-slate-400">지역 평균 단가: </span>
              <span className="text-xl font-bold text-cyan-400">{formatPrice(rankings.regionAvg)}</span>
            </div>
          )}

          {/* 랭킹 테이블 */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-center p-3 text-sm font-medium text-slate-400 w-16">순위</th>
                  <th className="text-left p-3 text-sm font-medium text-slate-400">병원</th>
                  <th className="text-right p-3 text-sm font-medium text-slate-400">단가</th>
                  <th className="text-right p-3 text-sm font-medium text-slate-400">평균대비</th>
                  <th className="text-center p-3 text-sm font-medium text-slate-400">등급</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {rankings?.rankings?.length > 0 ? rankings.rankings.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-800/50">
                    <td className="p-3 text-center">
                      <span className={`font-bold ${i < 3 ? 'text-yellow-400' : 'text-slate-400'}`}>
                        {r.rank}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="font-medium">{r.hospital_name}</div>
                      <div className="text-xs text-slate-500">{r.sigungu}</div>
                    </td>
                    <td className="p-3 text-right font-bold text-cyan-400">
                      {formatPrice(r.price_per_unit)}
                    </td>
                    <td className="p-3 text-right">
                      <span className={r.vs_avg_percent < 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {r.vs_avg_percent > 0 ? '+' : ''}{r.vs_avg_percent}%
                      </span>
                    </td>
                    <td className={`p-3 text-center ${getGradeColor(r.price_grade)}`}>
                      {r.price_grade}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">
                      {selectedProcedure ? '해당 시술 데이터가 없습니다' : '시술을 선택해주세요'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// 요약 카드 컴포넌트
function SummaryCard({ title, value, icon, color }) {
  const colorClasses = {
    cyan: 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/30 text-cyan-400',
    emerald: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-400',
    purple: 'from-purple-500/20 to-purple-500/5 border-purple-500/30 text-purple-400',
    orange: 'from-orange-500/20 to-orange-500/5 border-orange-500/30 text-orange-400',
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} rounded-xl p-4 border`}>
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        <span className={`text-2xl font-bold ${colorClasses[color].split(' ').pop()}`}>
          {value.toLocaleString()}
        </span>
      </div>
      <p className="text-sm text-slate-400 mt-2">{title}</p>
    </div>
  );
}
