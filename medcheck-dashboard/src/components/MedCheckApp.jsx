import { useState } from 'react';
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

export default function MedCheckApp() {
  const [activeTab, setActiveTab] = useState('overview');

  const ActiveComponent = TAB_COMPONENTS[activeTab] || OverviewTab;

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      <ActiveComponent />
    </Layout>
  );
}
