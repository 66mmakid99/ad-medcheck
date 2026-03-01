import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { API_BASE } from '../../lib/config';
import GradeBadge from '../ui/GradeBadge';

export default function OverviewTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [healthData, setHealthData] = useState(null);
  const [crawlerStatus, setCrawlerStatus] = useState(null);
  const [analysisStats, setAnalysisStats] = useState(null);
  const [recentResults, setRecentResults] = useState([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const summaryRes = await fetch(`${API_BASE}/v1/dashboard/summary`);
      const summaryData = await summaryRes.json();
      if (summaryData.success) {
        const d = summaryData.data;
        setCrawlerStatus({
          online: d.crawler?.online,
          mode: d.crawler?.mode || 'cloud',
          lastHeartbeat: d.crawler?.lastHeartbeat,
          lastCrawl: d.recentBatch?.started_at,
        });
        setAnalysisStats({
          total: d.today?.analyzed || 0,
          violations: d.today?.violations || 0,
          avgScore: d.today?.avgScore || 0,
          clean: (d.today?.analyzed || 0) - (d.today?.violations || 0),
          byDate: d.byDate || [],
          gradeDistribution: d.gradeDistribution || [],
        });
        setRecentResults((d.recentResults || []).map(r => ({
          name: r.hospital_name,
          grade: r.grade,
          violations: r.violation_count,
          analyzedAt: r.analyzed_at,
          url: r.url_analyzed,
          cleanScore: r.clean_score,
        })));
      }
      fetch(`${API_BASE}/v1/health`).then(r => r.json()).then(d => setHealthData(d)).catch(() => {});
    } catch (e) {
      console.error('Dashboard load error:', e);
      setError('데이터를 불러오지 못했습니다.');
    }
    setLoading(false);
  };

  const formatTime = (ts) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  // 오늘/어제 비교
  const byDate = analysisStats?.byDate || [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const todayViolations = byDate.find(d => d.date === todayStr)?.violations || 0;
  const delta = todayViolations - (byDate.find(d => d.date === yesterdayStr)?.violations || 0);

  const isOnline = crawlerStatus?.online;

  // 차트 데이터
  const chartData = byDate.map(d => ({
    date: d.date?.slice(5),
    total: d.count || 0,
    violations: d.violations || 0,
  })).reverse();

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="bg-card rounded-xl h-28 border border-border" />)}
        </div>
        <div className="bg-card rounded-xl h-64 border border-border" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card rounded-xl border border-red-500/20 p-10 text-center">
        <p className="text-3xl mb-3">⚠️</p>
        <p className="text-sm text-red-400 mb-3">{error}</p>
        <button onClick={loadData} className="px-4 py-2 bg-accent text-white rounded-lg text-sm">다시 시도</button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-1">대시보드</h2>
      <p className="text-sm text-text-secondary mb-6">MedCheck 시스템 현황 한눈에 보기</p>

      {/* 1. 핵심 지표 4개 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          icon="🛡️" iconBg="bg-grade-d/10"
          label="오늘 위반 탐지"
          value={`${todayViolations}건`}
          sub={delta !== 0 ? `전일 대비 ${delta > 0 ? '+' : ''}${delta}건` : '전일 동일'}
          subColor={delta > 0 ? 'text-grade-d' : delta < 0 ? 'text-grade-s' : 'text-text-muted'}
        />
        <StatCard
          icon="📊" iconBg="bg-accent/10"
          label="누적 분석"
          value={`${analysisStats?.total || 0}건`}
          sub={`위반 ${analysisStats?.violations || 0}건 · 양호 ${analysisStats?.clean || 0}건`}
        />
        <StatCard
          icon="🕷️" iconBg="bg-grade-s/10"
          label="크롤러 상태"
          value={isOnline ? '온라인' : crawlerStatus?.mode === 'cloud' ? 'Cron 대기' : '오프라인'}
          valueColor={isOnline ? 'text-grade-s' : 'text-text-secondary'}
          sub={`마지막: ${formatTime(crawlerStatus?.lastCrawl)}`}
        />
        <StatCard
          icon="🚀" iconBg="bg-grade-b/10"
          label="엔진 상태"
          value={healthData?.status === 'ok' || healthData?.status === 'healthy' ? '정상' : '확인 필요'}
          valueColor={healthData ? 'text-grade-s' : 'text-grade-d'}
          sub="Cloudflare Workers"
        />
      </div>

      {/* 2. 최근 위반 탐지 목록 */}
      <div className="bg-card rounded-xl border border-border mb-6 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">최근 위반 탐지</h3>
          <button onClick={loadData} className="text-xs text-accent hover:text-accent-light font-medium">
            🔄 새로고침
          </button>
        </div>
        {recentResults.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-3xl mb-2">📭</div>
            <p className="text-sm text-text-muted">위반 탐지 기록이 없습니다</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr>
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-text-secondary uppercase tracking-wider">시간</th>
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-text-secondary uppercase tracking-wider">병원</th>
                  <th className="text-center px-5 py-2.5 text-xs font-medium text-text-secondary uppercase tracking-wider">등급</th>
                  <th className="text-center px-5 py-2.5 text-xs font-medium text-text-secondary uppercase tracking-wider">청정지수</th>
                  <th className="text-center px-5 py-2.5 text-xs font-medium text-text-secondary uppercase tracking-wider">위반 수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentResults.map((r, i) => (
                  <tr key={i} className="hover:bg-accent/[0.03] transition-colors">
                    <td className="px-5 py-3 text-text-secondary">{formatTime(r.analyzedAt)}</td>
                    <td className="px-5 py-3 font-medium text-text-primary">{r.name}</td>
                    <td className="px-5 py-3 text-center"><GradeBadge grade={r.grade} /></td>
                    <td className="px-5 py-3 text-center font-medium">{r.cleanScore || '-'}점</td>
                    <td className="px-5 py-3 text-center text-grade-d font-medium">{r.violations || 0}건</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. 하단 2-column */}
      <div className="grid grid-cols-2 gap-4">
        {/* 주간 추이 차트 */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">주간 탐지 추이</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '13px' }}
                />
                <Line type="monotone" dataKey="total" stroke="var(--color-accent)" strokeWidth={2} dot={{ r: 3 }} name="전체 분석" />
                <Line type="monotone" dataKey="violations" stroke="var(--color-grade-d)" strokeWidth={2} dot={{ r: 3 }} name="위반 탐지" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex flex-col items-center justify-center">
              <div className="text-3xl mb-2">📈</div>
              <p className="text-sm text-text-muted">데이터 수집 중</p>
            </div>
          )}
        </div>

        {/* 시스템 상태 */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">시스템 상태</h3>
          <div className="space-y-2.5">
            <StatusRow icon="🕷️" label="클라우드 크롤러" desc="Cron: 매일 09:00/18:00 KST"
              online={crawlerStatus?.mode === 'cloud' || isOnline} />
            <StatusRow icon="🌐" label="API 서버" desc="MedCheck Engine on Workers"
              online={!!healthData} />
            <StatusRow icon="📋" label="분석 패턴" desc="156개 패턴 · 32개 카테고리" online />
            <StatusRow icon="🤖" label="Gemini AI" desc="2.0 Flash 분석 엔진"
              online={!!healthData} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Internal sub-components ---- */

function StatCard({ icon, iconBg, label, value, valueColor, sub, subColor }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-3.5 hover:shadow-sm transition-shadow">
      <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center text-xl shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide">{label}</p>
        <p className={`text-lg font-bold mt-0.5 ${valueColor || 'text-text-primary'}`}>{value}</p>
        {sub && <p className={`text-[11px] mt-0.5 ${subColor || 'text-text-muted'}`}>{sub}</p>}
      </div>
    </div>
  );
}

function StatusRow({ icon, label, desc, online }) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-surface border border-border">
      <span className="text-base">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="text-[11px] text-text-muted">{desc}</p>
      </div>
      <div className={`w-2 h-2 rounded-full ${online ? 'bg-grade-s' : 'bg-grade-d'}`} />
    </div>
  );
}
