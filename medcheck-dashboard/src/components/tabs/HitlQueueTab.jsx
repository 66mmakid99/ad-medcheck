import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../../lib/config';
import SeverityBadge from '../ui/SeverityBadge';

const VERDICT_OPTIONS = [
  { value: 'violation', label: '위반', icon: '🔴', color: 'bg-grade-d text-white hover:bg-grade-d/90' },
  { value: 'not_violation', label: '비위반', icon: '🟢', color: 'bg-emerald-600 text-white hover:bg-emerald-700' },
  { value: 'borderline', label: '경계', icon: '🟡', color: 'bg-yellow-500 text-white hover:bg-yellow-600' },
];

export default function HitlQueueTab() {
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [threshold, setThreshold] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [verdict, setVerdict] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/learning/hitl-queue?limit=50`);
      const data = await res.json();
      setItems(data.items || []);
      setCount(data.count || 0);
      setThreshold(data.threshold || 0);
    } catch (e) {
      console.error('HITL queue load error:', e);
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleSubmit = async () => {
    if (!selected || !verdict) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/v1/learning/hitl-queue/${selected.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict, note }),
      });
      if (!res.ok) throw new Error('판정 실패');
      setItems(prev => prev.filter(i => i.id !== selected.id));
      setCount(prev => Math.max(0, prev - 1));
      setSelected(null);
      setVerdict('');
      setNote('');
      showToast('판정이 성공적으로 처리되었습니다');
    } catch (e) {
      console.error('Resolve error:', e);
      showToast('판정 처리 중 오류가 발생했습니다');
    }
    setSubmitting(false);
  };

  const formatTime = (ts) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const avgConfidence = items.length
    ? Math.round(items.reduce((a, i) => a + (i.composite_confidence || 0), 0) / items.length * 100)
    : 0;

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-1">👁️ HITL 검토 큐</h2>
      <p className="text-sm text-text-secondary mb-6">
        검토가 필요한 저신뢰도 탐지 결과를 판정합니다
      </p>

      {/* 통계 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <MiniCard label="대기 건수" value={count} icon="📋" />
        <MiniCard label="임계값" value={`${Math.round(threshold * 100)}%`} icon="📏" />
        <MiniCard label="평균 신뢰도" value={`${avgConfidence}%`} icon="📊" />
        <div className="bg-card rounded-xl border border-border p-3.5 flex items-center justify-center">
          <button
            onClick={loadQueue}
            disabled={loading}
            className="px-4 py-2 bg-accent/10 text-accent rounded-lg text-sm font-medium hover:bg-accent/20 transition-colors disabled:opacity-50"
          >
            🔄 새로고침
          </button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-5">
        {/* 테이블 */}
        <div className="col-span-3 bg-card rounded-xl border border-border overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-text-muted">로딩 중...</div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm text-text-muted">검토 대기 항목이 없습니다</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">병원명</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">패턴 ID</th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">신뢰도</th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">심각도</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">생성일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => { setSelected(item); setVerdict(''); setNote(''); }}
                      className={`cursor-pointer transition-colors ${selected?.id === item.id ? 'bg-accent/[0.06]' : 'hover:bg-accent/[0.03]'}`}
                    >
                      <td className="px-4 py-3 font-medium text-text-primary truncate max-w-[160px]">{item.hospital_name || '-'}</td>
                      <td className="px-4 py-3 text-text-secondary text-xs font-mono">{item.pattern_id || '-'}</td>
                      <td className="px-4 py-3">
                        <ConfidenceBar value={item.composite_confidence} />
                      </td>
                      <td className="px-4 py-3 text-center"><SeverityBadge severity={item.severity} /></td>
                      <td className="px-4 py-3 text-text-secondary text-xs whitespace-nowrap">{formatTime(item.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 상세 + 판정 패널 */}
        <div className="col-span-2 bg-card rounded-xl border border-border p-5 h-fit">
          {selected ? (
            <div>
              <h4 className="text-sm font-semibold text-text-primary mb-4">상세 정보 & 판정</h4>

              {/* 매칭 텍스트 */}
              {selected.matched_text && (
                <div className="mb-3">
                  <p className="text-[11px] text-text-muted mb-1">매칭 텍스트</p>
                  <div className="bg-grade-d/5 rounded-lg p-3 border border-grade-d/10">
                    <p className="text-sm text-grade-d font-medium">"{selected.matched_text}"</p>
                  </div>
                </div>
              )}

              {/* 컨텍스트 */}
              {selected.context_text && (
                <div className="mb-3">
                  <p className="text-[11px] text-text-muted mb-1">컨텍스트</p>
                  <div className="bg-surface rounded-lg p-3 border border-border">
                    <p className="text-xs text-text-secondary leading-relaxed">{selected.context_text}</p>
                  </div>
                </div>
              )}

              {/* 메타 정보 */}
              <div className="space-y-1.5 mb-4">
                <MetaRow label="판정" value={selected.determination || '-'} />
                <MetaRow label="탐지 소스" value={
                  selected.detection_source === 'rule_only' ? 'Rule' :
                  selected.detection_source === 'rule_and_ai' ? 'Rule+AI' :
                  selected.detection_source || '-'
                } />
                <div className="flex justify-between items-center text-xs">
                  <span className="text-text-muted">심각도</span>
                  <SeverityBadge severity={selected.severity} />
                </div>
              </div>

              {/* 신뢰도 바 (큰 버전) */}
              <div className="mb-5">
                <p className="text-[11px] text-text-muted mb-1.5">종합 신뢰도</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-surface rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        (selected.composite_confidence || 0) < 0.3 ? 'bg-grade-d' :
                        (selected.composite_confidence || 0) < 0.5 ? 'bg-yellow-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.round((selected.composite_confidence || 0) * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-text-primary w-12 text-right">
                    {Math.round((selected.composite_confidence || 0) * 100)}%
                  </span>
                </div>
              </div>

              {/* 구분선 */}
              <div className="border-t border-border mb-4" />

              {/* Verdict 버튼 */}
              <p className="text-[11px] text-text-muted mb-2">판정 선택</p>
              <div className="flex gap-2 mb-4">
                {VERDICT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setVerdict(opt.value)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      verdict === opt.value
                        ? opt.color + ' ring-2 ring-offset-1 ring-offset-card'
                        : 'bg-surface border border-border text-text-secondary hover:bg-border'
                    }`}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>

              {/* 메모 */}
              <div className="mb-4">
                <p className="text-[11px] text-text-muted mb-1.5">메모 (선택)</p>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="판정 사유를 입력하세요..."
                  rows={3}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 resize-none"
                />
              </div>

              {/* 제출 버튼 */}
              <button
                onClick={handleSubmit}
                disabled={!verdict || submitting}
                className="w-full px-4 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? '처리 중...' : '판정 제출'}
              </button>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-3xl mb-2">👈</div>
              <p className="text-sm text-text-muted">왼쪽 테이블에서<br />항목을 선택하세요</p>
            </div>
          )}
        </div>
      </div>

      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-navy-900 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50 animate-fade-in">
          {toast}
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

function MetaRow({ label, value }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-secondary font-medium">{value}</span>
    </div>
  );
}

function ConfidenceBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div className="flex items-center gap-1.5 justify-center">
      <div className="w-16 bg-surface rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full ${
            pct < 30 ? 'bg-grade-d' : pct < 50 ? 'bg-yellow-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-text-secondary font-medium w-8 text-right">{pct}%</span>
    </div>
  );
}
