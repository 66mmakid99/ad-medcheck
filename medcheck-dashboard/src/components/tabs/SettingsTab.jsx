import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../../lib/config';

const SETTING_GROUPS = [
  {
    title: 'Flywheel 학습 임계값',
    icon: '🎯',
    keys: ['accuracy_threshold', 'exception_min_occurrences', 'exception_min_confidence', 'auto_apply_confidence', 'learning_expiry_days'],
  },
  {
    title: '성능 추적 설정',
    icon: '📊',
    keys: ['context_modifier_min_samples', 'performance_aggregation_days', 'flag_review_period_days'],
  },
  {
    title: 'Rule-First 파이프라인',
    icon: '🔧',
    keys: ['hitl_confidence_threshold', 'rule_first_enabled'],
  },
];

const SETTING_META = {
  accuracy_threshold: { label: '패턴 정확도 경고 임계값', type: 'slider', min: 0, max: 1, step: 0.05 },
  exception_min_occurrences: { label: '예외 규칙 최소 발생 횟수', type: 'number', min: 1, max: 100 },
  exception_min_confidence: { label: '예외 규칙 자동 적용 최소 신뢰도', type: 'slider', min: 0, max: 1, step: 0.05 },
  auto_apply_confidence: { label: '자동 적용 최소 신뢰도', type: 'slider', min: 0, max: 1, step: 0.05 },
  context_modifier_min_samples: { label: '맥락 신뢰도 조정 최소 샘플 수', type: 'number', min: 1, max: 200 },
  performance_aggregation_days: { label: '성능 집계 기간 (일)', type: 'number', min: 1, max: 365 },
  flag_review_period_days: { label: '플래그 검토 기간 (일)', type: 'number', min: 1, max: 60 },
  learning_expiry_days: { label: '학습 후보 만료 기간 (일)', type: 'number', min: 1, max: 365 },
  hitl_confidence_threshold: { label: 'HITL 큐 진입 기준 신뢰도', type: 'slider', min: 0, max: 1, step: 0.05 },
  rule_first_enabled: { label: 'Rule-First 파이프라인 활성화', type: 'toggle' },
};

export default function SettingsTab() {
  const [settings, setSettings] = useState({});
  const [original, setOriginal] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [toast, setToast] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [healthData, setHealthData] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, healthRes] = await Promise.all([
        fetch(`${API_BASE}/v1/settings`).then(r => r.json()),
        fetch(`${API_BASE}/v1/health?detailed=true`).then(r => r.json()).catch(() => null),
      ]);
      if (settingsRes.success) {
        const map = {};
        for (const s of settingsRes.data) {
          map[s.setting_key] = s.setting_value;
        }
        setSettings({ ...map });
        setOriginal({ ...map });
      }
      if (healthRes) setHealthData(healthRes);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: String(value) }));
  };

  const handleSave = async (key) => {
    setSaving(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(`${API_BASE}/v1/settings/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: settings[key] }),
      });
      if (!res.ok) throw new Error('저장 실패');
      setOriginal(prev => ({ ...prev, [key]: settings[key] }));
      showToast(`${SETTING_META[key]?.label || key} 저장 완료`);
    } catch (e) { showToast('오류: ' + e.message); }
    setSaving(prev => ({ ...prev, [key]: false }));
  };

  const handleAction = async (endpoint, label) => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('실행 실패');
      const data = await res.json();
      showToast(`${label} 완료${data.data?.generated ? ` (${data.data.generated}건)` : ''}`);
    } catch (e) { showToast('오류: ' + e.message); }
    setActionLoading(false);
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
      <h2 className="text-xl font-semibold text-text-primary mb-1">설정</h2>
      <p className="text-sm text-text-secondary mb-6">엔진 설정 및 시스템 관리</p>

      <div className="space-y-6">
        {/* 설정 그룹 */}
        {SETTING_GROUPS.map(group => (
          <div key={group.title} className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-3 bg-surface border-b border-border">
              <h3 className="text-sm font-semibold text-text-primary">{group.icon} {group.title}</h3>
            </div>
            <div className="p-5 space-y-5">
              {group.keys.map(key => {
                const meta = SETTING_META[key];
                const value = settings[key];
                const changed = value !== original[key];
                if (!meta) return null;

                return (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary font-medium">{meta.label}</p>
                      <p className="text-[11px] text-text-muted font-mono">{key}</p>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {meta.type === 'slider' && (
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={meta.min} max={meta.max} step={meta.step}
                            value={parseFloat(value) || 0}
                            onChange={e => handleChange(key, e.target.value)}
                            className="w-32 h-1.5 accent-accent"
                          />
                          <span className="text-sm font-bold text-text-primary w-12 text-right">
                            {Math.round((parseFloat(value) || 0) * 100)}%
                          </span>
                        </div>
                      )}
                      {meta.type === 'number' && (
                        <input
                          type="number"
                          min={meta.min} max={meta.max}
                          value={value || ''}
                          onChange={e => handleChange(key, e.target.value)}
                          className="w-20 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary text-center focus:outline-none focus:ring-2 focus:ring-accent/20"
                        />
                      )}
                      {meta.type === 'toggle' && (
                        <button
                          onClick={() => handleChange(key, value === '1' ? '0' : '1')}
                          className={`relative w-11 h-6 rounded-full transition-colors ${value === '1' ? 'bg-emerald-500' : 'bg-surface border border-border'}`}
                        >
                          <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${value === '1' ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                      )}
                      {changed && (
                        <button
                          onClick={() => handleSave(key)}
                          disabled={saving[key]}
                          className="px-2.5 py-1 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
                        >
                          {saving[key] ? '...' : '저장'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* 빠른 작업 */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-3 bg-surface border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">⚡ 빠른 작업</h3>
          </div>
          <div className="p-5 grid grid-cols-3 gap-3">
            <ActionButton
              label="성능 집계 실행"
              desc="패턴 성능 데이터 재집계"
              onClick={() => handleAction('/v1/performance/aggregate', '성능 집계')}
              loading={actionLoading}
            />
            <ActionButton
              label="예외 후보 생성"
              desc="오탐 데이터에서 예외 규칙 후보 생성"
              onClick={() => handleAction('/v1/learning/generate-exceptions', '예외 후보 생성')}
              loading={actionLoading}
            />
            <ActionButton
              label="매핑 학습"
              desc="시술명 매핑 패턴 학습"
              onClick={() => handleAction('/v1/learning/learn-mappings', '매핑 학습')}
              loading={actionLoading}
            />
          </div>
        </div>

        {/* 시스템 정보 */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-3 bg-surface border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">🖥️ 시스템 정보</h3>
          </div>
          <div className="p-5 space-y-2">
            <MetaRow label="Engine URL" value={API_BASE} mono />
            <MetaRow label="상태" value={healthData?.status || '-'} />
            <MetaRow label="버전" value={healthData?.version || '-'} />
            <MetaRow label="Uptime" value={healthData?.uptime ? `${Math.floor(healthData.uptime / 3600)}h ${Math.floor((healthData.uptime % 3600) / 60)}m` : '-'} />
            {healthData?.components?.map(comp => (
              <MetaRow
                key={comp.name}
                label={comp.name}
                value={`${comp.status}${comp.latency ? ` (${comp.latency}ms)` : ''}`}
              />
            ))}
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-navy-900 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

function ActionButton({ label, desc, onClick, loading }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex flex-col items-start p-4 bg-surface border border-border rounded-xl hover:border-accent/30 hover:bg-accent/[0.03] transition-colors text-left disabled:opacity-50"
    >
      <span className="text-sm font-medium text-text-primary mb-1">{label}</span>
      <span className="text-[11px] text-text-muted">{desc}</span>
    </button>
  );
}

function MetaRow({ label, value, mono }) {
  return (
    <div className="flex justify-between items-center text-xs gap-2">
      <span className="text-text-muted flex-shrink-0">{label}</span>
      <span className={`text-text-secondary font-medium truncate text-right ${mono ? 'font-mono text-[10px]' : ''}`}>{value}</span>
    </div>
  );
}
