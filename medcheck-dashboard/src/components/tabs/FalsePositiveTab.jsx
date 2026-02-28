import { useState, useEffect } from 'react';
import { API_BASE } from '../../lib/config';

export default function FalsePositiveTab() {
  const [fpStats, setFpStats] = useState({ summary: {} });
  const [suggestions, setSuggestions] = useState([]);
  const [tricks, setTricks] = useState([]);
  const [tricksStats, setTricksStats] = useState({ summary: {} });
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState('exception'); // 'exception' | 'tricks'

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([
      fetch(`${API_BASE}/v1/false-positives/stats`).then(r => r.json()).then(d => d.success && setFpStats(d.data || {})).catch(() => {}),
      fetch(`${API_BASE}/v1/exception-suggestions?status=pending`).then(r => r.json()).then(d => d.success && setSuggestions(d.data || [])).catch(() => {}),
      fetch(`${API_BASE}/v1/tricks/stats`).then(r => r.json()).then(d => d.success && setTricksStats(d.data || {})).catch(() => {}),
      fetch(`${API_BASE}/v1/tricks?limit=50`).then(r => r.json()).then(d => d.success && setTricks(d.data || [])).catch(() => {}),
    ]);
    setLoading(false);
  };

  const summary = fpStats.summary || {};
  const tSummary = tricksStats.summary || {};

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-1">오탐 관리</h2>
      <p className="text-sm text-text-secondary mb-6">오탐(False Positive) 신고 및 예외 규칙, 꼼수 패턴 관리</p>

      {/* 서브탭 */}
      <div className="border-b border-border mb-5">
        <div className="flex gap-0">
          {[
            { id: 'exception', label: '예외/오탐', badge: summary.pending || 0 },
            { id: 'tricks', label: '꼼수 패턴', badge: tSummary.total || 0 },
          ].map(tab => (
            <button key={tab.id} onClick={() => setSubTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                subTab === tab.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
              }`}>
              {tab.label}
              {tab.badge > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[11px] ${subTab === tab.id ? 'bg-accent/10 text-accent' : 'bg-surface text-text-muted'}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-text-muted">로딩 중...</div>
      ) : subTab === 'exception' ? (
        <div className="space-y-5">
          {/* 통계 */}
          <div className="grid grid-cols-4 gap-4">
            <MiniCard label="전체" value={summary.total || 0} icon="📊" />
            <MiniCard label="대기중" value={summary.pending || 0} icon="🟡" />
            <MiniCard label="승인됨" value={summary.approved || 0} icon="✅" />
            <MiniCard label="반려됨" value={summary.rejected || 0} icon="❌" />
          </div>

          {/* 예외 제안 */}
          <div className="bg-card rounded-xl border border-border p-5">
            <h4 className="text-sm font-semibold text-text-primary mb-3">예외 제안 목록</h4>
            {suggestions.length > 0 ? (
              <div className="space-y-2.5">
                {suggestions.map((s, i) => (
                  <div key={i} className="p-3.5 bg-surface rounded-lg border border-border">
                    <p className="text-sm font-medium text-text-primary">{s.pattern || s.text}</p>
                    <p className="text-xs text-text-secondary mt-1">{s.reason}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-text-muted py-6 text-sm">대기 중인 제안이 없습니다</p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* 꼼수 통계 */}
          <div className="grid grid-cols-4 gap-4">
            <MiniCard label="전체 꼼수" value={tSummary.total || 0} icon="🎭" />
            <MiniCard label="활성" value={tSummary.active || 0} icon="✅" />
            <MiniCard label="비활성" value={tSummary.inactive || 0} icon="⏸️" />
            <MiniCard label="신규" value={tSummary.new || 0} icon="🆕" />
          </div>

          {/* 꼼수 목록 */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <h4 className="text-sm font-semibold text-text-primary">꼼수 패턴 목록</h4>
            </div>
            {tricks.length > 0 ? (
              <div className="divide-y divide-border">
                {tricks.map((t, i) => (
                  <div key={i} className="p-4 hover:bg-accent/[0.02] transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-text-primary">{t.name || t.pattern_name}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${t.is_active ? 'bg-grade-s/10 text-grade-s' : 'bg-surface text-text-muted'}`}>
                        {t.is_active ? '활성' : '비활성'}
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary">{t.description}</p>
                    {t.example && <p className="text-[11px] text-text-muted mt-1">예시: "{t.example}"</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-text-muted text-sm">등록된 꼼수 패턴이 없습니다</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniCard({ label, value, icon }) {
  return (
    <div className="bg-card rounded-xl border border-border p-3.5 flex items-center gap-3">
      <span className="text-lg">{icon}</span>
      <div>
        <p className="text-[11px] text-text-muted">{label}</p>
        <p className="text-lg font-bold text-text-primary">{value}</p>
      </div>
    </div>
  );
}
