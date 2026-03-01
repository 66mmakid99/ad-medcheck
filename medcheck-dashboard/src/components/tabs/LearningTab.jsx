import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../../lib/config';

const LEARNING_TYPES = {
  exception_generated: { label: '예외 규칙', icon: '🛡️', color: 'bg-emerald-500/10 text-emerald-600' },
  confidence_adjusted: { label: '신뢰도 조정', icon: '📊', color: 'bg-accent/10 text-accent' },
  pattern_suggested: { label: '패턴 후보', icon: '🔍', color: 'bg-purple-500/10 text-purple-600' },
  mapping_learned: { label: '매핑 학습', icon: '🔗', color: 'bg-grade-b/10 text-grade-b' },
  severity_adjusted: { label: '심각도 조정', icon: '⚖️', color: 'bg-grade-c/10 text-grade-c' },
};

const STATUS_STYLES = {
  pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  approved: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  rejected: 'bg-grade-d/10 text-grade-d border-grade-d/20',
  auto_applied: 'bg-accent/10 text-accent border-accent/20',
  expired: 'bg-surface text-text-muted border-border',
};

const STATUS_LABELS = {
  pending: '대기',
  approved: '승인됨',
  rejected: '거부됨',
  auto_applied: '자동적용',
  expired: '만료',
};

export default function LearningTab() {
  const [candidates, setCandidates] = useState([]);
  const [autoEligible, setAutoEligible] = useState([]);
  const [exceptionCandidates, setExceptionCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [viewMode, setViewMode] = useState('candidates'); // candidates | auto | exceptions
  const [typeFilter, setTypeFilter] = useState('');
  const [toast, setToast] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [candRes, autoRes, excRes] = await Promise.all([
        fetch(`${API_BASE}/v1/learning/candidates?limit=50${typeFilter ? `&type=${typeFilter}` : ''}`).then(r => r.json()),
        fetch(`${API_BASE}/v1/learning/auto-apply-eligible`).then(r => r.json()),
        fetch(`${API_BASE}/v1/exception-candidates?status=all&limit=50`).then(r => r.json()),
      ]);
      setCandidates(candRes.data || []);
      setAutoEligible(autoRes.data || []);
      setExceptionCandidates(excRes.data || []);
    } catch (e) {
      console.error('Learning data load error:', e);
    }
    setLoading(false);
  }, [typeFilter]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleApprove = async (id, isException) => {
    setActionLoading(true);
    try {
      const url = isException
        ? `${API_BASE}/v1/exception-candidates/${id}/approve`
        : `${API_BASE}/v1/learning/candidates/${id}/approve`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedBy: 'dashboard' }),
      });
      if (!res.ok) throw new Error('승인 실패');
      showToast('승인되었습니다');
      setSelected(null);
      loadAll();
    } catch (e) {
      showToast('오류: ' + e.message);
    }
    setActionLoading(false);
  };

  const handleReject = async (id, isException, reason) => {
    setActionLoading(true);
    try {
      const url = isException
        ? `${API_BASE}/v1/exception-candidates/${id}/reject`
        : `${API_BASE}/v1/learning/candidates/${id}/reject`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || '대시보드에서 거부' }),
      });
      if (!res.ok) throw new Error('거부 실패');
      showToast('거부되었습니다');
      setSelected(null);
      loadAll();
    } catch (e) {
      showToast('오류: ' + e.message);
    }
    setActionLoading(false);
  };

  const handleApplyOne = async (id) => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/learning/candidates/${id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('적용 실패');
      const result = await res.json();
      showToast(result.data?.detail || '적용되었습니다');
      setSelected(null);
      loadAll();
    } catch (e) {
      showToast('오류: ' + e.message);
    }
    setActionLoading(false);
  };

  const handleBatchAutoApply = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/learning/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('일괄 적용 실패');
      const result = await res.json();
      showToast(`${result.data?.applied || 0}건 적용 완료`);
      loadAll();
    } catch (e) {
      showToast('오류: ' + e.message);
    }
    setActionLoading(false);
  };

  const handleGenerate = async (action) => {
    setActionLoading(true);
    try {
      const endpoints = {
        exceptions: '/v1/learning/generate-exceptions',
        patterns: '/v1/learning/extract-patterns',
        mappings: '/v1/learning/learn-mappings',
      };
      const res = await fetch(`${API_BASE}${endpoints[action]}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('생성 실패');
      showToast('생성 완료');
      loadAll();
    } catch (e) {
      showToast('오류: ' + e.message);
    }
    setActionLoading(false);
  };

  const currentItems = viewMode === 'candidates' ? candidates
    : viewMode === 'auto' ? autoEligible
    : exceptionCandidates;

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-1">🔄 Flywheel 학습 관리</h2>
      <p className="text-sm text-text-secondary mb-6">
        자동 학습 후보를 검토하고 승인/거부/적용합니다
      </p>

      {/* 통계 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <MiniCard label="학습 후보" value={candidates.length} icon="📋" />
        <MiniCard label="자동적용 대상" value={autoEligible.length} icon="⚡" highlight={autoEligible.length > 0} />
        <MiniCard label="예외 후보" value={exceptionCandidates.length} icon="🛡️" />
        <div className="bg-card rounded-xl border border-border p-3.5 flex items-center justify-center">
          <button
            onClick={loadAll}
            disabled={loading}
            className="px-4 py-2 bg-accent/10 text-accent rounded-lg text-sm font-medium hover:bg-accent/20 transition-colors disabled:opacity-50"
          >
            🔄 새로고침
          </button>
        </div>
      </div>

      {/* 뷰 모드 탭 + 액션 버튼 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-surface rounded-lg p-1">
          {[
            { id: 'candidates', label: '학습 후보', count: candidates.length },
            { id: 'auto', label: '자동적용', count: autoEligible.length },
            { id: 'exceptions', label: '예외 후보', count: exceptionCandidates.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setViewMode(tab.id); setSelected(null); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === tab.id
                  ? 'bg-card text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {viewMode === 'candidates' && (
            <select
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value); setSelected(null); }}
              className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              <option value="">전체 유형</option>
              {Object.entries(LEARNING_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          )}
          {viewMode === 'auto' && autoEligible.length > 0 && (
            <button
              onClick={handleBatchAutoApply}
              disabled={actionLoading}
              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              ⚡ 일괄 자동적용 ({autoEligible.length}건)
            </button>
          )}
          <div className="flex gap-1">
            <button onClick={() => handleGenerate('exceptions')} disabled={actionLoading}
              className="px-2.5 py-1.5 bg-surface border border-border rounded-lg text-xs text-text-secondary hover:bg-border transition-colors disabled:opacity-50">
              예외 생성
            </button>
            <button onClick={() => handleGenerate('patterns')} disabled={actionLoading}
              className="px-2.5 py-1.5 bg-surface border border-border rounded-lg text-xs text-text-secondary hover:bg-border transition-colors disabled:opacity-50">
              패턴 추출
            </button>
            <button onClick={() => handleGenerate('mappings')} disabled={actionLoading}
              className="px-2.5 py-1.5 bg-surface border border-border rounded-lg text-xs text-text-secondary hover:bg-border transition-colors disabled:opacity-50">
              매핑 학습
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-5">
        {/* 테이블 */}
        <div className="col-span-3 bg-card rounded-xl border border-border overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-text-muted">로딩 중...</div>
          ) : currentItems.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-sm text-text-muted">
                {viewMode === 'auto' ? '자동적용 대상이 없습니다' :
                 viewMode === 'exceptions' ? '예외 후보가 없습니다' : '학습 후보가 없습니다'}
              </p>
            </div>
          ) : viewMode === 'exceptions' ? (
            <ExceptionTable items={currentItems} selected={selected} onSelect={setSelected} />
          ) : (
            <CandidateTable items={currentItems} selected={selected} onSelect={setSelected} />
          )}
        </div>

        {/* 상세 패널 */}
        <div className="col-span-2 bg-card rounded-xl border border-border p-5 h-fit">
          {selected ? (
            viewMode === 'exceptions' ? (
              <ExceptionDetail
                item={selected}
                onApprove={() => handleApprove(selected.id, true)}
                onReject={(reason) => handleReject(selected.id, true, reason)}
                loading={actionLoading}
              />
            ) : (
              <CandidateDetail
                item={selected}
                onApprove={() => handleApprove(selected.id, false)}
                onReject={(reason) => handleReject(selected.id, false, reason)}
                onApply={() => handleApplyOne(selected.id)}
                loading={actionLoading}
              />
            )
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
        <div className="fixed bottom-6 right-6 bg-navy-900 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ─── 학습 후보 테이블 ─── */
function CandidateTable({ items, selected, onSelect }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface">
          <tr>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">유형</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">대상</th>
            <th className="text-center px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">신뢰도</th>
            <th className="text-center px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">피드백</th>
            <th className="text-center px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">상태</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map(item => {
            const typeInfo = LEARNING_TYPES[item.learningType] || { label: item.learningType, icon: '📄', color: 'bg-surface text-text-muted' };
            return (
              <tr
                key={item.id}
                onClick={() => onSelect(item)}
                className={`cursor-pointer transition-colors ${selected?.id === item.id ? 'bg-accent/[0.06]' : 'hover:bg-accent/[0.03]'}`}
              >
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${typeInfo.color}`}>
                    {typeInfo.icon} {typeInfo.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-primary text-xs font-mono truncate max-w-[140px]">{item.targetId || '-'}</td>
                <td className="px-4 py-3">
                  <ConfidenceBar value={item.confidenceScore} />
                </td>
                <td className="px-4 py-3 text-center text-text-secondary text-xs">{item.sourceFeedbackCount || 0}건</td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge status={item.status} autoEligible={item.autoApplyEligible} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── 예외 후보 테이블 ─── */
function ExceptionTable({ items, selected, onSelect }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface">
          <tr>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">패턴 ID</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">예외 패턴</th>
            <th className="text-center px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">신뢰도</th>
            <th className="text-center px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">발생</th>
            <th className="text-center px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">상태</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map(item => (
            <tr
              key={item.id}
              onClick={() => onSelect(item)}
              className={`cursor-pointer transition-colors ${selected?.id === item.id ? 'bg-accent/[0.06]' : 'hover:bg-accent/[0.03]'}`}
            >
              <td className="px-4 py-3 text-text-primary text-xs font-mono">{item.pattern_id || '-'}</td>
              <td className="px-4 py-3 text-text-secondary text-xs truncate max-w-[160px]">{item.exception_pattern || '-'}</td>
              <td className="px-4 py-3">
                <ConfidenceBar value={item.confidence} />
              </td>
              <td className="px-4 py-3 text-center text-text-secondary text-xs">{item.occurrence_count || 0}회</td>
              <td className="px-4 py-3 text-center">
                <StatusBadge status={item.status === 'pending_review' ? 'pending' : item.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── 학습 후보 상세 ─── */
function CandidateDetail({ item, onApprove, onReject, onApply, loading }) {
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const typeInfo = LEARNING_TYPES[item.learningType] || { label: item.learningType, icon: '📄' };
  const isPending = item.status === 'pending';

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">{typeInfo.icon}</span>
        <h4 className="text-sm font-semibold text-text-primary">{typeInfo.label} 상세</h4>
        <StatusBadge status={item.status} autoEligible={item.autoApplyEligible} />
      </div>

      {/* 메타 정보 */}
      <div className="space-y-1.5 mb-4">
        <MetaRow label="ID" value={item.id} mono />
        <MetaRow label="대상 ID" value={item.targetId || '-'} mono />
        <MetaRow label="대상 유형" value={item.targetType || '-'} />
        <MetaRow label="신뢰도" value={`${Math.round((item.confidenceScore || 0) * 100)}%`} />
        <MetaRow label="피드백 수" value={`${item.sourceFeedbackCount || 0}건`} />
        {item.autoApplyReason && <MetaRow label="자동적용" value={item.autoApplyReason} />}
      </div>

      {/* 입력 데이터 */}
      {item.inputData && (
        <div className="mb-3">
          <p className="text-[11px] text-text-muted mb-1">입력 데이터</p>
          <pre className="bg-surface rounded-lg p-3 border border-border text-[11px] text-text-secondary overflow-x-auto max-h-[120px] overflow-y-auto sidebar-scroll">
            {JSON.stringify(item.inputData, null, 2)}
          </pre>
        </div>
      )}

      {/* 출력 데이터 */}
      {item.outputData && (
        <div className="mb-4">
          <p className="text-[11px] text-text-muted mb-1">출력 데이터</p>
          <pre className="bg-surface rounded-lg p-3 border border-border text-[11px] text-text-secondary overflow-x-auto max-h-[120px] overflow-y-auto sidebar-scroll">
            {JSON.stringify(item.outputData, null, 2)}
          </pre>
        </div>
      )}

      {/* 신뢰도 바 */}
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-surface rounded-full h-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                (item.confidenceScore || 0) < 0.5 ? 'bg-grade-d' :
                (item.confidenceScore || 0) < 0.8 ? 'bg-yellow-500' :
                (item.confidenceScore || 0) < 0.95 ? 'bg-accent' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.round((item.confidenceScore || 0) * 100)}%` }}
            />
          </div>
          <span className="text-sm font-bold text-text-primary w-12 text-right">
            {Math.round((item.confidenceScore || 0) * 100)}%
          </span>
        </div>
      </div>

      {/* 액션 버튼 */}
      {isPending && (
        <>
          <div className="border-t border-border mb-4" />
          <div className="flex gap-2 mb-3">
            <button
              onClick={onApprove}
              disabled={loading}
              className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              ✅ 승인
            </button>
            {item.autoApplyEligible && (
              <button
                onClick={onApply}
                disabled={loading}
                className="flex-1 px-3 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-light transition-colors disabled:opacity-50"
              >
                ⚡ 적용
              </button>
            )}
            <button
              onClick={() => setShowReject(!showReject)}
              className="flex-1 px-3 py-2 bg-grade-d/10 text-grade-d rounded-lg text-sm font-medium hover:bg-grade-d/20 transition-colors"
            >
              ❌ 거부
            </button>
          </div>
          {showReject && (
            <div className="space-y-2">
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="거부 사유를 입력하세요..."
                rows={2}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 resize-none"
              />
              <button
                onClick={() => { onReject(rejectReason); setShowReject(false); setRejectReason(''); }}
                disabled={loading}
                className="w-full px-3 py-2 bg-grade-d text-white rounded-lg text-sm font-medium hover:bg-grade-d/90 transition-colors disabled:opacity-50"
              >
                거부 확정
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── 예외 후보 상세 ─── */
function ExceptionDetail({ item, onApprove, onReject, loading }) {
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const isPending = item.status === 'pending_review' || item.status === 'pending';

  let sampleTexts = [];
  try {
    sampleTexts = typeof item.sample_texts === 'string' ? JSON.parse(item.sample_texts) : (item.sample_texts || []);
  } catch { /* ignore */ }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🛡️</span>
        <h4 className="text-sm font-semibold text-text-primary">예외 후보 상세</h4>
        <StatusBadge status={isPending ? 'pending' : item.status} />
      </div>

      <div className="space-y-1.5 mb-4">
        <MetaRow label="ID" value={item.id} mono />
        <MetaRow label="패턴 ID" value={item.pattern_id || '-'} mono />
        <MetaRow label="예외 유형" value={item.exception_type || '-'} />
        <MetaRow label="예외 패턴" value={item.exception_pattern || '-'} />
        <MetaRow label="신뢰도" value={`${Math.round((item.confidence || 0) * 100)}%`} />
        <MetaRow label="발생 횟수" value={`${item.occurrence_count || 0}회`} />
        <MetaRow label="고유 소스" value={`${item.unique_sources || 0}개`} />
        <MetaRow label="임계값 충족" value={item.meets_threshold ? '✅ 예' : '❌ 아니오'} />
      </div>

      {/* 샘플 텍스트 */}
      {sampleTexts.length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] text-text-muted mb-1.5">샘플 텍스트</p>
          <div className="space-y-1 max-h-[120px] overflow-y-auto sidebar-scroll">
            {sampleTexts.map((t, i) => (
              <div key={i} className="bg-surface rounded px-3 py-1.5 text-xs text-text-secondary border border-border">
                "{t}"
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 신뢰도 바 */}
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-surface rounded-full h-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                (item.confidence || 0) < 0.5 ? 'bg-grade-d' :
                (item.confidence || 0) < 0.85 ? 'bg-yellow-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.round((item.confidence || 0) * 100)}%` }}
            />
          </div>
          <span className="text-sm font-bold text-text-primary w-12 text-right">
            {Math.round((item.confidence || 0) * 100)}%
          </span>
        </div>
      </div>

      {isPending && (
        <>
          <div className="border-t border-border mb-4" />
          <div className="flex gap-2 mb-3">
            <button
              onClick={onApprove}
              disabled={loading}
              className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              ✅ 승인
            </button>
            <button
              onClick={() => setShowReject(!showReject)}
              className="flex-1 px-3 py-2 bg-grade-d/10 text-grade-d rounded-lg text-sm font-medium hover:bg-grade-d/20 transition-colors"
            >
              ❌ 거부
            </button>
          </div>
          {showReject && (
            <div className="space-y-2">
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="거부 사유를 입력하세요..."
                rows={2}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 resize-none"
              />
              <button
                onClick={() => { onReject(rejectReason); setShowReject(false); setRejectReason(''); }}
                disabled={loading}
                className="w-full px-3 py-2 bg-grade-d text-white rounded-lg text-sm font-medium hover:bg-grade-d/90 transition-colors disabled:opacity-50"
              >
                거부 확정
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── 공통 컴포넌트 ─── */
function MiniCard({ label, value, icon, highlight }) {
  return (
    <div className={`rounded-xl border p-3.5 flex items-center gap-3 ${highlight ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-card border-border'}`}>
      <span className="text-lg">{icon}</span>
      <div>
        <p className="text-[11px] text-text-muted">{label}</p>
        <p className={`text-lg font-bold ${highlight ? 'text-emerald-600' : 'text-text-primary'}`}>{value}</p>
      </div>
    </div>
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

function ConfidenceBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div className="flex items-center gap-1.5 justify-center">
      <div className="w-16 bg-surface rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full ${
            pct < 50 ? 'bg-grade-d' : pct < 80 ? 'bg-yellow-500' : pct < 95 ? 'bg-accent' : 'bg-emerald-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-text-secondary font-medium w-8 text-right">{pct}%</span>
    </div>
  );
}

function StatusBadge({ status, autoEligible }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.pending;
  const label = STATUS_LABELS[status] || status;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border ${style}`}>
      {label}
      {autoEligible && <span title="자동적용 대상">⚡</span>}
    </span>
  );
}
