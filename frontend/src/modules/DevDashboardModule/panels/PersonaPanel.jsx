import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Input,
  Modal,
  Segmented,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';

import { request } from '@/request';

const { Text, Paragraph } = Typography;

function fmtTime(t) {
  if (!t) return '—';
  // nanobot returns an mtime float (epoch seconds); render local.
  return new Date(t * 1000).toLocaleString();
}

// ---------------------------------------------------------------------------
// Editor modal — edits SOUL.md + USER.md; shows AGENTS/TOOLS read-only.
// ---------------------------------------------------------------------------
function PersonaEditor({ env, admin, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [files, setFiles] = useState(null);
  const [soul, setSoul] = useState('');
  const [user, setUser] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    request
      .get({ entity: `/personas/${env}/${admin.adminId}` })
      .then((res) => {
        if (cancelled) return;
        if (res?.success) {
          setFiles(res.result.files);
          setSoul(res.result.files['SOUL.md']?.content ?? '');
          setUser(res.result.files['USER.md']?.content ?? '');
        } else setError(res?.message || 'Failed to load persona');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [env, admin.adminId]);

  const save = async (file, content) => {
    setSaving(true);
    const res = await request.put({
      entity: `/personas/${env}/${admin.adminId}/${file}`,
      body: { content },
    });
    setSaving(false);
    if (res?.success) {
      message.success(`${file} saved (${res.result.bytes} bytes) — live on next message`);
      onSaved();
    } else {
      message.error(res?.message || `Failed to save ${file}`);
    }
  };

  return (
    <Modal
      open
      title={
        <span>
          {admin.name || admin.adminId}{' '}
          <Text type="secondary" style={{ fontSize: 12 }}>
            {admin.email} · <code>{admin.adminId}</code> · {env}
          </Text>
        </span>
      }
      width={820}
      onCancel={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} />}
      <Spin spinning={loading}>
        {files && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Space style={{ marginBottom: 4 }}>
                <Text strong>SOUL.md</Text>
                <Tag color={files['SOUL.md'].source === 'override' ? 'green' : 'default'}>
                  {files['SOUL.md'].source === 'override' ? 'custom' : 'global default'}
                </Tag>
              </Space>
              <Input.TextArea
                value={soul}
                onChange={(e) => setSoul(e.target.value)}
                autoSize={{ minRows: 8, maxRows: 20 }}
              />
              <Button
                type="primary"
                size="small"
                loading={saving}
                style={{ marginTop: 8 }}
                onClick={() => save('SOUL.md', soul)}
              >
                Save SOUL.md
              </Button>
            </div>

            <div>
              <Space style={{ marginBottom: 4 }}>
                <Text strong>USER.md</Text>
                <Tag color={files['USER.md'].source === 'override' ? 'green' : 'default'}>
                  {files['USER.md'].source === 'override' ? 'custom' : 'global default'}
                </Tag>
              </Space>
              <Input.TextArea
                value={user}
                onChange={(e) => setUser(e.target.value)}
                autoSize={{ minRows: 4, maxRows: 12 }}
              />
              <Button
                size="small"
                loading={saving}
                style={{ marginTop: 8 }}
                onClick={() => save('USER.md', user)}
              >
                Save USER.md
              </Button>
            </div>

            <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
              AGENTS.md and TOOLS.md are global and read-only here (authority /
              shared operational layers — never per-tenant).
            </Paragraph>
          </Space>
        )}
      </Spin>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Panel — env picker + tenant table.
// ---------------------------------------------------------------------------
export default function PersonaPanel() {
  const [envs, setEnvs] = useState([]);
  const [env, setEnv] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    request.get({ entity: '/personas/envs' }).then((res) => {
      if (res?.success && res.result.length) {
        setEnvs(res.result);
        setEnv(res.result[0]);
      } else {
        setError('No environments configured. Set PERSONA_* env vars on the devboard.');
      }
    });
  }, []);

  const load = useCallback(() => {
    if (!env) return;
    setLoading(true);
    setError(null);
    request
      .get({ entity: `/personas?env=${env}` })
      .then((res) => {
        if (res?.success) setRows(res.result.admins);
        else setError(res?.message || 'Failed to load tenants');
      })
      .finally(() => setLoading(false));
  }, [env]);

  useEffect(() => {
    load();
  }, [load]);

  const sourceTag = (s) =>
    s === 'override' ? <Tag color="green">custom</Tag> : <Tag>global default</Tag>;

  const columns = [
    {
      title: 'Tenant',
      key: 'name',
      render: (_, r) => (
        <span>
          <div>{r.name || <Text type="secondary">(no CRM name)</Text>}</div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {r.email || <code>{r.adminId}</code>}
          </Text>
        </span>
      ),
    },
    {
      title: 'SOUL (persona)',
      dataIndex: 'soulSource',
      key: 'soulSource',
      width: 140,
      render: sourceTag,
    },
    {
      title: 'USER (profile)',
      dataIndex: 'userSource',
      key: 'userSource',
      width: 140,
      render: sourceTag,
    },
    {
      title: 'SOUL updated',
      key: 'updatedAt',
      width: 180,
      render: (_, r) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {fmtTime(r.updatedAt)}
        </Text>
      ),
    },
    {
      title: '',
      key: 'edit',
      width: 130,
      render: (_, r) => (
        <Button type="primary" ghost size="small" onClick={() => setEditing(r)}>
          Edit SOUL / USER
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
        {envs.length > 0 && (
          <Segmented
            options={envs.map((e) => ({ label: e, value: e }))}
            value={env}
            onChange={setEnv}
          />
        )}
        <Button size="small" onClick={load} disabled={!env}>
          Refresh
        </Button>
      </div>
      {error && <Alert type="warning" message={error} style={{ marginBottom: 16 }} />}
      <Spin spinning={loading}>
        <Table
          rowKey="adminId"
          columns={columns}
          dataSource={rows}
          size="small"
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
        />
      </Spin>
      {editing && (
        <PersonaEditor
          env={env}
          admin={editing}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
