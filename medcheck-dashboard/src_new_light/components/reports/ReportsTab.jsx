import { useState } from 'react';
import { useApp } from '../../contexts/AppContext';

const gradeColors = {
  S: '#06b6d4', A: '#10b981', B: '#3b82f6',
  C: '#eab308', D: '#f97316', F: '#ef4444',
};

export default function ReportsTab() {
  const { state, actions } = useApp();
  const { analysisResults, user } = state;
  const { single, batch } = analysisResults;
  
  const [generating, setGenerating] = useState(false);
  const [reportType, setReportType] = useState('single');
  
  const hasSingleResult = !!single;
  const hasBatchResult = batch.length > 0;
  const hasAnyResult = hasSingleResult || hasBatchResult;
  
  const generatePdf = async () => {
    setGenerating(true);
    try {
      const content = generateReportHtml();
      const win = window.open('', '_blank');
      win.document.write(content);
      win.document.close();
      setTimeout(() => win.print(), 500);
    } catch (err) {
      alert('PDF 생성 중 오류: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };
  
  const generateReportHtml = () => {
    const now = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
    
    let resultsHtml = '';
    if (reportType === 'single' && single) {
      resultsHtml = generateSingleResultHtml(single);
    } else if (reportType === 'batch' && batch.length > 0) {
      resultsHtml = batch.map(item => 
        item.result ? generateSingleResultHtml({ ...item.result, url: item.url }) : ''
      ).join('<div style="page-break-after: always;"></div>');
    } else if (reportType === 'summary') {
      resultsHtml = generateSummaryHtml();
    }
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>MADMEDCHECK 분석 리포트</title>
        <style>
          @page { margin: 20mm; }
          body { font-family: 'Pretendard', sans-serif; color: #1e293b; max-width: 800px; margin: 0 auto; padding: 40px; }
          .header { text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 20px; margin-bottom: 30px; }
          .logo { font-size: 24px; font-weight: bold; color: #3b82f6; }
          .grade-badge { width: 60px; height: 60px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; color: white; font-size: 24px; font-weight: bold; }
          .violation { padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">MADMEDCHECK</div>
          <p style="color: #64748b; margin: 8px 0 0;">의료광고 컴플라이언스 분석 리포트</p>
        </div>
        <div style="display: flex; justify-content: space-between; background: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
          <div><span style="color: #64748b; font-size: 12px;">분석일</span><br><strong>${now}</strong></div>
          <div><span style="color: #64748b; font-size: 12px;">의뢰처</span><br><strong>${user.hospital}</strong></div>
          <div><span style="color: #64748b; font-size: 12px;">리포트</span><br><strong>${reportType === 'single' ? '단일' : reportType === 'batch' ? '배치' : '요약'}</strong></div>
        </div>
        ${resultsHtml}
        <div style="margin-top: 40px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
          © 2026 MADMEDCHECK by MMAKID
        </div>
      </body>
      </html>
    `;
  };
  
  const generateSingleResultHtml = (result) => {
    const grade = result.grade || 'F';
    const violations = result.violations || [];
    return `
      <div style="display: flex; align-items: center; gap: 16px; padding: 16px; background: #f8fafc; border-radius: 12px; margin-bottom: 24px;">
        <div class="grade-badge" style="background: ${gradeColors[grade]}">${grade}</div>
        <div>
          <strong style="font-size: 16px;">${result.url || '텍스트 분석'}</strong>
          <p style="margin: 4px 0 0; color: #64748b;">청정지수 ${result.cleanScore}점 · 위반 ${violations.length}건</p>
        </div>
      </div>
      ${violations.length > 0 ? `
        <h3>발견된 위반 (${violations.length}건)</h3>
        ${violations.map(v => `
          <div class="violation">
            <strong>${v.category}</strong>
            <span style="float: right; font-size: 12px; color: ${v.severity === 'critical' ? '#ef4444' : v.severity === 'high' ? '#f97316' : '#eab308'}">
              ${v.severity === 'critical' ? '심각' : v.severity === 'high' ? '높음' : v.severity === 'medium' ? '중간' : '낮음'}
            </span>
            <p style="margin: 8px 0 0; color: #475569;">"${v.matched}"</p>
          </div>
        `).join('')}
      ` : '<p style="text-align: center; color: #10b981;">✨ 위반 사항이 없습니다</p>'}
    `;
  };
  
  const generateSummaryHtml = () => {
    const allResults = [...(single ? [single] : []), ...batch.filter(b => b.result).map(b => b.result)];
    const avg = Math.round(allResults.reduce((s, r) => s + (r.cleanScore || 0), 0) / allResults.length) || 0;
    const total = allResults.reduce((s, r) => s + (r.violations?.length || 0), 0);
    return `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; text-align: center; margin-bottom: 24px;">
        <div style="padding: 20px; background: #eff6ff; border-radius: 12px;">
          <div style="font-size: 32px; font-weight: bold; color: #3b82f6;">${allResults.length}</div>
          <div style="color: #64748b;">분석 건수</div>
        </div>
        <div style="padding: 20px; background: #ecfdf5; border-radius: 12px;">
          <div style="font-size: 32px; font-weight: bold; color: #10b981;">${avg}점</div>
          <div style="color: #64748b;">평균 청정지수</div>
        </div>
        <div style="padding: 20px; background: #fff7ed; border-radius: 12px;">
          <div style="font-size: 32px; font-weight: bold; color: #f97316;">${total}</div>
          <div style="color: #64748b;">총 위반</div>
        </div>
      </div>
    `;
  };
  
  return (
    <div className="space-y-6">
      {/* 리포트 유형 선택 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { id: 'single', icon: '📄', title: '단일 리포트', desc: '최근 분석 결과', disabled: !hasSingleResult },
          { id: 'batch', icon: '📊', title: '배치 리포트', desc: `${batch.length}건 결과`, disabled: !hasBatchResult },
          { id: 'summary', icon: '📋', title: '요약 리포트', desc: '전체 현황', disabled: !hasAnyResult },
        ].map((r) => (
          <button
            key={r.id}
            onClick={() => !r.disabled && setReportType(r.id)}
            disabled={r.disabled}
            className={`p-6 rounded-2xl border-2 text-left transition-all shadow-sm ${
              r.disabled
                ? 'bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed'
                : reportType === r.id
                  ? 'bg-blue-50 border-blue-400 shadow-md'
                  : 'bg-white border-slate-200 hover:border-blue-300'
            }`}
          >
            <span className="text-3xl mb-3 block">{r.icon}</span>
            <h4 className="text-slate-800 font-bold">{r.title}</h4>
            <p className="text-slate-500 text-sm mt-1">{r.desc}</p>
          </button>
        ))}
      </div>
      
      {/* 리포트 미리보기 */}
      {hasAnyResult ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h4 className="text-slate-800 font-bold text-lg">리포트 미리보기</h4>
            <button
              onClick={generatePdf}
              disabled={generating}
              className={`px-6 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 ${
                generating
                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-200'
              }`}
            >
              {generating ? '생성 중...' : '📥 PDF 다운로드'}
            </button>
          </div>
          
          {/* 미리보기 영역 */}
          <div className="bg-slate-50 rounded-xl p-8 border border-slate-200">
            {reportType === 'single' && single && <PreviewSingle result={single} />}
            {reportType === 'batch' && batch.length > 0 && <PreviewBatch results={batch} />}
            {reportType === 'summary' && <PreviewSummary single={single} batch={batch} />}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
          <div className="text-6xl mb-4">📋</div>
          <h4 className="text-xl font-bold text-slate-800 mb-2">리포트를 생성하려면 먼저 분석하세요</h4>
          <p className="text-slate-500 mb-6">URL이나 텍스트를 분석한 후 리포트를 생성할 수 있습니다</p>
          <button
            onClick={() => actions.setTab('analyze')}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl transition-colors shadow-lg shadow-blue-200"
          >
            🔍 분석하러 가기
          </button>
        </div>
      )}
    </div>
  );
}

function PreviewSingle({ result }) {
  return (
    <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200">
      <div className="w-14 h-14 rounded-xl flex items-center justify-center text-white text-xl font-bold" style={{ background: gradeColors[result.grade] }}>
        {result.grade}
      </div>
      <div>
        <p className="font-bold text-slate-800">{result.url || '텍스트 분석'}</p>
        <p className="text-slate-500 text-sm">청정지수 {result.cleanScore}점 · 위반 {result.violations?.length || 0}건</p>
      </div>
    </div>
  );
}

function PreviewBatch({ results }) {
  const success = results.filter(r => r.status === 'success');
  return (
    <div className="space-y-2">
      <p className="font-bold text-slate-800 mb-4">배치 분석 결과 ({success.length}건)</p>
      {success.slice(0, 4).map((item, i) => (
        <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200">
          <span className="w-7 h-7 rounded flex items-center justify-center text-white text-xs font-bold" style={{ background: gradeColors[item.result?.grade] }}>
            {item.result?.grade}
          </span>
          <span className="flex-1 truncate text-sm text-slate-700">{item.url}</span>
          <span className="text-slate-500 text-xs">{item.result?.cleanScore}점</span>
        </div>
      ))}
      {success.length > 4 && <p className="text-slate-400 text-sm text-center">+{success.length - 4}건 더...</p>}
    </div>
  );
}

function PreviewSummary({ single, batch }) {
  const all = [...(single ? [single] : []), ...batch.filter(b => b.result).map(b => b.result)];
  const avg = Math.round(all.reduce((s, r) => s + (r.cleanScore || 0), 0) / all.length) || 0;
  return (
    <div className="grid grid-cols-3 gap-4 text-center">
      <div className="p-4 bg-blue-50 rounded-xl">
        <p className="text-2xl font-bold text-blue-600">{all.length}</p>
        <p className="text-slate-500 text-sm">분석 건수</p>
      </div>
      <div className="p-4 bg-emerald-50 rounded-xl">
        <p className="text-2xl font-bold text-emerald-600">{avg}점</p>
        <p className="text-slate-500 text-sm">평균 점수</p>
      </div>
      <div className="p-4 bg-orange-50 rounded-xl">
        <p className="text-2xl font-bold text-orange-600">{all.reduce((s, r) => s + (r.violations?.length || 0), 0)}</p>
        <p className="text-slate-500 text-sm">총 위반</p>
      </div>
    </div>
  );
}
