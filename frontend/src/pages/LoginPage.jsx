import { useState } from 'react';
import { Alert, Button, Card, Form, Input, Layout, Typography } from 'antd';

import request from '@/request';

const { Content } = Layout;
const { Text, Title } = Typography;

function formatVersion(v) {
  if (!v) return '';
  if (v.tag) return `${v.tag} · ${v.shaShort}`;
  return v.rev || v.shaShort || 'unknown';
}

export default function LoginPage({ onLoggedIn, version }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function onFinish({ password }) {
    setSubmitting(true);
    setError(null);
    const res = await request.post({
      entity: '/auth/login',
      body: { password },
    });
    setSubmitting(false);
    if (res?.success === true && res?.result?.authed === true) {
      onLoggedIn();
      return;
    }
    setError(res?.message || 'Login failed');
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Content
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Card style={{ maxWidth: 400, width: '100%' }}>
          <Title level={3} style={{ marginTop: 0 }}>
            Ola Dev Dashboard
          </Title>
          <Text
            type="secondary"
            style={{ display: 'block', marginBottom: 16 }}
          >
            Internal — authenticate to continue
          </Text>
          {error && (
            <Alert
              type="error"
              message={error}
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}
          <Form layout="vertical" onFinish={onFinish}>
            <Form.Item
              label="Password"
              name="password"
              rules={[{ required: true, message: 'Password is required' }]}
            >
              <Input.Password autoFocus />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={submitting}
                block
              >
                Log in
              </Button>
            </Form.Item>
          </Form>
          {version && (
            <Text
              type="secondary"
              style={{ display: 'block', marginTop: 16, fontSize: 11 }}
            >
              {formatVersion(version)}
            </Text>
          )}
        </Card>
      </Content>
    </Layout>
  );
}
