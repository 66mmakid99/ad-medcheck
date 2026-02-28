import Sidebar from './Sidebar';

export default function Layout({ activeTab, onTabChange, children }) {
  return (
    <div className="min-h-screen bg-surface">
      <Sidebar activeTab={activeTab} onTabChange={onTabChange} />
      <main className="ml-[240px] min-h-screen">
        <div className="px-8 py-6 max-w-[1400px]">
          {children}
        </div>
      </main>
    </div>
  );
}
