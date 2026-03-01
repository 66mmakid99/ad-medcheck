import { useState, useEffect } from 'react';
import { API_BASE } from '../../lib/config';

export default function MappingTab() {
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState('');
  const [toast, setToast] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/mapping-candidates?status=pending_review`);
      const data = await res.json();
      if (data.success) setCandidates(data.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const approve = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/v1/mapping-candidates/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if ((await res.json()).success) {
        showToast('매핑 승인 완료');
        setSelected(null);
        load();
      }
    } catch (e) { console.error(e); }
  };

  const reject = async (id) => {
    try {
      await fetch(`${API_BASE}/v1/mapping-candidates/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason || '적합하지 않음' }),
      });
      showToast('매핑 거부 완료');
      setRejectReason('');
      setSelected(null);
      load();
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
      <h2 className="text-xl font-semibold text-text-primary mb-1">매핑 승인</h2>
      <p className="text-sm text-text-secondary mb-6">자동 매핑 후보 검토 및 승인/거부</p>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg z-50 animate-fade-in">
          {toast}
        </div>
      )}

      <div className="grid grid-cols-5 gap-4">
        {/* List (3/5) */}
        <div className="col-span-3 bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3">검토 대기 ({candidates.length})</h3>
          <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
            {candidates.map(c => (
              <button
                key={c.id}
                onClick={() => { setSelected(c); setRejectReason(''); }}
                className={`w-full text-left px-3 py-3 rounded-lg transition-colors ${
                  selected?.id === c.id ? 'bg-accent-muted' : 'hover:bg-navy-800/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-text-primary">{c.raw_name}</span>
                  <span className="text-xs text-text-secondary">{c.confidence ? `${(c.confidence * 100).toFixed(0)}%` : ''}</span>
                </div>
                <div className="text-xs text-text-secondary">
                  → {c.mapped_procedure || c.procedure_id}
                  {c.target_area && <span> ({c.target_area})</span>}
                </div>
              </button>
            ))}
            {candidates.length === 0 && (
              <p className="text-sm text-text-secondary text-center py-8">검토 대기 중인 매핑이 없습니다.</p>
            )}
          </div>
        </div>

        {/* Detail (2/5) */}
        <div className="col-span-2">
          {selected ? (
            <div className="bg-card rounded-xl border border-border p-5 space-y-4 sticky top-4">
              <h3 className="text-sm font-semibold text-text-primary">매핑 검토</h3>

              <div className="space-y-3">
                <div>
                  <p className="text-xs text-text-secondary mb-1">원본 이름</p>
                  <p className="text-sm text-text-primary font-medium">{selected.raw_name}</p>
                </div>
                <div>
                  <p className="text-xs text-text-secondary mb-1">매핑 대상</p>
                  <p className="text-sm text-accent font-medium">{selected.mapped_procedure || selected.procedure_id}</p>
                </div>
                {selected.target_area && (
                  <div>
                    <p className="text-xs text-text-secondary mb-1">부위</p>
                    <p className="text-sm text-text-primary">{selected.target_area}</p>
                  </div>
                )}
                {selected.hospital_name && (
                  <div>
                    <p className="text-xs text-text-secondary mb-1">병원</p>
                    <p className="text-sm text-text-primary">{selected.hospital_name}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => approve(selected.id)}
                  className="flex-1 py-2.5 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors"
                >
                  승인
                </button>
                <button
                  onClick={() => reject(selected.id)}
                  className="flex-1 py-2.5 bg-red-500/20 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-colors"
                >
                  거부
                </button>
              </div>

              <div>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="거부 사유 (선택)"
                  className="w-full bg-navy-800/30 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent resize-none h-20"
                />
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border p-8 text-center">
              <p className="text-3xl mb-3">🔄</p>
              <p className="text-sm text-text-secondary">매핑 후보를 선택하면 상세 정보를 확인할 수 있습니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
