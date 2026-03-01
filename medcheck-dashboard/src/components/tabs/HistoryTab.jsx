import { useState, useEffect } from 'react';
import { API_BASE } from '../../lib/config';

const LEARNING_TYPES = {
  exception_generated: { label: '예외 규칙', color: 'bg-blue-500' },
  confidence_adjusted: { label: '신뢰도 조정', color: 'bg-emerald-500' },
  pattern_suggested: { label: '새 패턴', color: 'bg-amber-500' },
  mapping_learned: { label: '매핑 규칙', color: 'bg-purple-500' },
  severity_adjusted: { label: '심각도 조정', color: 'bg-red-500' },
  context_modifier_updated: { label: '맥락 보정', color: 'bg-gray-400' },
};

function MiniCard({ label, value, color = 'accent' }) {
  const colors = {
    accent: 'text-accent',
    green: 'text-emerald-400',
    blue: 'text-blue-400',
    slate: 'text-text-secondary',
  };
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <p className="text-xs text-text-secondary mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colors[color] || colors.accent}`}>{value}</p>
    </div>
  );
}

export default function HistoryTab() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, approved, auto_applied

  useEffect(() => {
    const load = async () => {
      try {
        const statusParam = filter === 'all' ? '' : `&status=${filter}`;
        const res = await fetch(`${API_BASE}/v1/learning/candidates?limit=200${statusParam}`);
        const data = await res.json();
        if (data.success) setHistory(data.data || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [filter]);

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisWeek = history.filter(h => new Date(h.applied_at || h.created_at) >= weekAgo).length;
  const thisMonth = history.filter(h => {
    const d = new Date(h.applied_at || h.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const autoApplied = history.filter(h => h.status === 'auto_applied').length;
  const manual = history.filter(h => h.status === 'approved').length;

  // Group by date
  const grouped = history.reduce((acc, item) => {
    const date = (item.applied_at || item.created_at)?.split('T')[0] || 'unknown';
    if (!acc[date]) acc[date] = [];
    acc[date].push(item);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-1">개선 이력</h2>
      <p className="text-sm text-text-secondary mb-6">자동/수동 학습 적용 타임라인</p>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <MiniCard label="이번 주" value={thisWeek} color="accent" />
        <MiniCard label="이번 달" value={thisMonth} color="blue" />
        <MiniCard label="자동 적용" value={autoApplied} color="green" />
        <MiniCard label="수동 적용" value={manual} color="slate" />
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'all', label: '전체' },
          { key: 'approved', label: '수동 승인' },
          { key: 'auto_applied', label: '자동 적용' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => { setLoading(true); setFilter(f.key); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f.key
                ? 'bg-accent text-white'
                : 'bg-card border border-border text-text-secondary hover:text-text-primary'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sortedDates.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <p className="text-3xl mb-3">📜</p>
          <p className="text-sm text-text-secondary">적용된 학습 이력이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDates.map(date => (
            <div key={date}>
              <div className="text-xs font-semibold text-text-secondary mb-3 sticky top-0 bg-background py-1 z-10">
                {new Date(date + 'T00:00:00').toLocaleDateString('ko-KR', {
                  year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
                })}
                <span className="ml-2 text-text-secondary/50">({grouped[date].length}건)</span>
              </div>

              <div className="space-y-2 relative">
                {/* Timeline line */}
                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

                {grouped[date].map(item => {
                  const typeInfo = LEARNING_TYPES[item.learning_type] || { label: item.learning_type, color: 'bg-gray-400' };
                  return (
                    <div key={item.id} className="flex gap-3 relative">
                      {/* Dot */}
                      <div className={`w-[9px] h-[9px] rounded-full ${typeInfo.color} mt-2 flex-shrink-0 z-10 ring-2 ring-background`} />

                      {/* Card */}
                      <div className="flex-1 bg-card rounded-xl border border-border p-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full text-white ${typeInfo.color}`}>
                              {typeInfo.label}
                            </span>
                            <span className="text-xs text-text-secondary">{item.target_type}</span>
                          </div>
                          <span className="text-[10px] text-text-secondary">
                            {new Date(item.applied_at || item.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-text-primary">{item.target_id}</span>
                          {item.status === 'auto_applied' && (
                            <span className="text-[10px] text-emerald-400">자동</span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-xs text-text-secondary mt-1 line-clamp-2">{item.description}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
