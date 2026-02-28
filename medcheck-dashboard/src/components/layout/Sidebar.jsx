import { useState } from 'react';

const MENU_ITEMS = [
  { id: 'overview', label: '대시보드', icon: '📊' },
  { id: 'analyze', label: '분석하기', icon: '🔍' },
  { id: 'violations', label: '위반 현황', icon: '⚠️' },
  { id: 'hospitals', label: '병원 관리', icon: '🏥' },
  { id: 'reports', label: '리포트', icon: '📋' },
  { id: 'crawler', label: '크롤러', icon: '🤖' },
  { id: 'false-positives', label: '오탐 관리', icon: '🔄' },
];

const BOTTOM_ITEMS = [
  { id: 'settings', label: '설정', icon: '⚙️' },
];

export default function Sidebar({ activeTab, onTabChange }) {
  const [hoveredItem, setHoveredItem] = useState(null);

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[240px] bg-navy-900 flex flex-col z-40">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-navy-700/40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-accent/25">
            M
          </div>
          <div>
            <h1 className="text-[15px] font-semibold text-white tracking-tight">MedCheck</h1>
            <p className="text-[11px] text-sidebar-text mt-[-2px]">v2.0 Engine</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto sidebar-scroll">
        <div className="space-y-0.5">
          {MENU_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            const isHovered = hoveredItem === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                onMouseEnter={() => setHoveredItem(item.id)}
                onMouseLeave={() => setHoveredItem(null)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px]
                  transition-all duration-150 cursor-pointer group relative
                  ${isActive
                    ? 'bg-accent-muted text-sidebar-text-active font-medium'
                    : isHovered
                      ? 'bg-navy-800/60 text-sidebar-text-active'
                      : 'text-sidebar-text hover:text-sidebar-text-active'
                  }
                `}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-accent rounded-r-full" />
                )}
                <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Bottom section */}
      <div className="px-3 py-3 border-t border-navy-700/40">
        {BOTTOM_ITEMS.map((item) => {
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`
                w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px]
                transition-all duration-150 cursor-pointer
                ${isActive
                  ? 'bg-accent-muted text-sidebar-text-active font-medium'
                  : 'text-sidebar-text hover:text-sidebar-text-active hover:bg-navy-800/60'
                }
              `}
            >
              <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}

        {/* Status indicator */}
        <div className="mt-3 px-3 py-2.5 bg-navy-800/50 rounded-lg">
          <div className="flex items-center gap-2 text-[11px] text-sidebar-text">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Engine Online
          </div>
        </div>
      </div>
    </aside>
  );
}
