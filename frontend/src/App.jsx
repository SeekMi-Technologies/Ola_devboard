import { useEffect, useState } from 'react';
import { Button, Layout, Spin, Tabs, Typography } from 'antd';

import request from '@/request';
import LoginPage from '@/pages/LoginPage';
import LlmUsagePanel from '@/modules/DevDashboardModule/panels/LlmUsagePanel';
import EmailTokenPanel from '@/modules/DevDashboardModule/panels/EmailTokenPanel';
import UserActivityPanel from '@/modules/DevDashboardModule/panels/UserActivityPanel';
import UserPanoramaPanel from '@/modules/DevDashboardModule/panels/UserPanoramaPanel';
import McpHealthPanel from '@/modules/DevDashboardModule/panels/McpHealthPanel';
import LogsPanel from '@/modules/DevDashboardModule/panels/LogsPanel';
import DbSummaryPanel from '@/modules/DevDashboardModule/panels/DbSummaryPanel';
import PersonaPanel from '@/modules/DevDashboardModule/panels/PersonaPanel';

const { Content, Footer, Header } = Layout;
const { Title } = Typography;

const PANELS = [
  { key: 'llm-usage', label: 'LLM Usage', component: <LlmUsagePanel /> },
  { key: 'email-token', label: 'Email Token', component: <EmailTokenPanel /> },
  { key: 'user-activity', label: 'User Activity', component: <UserActivityPanel /> },
  { key: 'users', label: 'Users', component: <UserPanoramaPanel /> },
  { key: 'personas', label: 'Personas', component: <PersonaPanel /> },
  { key: 'mcp-health', label: 'MCP Health', component: <McpHealthPanel /> },
  { key: 'logs', label: 'Logs', component: <LogsPanel /> },
  { key: 'db-summary', label: 'DB Summary', component: <DbSummaryPanel /> },
];

function formatVersion(v) {
  if (!v) return '';
  if (v.tag) return `${v.tag} · ${v.shaShort}`;
  return v.rev || v.shaShort || 'unknown';
}

export default function App() {
  // null = probing /auth/me, true/false = settled
  const [authed, setAuthed] = useState(null);
  const [version, setVersion] = useState(null);

  useEffect(() => {
    let mounted = true;
    request.get({ entity: '/auth/me' }).then((r) => {
      if (!mounted) return;
      setAuthed(r?.success === true && r?.result?.authed === true);
    });
    request.get({ entity: '/version' }).then((r) => {
      if (!mounted) return;
      if (r?.success && r?.result) setVersion(r.result);
    });

    const onUnauthed = () => {
      if (mounted) setAuthed(false);
    };
    window.addEventListener('devboard:unauthenticated', onUnauthed);
    return () => {
      mounted = false;
      window.removeEventListener('devboard:unauthenticated', onUnauthed);
    };
  }, []);

  async function onLogout() {
    await request.post({ entity: '/auth/logout', body: {} });
    setAuthed(false);
  }

  if (authed === null) {
    return (
      <Layout
        style={{
          minHeight: '100vh',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Spin size="large" />
      </Layout>
    );
  }

  if (authed === false) {
    return (
      <LoginPage onLoggedIn={() => setAuthed(true)} version={version} />
    );
  }

  const items = PANELS.map(({ key, label, component }) => ({
    key,
    label,
    children: component,
  }));

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          padding: '0 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <Title level={3} style={{ margin: '16px 0 0', lineHeight: 1.2 }}>
            Ola Dev Dashboard
          </Title>
          <div style={{ color: '#888', fontSize: 12 }}>
            Internal — read-only
          </div>
        </div>
        <Button onClick={onLogout} size="small">
          Log out
        </Button>
      </Header>
      <Content
        style={{
          padding: '24px 40px',
          maxWidth: 1400,
          width: '100%',
          margin: '0 auto',
        }}
      >
        <Tabs defaultActiveKey="llm-usage" items={items} />
      </Content>
      <Footer style={{ textAlign: 'center', fontSize: 11, color: '#999' }}>
        {formatVersion(version)}
      </Footer>
    </Layout>
  );
}
