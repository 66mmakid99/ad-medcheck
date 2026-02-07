import { useApp } from '../../contexts/AppContext';

// 메뉴 아이템
const menuItems = {
  customer: [
    { id: 'dashboard', label: '대시보드', icon: '📊' },
    { id: 'analyze', label: '분석', icon: '🔍' },
    { id: 'violations', label: '위반 관리', icon: '⚠️' },
    { id: 'reports', label: '리포트', icon: '📋' },
    { id: 'monitoring', label: '모니터링', icon: '👁️', disabled: true },
    { id: 'settings', label: '설정', icon: '⚙️' },
  ],
  admin: [
    { id: 'dashboard', label: '운영 현황', icon: '📊' },
    { id: 'customers', label: '고객 관리', icon: '👥' },
    { id: 'analyze', label: '분석 관리', icon: '🔍' },
    { id: 'patterns', label: '패턴 관리', icon: '🎯' },
    { id: 'falsePositives', label: '오탐 관리', icon: '🚫' },
    { id: 'crawling', label: '크롤링', icon: '🕷️' },
    { id: 'settings', label: '시스템 설정', icon: '⚙️' },
  ],
};

export default function Sidebar() {
  const { state, actions } = useApp();
  const { user, activeTab } = state;
  
  const currentMenuItems = menuItems[user.role] || menuItems.customer;
  
  return (
    <aside className="w-64 bg-gradient-to-b from-[#1e2a4a] to-[#0f1629] flex flex-col h-screen">
      {/* 로고 영역 */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-500/30">
            M
          </div>
          <div>
            <h1 className="text-white font-bold text-lg tracking-tight">MADMEDCHECK</h1>
            <p className="text-blue-300/60 text-xs">의료광고 컴플라이언스</p>
          </div>
        </div>
      </div>
      
      {/* 사용자 프로필 */}
      <div className="p-4 mx-3 mt-4 bg-white/5 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-slate-400 to-slate-500 rounded-full flex items-center justify-center text-white text-sm shadow-lg">
            {user.role === 'admin' ? '👑' : user.name?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{user.name}</p>
            <p className="text-blue-300/50 text-xs truncate">
              {user.role === 'admin' ? '관리자' : user.hospital}
            </p>
          </div>
        </div>
      </div>
      
      {/* 메뉴 */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <ul className="space-y-1">
          {currentMenuItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => !item.disabled && actions.setTab(item.id)}
                disabled={item.disabled}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200
                  ${activeTab === item.id
                    ? 'bg-white text-[#1e2a4a] shadow-lg shadow-white/20'
                    : item.disabled
                      ? 'text-white/30 cursor-not-allowed'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }
                `}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="text-sm font-medium">{item.label}</span>
                {item.disabled && (
                  <span className="ml-auto text-[10px] bg-white/10 text-white/40 px-1.5 py-0.5 rounded">
                    준비중
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      
      {/* 역할 전환 (개발용) */}
      <div className="p-3 border-t border-white/10">
        <button
          onClick={actions.toggleRole}
          className="w-full py-2.5 px-4 text-xs bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-xl transition-all"
        >
          🔄 {user.role === 'admin' ? '고객 모드' : '관리자 모드'}로 전환
        </button>
      </div>
      
      {/* 하단 정보 */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center justify-between text-xs text-white/40">
          <span>Need Help?</span>
          <span>Contact Us</span>
        </div>
      </div>
    </aside>
  );
}
