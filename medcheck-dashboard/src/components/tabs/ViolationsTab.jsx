import { useState, useEffect } from 'react';
import { supabaseQuery } from '../../lib/supabase';
import GradeBadge from '../ui/GradeBadge';
import SeverityBadge from '../ui/SeverityBadge';

/** object/array를 안전하게 string으로 변환 */
function safe(val) {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return JSON.stringify(val);
}

const PAGE_SIZE = 20;

export default function ViolationsTab() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [gradeFilter, setGradeFilter] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => { loadData(); }, [page, gradeFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const filters = [];
      if (gradeFilter) filters.push({ column: 'grade', op: 'eq', value: gradeFilter });

      const { data, total: t } = await supabaseQuery('check_violation_results', {
        select: 'id,hospital_name,url,grade,clean_score,violation_count,critical_count,major_count,minor_count,analysis_mode,processing_time_ms,analyzed_at,violations',
        order: 'analyzed_at.desc',
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        filters,
      });
      setRows(data || []);
      setTotal(t || 0);
    } catch (e) {
      console.error('Supabase query error:', e);
      setRows([]);
    }
    setLoading(false);
  };

  const formatTime = (ts) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // 통계 요약 (현재 데이터 기준이 아닌 전체)
  const criticalTotal = rows.reduce((a, r) => a + (r.critical_count || 0), 0);
  const majorTotal = rows.reduce((a, r) => a + (r.major_count || 0), 0);
  const minorTotal = rows.reduce((a, r) => a + (r.minor_count || 0), 0);

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-1">위반 현황</h2>
      <p className="text-sm text-text-secondary mb-6">
        Supabase check_violation_results · 전체 {total}건
      </p>

      {/* 통계 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <MiniCard label="전체 결과" value={total} icon="📊" />
        <MiniCard label="Critical" value={criticalTotal} icon="🔴" danger />
        <MiniCard label="Major" value={majorTotal} icon="🟠" />
        <MiniCard label="Minor" value={minorTotal} icon="🟡" />
      </div>

      {/* 필터 */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={gradeFilter}
          onChange={e => { setGradeFilter(e.target.value); setPage(0); }}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20"
        >
          <option value="">전체 등급</option>
          {['S','A','B','C','D','F'].map(g => <option key={g} value={g}>{g} 등급</option>)}
        </select>
        <button
          onClick={() => { setPage(0); loadData(); }}
          className="px-3 py-2 bg-accent/10 text-accent rounded-lg text-sm font-medium hover:bg-accent/20 transition-colors"
        >
          🔄 새로고침
        </button>
      </div>

      <div className="grid grid-cols-5 gap-5">
        {/* 테이블 */}
        <div className="col-span-3 bg-card rounded-xl border border-border overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-text-muted">로딩 중...</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-sm text-text-muted">데이터가 없습니다</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">시간</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">병원</th>
                      <th className="text-center px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">등급</th>
                      <th className="text-center px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">위반</th>
                      <th className="text-center px-4 py-2.5 text-xs font-medium text-text-secondary uppercase">모드</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => setSelected(r)}
                        className={`cursor-pointer transition-colors ${selected?.id === r.id ? 'bg-accent/[0.06]' : 'hover:bg-accent/[0.03]'}`}
                      >
                        <td className="px-4 py-3 text-text-secondary text-xs whitespace-nowrap">{formatTime(r.analyzed_at)}</td>
                        <td className="px-4 py-3 font-medium text-text-primary truncate max-w-[180px]">{r.hospital_name || '-'}</td>
                        <td className="px-4 py-3 text-center"><GradeBadge grade={r.grade} /></td>
                        <td className="px-4 py-3 text-center text-grade-d font-medium">{r.violation_count || 0}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-[11px] px-1.5 py-0.5 rounded ${
                            r.analysis_mode === 'rule_and_ai' ? 'bg-grade-b/10 text-grade-b' :
                            r.analysis_mode === 'rule_only' ? 'bg-accent/10 text-accent' :
                            r.analysis_mode === 'gemini' ? 'bg-grade-b/10 text-grade-b' :
                            'bg-surface text-text-muted'
                          }`}>
                            {r.analysis_mode === 'rule_only' ? 'Rule' : r.analysis_mode === 'rule_and_ai' ? 'Rule+AI' : r.analysis_mode || '-'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 페이지네이션 */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-xs text-text-muted">
                  {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} / {total}건
                </p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-2.5 py-1 text-xs rounded bg-surface border border-border text-text-secondary hover:bg-border disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ← 이전
                  </button>
                  <span className="px-2.5 py-1 text-xs text-text-muted">{page + 1}/{totalPages || 1}</span>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={page >= totalPages - 1}
                    className="px-2.5 py-1 text-xs rounded bg-surface border border-border text-text-secondary hover:bg-border disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    다음 →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 상세 패널 */}
        <div className="col-span-2 bg-card rounded-xl border border-border p-5 h-fit">
          {selected ? (
            <div>
              <h4 className="text-sm font-semibold text-text-primary mb-4">위반 상세</h4>

              {/* 병원 정보 */}
              <div className="bg-surface rounded-lg p-3.5 mb-4">
                <p className="font-semibold text-text-primary">{selected.hospital_name || '이름 없음'}</p>
                <a href={selected.url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-accent hover:underline truncate block mt-1">
                  {selected.url}
                </a>
                <div className="flex items-center gap-2 mt-2.5">
                  <GradeBadge grade={selected.grade} size="lg" />
                  <span className="text-sm text-text-secondary">청정지수 {selected.clean_score ?? '-'}점</span>
                </div>
              </div>

              {/* 심각도 요약 */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-grade-d/5 rounded-lg p-2.5 text-center border border-grade-d/10">
                  <p className="text-[11px] text-grade-d">Critical</p>
                  <p className="text-lg font-bold text-grade-d">{selected.critical_count || 0}</p>
                </div>
                <div className="bg-grade-c/5 rounded-lg p-2.5 text-center border border-grade-c/10">
                  <p className="text-[11px] text-grade-c">Major</p>
                  <p className="text-lg font-bold text-grade-c">{selected.major_count || 0}</p>
                </div>
                <div className="bg-grade-b/5 rounded-lg p-2.5 text-center border border-grade-b/10">
                  <p className="text-[11px] text-grade-b">Minor</p>
                  <p className="text-lg font-bold text-grade-b">{selected.minor_count || 0}</p>
                </div>
              </div>

              {/* 메타 정보 */}
              <div className="space-y-1.5 mb-4">
                <MetaRow label="분석 모드" value={
                  selected.analysis_mode === 'rule_only' ? 'Rule Only' :
                  selected.analysis_mode === 'rule_and_ai' ? 'Rule + AI' :
                  selected.analysis_mode || '-'
                } />
                <MetaRow label="처리 시간" value={selected.processing_time_ms ? `${selected.processing_time_ms}ms` : '-'} />
                <MetaRow label="분석 시간" value={formatTime(selected.analyzed_at)} />
              </div>

              {/* 위반 목록 */}
              {(() => {
                let violations = [];
                try {
                  violations = typeof selected.violations === 'string'
                    ? JSON.parse(selected.violations || '[]')
                    : (Array.isArray(selected.violations) ? selected.violations : []);
                } catch { violations = []; }
                if (!violations.length) return <p className="text-xs text-text-muted text-center py-3">위반 항목 없음</p>;
                return (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-text-secondary">위반 항목 ({violations.length}건)</p>
                    <div className="max-h-[300px] overflow-y-auto space-y-2 sidebar-scroll">
                      {violations.map((v, i) => (
                        <div key={i} className="p-3 bg-surface rounded-lg border border-border">
                          <div className="flex items-start gap-2">
                            <SeverityBadge severity={v.severity} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-medium text-text-primary">{safe(v.description)}</p>
                                {v.determination && (
                                  <span className={`text-[9px] px-1.5 py-0 rounded-full border font-medium ${
                                    v.determination === 'confirmed' ? 'bg-grade-d/10 text-grade-d border-grade-d/20' :
                                    v.determination === 'ai_verified' ? 'bg-grade-b/10 text-grade-b border-grade-b/20' :
                                    v.determination === 'hitl_required' ? 'bg-grade-d/10 text-grade-d border-grade-d/20' :
                                    'bg-surface text-text-muted border-border'
                                  }`}>
                                    {v.determination === 'confirmed' ? '확정' : v.determination === 'ai_verified' ? 'AI검증' : v.determination === 'hitl_required' ? '검토필요' : v.determination}
                                  </span>
                                )}
                              </div>
                              {v.matchedText && (
                                <p className="text-[11px] text-text-muted mt-0.5">
                                  "<span className="text-grade-d">{safe(v.matchedText)}</span>"
                                </p>
                              )}
                              {v.compositeConfidence != null && (
                                <p className="text-[10px] text-text-muted mt-0.5">
                                  신뢰도 {Math.round(v.compositeConfidence * 100)}%
                                  {v.detectionSource && ` · ${v.detectionSource === 'rule_only' ? 'Rule' : v.detectionSource === 'rule_and_ai' ? 'Rule+AI' : 'AI'}`}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-3xl mb-2">👈</div>
              <p className="text-sm text-text-muted">왼쪽 테이블에서<br />항목을 선택하세요</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniCard({ label, value, icon, danger }) {
  return (
    <div className="bg-card rounded-xl border border-border p-3.5 flex items-center gap-3">
      <span className="text-lg">{icon}</span>
      <div>
        <p className="text-[11px] text-text-muted">{label}</p>
        <p className={`text-lg font-bold ${danger ? 'text-grade-d' : 'text-text-primary'}`}>{value}</p>
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
