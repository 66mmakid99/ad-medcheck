import { useState, useEffect } from 'react';
import { API_BASE } from '../../lib/config';

function formatPrice(price) {
  if (!price) return '-';
  if (price >= 10000) return (price / 10000).toFixed(0) + '만원';
  return price.toLocaleString() + '원';
}

export default function PriceAlertsTab() {
  const [alerts, setAlerts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/price-alerts?isRead=false`);
      const data = await res.json();
      if (data.success) setAlerts(data.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const loadDetail = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/v1/price-alerts/${id}`);
      const data = await res.json();
      if (data.success) setSelected(data.data);
    } catch (e) { console.error(e); }
  };

  const markRead = async (ids) => {
    try {
      await fetch(`${API_BASE}/v1/price-alerts/mark-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-text-primary mb-1">가격 알림</h2>
          <p className="text-sm text-text-secondary">경쟁사 가격 변동 감지 알림</p>
        </div>
        {alerts.length > 0 && (
          <button
            onClick={() => markRead(alerts.map(a => a.id))}
            className="px-4 py-2 bg-card border border-border text-text-secondary rounded-lg text-sm hover:text-text-primary transition-colors"
          >
            전체 읽음 처리
          </button>
        )}
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* Alert list (3/5) */}
        <div className="col-span-3 bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3">미확인 알림 ({alerts.length})</h3>
          <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
            {alerts.map(a => (
              <button
                key={a.id}
                onClick={() => loadDetail(a.id)}
                className={`w-full text-left px-3 py-3 rounded-lg transition-colors ${
                  selected?.id === a.id ? 'bg-accent-muted' : 'hover:bg-navy-800/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-text-primary">{a.procedure_name || a.procedure_id}</span>
                  <span className={`text-xs font-medium ${a.change_percent > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {a.change_percent > 0 ? '+' : ''}{a.change_percent?.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <span>{a.hospital_name}</span>
                  <span>|</span>
                  <span>{formatPrice(a.old_price)} → {formatPrice(a.new_price)}</span>
                </div>
                <p className="text-[10px] text-text-secondary mt-1">
                  {new Date(a.created_at).toLocaleString('ko-KR')}
                </p>
              </button>
            ))}
            {alerts.length === 0 && (
              <p className="text-sm text-text-secondary text-center py-8">미확인 가격 알림이 없습니다.</p>
            )}
          </div>
        </div>

        {/* Detail (2/5) */}
        <div className="col-span-2">
          {selected ? (
            <div className="bg-card rounded-xl border border-border p-5 space-y-4 sticky top-4">
              <h3 className="text-sm font-semibold text-text-primary">{selected.procedure_name || selected.procedure_id}</h3>
              <p className="text-xs text-text-secondary">{selected.hospital_name}</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-navy-800/30 rounded-lg p-3">
                  <p className="text-xs text-text-secondary">이전 가격</p>
                  <p className="text-lg font-bold text-text-primary">{formatPrice(selected.old_price)}</p>
                </div>
                <div className="bg-navy-800/30 rounded-lg p-3">
                  <p className="text-xs text-text-secondary">변경 가격</p>
                  <p className={`text-lg font-bold ${selected.change_percent > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {formatPrice(selected.new_price)}
                  </p>
                </div>
              </div>

              {selected.screenshot_url && (
                <div>
                  <p className="text-xs text-text-secondary mb-2">스크린샷</p>
                  <img src={selected.screenshot_url} alt="Price screenshot" className="w-full rounded-lg border border-border" />
                </div>
              )}

              <button
                onClick={() => { markRead([selected.id]); setSelected(null); }}
                className="w-full py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-light transition-colors"
              >
                읽음 처리
              </button>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border p-8 text-center">
              <p className="text-3xl mb-3">🔔</p>
              <p className="text-sm text-text-secondary">알림을 선택하면 상세 정보를 확인할 수 있습니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
