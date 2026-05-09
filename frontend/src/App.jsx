import { Layout, Tabs, Typography } from 'antd';

const { Header, Content } = Layout;
const { Title } = Typography;

const PANELS = [
  { key: 'llm-usage', label: 'LLM Usage' },
  { key: 'email-token', label: 'Email Token' },
  { key: 'user-activity', label: 'User Activity' },
  { key: 'mcp-health', label: 'MCP Health' },
  { key: 'logs', label: 'Logs' },
  { key: 'db-summary', label: 'DB Summary' },
];

const PLACEHOLDER_TEXT = 'Coming soon — wired in D11 (backend) + D12 (frontend)';

export default function App() {
  const items = PANELS.map(({ key, label }) => ({
    key,
    label,
    children: (
      <div style={{ padding: '24px 8px', color: '#888' }}>
        {label} — {PLACEHOLDER_TEXT}
      </div>
    ),
  }));

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
