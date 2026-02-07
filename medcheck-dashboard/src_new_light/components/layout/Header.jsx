import { useApp } from '../../contexts/AppContext';

const tabTitles = {
  dashboard: '대시보드',
  analyze: '분석',
  violations: '위반 관리',
  reports: '리포트',
  monitoring: '모니터링',
  settings: '설정',
  customers: '고객 관리',
  patterns: '패턴 관리',
  falsePositives: '오탐 관리',
  crawling: '크롤링 관리',
};

export default function Header() {
  const { state } = useApp();
  const { activeTab, user, analysisResults } = state;
  
  const title = tabTitles[activeTab] || '대시보드';
  const batchCount = analysisResults.batch.length;
  
  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* 좌측: 페이지 제목 + 필터 */}
        <div className="flex items-center gap-6">
          <h2 className="text-xl font-bold text-slate-800">{title}</h2>
          
          {/* 필터 드롭다운 (레퍼런스 스타일) */}
          <div className="flex items-center gap-3">
            <select className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400">
              <option>All stats</option>
              <option>이번 주</option>
              <option>이번 달</option>
            </select>
            <select className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400">
              <option>All categories</option>
              <option>위반 유형</option>
              <option>심각도</option>
            </select>
          </div>
        </div>
        
        {/* 우측: 검색 + 알림 + 프로필 */}
        <div className="flex items-center gap-4">
          {/* 배치 결과 뱃지 */}
          {batchCount > 0 && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-full px-3 py-1.5">
              <span className="text-blue-500 text-sm">📊</span>
              <span className="text-blue-600 text-sm font-medium">배치 {batchCount}건</span>
            </div>
          )}
          
          {/* 검색 */}
          <div className="relative">
            <input
              type="text"
              placeholder="Go to search"
              className="w-48 text-sm bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-blue-400 placeholder-slate-400"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          </div>
          
          {/* 알림 */}
          <button className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            🔔
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          
          {/* 프로필 */}
          <div className="flex items-center gap-2 pl-4 border-l border-slate-200">
            <div className="w-9 h-9 bg-gradient-to-br from-slate-400 to-slate-500 rounded-full flex items-center justify-center text-white text-sm">
              {user.name?.charAt(0) || 'U'}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
