import { useState, useEffect } from 'react';
import { API_BASE } from '../../lib/config';

export default function CrawlerTab() {
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState(null);

  const loadStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/dashboard/summary`);
      const d = await res.json();
      if (d.success) {
        setStatus({
          online: d.data.crawler?.online,
          mode: d.data.crawler?.mode || 'cloud',
          lastHeartbeat: d.data.crawler?.lastHeartbeat,
          recentBatch: d.data.recentBatch,
          queue: d.data.queue,
        });
      }
    } catch (e) { /* ignore */ }
  };

  const loadLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/crawl-batches?limit=20`);
      const d = await res.json();
      if (d.success) setLogs(d.data || []);
    } catch (e) { /* ignore */ }
  };

  const loadAll = async () => {
    await Promise.all([loadStatus(), loadLogs()]);
  };

  useEffect(() => {
    (async () => { setLoading(true); await loadAll(); setLoading(false); })();
    const interval = setInterval(loadAll, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleTrigger = async () => {
    setTriggering(true);
    setTriggerResult(null);
    try {
      const res = await fetch(`${API_BASE}/v1/dashboard/trigger-crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const d = await res.json();
      if (d.success) {
        setTriggerResult({ type: 'success', msg: '클라우드 크롤링이 시작되었습니다' });
        setTimeout(loadAll, 5000);
      } else {
        setTriggerResult({ type: 'error', msg: d.error || '트리거 실패' });
      }
    } catch (e) {
      setTriggerResult({ type: 'error', msg: '네트워크 오류' });
    }
    setTriggering(false);
  };

  const formatTime = (ts) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const formatDuration = (sec) => {
    if (!sec && sec !== 0) return '-';
    if (sec < 60) return `${sec}초`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}분 ${s}초` : `${m}분`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-text-muted">크롤러 상태 로딩 중...</p>
      </div>
    );
  }

  const batch = status?.recentBatch;
  const isOnline = status?.online;
  const pending = status?.queue?.pending || 0;

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-1">크롤러</h2>
      <p className="text-sm text-text-secondary mb-6">자동 크롤링 파이프라인 상태 및 배치 이력</p>

      {/* 알림 */}
      {triggerResult && (
        <div className={`px-4 py-3 rounded-lg text-sm mb-5 flex items-center gap-2 ${
          triggerResult.type === 'success' ? 'bg-grade-s/10 text-grade-s border border-grade-s/20' : 'bg-grade-d/10 text-grade-d border border-grade-d/20'
        }`}>
          <span>{triggerResult.type === 'success' ? '✅' : '❌'}</span>
          {triggerResult.msg}
          <button onClick={() => setTriggerResult(null)} className="ml-auto opacity-50 hover:opacity-100">&times;</button>
        </div>
      )}

      {/* 상태 배너 */}
      <div className={`rounded-xl border p-5 mb-5 ${isOnline ? 'bg-grade-s/5 border-grade-s/20' : 'bg-surface border-border'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${isOnline ? 'bg-grade-s/15' : 'bg-border'}`}>
              {isOnline ? '🟢' : '⏰'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`text-base font-bold ${isOnline ? 'text-grade-s' : 'text-text-secondary'}`}>
                  {isOnline ? 'Crawler Online' : 'Cron 대기 모드'}
                </h3>
                {isOnline && <div className="w-2 h-2 bg-grade-s rounded-full animate-pulse" />}
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                Cloudflare Workers Cron · 매일 09:00 / 18:00 KST · Gemini AI 분석
              </p>
            </div>
          </div>
          <button
            onClick={handleTrigger}
            disabled={triggering}
            className="px-5 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium shadow-sm disabled:opacity-40 transition-colors"
          >
            {triggering ? '실행 중...' : '🚀 수동 크롤링'}
          </button>
        </div>
      </div>

      {/* 대기 큐 */}
      {pending > 0 && (
        <div className="px-4 py-2.5 rounded-lg text-sm bg-grade-c/10 text-grade-c border border-grade-c/20 mb-5 flex items-center gap-2">
          ⏳ 대기 중인 트리거 <span className="font-bold">{pending}건</span>
        </div>
      )}

      {/* 통계 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <MiniCard icon="🔄" label="최근 배치" value={batch?.status === 'completed' ? '완료' : batch?.status || '없음'}
          sub={formatTime(batch?.started_at)} />
        <MiniCard icon="🏥" label="분석 병원" value={`${batch?.hospitals_analyzed || 0}개`}
          sub={`전체 ${batch?.hospitals_total || 0}개`} />
        <MiniCard icon="⚠️" label="위반 탐지" value={`${batch?.violations_found || 0}건`}
          sub="최근 배치" danger={batch?.violations_found > 0} />
        <MiniCard icon="⏱️" label="소요 시간" value={formatDuration(batch?.duration_seconds)}
          sub="최근 배치" />
      </div>

      {/* 실행 이력 */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">실행 이력</h3>
          <button onClick={loadAll} className="text-xs text-accent hover:text-accent-light font-medium">🔄 새로고침</button>
        </div>
        {logs.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-3xl mb-2">📭</div>
            <p className="text-sm text-text-muted">실행 이력이 없습니다</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr>
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-text-secondary uppercase">시간</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">유형</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">병원수</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">위반</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">소요시간</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-accent/[0.03] transition-colors">
                    <td className="px-5 py-3 text-text-secondary text-xs">{formatTime(log.started_at)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[11px] px-1.5 py-0.5 rounded ${log.type === 'scheduled' ? 'bg-grade-b/10 text-grade-b' : 'bg-grade-c/10 text-grade-c'}`}>
                        {log.type === 'scheduled' ? '🕐 예약' : '👆 수동'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-medium text-text-primary">
                      {log.hospitals_analyzed || 0}
                      {log.hospitals_total > 0 && log.hospitals_total !== log.hospitals_analyzed && (
                        <span className="text-text-muted text-xs">/{log.hospitals_total}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-medium ${(log.violations_found || 0) > 0 ? 'text-grade-d' : 'text-text-muted'}`}>
                        {log.violations_found || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-text-secondary text-xs">{formatDuration(log.duration_seconds)}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={log.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniCard({ icon, label, value, sub, danger }) {
  return (
    <div className="bg-card rounded-xl border border-border p-3.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-muted">{label}</span>
        <span className="text-base">{icon}</span>
      </div>
      <p className={`text-lg font-bold ${danger ? 'text-grade-d' : 'text-text-primary'}`}>{value}</p>
      <p className="text-[11px] text-text-muted mt-0.5">{sub}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    running:   { bg: 'bg-accent/10', text: 'text-accent', label: '⏳ 실행 중' },
    completed: { bg: 'bg-grade-s/10', text: 'text-grade-s', label: '✅ 완료' },
    failed:    { bg: 'bg-grade-d/10', text: 'text-grade-d', label: '❌ 실패' },
  };
  const c = map[status] || { bg: 'bg-surface', text: 'text-text-muted', label: status };
  return <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${c.bg} ${c.text}`}>{c.label}</span>;
}
