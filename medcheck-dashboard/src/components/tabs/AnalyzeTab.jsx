import { useState } from 'react';
import { API_BASE } from '../../lib/config';
import SeverityBadge from '../ui/SeverityBadge';

export default function AnalyzeTab() {
  const [mode, setMode] = useState('url'); // 'url' | 'text'
  const [url, setUrl] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [text, setText] = useState('');
  const [enableAI, setEnableAI] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const analyze = async () => {
    if (mode === 'url' && !url.trim()) return;
    if (mode === 'text' && !text.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      if (mode === 'url') {
        const res = await fetch(`${API_BASE}/v1/analyze-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: url.trim(),
            hospitalName: hospitalName.trim() || undefined,
            enableAI,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setResult({
            grade: data.data.grade,
            cleanScore: data.data.cleanScore,
            violationCount: data.data.violationCount,
            violations: data.data.violations || [],
            analysisMode: data.data.analysisMode,
            processingTime: data.data.processingTimeMs,
            saved: data.data.saved,
          });
        } else {
          setResult({ error: data.error?.message || '분석 실패' });
        }
      } else {
        const res = await fetch(`${API_BASE}/v1/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, enableAI, options: { detailed: true } }),
        });
        const data = await res.json();
        if (data.success) {
          setResult({
            grade: data.data.grade,
            cleanScore: data.data.score?.cleanScore,
            violationCount: data.data.violationCount,
            violations: data.data.violations || [],
            analysisMode: data.data.analysisMode || 'pattern',
          });
        } else {
          setResult({ error: data.error?.message || '분석 실패' });
        }
      }
    } catch (e) {
      console.error(e);
      setResult({ error: '네트워크 오류: ' + e.message });
    }
    setLoading(false);
  };

  const GRADE_COLORS = {
    S: 'bg-grade-s/10 border-grade-s/30 text-grade-s',
    A: 'bg-grade-a/10 border-grade-a/30 text-grade-a',
    B: 'bg-grade-b/10 border-grade-b/30 text-grade-b',
    C: 'bg-grade-c/10 border-grade-c/30 text-grade-c',
    D: 'bg-grade-d/10 border-grade-d/30 text-grade-d',
    F: 'bg-grade-f/10 border-grade-f/30 text-grade-f',
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-1">분석하기</h2>
      <p className="text-sm text-text-secondary mb-6">URL 또는 텍스트를 입력하여 의료광고 위반 여부를 분석합니다</p>

      <div className="grid grid-cols-3 gap-5">
        {/* 좌측: 입력 영역 */}
        <div className="col-span-2 space-y-4">
          <div className="bg-card rounded-xl border border-border p-5">
            {/* 모드 토글 */}
            <div className="flex gap-2 mb-4">
              <button onClick={() => setMode('url')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'url' ? 'bg-accent text-white' : 'bg-surface text-text-secondary hover:bg-border'}`}>
                🌐 URL 분석
              </button>
              <button onClick={() => setMode('text')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'text' ? 'bg-accent text-white' : 'bg-surface text-text-secondary hover:bg-border'}`}>
                📝 텍스트 분석
              </button>
            </div>

            {mode === 'url' ? (
              <div className="space-y-3">
                <input
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://example-hospital.com"
                  className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
                <input
                  value={hospitalName}
                  onChange={e => setHospitalName(e.target.value)}
                  placeholder="병원명 (선택 — Supabase 저장 시 사용)"
                  className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
              </div>
            ) : (
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="분석할 광고 텍스트를 입력하세요..."
                className="w-full h-36 bg-surface border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            )}

            <div className="flex items-center justify-between mt-4">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableAI}
                  onChange={e => setEnableAI(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-accent focus:ring-accent/30"
                />
                <span className="text-sm text-text-secondary">Gemini AI 분석</span>
              </label>
              <button
                onClick={analyze}
                disabled={loading || (mode === 'url' ? !url.trim() : !text.trim())}
                className="px-5 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? '분석 중...' : '분석하기'}
              </button>
            </div>
          </div>

          {/* 위반 상세 */}
          {result?.violations?.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-5">
              <h4 className="text-sm font-semibold text-text-primary mb-3">
                위반 내역 ({result.violations.length}건)
              </h4>
              <div className="space-y-2.5">
                {result.violations.map((v, i) => (
                  <div key={i} className="p-3.5 bg-surface rounded-lg border border-border">
                    <div className="flex items-start gap-2.5">
                      <SeverityBadge severity={v.severity} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary">{v.description}</p>
                        {v.matchedText && (
                          <p className="text-xs text-text-secondary mt-1">
                            발견: "<span className="text-grade-d font-medium">{v.matchedText}</span>"
                          </p>
                        )}
                        {v.suggestion && (
                          <p className="text-xs text-accent mt-1.5">💡 {v.suggestion}</p>
                        )}
                        {v.legalBasis && (
                          <p className="text-[11px] text-text-muted mt-1">📜 {v.legalBasis}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 우측: 결과 패널 */}
        <div className="bg-card rounded-xl border border-border p-5 h-fit">
          {result && !result.error ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-text-primary">분석 결과</h4>
                <span className="text-[11px] text-text-muted">
                  {result.analysisMode === 'gemini' ? '🤖 Gemini' : '📋 Pattern'}
                </span>
              </div>

              <div className={`text-center py-6 rounded-xl border ${GRADE_COLORS[result.grade] || 'bg-surface border-border'}`}>
                <p className="text-5xl font-bold">{result.grade}</p>
                <p className="text-sm mt-1 opacity-70">등급</p>
              </div>

              <div className="mt-4 space-y-2">
                <ResultRow label="청정지수" value={`${result.cleanScore ?? '-'}점`} />
                <ResultRow label="위반 항목" value={`${result.violationCount || 0}건`} danger={result.violationCount > 0} />
                {result.processingTime && (
                  <ResultRow label="처리 시간" value={`${result.processingTime}ms`} />
                )}
                {result.saved !== undefined && (
                  <ResultRow label="Supabase 저장" value={result.saved ? '✅ 저장됨' : '❌ 미저장'} />
                )}
              </div>
            </div>
          ) : result?.error ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">❌</div>
              <p className="text-sm text-grade-d">{result.error}</p>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">🔍</div>
              <p className="text-sm text-text-muted">
                {mode === 'url' ? 'URL을 입력하고' : '텍스트를 입력하고'}<br />분석 버튼을 누르세요
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultRow({ label, value, danger }) {
  return (
    <div className="flex justify-between items-center p-2.5 bg-surface rounded-lg">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className={`text-sm font-semibold ${danger ? 'text-grade-d' : 'text-text-primary'}`}>{value}</span>
    </div>
  );
}
