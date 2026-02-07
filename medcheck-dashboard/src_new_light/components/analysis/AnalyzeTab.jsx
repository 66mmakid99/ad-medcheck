import { useState } from 'react';
import { useApp } from '../../contexts/AppContext';

// 등급별 색상 (라이트 테마)
const gradeColors = {
  S: { bg: '#06b6d4', light: '#ecfeff', text: '#0891b2', glow: 'shadow-cyan-200' },
  A: { bg: '#10b981', light: '#ecfdf5', text: '#059669', glow: 'shadow-emerald-200' },
  B: { bg: '#3b82f6', light: '#eff6ff', text: '#2563eb', glow: 'shadow-blue-200' },
  C: { bg: '#eab308', light: '#fefce8', text: '#ca8a04', glow: 'shadow-yellow-200' },
  D: { bg: '#f97316', light: '#fff7ed', text: '#ea580c', glow: 'shadow-orange-200' },
  F: { bg: '#ef4444', light: '#fef2f2', text: '#dc2626', glow: 'shadow-red-200' },
};

const weatherEmojis = { S: '☀️', A: '🌤️', B: '⛅', C: '🌥️', D: '🌧️', F: '⛈️' };

const severityColors = {
  critical: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
  high: { bg: '#fff7ed', text: '#ea580c', border: '#fed7aa' },
  medium: { bg: '#fefce8', text: '#ca8a04', border: '#fef08a' },
  low: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
};

export default function AnalyzeTab() {
  const { state, actions } = useApp();
  const { analysisResults, apiUrl } = state;
  const { single, batch } = analysisResults;
  
  const [mode, setMode] = useState('url');
  const [input, setInput] = useState('');
  const [batchUrls, setBatchUrls] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  
  // 단일 분석
  const handleAnalyze = async () => {
    if (!input.trim()) return;
    setAnalyzing(true);
    setError(null);
    
    try {
      let result;
      if (mode === 'url') {
        const response = await fetch(`${apiUrl}/v1/analyze-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: input.trim() }),
        });
        if (!response.ok) throw new Error('분석 실패');
        result = await response.json();
        result.url = input.trim();
      } else {
        const response = await fetch(`${apiUrl}/v1/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: input.trim() }),
        });
        if (!response.ok) throw new Error('분석 실패');
        result = await response.json();
        result.url = '텍스트 직접 입력';
      }
      
      actions.setSingleResult(result);
      actions.addToHistory({ ...result, analyzedAt: new Date().toISOString() });
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };
  
  // 배치 분석
  const handleBatchAnalyze = async () => {
    const urls = batchUrls.split('\n').map(u => u.trim()).filter(u => u);
    if (urls.length === 0) return;
    
    setAnalyzing(true);
    setError(null);
    setBatchProgress({ current: 0, total: urls.length });
    
    for (let i = 0; i < urls.length; i++) {
      setBatchProgress({ current: i + 1, total: urls.length });
      
      try {
        const response = await fetch(`${apiUrl}/v1/analyze-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urls[i] }),
        });
        
        if (!response.ok) throw new Error('분석 실패');
        const result = await response.json();
        
        actions.addBatchResult({
          url: urls[i],
          result,
          status: 'success',
          analyzedAt: new Date().toISOString(),
        });
      } catch (err) {
        actions.addBatchResult({
          url: urls[i],
          result: null,
          status: 'error',
          error: err.message,
          analyzedAt: new Date().toISOString(),
        });
      }
      
      if (i < urls.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    
    setAnalyzing(false);
    setBatchProgress({ current: 0, total: 0 });
  };
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 좌측: 입력 영역 */}
      <div className="space-y-4">
        {/* 모드 선택 */}
        <div className="flex gap-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm">
          {[
            { id: 'url', label: '🔗 URL 분석' },
            { id: 'text', label: '📝 텍스트' },
            { id: 'batch', label: '📊 배치' },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                mode === m.id
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        
        {/* 입력 폼 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          {mode === 'batch' ? (
            <>
              <label className="block text-slate-700 font-medium mb-2">
                URL 목록 (한 줄에 하나씩)
              </label>
              <textarea
                value={batchUrls}
                onChange={(e) => setBatchUrls(e.target.value)}
                placeholder="https://example.com/page1&#10;https://example.com/page2"
                className="w-full h-48 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
              />
              <p className="text-slate-500 text-sm mt-2">
                {batchUrls.split('\n').filter(u => u.trim()).length}개 URL 입력됨
              </p>
            </>
          ) : (
            <>
              <label className="block text-slate-700 font-medium mb-2">
                {mode === 'url' ? '분석할 URL' : '분석할 텍스트'}
              </label>
              {mode === 'url' ? (
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="https://example.com/ad-page"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                />
              ) : (
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="분석할 광고 문구를 입력하세요..."
                  className="w-full h-48 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
                />
              )}
            </>
          )}
          
          <button
            onClick={mode === 'batch' ? handleBatchAnalyze : handleAnalyze}
            disabled={analyzing}
            className={`w-full mt-4 py-3.5 rounded-xl font-medium transition-all ${
              analyzing
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-200'
            }`}
          >
            {analyzing ? (
              mode === 'batch' ? `분석 중... ${batchProgress.current}/${batchProgress.total}` : '분석 중...'
            ) : (
              '🔍 분석하기'
            )}
          </button>
          
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
              ⚠️ {error}
            </div>
          )}
        </div>
        
        {/* 배치 결과 목록 */}
        {batch.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-slate-800 font-bold">배치 결과 ({batch.length}건)</h4>
              <button
                onClick={() => actions.clearBatchResults()}
                className="text-slate-400 hover:text-red-500 text-sm"
              >
                🗑️ 초기화
              </button>
            </div>
            
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {batch.map((item, index) => {
                const grade = item.result?.grade || 'F';
                const colors = gradeColors[grade];
                return (
                  <button
                    key={index}
                    onClick={() => item.result && actions.setSingleResult({ ...item.result, url: item.url })}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                      item.status === 'error'
                        ? 'bg-red-50 border border-red-200'
                        : 'bg-slate-50 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {item.status === 'error' ? (
                      <span className="text-red-500">❌</span>
                    ) : (
                      <span 
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: colors.bg }}
                      >
                        {grade}
                      </span>
                    )}
                    <span className="text-slate-700 text-sm truncate flex-1">{item.url}</span>
                    {item.result && (
                      <span className="text-slate-500 text-xs">{item.result.cleanScore}점</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      
      {/* 우측: 결과 영역 */}
      <div>
        {single ? (
          <ResultPanel result={single} actions={actions} />
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center h-full flex flex-col items-center justify-center">
            <div className="text-6xl mb-4">📋</div>
            <h4 className="text-xl font-bold text-slate-800 mb-2">분석 결과가 여기에 표시됩니다</h4>
            <p className="text-slate-500">URL이나 텍스트를 입력하고 분석하기 버튼을 누르세요</p>
          </div>
        )}
      </div>
    </div>
  );
}

// 결과 패널
function ResultPanel({ result, actions }) {
  const grade = result.grade || 'F';
  const colors = gradeColors[grade];
  const weather = weatherEmojis[grade];
  const violations = result.violations || [];
  
  return (
    <div className="space-y-4">
      {/* 등급 카드 */}
      <div 
        className={`rounded-2xl p-6 shadow-lg ${colors.glow}`}
        style={{ backgroundColor: colors.light, borderColor: colors.bg, borderWidth: 2 }}
      >
        <div className="flex items-center gap-6">
          <div 
            className="w-24 h-24 rounded-2xl flex items-center justify-center text-white"
            style={{ backgroundColor: colors.bg }}
          >
            <span className="text-5xl font-bold">{grade}</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-3xl">{weather}</span>
              <span className="text-lg font-medium" style={{ color: colors.text }}>
                {result.gradeInfo?.status || '분석 완료'}
              </span>
            </div>
            <p className="text-slate-600 text-sm mb-3 truncate">{result.url}</p>
            <div className="flex items-center gap-6">
              <div>
                <span className="text-slate-500 text-sm">청정지수</span>
                <p className="text-2xl font-bold" style={{ color: colors.text }}>{result.cleanScore}점</p>
              </div>
              <div>
                <span className="text-slate-500 text-sm">위반</span>
                <p className="text-2xl font-bold text-slate-800">{violations.length}건</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* 위반 목록 */}
      {violations.length > 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-slate-800 font-bold">발견된 위반 ({violations.length}건)</h4>
            <button
              onClick={() => actions.setTab('violations')}
              className="text-blue-500 hover:text-blue-600 text-sm"
            >
              상세보기 →
            </button>
          </div>
          
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {violations.slice(0, 10).map((v, i) => (
              <ViolationCard key={i} violation={v} />
            ))}
            {violations.length > 10 && (
              <p className="text-slate-400 text-center py-2">+{violations.length - 10}건 더 있음</p>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
          <div className="text-4xl mb-2">✨</div>
          <p className="text-emerald-600 font-medium">위반 사항이 없습니다!</p>
          <p className="text-slate-500 text-sm mt-1">깨끗한 광고입니다</p>
        </div>
      )}
    </div>
  );
}

// 위반 카드
function ViolationCard({ violation }) {
  const severity = violation.severity || 'medium';
  const colors = severityColors[severity];
  const labels = { critical: '심각', high: '높음', medium: '중간', low: '낮음' };
  
  return (
    <div 
      className="p-4 rounded-xl border"
      style={{ backgroundColor: colors.bg, borderColor: colors.border }}
    >
      <div className="flex items-start gap-3">
        <span 
          className="px-2 py-0.5 rounded text-xs font-medium"
          style={{ backgroundColor: 'white', color: colors.text }}
        >
          {labels[severity]}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-slate-800 font-medium">{violation.category}</p>
          <p className="text-slate-600 text-sm mt-1">"{violation.matched}"</p>
          {violation.suggestion && (
            <p className="text-blue-600 text-sm mt-2">💡 {violation.suggestion}</p>
          )}
        </div>
      </div>
    </div>
  );
}
