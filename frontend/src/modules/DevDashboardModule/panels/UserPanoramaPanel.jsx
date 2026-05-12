import { useEffect, useState } from 'react';
import { Alert, Card, Col, Row, Segmented, Spin, Statistic, Table, Tag } from 'antd';

import { request } from '@/request';

const RANGES = [
  { label: 'Today', value: 'today' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
];

const fmtInt = (n) => (n || 0).toLocaleString();
const fmtCost = (n) => `$${(n || 0).toFixed(4)}`;

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function UserPanoramaPanel() {
  const [range, setRange] = useState('7d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    request
      .get({ entity: `/dashboard/users/panorama?range=${range}` })
      .then((res) => {
        if (cancelled) return;
        if (res && res.success) setData(res.result);
        else setError(res?.message || 'Failed to load user panorama');
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Network error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
        <Segmented options={RANGES} value={range} onChange={setRange} />
        {data && (
          <span style={{ color: '#888', fontSize: 12 }}>
            Window: {data.windowStart} → {data.windowEnd}
          </span>
        )}
      </div>
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
      <Spin spinning={loading}>{data ? <PanoramaBody data={data} /> : null}</Spin>
    </div>
  );
}

function statusTag(user) {
  if (user.enabled === false) return <Tag color="red">Disabled</Tag>;
  if (user.activeNow) return <Tag color="green">Active</Tag>;
  return <Tag>Idle</Tag>;
}

function PanoramaBody({ data }) {
  const users = data.users || [];
  const activeCount = users.filter((u) => u.activeNow).length;
  const totalTokensSum = users.reduce((s, u) => s + (u.totalTokens || 0), 0);
  const totalCostSum = users.reduce((s, u) => s + (u.costUsd || 0), 0);

  const columns = [
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (v) => v || <em style={{ color: '#999' }}>(unknown)</em>,
      sorter: (a, b) => (a.email || '').localeCompare(b.email || ''),
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
    },
    {
      title: 'Status',
      key: 'status',
      width: 100,
      render: (_, user) => statusTag(user),
      filters: [
        { text: 'Active', value: 'active' },
        { text: 'Idle', value: 'idle' },
        { text: 'Disabled', value: 'disabled' },
      ],
      onFilter: (value, user) => {
        if (value === 'disabled') return user.enabled === false;
        if (value === 'active') return user.enabled !== false && user.activeNow;
        return user.enabled !== false && !user.activeNow;
      },
    },
    {
      title: 'Created',
      dataIndex: 'created',
      key: 'created',
      width: 130,
      render: fmtDate,
      sorter: (a, b) => new Date(a.created || 0) - new Date(b.created || 0),
    },
    {
      title: 'Last Activity',
      dataIndex: 'lastActivity',
      key: 'lastActivity',
      width: 200,
      render: fmtDateTime,
      sorter: (a, b) => new Date(a.lastActivity || 0) - new Date(b.lastActivity || 0),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Requests',
      dataIndex: 'requests',
      key: 'requests',
      width: 100,
      sorter: (a, b) => (a.requests || 0) - (b.requests || 0),
    },
    {
      title: 'Total Tokens',
      dataIndex: 'totalTokens',
      key: 'totalTokens',
      width: 130,
      render: fmtInt,
      sorter: (a, b) => (a.totalTokens || 0) - (b.totalTokens || 0),
    },
    {
      title: 'Cost (USD)',
      dataIndex: 'costUsd',
      key: 'costUsd',
      width: 110,
      render: fmtCost,
      sorter: (a, b) => (a.costUsd || 0) - (b.costUsd || 0),
    },
  ];

  return (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="Total Users" value={data.totalUsers || 0} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Active Now"
              value={activeCount}
              suffix={`in last ${data.activeWindowMinutes || 15}m`}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="Total Tokens (window)" value={totalTokensSum} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Total Cost (window)"
              value={totalCostSum}
              precision={4}
              prefix="$"
            />
          </Card>
        </Col>
      </Row>

      <Card size="small">
        <Table
          dataSource={users}
          columns={columns}
          rowKey={(r) => String(r.userId)}
          pagination={{ pageSize: 25, showSizeChanger: false }}
          size="small"
          scroll={{ x: 1200 }}
          locale={{ emptyText: 'No users' }}
        />
      </Card>
    </>
  );
}
