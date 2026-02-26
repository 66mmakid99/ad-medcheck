import React, { useState } from 'react';

const API_BASE = 'https://medcheck-engine.mmakid.workers.dev';

const GRADE_COLORS = {
  S: { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-300' },
  A: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300' },
  B: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  C: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  D: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  F: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
};

function getGrade(score) {
  if (score >= 85) return 'S';
  if (score >= 70) return 'A';
  if (score >= 55) return 'B';
  if (score >= 40) return 'C';
  if (score >= 25) return 'D';
  return 'F';
}

function formatWon(amount) {
  if (!amount) return '0원';
  if (amount >= 10000) return `${Math.round(amount / 10000)}만원`;
  return `${amount.toLocaleString()}원`;
}

export default function ViralDashboard() {
  const [url, setUrl] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [expandedItem, setExpandedItem] = useState(null);

  const handleAnalyze = async () => {
    if (!url) return;
    setAnalyzing(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/v1/viral/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, hospitalName: hospitalName || undefined, hospitalId: hospitalName || url }),
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
  const activeChannels = result?.snsChannels?.filter(c => c.detected) || [];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow">
          VR
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Viral MedCheck</h2>
          <p className="text-sm text-slate-500">온라인 마케팅 현황 분석</p>
        </div>
      </div>

      {/* 입력 폼 */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-600 mb-1">병원 홈페이지 URL</label>
            <input
              type="text" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.hospital.com"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-300 focus:border-rose-400 outline-none"
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
            />
          </div>
          <div className="w-48">
            <label className="block text-sm font-medium text-slate-600 mb-1">병원명 (선택)</label>
            <input
              type="text" value={hospitalName} onChange={(e) => setHospitalName(e.target.value)}
              placeholder="OO피부과"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-300 focus:border-rose-400 outline-none"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleAnalyze} disabled={!url || analyzing}
              className="px-6 py-2.5 bg-gradient-to-r from-pink-500 to-rose-600 text-white rounded-xl font-medium text-sm hover:from-pink-600 hover:to-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
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
        {error && <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}
      </div>

      {/* 결과 */}
      {result && (
        <>
          {/* 총점 + 핵심 수치 */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 col-span-1">
              <p className="text-sm text-slate-500 mb-2">마케팅 점수</p>
              <div className={`w-16 h-16 rounded-xl flex flex-col items-center justify-center ${gradeStyle.bg} border ${gradeStyle.border} mx-auto`}>
                <span className={`text-2xl font-black ${gradeStyle.text}`}>{grade}</span>
              </div>
              <p className="text-center text-2xl font-bold text-slate-800 mt-2">{result.totalScore}<span className="text-sm text-slate-400">/100</span></p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
              <p className="text-sm text-slate-500 mb-1">블로그 게시물</p>
              <p className="text-3xl font-bold text-blue-600">{result.blogCount}</p>
              <p className="text-xs text-slate-400">홈페이지 내 발견</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
              <p className="text-sm text-slate-500 mb-1">SNS 채널</p>
              <p className="text-3xl font-bold text-purple-600">{activeChannels.length}</p>
              <p className="text-xs text-slate-400">{activeChannels.map(c => c.platform).join(', ') || '-'}</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
              <p className="text-sm text-slate-500 mb-1">추정 마케팅비</p>
              <p className="text-3xl font-bold text-rose-600">{formatWon(result.estimatedAdSpend)}</p>
              <p className="text-xs text-slate-400">월 추정치</p>
            </div>
          </div>

          {/* 항목별 상세 */}
          <div className="space-y-3">
            {result.items?.map((item, idx) => {
              const pct = Math.round((item.score / item.maxScore) * 100);
              const color = pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444';
              return (
                <div key={idx} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <button
                    onClick={() => setExpandedItem(expandedItem === idx ? null : idx)}
                    className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <span className="font-medium text-slate-700">{item.name}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-3 max-w-xs">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                      <span className="text-sm font-bold" style={{ color }}>{item.score}/{item.maxScore}</span>
                    </div>
                    <span className={`ml-3 text-slate-400 transition-transform ${expandedItem === idx ? 'rotate-180' : ''}`}>▼</span>
                  </button>
                  {expandedItem === idx && (
                    <div className="px-4 pb-4">
                      <p className="text-sm text-slate-600">{item.evidence}</p>
                      {item.recommendation && <p className="text-sm text-rose-600 mt-1">💡 {item.recommendation}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* SNS 채널 */}
          {result.snsChannels && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
              <h3 className="font-bold text-slate-700 mb-3">SNS 채널 현황</h3>
              <div className="grid grid-cols-3 gap-3">
                {result.snsChannels.map((ch, idx) => (
                  <div key={idx} className={`p-3 rounded-xl border ${ch.detected ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${ch.detected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <span className={`text-sm font-medium ${ch.detected ? 'text-emerald-700' : 'text-slate-400'}`}>{ch.platform}</span>
                    </div>
                    {ch.detected && ch.url && <p className="text-xs text-emerald-600 mt-1 truncate">{ch.url}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 개선 추천 */}
          {result.recommendations?.length > 0 && (
            <div className="bg-gradient-to-br from-rose-50 to-pink-50 rounded-2xl p-6 border border-rose-200">
              <h3 className="font-bold text-rose-800 mb-3 flex items-center gap-2">
                <span>💡</span> 마케팅 개선 추천
              </h3>
              <ul className="space-y-2">
                {result.recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-rose-700">
                    <span className="w-5 h-5 bg-rose-200 text-rose-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{idx + 1}</span>
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
