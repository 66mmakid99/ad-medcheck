import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { supabaseQuery } from '../../lib/supabase';
import GradeBadge from '../ui/GradeBadge';

const GRADE_COLORS = {
  S: '#10b981', A: '#3b82f6', B: '#8b5cf6',
  C: '#f59e0b', D: '#ef4444', F: '#991b1b',
};

export default function ReportsTab() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, byGrade: {}, byMode: {}, topViolations: [] });

  useEffect(() => { loadReport(); }, []);

  const loadReport = async () => {
    setLoading(true);
    try {
      // 전체 결과 조회 (최근 500건으로 통계)
      const { data } = await supabaseQuery('check_violation_results', {
        select: 'grade,violation_count,critical_count,major_count,minor_count,analysis_mode,hospital_name',
        order: 'analyzed_at.desc',
        limit: 500,
      });

      if (data?.length) {
        const byGrade = {};
        const byMode = {};
        const hospitalMap = {};
        let totalViolations = 0;
        let totalCritical = 0;

        data.forEach(r => {
          byGrade[r.grade] = (byGrade[r.grade] || 0) + 1;
          byMode[r.analysis_mode || 'unknown'] = (byMode[r.analysis_mode || 'unknown'] || 0) + 1;
          totalViolations += r.violation_count || 0;
          totalCritical += r.critical_count || 0;

          if (r.hospital_name) {
            if (!hospitalMap[r.hospital_name]) hospitalMap[r.hospital_name] = { name: r.hospital_name, count: 0, violations: 0 };
            hospitalMap[r.hospital_name].count++;
            hospitalMap[r.hospital_name].violations += r.violation_count || 0;
          }
        });

        const topHospitals = Object.values(hospitalMap)
          .sort((a, b) => b.violations - a.violations)
          .slice(0, 10);

        setStats({
          total: data.length,
          byGrade,
          byMode,
          totalViolations,
          totalCritical,
          avgViolations: data.length > 0 ? (totalViolations / data.length).toFixed(1) : 0,
          topHospitals,
        });
      }
    } catch (e) {
      console.error('Report load error:', e);
    }
    setLoading(false);
  };

  // 차트 데이터
  const gradeChartData = ['S','A','B','C','D','F'].map(g => ({
    grade: g, count: stats.byGrade[g] || 0,
  }));

  const pieData = gradeChartData.filter(d => d.count > 0);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="bg-card rounded-xl h-24 border border-border" />)}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-card rounded-xl h-64 border border-border" />
          <div className="bg-card rounded-xl h-64 border border-border" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-1">리포트</h2>
      <p className="text-sm text-text-secondary mb-6">병원별 종합 리포트 및 트렌드 분석 · 최근 {stats.total}건 기준</p>

      {/* 통계 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="전체 분석" value={stats.total} icon="📊" />
        <StatCard label="총 위반" value={stats.totalViolations || 0} icon="⚠️" />
        <StatCard label="Critical" value={stats.totalCritical || 0} icon="🔴" danger />
        <StatCard label="평균 위반" value={`${stats.avgViolations || 0}건`} icon="📈" />
      </div>

      {/* 차트 영역 */}
      <div className="grid grid-cols-2 gap-5 mb-6">
        {/* 등급 분포 바차트 */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">등급 분포</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={gradeChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="grade" tick={{ fontSize: 13, fill: 'var(--color-text-secondary)' }} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '13px' }} />
              <Bar dataKey="count" name="건수" radius={[4, 4, 0, 0]}>
                {gradeChartData.map((entry) => (
                  <Cell key={entry.grade} fill={GRADE_COLORS[entry.grade]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 등급 파이차트 */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">등급 비율</h3>
          <div className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="count" nameKey="grade" cx="50%" cy="50%"
                  innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {pieData.map(entry => (
                    <Cell key={entry.grade} fill={GRADE_COLORS[entry.grade]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '13px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-3 mt-2">
            {pieData.map(d => (
              <div key={d.grade} className="flex items-center gap-1.5 text-xs">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: GRADE_COLORS[d.grade] }} />
                <span className="text-text-secondary">{d.grade} ({d.count})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 위반 많은 병원 TOP 10 */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">위반 상위 병원 TOP 10</h3>
        </div>
        {stats.topHospitals?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr>
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-text-secondary uppercase">순위</th>
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-text-secondary uppercase">병원명</th>
                  <th className="text-center px-5 py-2.5 text-xs font-medium text-text-secondary uppercase">분석 횟수</th>
                  <th className="text-center px-5 py-2.5 text-xs font-medium text-text-secondary uppercase">총 위반</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stats.topHospitals.map((h, i) => (
                  <tr key={h.name} className="hover:bg-accent/[0.03]">
                    <td className="px-5 py-3 text-text-muted font-medium">{i + 1}</td>
                    <td className="px-5 py-3 font-medium text-text-primary">{h.name}</td>
                    <td className="px-5 py-3 text-center text-text-secondary">{h.count}회</td>
                    <td className="px-5 py-3 text-center font-bold text-grade-d">{h.violations}건</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center text-text-muted">데이터가 없습니다</div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, danger }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-text-muted">{label}</span>
        <span className="text-base">{icon}</span>
      </div>
      <p className={`text-2xl font-bold ${danger ? 'text-grade-d' : 'text-text-primary'}`}>{value}</p>
    </div>
  );
}
