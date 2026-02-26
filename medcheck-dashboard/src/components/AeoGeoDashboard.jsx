import React, { useState, useEffect } from 'react';

const API_BASE = 'https://medcheck-engine.mmakid.workers.dev';

// AEO 등급 색상
const GRADE_COLORS = {
  S: { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-300' },
  A: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300' },
  B: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  C: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  D: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  F: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
};

const CATEGORY_META = {
  content: { name: '콘텐츠 품질', icon: '📝', maxScore: 30, color: '#6366f1' },
  technical: { name: '기술 기반', icon: '⚙️', maxScore: 20, color: '#06b6d4' },
  trust: { name: '신뢰도', icon: '🏥', maxScore: 20, color: '#10b981' },
  local: { name: '지역 최적화', icon: '📍', maxScore: 15, color: '#f59e0b' },
  aiFriendly: { name: 'AI 친화성', icon: '🤖', maxScore: 15, color: '#8b5cf6' },
};

function getGrade(score) {
  if (score >= 90) return 'S';
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  if (score >= 45) return 'C';
  if (score >= 30) return 'D';
  return 'F';
}

export default function AeoGeoDashboard() {
  const [url, setUrl] = useState('');
  const [hospitalId, setHospitalId] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [expandedCat, setExpandedCat] = useState(null);

  const handleAnalyze = async () => {
    if (!url) return;
    setAnalyzing(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/v1/aeo/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, hospitalId: hospitalId || url }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error?.message || '분석 실패');
      }
    } catch (e) {
      setError('API 연결 실패: ' + e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const grade = result ? getGrade(result.totalScore) : null;
  const gradeStyle = grade ? GRADE_COLORS[grade] : null;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow">
          AG
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">AG MedCheck</h2>
          <p className="text-sm text-slate-500">AI 검색 노출 경쟁력 분석 (AEO/GEO)</p>
        </div>
      </div>

      {/* 입력 폼 */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-600 mb-1">병원 홈페이지 URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.hospital.com"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
            />
          </div>
          <div className="w-48">
            <label className="block text-sm font-medium text-slate-600 mb-1">병원 ID (선택)</label>
            <input
              type="text"
              value={hospitalId}
              onChange={(e) => setHospitalId(e.target.value)}
              placeholder="hospital-id"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleAnalyze}
              disabled={!url || analyzing}
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium text-sm hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
            >
              {analyzing ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  분석 중...
                </span>
              ) : '분석 시작'}
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            {error}
          </div>
        )}
      </div>

      {/* 결과 */}
      {result && (
        <>
          {/* 총점 카드 */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center ${gradeStyle.bg} border ${gradeStyle.border}`}>
                  <span className={`text-3xl font-black ${gradeStyle.text}`}>{grade}</span>
                </div>
                <div>
                  <p className="text-sm text-slate-500">AI 검색 노출 경쟁력</p>
                  <p className="text-4xl font-bold text-slate-800">{result.totalScore}<span className="text-lg text-slate-400"> / 100</span></p>
                </div>
              </div>
              <div className="text-right text-sm text-slate-400">
                <p>분석 URL: {result.analyzedUrl}</p>
              </div>
            </div>

            {/* 카테고리 바 차트 */}
            <div className="mt-6 space-y-3">
              {Object.entries(CATEGORY_META).map(([key, meta]) => {
                const cat = result.categories[key];
                if (!cat) return null;
                const pct = Math.round((cat.score / cat.maxScore) * 100);
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-lg w-6">{meta.icon}</span>
                    <span className="text-sm text-slate-600 w-28 shrink-0">{meta.name}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-5 relative overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: meta.color }}
                      />
                    </div>
                    <span className="text-sm font-semibold w-20 text-right" style={{ color: meta.color }}>
                      {cat.score}/{cat.maxScore}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 카테고리 상세 */}
          <div className="grid grid-cols-1 gap-4">
            {Object.entries(CATEGORY_META).map(([key, meta]) => {
              const cat = result.categories[key];
              if (!cat) return null;
              const isExpanded = expandedCat === key;
              return (
                <div key={key} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <button
                    onClick={() => setExpandedCat(isExpanded ? null : key)}
                    className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{meta.icon}</span>
                      <span className="font-semibold text-slate-700">{meta.name}</span>
                      <span className="text-sm px-2 py-0.5 rounded-full" style={{ backgroundColor: meta.color + '20', color: meta.color }}>
                        {cat.score}/{cat.maxScore}점
                      </span>
                    </div>
                    <span className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3">
                      {cat.items.map((item, idx) => (
                        <div key={idx} className="p-3 bg-slate-50 rounded-xl">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium text-slate-700">{item.name}</span>
                            <span className={`text-sm font-bold ${item.score >= item.maxScore * 0.7 ? 'text-emerald-600' : item.score >= item.maxScore * 0.4 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {item.score}/{item.maxScore}
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-1.5 mb-2">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${(item.score / item.maxScore) * 100}%`,
                                backgroundColor: item.score >= item.maxScore * 0.7 ? '#10b981' : item.score >= item.maxScore * 0.4 ? '#f59e0b' : '#ef4444',
                              }}
                            />
                          </div>
                          <p className="text-xs text-slate-500">{item.evidence}</p>
                          {item.recommendation && (
                            <p className="text-xs text-indigo-600 mt-1">💡 {item.recommendation}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 개선 추천 */}
          {result.recommendations && result.recommendations.length > 0 && (
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-200">
              <h3 className="font-bold text-indigo-800 mb-3 flex items-center gap-2">
                <span>💡</span> 우선 개선 추천
              </h3>
              <ul className="space-y-2">
                {result.recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-indigo-700">
                    <span className="w-5 h-5 bg-indigo-200 text-indigo-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{idx + 1}</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
