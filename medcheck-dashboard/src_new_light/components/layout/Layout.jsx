import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout({ children }) {
  return (
    <div className="flex h-screen bg-slate-100">
      {/* 사이드바 (다크) */}
      <Sidebar />
      
      {/* 메인 컨텐츠 영역 (라이트) */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 헤더 */}
        <Header />
        
        {/* 메인 컨텐츠 */}
        <main className="flex-1 overflow-auto p-6 bg-slate-100">
          {children}
        </main>
      </div>
    </div>
  );
}
