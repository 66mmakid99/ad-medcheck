import { AppProvider, useApp } from './contexts/AppContext';
import Layout from './components/layout/Layout';
import DashboardTab from './components/dashboard/DashboardTab';
import AnalyzeTab from './components/analysis/AnalyzeTab';
import ViolationsTab from './components/violations/ViolationsTab';
import ReportsTab from './components/reports/ReportsTab';
import {
  SettingsTab,
  MonitoringTab,
  CustomersTab,
  PatternsTab,
  FalsePositivesTab,
  CrawlingTab,
} from './components/common/PlaceholderTabs';

// 탭 컴포넌트 매핑
const tabComponents = {
  // B2B 고객 포털
  dashboard: DashboardTab,
  analyze: AnalyzeTab,
  violations: ViolationsTab,
  reports: ReportsTab,
  monitoring: MonitoringTab,
  settings: SettingsTab,
  
  // 관리자 전용
  customers: CustomersTab,
  patterns: PatternsTab,
  falsePositives: FalsePositivesTab,
  crawling: CrawlingTab,
};

function AppContent() {
  const { state } = useApp();
  const { activeTab } = state;
  
  // 현재 탭에 해당하는 컴포넌트
  const TabComponent = tabComponents[activeTab] || DashboardTab;
  
  return (
    <Layout>
      <TabComponent />
    </Layout>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
