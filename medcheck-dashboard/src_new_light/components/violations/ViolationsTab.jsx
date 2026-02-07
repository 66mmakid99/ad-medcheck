import { useState } from 'react';
import { useApp } from '../../contexts/AppContext';

const severityColors = {
  critical: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca', badge: '#ef4444' },
  high: { bg: '#fff7ed', text: '#ea580c', border: '#fed7aa', badge: '#f97316' },
  medium: { bg: '#fefce8', text: '#ca8a04', border: '#fef08a', badge: '#eab308' },
  low: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe', badge: '#3b82f6' },
};

const severityLabels = { critical: '심각', high: '높음', medium: '중간', low: '낮음' };
const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

export default function ViolationsTab() {
  const { state, actions } = useApp();
  const { analysisResults } = state;
  const { single, batch } = analysisResults;
  
  // 모든 위반 수집
  const allViolations = [];
  
  if (single?.violations) {
    single.violations.forEach((v, i) => {
      allViolations.push({
        ...v,
        source: single.url || '텍스트 분석',
        sourceType: 'single',
        id: `single-${i}`,
      });
    });
  }
  
  batch.forEach((item, batchIndex) => {
    if (item.result?.violations) {
      item.result.violations.forEach((v, i) => {
        allViolations.push({
          ...v,
          source: item.url,
          sourceType: 'batch',
          id: `batch-${batchIndex}-${i}`,
        });
      });
    }
  });
  
  const [severityFilter, setSeverityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedViolation, setSelectedViolation] = useState(null);
  
  // 필터링
  let filteredViolations = allViolations;
  
  if (severityFilter !== 'all') {
    filteredViolations = filteredViolations.filter(v => v.severity === severityFilter);
  }
  
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredViolations = filteredViolations.filter(v =>
      v.category?.toLowerCase().includes(query) ||
      v.matched?.toLowerCase().includes(query) ||
      v.source?.toLowerCase().includes(query)
    );
  }
  
  filteredViolations.sort((a, b) => 
    (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99)
  );
  
  const stats = allViolations.reduce((acc, v) => {
    acc[v.severity] = (acc[v.severity] || 0) + 1;
    return acc;
  }, {});
  
  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          label="전체"
          count={allViolations.length}
          color="slate"
          active={severityFilter === 'all'}
          onClick={() => setSeverityFilter('all')}
        />
        {['critical', 'high', 'medium', 'low'].map(sev => (
          <StatCard
            key={sev}
            label={severityLabels[sev]}
            count={stats[sev] || 0}
            color={sev}
            active={severityFilter === sev}
            onClick={() => setSeverityFilter(sev)}
          />
        ))}
      </div>
      
      {/* 검색 */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="위반 내용 또는 URL 검색..."
          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 pl-10 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 shadow-sm"
        />
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
      </div>
      
      {/* 위반 없을 때 */}
      {allViolations.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
          <div className="text-6xl mb-4">✨</div>
          <h4 className="text-xl font-bold text-slate-800 mb-2">발견된 위반이 없어요</h4>
          <p className="text-slate-500 mb-6">분석 결과에 위반 사항이 없거나, 아직 분석을 하지 않았어요</p>
          <button
            onClick={() => actions.setTab('analyze')}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl transition-colors shadow-lg shadow-blue-200"
          >
            🔍 분석하러 가기
          </button>
        </div>
      )}
      
      {/* 위반 목록 */}
      {filteredViolations.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 위반 목록 */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h4 className="text-slate-800 font-bold mb-4">
              위반 목록 ({filteredViolations.length}건)
            </h4>
            
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {filteredViolations.map((violation) => (
                <ViolationItem
                  key={violation.id}
                  violation={violation}
                  selected={selectedViolation?.id === violation.id}
                  onClick={() => setSelectedViolation(violation)}
                />
              ))}
            </div>
          </div>
          
          {/* 상세 정보 */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            {selectedViolation ? (
              <ViolationDetail 
                violation={selectedViolation}
                onOpenHighlight={() => openHighlightViewer(selectedViolation)}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-12">
                <div className="text-5xl mb-4">👈</div>
                <p className="text-slate-500">위반 항목을 선택하면<br/>상세 정보가 표시됩니다</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// 통계 카드
function StatCard({ label, count, color, active, onClick }) {
  const colorMap = {
    slate: { bg: 'bg-slate-100', border: 'border-slate-300', text: 'text-slate-700', activeBg: 'bg-slate-200' },
    critical: { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-600', activeBg: 'bg-red-100' },
    high: { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-600', activeBg: 'bg-orange-100' },
    medium: { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-600', activeBg: 'bg-yellow-100' },
    low: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-600', activeBg: 'bg-blue-100' },
  };
  
  const colors = colorMap[color];
  
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-xl border-2 transition-all shadow-sm ${
        active
          ? `${colors.activeBg} ${colors.border}`
          : `bg-white border-slate-200 hover:border-slate-300`
      }`}
    >
      <p className={`text-2xl font-bold ${active ? colors.text : 'text-slate-800'}`}>{count}</p>
      <p className="text-slate-500 text-sm">{label}</p>
    </button>
  );
}

// 위반 아이템
function ViolationItem({ violation, selected, onClick }) {
  const colors = severityColors[violation.severity] || severityColors.medium;
  
  return (
    <button
      onClick={onClick}
      className={`w-full p-4 rounded-xl text-left transition-all border-2 ${
        selected
          ? 'border-blue-400 bg-blue-50 shadow-md'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-3">
        <span 
          className="w-2 h-2 rounded-full mt-2"
          style={{ backgroundColor: colors.badge }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-slate-800 font-medium">{violation.category}</p>
          <p className="text-slate-500 text-sm mt-1 truncate">"{violation.matched}"</p>
          <p className="text-slate-400 text-xs mt-2 truncate">{violation.source}</p>
        </div>
        <span 
          className="px-2 py-0.5 rounded text-xs font-medium border"
          style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
        >
          {severityLabels[violation.severity]}
        </span>
      </div>
    </button>
  );
}

// 위반 상세
function ViolationDetail({ violation, onOpenHighlight }) {
  const colors = severityColors[violation.severity] || severityColors.medium;
  
  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div 
        className="rounded-xl p-4 border"
        style={{ backgroundColor: colors.bg, borderColor: colors.border }}
      >
        <div className="flex items-center gap-3 mb-3">
          <span 
            className="px-3 py-1 rounded-lg text-sm font-medium border"
            style={{ backgroundColor: 'white', color: colors.text, borderColor: colors.border }}
          >
            {severityLabels[violation.severity]}
          </span>
          <span className="text-slate-800 font-bold">{violation.category}</span>
        </div>
        <p className="text-slate-600 text-sm truncate">{violation.source}</p>
      </div>
      
      {/* 위반 내용 */}
      <div>
        <h5 className="text-slate-500 text-sm mb-2">위반 표현</h5>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="font-medium" style={{ color: colors.text }}>"{violation.matched}"</p>
        </div>
      </div>
      
      {/* 법적 근거 */}
      {violation.legalBasis && (
        <div>
          <h5 className="text-slate-500 text-sm mb-2">법적 근거</h5>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-slate-700 text-sm">{violation.legalBasis}</p>
          </div>
        </div>
      )}
      
      {/* 개선 제안 */}
      {violation.suggestion && (
        <div>
          <h5 className="text-slate-500 text-sm mb-2">💡 개선 제안</h5>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-blue-700 text-sm">{violation.suggestion}</p>
          </div>
        </div>
      )}
      
      {/* 액션 버튼 */}
      <div className="flex gap-3 pt-4 border-t border-slate-200">
        <button
          onClick={onOpenHighlight}
          className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl transition-colors shadow-lg shadow-blue-200"
        >
          🔍 원문에서 보기
        </button>
        <button 
          onClick={() => navigator.clipboard.writeText(violation.matched)}
          className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
        >
          📋 복사
        </button>
      </div>
    </div>
  );
}

// 하이라이트 뷰어
function openHighlightViewer(violation) {
  const colors = severityColors[violation.severity] || severityColors.medium;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>위반 하이라이트 - MADMEDCHECK</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #f8fafc;
          color: #1e293b;
          padding: 2rem;
          margin: 0;
        }
        .header {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 1rem;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .header h1 {
          margin: 0 0 0.5rem 0;
          font-size: 1.25rem;
          color: #3b82f6;
        }
        .header p {
          margin: 0;
          color: #64748b;
          font-size: 0.875rem;
        }
        .content {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 1rem;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .highlight {
          background: ${colors.bg};
          color: ${colors.text};
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          font-weight: 600;
          border: 2px solid ${colors.border};
          display: inline-block;
        }
        .suggestion {
          margin-top: 1.5rem;
          padding: 1rem;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 0.5rem;
        }
        .suggestion strong {
          color: #3b82f6;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🔍 위반 하이라이트 뷰어</h1>
        <p>출처: ${violation.source}</p>
      </div>
      <div class="content">
        <p>다음 표현이 <strong>${violation.category}</strong> 위반으로 감지되었습니다:</p>
        <p style="font-size: 1.5rem; margin: 1.5rem 0;">
          <span class="highlight">${violation.matched}</span>
        </p>
        ${violation.suggestion ? `
        <div class="suggestion">
          <strong>💡 개선 제안:</strong>
          <p style="margin: 0.5rem 0 0 0;">${violation.suggestion}</p>
        </div>
        ` : ''}
      </div>
    </body>
    </html>
  `;
  
  const win = window.open('', '_blank', 'width=800,height=600');
  win.document.write(html);
  win.document.close();
}
