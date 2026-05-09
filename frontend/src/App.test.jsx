// @vitest-environment jsdom
import '@/test-utils/setupAntdJsdom';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

// App-level wiring only (panel internals were validated upstream in CRM).

const requestGetMock = vi.fn();
vi.mock('@/request', () => ({
  request: { get: (...args) => requestGetMock(...args) },
  default: { get: (...args) => requestGetMock(...args) },
}));

let App;

const EMPTY_LLM_RESULT = {
  range: '7d',
  windowStart: '2026-05-01T00:00:00.000Z',
  windowEnd: '2026-05-08T00:00:00.000Z',
  totals: { records: 0, input: 0, output: 0, cached: 0, total: 0, costUsd: 0 },
  byProviderModel: [], topUsers: [], erroredCount: 0, byChannel: [],
};
const EMPTY_EMAIL_RESULT = {
  range: '7d',
  windowStart: '2026-05-01T00:00:00.000Z',
  windowEnd: '2026-05-08T00:00:00.000Z',
  empty: true,
  hint: 'No email channel data yet',
};
const EMPTY_USER_RESULT = {
  windowMinutes: 15,
  windowStart: '2026-05-08T00:00:00.000Z',
  activeSessionsLast: 0, aiActiveUsersLast: 0,
  sessions: [], aiUsers: [],
};
const HEALTHY_MCP_RESULT = {
  mcp: { name: 'MCP', url: 'http://127.0.0.1:8889/health', ok: true, latencyMs: 5 },
  nanobotServe: { name: 'NS', url: 'http://127.0.0.1:8900/health', ok: false, latencyMs: 5, error: 'ECONNREFUSED' },
  nanobotGateway: { name: 'NG', url: 'http://127.0.0.1:8901/health', ok: false, latencyMs: 5, error: 'ECONNREFUSED' },
};
const EMPTY_LOGS_RESULT = { source: 'mcp', limit: 100, logs: [], totalLinesScanned: 0 };
const EMPTY_DB_RESULT = {
  generatedAt: '2026-05-08T00:00:00.000Z',
  collectionCount: 0,
  collections: [],
};

// Route-aware mock returning shape-correct empty payloads.
function mockByEntity(entity) {
  if (entity.startsWith('/dashboard/llm-usage')) return { success: true, result: EMPTY_LLM_RESULT };
  if (entity.startsWith('/dashboard/email-token-usage')) return { success: true, result: EMPTY_EMAIL_RESULT };
  if (entity.startsWith('/dashboard/users/active')) return { success: true, result: EMPTY_USER_RESULT };
  if (entity.startsWith('/dashboard/mcp-health')) return { success: true, result: HEALTHY_MCP_RESULT };
  if (entity.startsWith('/dashboard/logs')) return { success: true, result: EMPTY_LOGS_RESULT };
  if (entity.startsWith('/dashboard/db-summary')) return { success: true, result: EMPTY_DB_RESULT };
  return { success: false, result: null, message: `unmocked entity: ${entity}` };
}

describe('App (D12 — top-level wiring)', () => {
  beforeEach(async () => {
    cleanup();
    vi.resetModules();
    requestGetMock.mockReset();
    requestGetMock.mockImplementation(({ entity }) => Promise.resolve(mockByEntity(entity)));
    ({ default: App } = await import('./App.jsx'));
  });

  test('renders the dashboard header + all six tab labels', async () => {
    render(<App />);
    expect(screen.getByText('Ola Dev Dashboard')).toBeDefined();
    expect(screen.getByText('LLM Usage')).toBeDefined();
    expect(screen.getByText('Email Token')).toBeDefined();
    expect(screen.getByText('User Activity')).toBeDefined();
    expect(screen.getByText('MCP Health')).toBeDefined();
    expect(screen.getByText('Logs')).toBeDefined();
    expect(screen.getByText('DB Summary')).toBeDefined();
  });

  test('the default LLM Usage tab fires a request to /dashboard/llm-usage', async () => {
    render(<App />);
    await waitFor(() => expect(requestGetMock).toHaveBeenCalled());
    const entities = requestGetMock.mock.calls.map((c) => c[0].entity);
    expect(entities.some((e) => e.startsWith('/dashboard/llm-usage'))).toBe(true);
  });

  test('switching tabs hits the right URL for each panel', async () => {
    render(<App />);
    await waitFor(() => expect(requestGetMock).toHaveBeenCalled());

    const tabs = [
      { label: 'Email Token', urlPrefix: '/dashboard/email-token-usage' },
      { label: 'User Activity', urlPrefix: '/dashboard/users/active' },
      { label: 'MCP Health', urlPrefix: '/dashboard/mcp-health' },
      { label: 'Logs', urlPrefix: '/dashboard/logs' },
      { label: 'DB Summary', urlPrefix: '/dashboard/db-summary' },
    ];
    for (const { label, urlPrefix } of tabs) {
      fireEvent.click(screen.getByText(label));
      await waitFor(() => {
        const entities = requestGetMock.mock.calls.map((c) => c[0].entity);
        expect(entities.some((e) => e.startsWith(urlPrefix))).toBe(true);
      });
    }
  });
});
