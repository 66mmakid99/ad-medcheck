import { useState, Component } from 'react';
import Layout from './layout/Layout';
import OverviewTab from './tabs/OverviewTab';
import AnalyzeTab from './tabs/AnalyzeTab';
import ViolationsTab from './tabs/ViolationsTab';
import HospitalsTab from './tabs/HospitalsTab';
import ReportsTab from './tabs/ReportsTab';
import CrawlerTab from './tabs/CrawlerTab';
import FalsePositiveTab from './tabs/FalsePositiveTab';
import SettingsTab from './tabs/SettingsTab';

const TAB_COMPONENTS = {
  overview: OverviewTab,
  analyze: AnalyzeTab,
  violations: ViolationsTab,
  hospitals: HospitalsTab,
  reports: ReportsTab,
  crawler: CrawlerTab,
  'false-positives': FalsePositiveTab,
  settings: SettingsTab,
};

class TabErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Tab render error:', error, info);
  }

  componentDidUpdate(prevProps) {
    // 탭 전환 시 에러 상태 초기화
    if (prevProps.activeTab !== this.props.activeTab) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="bg-card rounded-xl border border-grade-d/20 p-8 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">탭 로딩 오류</h3>
          <p className="text-sm text-text-secondary mb-4">
            {String(this.state.error?.message || this.state.error || '알 수 없는 오류')}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-light transition-colors"
          >
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function MedCheckApp() {
  const [activeTab, setActiveTab] = useState('overview');

  const ActiveComponent = TAB_COMPONENTS[activeTab] || OverviewTab;

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      <TabErrorBoundary activeTab={activeTab}>
        <ActiveComponent />
      </TabErrorBoundary>
    </Layout>
  );
}
