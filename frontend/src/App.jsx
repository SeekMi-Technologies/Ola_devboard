import { Layout, Tabs, Typography } from 'antd';

import LlmUsagePanel from '@/modules/DevDashboardModule/panels/LlmUsagePanel';
import EmailTokenPanel from '@/modules/DevDashboardModule/panels/EmailTokenPanel';
import UserActivityPanel from '@/modules/DevDashboardModule/panels/UserActivityPanel';
import McpHealthPanel from '@/modules/DevDashboardModule/panels/McpHealthPanel';
import LogsPanel from '@/modules/DevDashboardModule/panels/LogsPanel';
import DbSummaryPanel from '@/modules/DevDashboardModule/panels/DbSummaryPanel';

const { Header, Content } = Layout;
const { Title } = Typography;

const PANELS = [
  { key: 'llm-usage', label: 'LLM Usage', component: <LlmUsagePanel /> },
  { key: 'email-token', label: 'Email Token', component: <EmailTokenPanel /> },
  { key: 'user-activity', label: 'User Activity', component: <UserActivityPanel /> },
  { key: 'mcp-health', label: 'MCP Health', component: <McpHealthPanel /> },
  { key: 'logs', label: 'Logs', component: <LogsPanel /> },
  { key: 'db-summary', label: 'DB Summary', component: <DbSummaryPanel /> },
];

export default function App() {
  const items = PANELS.map(({ key, label, component }) => ({ key, label, children: component }));

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '0 24px' }}>
        <Title level={3} style={{ margin: '16px 0 0', lineHeight: 1.2 }}>
          Ola Dev Dashboard
        </Title>
        <div style={{ color: '#888', fontSize: 12 }}>
          Internal — read-only · v0 local-only · loopback bind
        </div>
      </Header>
      <Content style={{ padding: '24px 40px', maxWidth: 1400, width: '100%', margin: '0 auto' }}>
        <Tabs defaultActiveKey="llm-usage" items={items} />
      </Content>
    </Layout>
  );
}
