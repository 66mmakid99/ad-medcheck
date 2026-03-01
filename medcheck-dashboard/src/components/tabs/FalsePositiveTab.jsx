import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../../lib/config';

const FP_STATUSES = {
  reported: { label: '신고됨', style: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' },
  reviewing: { label: '검토 중', style: 'bg-accent/10 text-accent border-accent/20' },
  resolved: { label: '해결됨', style: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  rejected: { label: '거부됨', style: 'bg-grade-d/10 text-grade-d border-grade-d/20' },
};

const FP_TYPES = {
  context_dependent: '맥락 의존',
  domain_specific: '도메인 특화',
  quotation: '인용/참조',
  negation: '부정 표현',
  education: '교육/정보',
  pattern_too_broad: '패턴 과잉',
  ocr_error: 'OCR 오류',
};

const SUGGESTION_STATUSES = {
  suggested: { label: '제안됨', style: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' },
  approved: { label: '승인됨', style: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  rejected: { label: '거부됨', style: 'bg-grade-d/10 text-grade-d border-grade-d/20' },
};

export default function FalsePositiveTab() {
  const [viewMode, setViewMode] = useState('fp_cases'); // fp_cases | suggestions | exceptions
  const [fpCases, setFpCases] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [toast, setToast] = useState(null);
  const [resolutionNote, setResolutionNote] = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fpRes, sugRes, excRes] = await Promise.all([
        fetch(`${API_BASE}/v1/false-positives?page=${page}&limit=20${statusFilter ? `&status=${statusFilter}` : ''}${typeFilter ? `&type=${typeFilter}` : ''}`).then(r => r.json()),
        fetch(`${API_BASE}/v1/exception-suggestions?status=suggested&limit=50`).then(r => r.json()),
        fetch(`${API_BASE}/v1/exceptions?status=active&limit=50`).then(r => r.json()),
      ]);
      setFpCases(fpRes.data || []);
      setTotalPages(fpRes.pagination?.totalPages || 1);
      setSuggestions(sugRes.data || []);
      setExceptions(excRes.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [page, statusFilter, typeFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  // FP case 상태 변경
  const handleStatusChange = async (id, newStatus) => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/false-positives/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          resolutionNote: resolutionNote || undefined,
          reviewer: 'dashboard',
        }),
      });
      if (!res.ok) throw new Error('상태 변경 실패');
      showToast(`${FP_STATUSES[newStatus]?.label || newStatus}로 변경`);
      setSelected(null);
      setResolutionNote('');
      loadData();
    } catch (e) { showToast('오류: ' + e.message); }
    setActionLoading(false);
  };

  // 예외 제안 승인/거부
  const handleSuggestion = async (id, action) => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/exception-suggestions/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewedBy: 'dashboard' }),
      });
      if (!res.ok) throw new Error(`${action} 실패`);
      showToast(action === 'approve' ? '승인 완료' : '거부 완료');
      setSelected(null);
      loadData();
    } catch (e) { showToast('오류: ' + e.message); }
    setActionLoading(false);
  };

  // 예외 삭제
  const handleDeleteException = async (patternId, excId) => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/patterns/${patternId}/exceptions/${excId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('삭제 실패');
      showToast('예외 비활성화 완료');
      setSelected(null);
      loadData();
    } catch (e) { showToast('오류: ' + e.message); }
    setActionLoading(false);
  };

  const fpReported = fpCases.filter(c => c.status === 'reported').length;
  const fpReviewing = fpCases.filter(c => c.status === 'reviewing').length;

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-1">오탐 관리</h2>
      <p className="text-sm text-text-secondary mb-6">오탐(False Positive) 신고 검토, 예외 제안 승인, 활성 예외 관리</p>

      {/* 통계 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <MiniCard label="신고 대기" value={fpReported} icon="📩" highlight={fpReported > 0} />
        <MiniCard label="검토 중" value={fpReviewing} icon="🔍" />
        <MiniCard label="예외 제안" value={suggestions.length} icon="💡" highlight={suggestions.length > 0} />
        <MiniCard label="활성 예외" value={exceptions.length} icon="🛡️" />
      </div>

      {/* 뷰 모드 탭 + 필터 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-surface rounded-lg p-1">
          {[
            { id: 'fp_cases', label: '오탐 신고', count: fpCases.length },
            { id: 'suggestions', label: '예외 제안', count: suggestions.length },
            { id: 'exceptions', label: '활성 예외', count: exceptions.length },
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
          {viewMode === 'fp_cases' && (
            <>
              <select
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setPage(1); setSelected(null); }}
                className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20"
              >
                <option value="">전체 상태</option>
                {Object.entries(FP_STATUSES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <select
                value={typeFilter}
                onChange={e => { setTypeFilter(e.target.value); setPage(1); setSelected(null); }}
                className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20"
              >
                <option value="">전체 유형</option>
                {Object.entries(FP_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </>
          )}
          <button
            onClick={() => { setSelected(null); loadData(); }}
            disabled={loading}
            className="px-3 py-1.5 bg-accent/10 text-accent rounded-lg text-xs font-medium hover:bg-accent/20 transition-colors disabled:opacity-50"
          >
            새로고침
          </button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-5">
        {/* 테이블 */}
        <div className="col-span-3 bg-card rounded-xl border border-border overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : viewMode === 'fp_cases' ? (
            fpCases.length === 0 ? <EmptyState text="오탐 신고가 없습니다" /> : (
              <>
                <FPCaseTable items={fpCases} selected={selected} onSelect={setSelected} />
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                      className="text-xs text-text-secondary hover:text-text-primary disabled:opacity-30">← 이전</button>
                    <span className="text-xs text-text-muted">{page} / {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                      className="text-xs text-text-secondary hover:text-text-primary disabled:opacity-30">다음 →</button>
                  </div>
                )}
              </>
            )
          ) : viewMode === 'suggestions' ? (
            suggestions.length === 0 ? <EmptyState text="예외 제안이 없습니다" /> : (
              <SuggestionTable items={suggestions} selected={selected} onSelect={setSelected} />
            )
          ) : (
            exceptions.length === 0 ? <EmptyState text="활성 예외가 없습니다" /> : (
              <ExceptionTable items={exceptions} selected={selected} onSelect={setSelected} />
            )
          )}
        </div>

        {/* 상세 패널 */}
        <div className="col-span-2 bg-card rounded-xl border border-border p-5 h-fit">
          {selected ? (
            viewMode === 'fp_cases' ? (
              <FPCaseDetail
                item={selected}
                onStatusChange={handleStatusChange}
                resolutionNote={resolutionNote}
                setResolutionNote={setResolutionNote}
                loading={actionLoading}
              />
            ) : viewMode === 'suggestions' ? (
              <SuggestionDetail
                item={selected}
                onApprove={() => handleSuggestion(selected.id, 'approve')}
                onReject={() => handleSuggestion(selected.id, 'reject')}
                loading={actionLoading}
              />
            ) : (
              <ExceptionDetail
                item={selected}
                onDelete={() => handleDeleteException(selected.pattern_id, selected.id)}
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

      {toast && (
        <div className="fixed bottom-6 right-6 bg-navy-900 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ─── 오탐 신고 테이블 ─── */
function FPCaseTable({ items, selected, onSelect }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface">
          <tr>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">패턴 ID</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">매칭 텍스트</th>
            <th className="text-center px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">유형</th>
            <th className="text-center px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">상태</th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">신고일</th>
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
              <td className="px-4 py-3 text-text-secondary text-xs truncate max-w-[180px]">{item.matched_text || '-'}</td>
              <td className="px-4 py-3 text-center">
                <span className="text-[10px] text-text-muted">{FP_TYPES[item.false_positive_type] || item.false_positive_type || '-'}</span>
              </td>
              <td className="px-4 py-3 text-center"><StatusBadge status={item.status} map={FP_STATUSES} /></td>
              <td className="px-4 py-3 text-right text-[10px] text-text-muted">
                {item.created_at ? new Date(item.created_at).toLocaleDateString('ko-KR') : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── 예외 제안 테이블 ─── */
function SuggestionTable({ items, selected, onSelect }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface">
          <tr>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">패턴 ID</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">예외 값</th>
            <th className="text-center px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">신뢰도</th>
            <th className="text-center px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">FP 건수</th>
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
              <td className="px-4 py-3 text-text-secondary text-xs truncate max-w-[160px]">{item.exception_value || '-'}</td>
              <td className="px-4 py-3"><ConfidenceBar value={item.confidence} /></td>
              <td className="px-4 py-3 text-center text-text-secondary text-xs">{item.fp_count || 0}건</td>
              <td className="px-4 py-3 text-center"><StatusBadge status={item.status} map={SUGGESTION_STATUSES} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── 활성 예외 테이블 ─── */
function ExceptionTable({ items, selected, onSelect }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface">
          <tr>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">패턴 ID</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">예외 유형</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">예외 값</th>
            <th className="text-center px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">출처</th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">생성일</th>
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
              <td className="px-4 py-3 text-text-secondary text-xs">{item.exception_type || '-'}</td>
              <td className="px-4 py-3 text-text-secondary text-xs truncate max-w-[160px]">{item.exception_value || '-'}</td>
              <td className="px-4 py-3 text-center text-[10px] text-text-muted">{item.source_type || '-'}</td>
              <td className="px-4 py-3 text-right text-[10px] text-text-muted">
                {item.created_at ? new Date(item.created_at).toLocaleDateString('ko-KR') : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── 오탐 신고 상세 ─── */
function FPCaseDetail({ item, onStatusChange, resolutionNote, setResolutionNote, loading }) {
  const isPending = item.status === 'reported' || item.status === 'reviewing';
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">📩</span>
        <h4 className="text-sm font-semibold text-text-primary">오탐 신고 상세</h4>
        <StatusBadge status={item.status} map={FP_STATUSES} />
      </div>

      <div className="space-y-1.5 mb-4">
        <MetaRow label="ID" value={item.id} mono />
        <MetaRow label="패턴 ID" value={item.pattern_id || '-'} mono />
        <MetaRow label="유형" value={FP_TYPES[item.false_positive_type] || item.false_positive_type || '-'} />
        <MetaRow label="신고자" value={item.reporter_type || '-'} />
        <MetaRow label="신고일" value={item.created_at ? new Date(item.created_at).toLocaleString('ko-KR') : '-'} />
      </div>

      {/* 매칭 텍스트 */}
      <div className="mb-3">
        <p className="text-[11px] text-text-muted mb-1">매칭 텍스트</p>
        <div className="bg-grade-d/5 border border-grade-d/20 rounded-lg px-3 py-2 text-xs text-text-primary">
          "{item.matched_text || '-'}"
        </div>
      </div>

      {/* 전체 컨텍스트 */}
      {item.full_context && (
        <div className="mb-3">
          <p className="text-[11px] text-text-muted mb-1">전체 컨텍스트</p>
          <pre className="bg-surface rounded-lg p-3 border border-border text-[11px] text-text-secondary overflow-x-auto max-h-[120px] overflow-y-auto sidebar-scroll whitespace-pre-wrap">
            {item.full_context}
          </pre>
        </div>
      )}

      {/* 신고 사유 */}
      {item.report_reason && (
        <div className="mb-3">
          <p className="text-[11px] text-text-muted mb-1">신고 사유</p>
          <p className="text-xs text-text-secondary">{item.report_reason}</p>
        </div>
      )}

      {/* 해결 메모 (resolved/rejected인 경우) */}
      {item.resolution_note && (
        <div className="mb-3">
          <p className="text-[11px] text-text-muted mb-1">해결 메모</p>
          <p className="text-xs text-text-secondary">{item.resolution_note}</p>
        </div>
      )}

      {isPending && (
        <>
          <div className="border-t border-border my-4" />
          <div className="mb-3">
            <textarea
              value={resolutionNote}
              onChange={e => setResolutionNote(e.target.value)}
              placeholder="처리 메모 (선택사항)..."
              rows={2}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 resize-none"
            />
          </div>
          <div className="flex gap-2">
            {item.status === 'reported' && (
              <button onClick={() => onStatusChange(item.id, 'reviewing')} disabled={loading}
                className="flex-1 px-3 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50">
                🔍 검토 시작
              </button>
            )}
            <button onClick={() => onStatusChange(item.id, 'resolved')} disabled={loading}
              className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50">
              해결
            </button>
            <button onClick={() => onStatusChange(item.id, 'rejected')} disabled={loading}
              className="flex-1 px-3 py-2 bg-grade-d/10 text-grade-d rounded-lg text-sm font-medium hover:bg-grade-d/20 transition-colors disabled:opacity-50">
              거부
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── 예외 제안 상세 ─── */
function SuggestionDetail({ item, onApprove, onReject, loading }) {
  const isPending = item.status === 'suggested';
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">💡</span>
        <h4 className="text-sm font-semibold text-text-primary">예외 제안 상세</h4>
        <StatusBadge status={item.status} map={SUGGESTION_STATUSES} />
      </div>

      <div className="space-y-1.5 mb-4">
        <MetaRow label="ID" value={item.id} mono />
        <MetaRow label="패턴 ID" value={item.pattern_id || '-'} mono />
        <MetaRow label="예외 유형" value={item.exception_type || '-'} />
        <MetaRow label="예외 값" value={item.exception_value || '-'} />
        <MetaRow label="FP 건수" value={`${item.fp_count || 0}건`} />
        <MetaRow label="신뢰도" value={`${Math.round((item.confidence || 0) * 100)}%`} />
      </div>

      {/* 신뢰도 바 */}
      <div className="mb-5">
        <ConfidenceBarLarge value={item.confidence} />
      </div>

      {isPending && (
        <>
          <div className="border-t border-border my-4" />
          <div className="flex gap-2">
            <button onClick={onApprove} disabled={loading}
              className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50">
              승인
            </button>
            <button onClick={onReject} disabled={loading}
              className="flex-1 px-3 py-2 bg-grade-d/10 text-grade-d rounded-lg text-sm font-medium hover:bg-grade-d/20 transition-colors disabled:opacity-50">
              거부
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── 활성 예외 상세 ─── */
function ExceptionDetail({ item, onDelete, loading }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🛡️</span>
        <h4 className="text-sm font-semibold text-text-primary">예외 규칙 상세</h4>
      </div>

      <div className="space-y-1.5 mb-4">
        <MetaRow label="ID" value={item.id} mono />
        <MetaRow label="패턴 ID" value={item.pattern_id || '-'} mono />
        <MetaRow label="예외 유형" value={item.exception_type || '-'} />
        <MetaRow label="예외 값" value={item.exception_value || '-'} />
        <MetaRow label="출처" value={item.source_type || '-'} />
        <MetaRow label="생성자" value={item.created_by || '-'} />
        <MetaRow label="버전" value={item.version || '-'} />
        <MetaRow label="생성일" value={item.created_at ? new Date(item.created_at).toLocaleString('ko-KR') : '-'} />
      </div>

      <div className="border-t border-border my-4" />
      <button onClick={onDelete} disabled={loading}
        className="w-full px-3 py-2 bg-grade-d/10 text-grade-d rounded-lg text-sm font-medium hover:bg-grade-d/20 transition-colors disabled:opacity-50">
        비활성화
      </button>
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

function StatusBadge({ status, map }) {
  const info = map[status] || { label: status, style: 'bg-surface text-text-muted border-border' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full border ${info.style}`}>
      {info.label}
    </span>
  );
}

function ConfidenceBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div className="flex items-center gap-1.5 justify-center">
      <div className="w-16 bg-surface rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full ${pct < 50 ? 'bg-grade-d' : pct < 80 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-text-secondary font-medium w-8 text-right">{pct}%</span>
    </div>
  );
}

function ConfidenceBarLarge({ value }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-surface rounded-full h-3 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct < 50 ? 'bg-grade-d' : pct < 80 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-bold text-text-primary w-12 text-right">{pct}%</span>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="p-10 text-center">
      <div className="text-3xl mb-2">📭</div>
      <p className="text-sm text-text-muted">{text}</p>
    </div>
  );
}
