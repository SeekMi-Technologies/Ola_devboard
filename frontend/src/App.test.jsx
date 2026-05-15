// @vitest-environment jsdom
import '@/test-utils/setupAntdJsdom';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

// App-level wiring (Ola/#220 D12 + Ola/#225-C auth + version). Mocks both
// request.get and request.post — see /auth/me probe + /auth/login flow.

const requestGetMock = vi.fn();
const requestPostMock = vi.fn();
vi.mock('@/request', () => ({
  request: {
    get: (...args) => requestGetMock(...args),
    post: (...args) => requestPostMock(...args),
  },
  default: {
    get: (...args) => requestGetMock(...args),
    post: (...args) => requestPostMock(...args),
  },
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
const EMPTY_PANORAMA_RESULT = {
  range: '7d',
  windowStart: '2026-05-01T00:00:00.000Z',
  windowEnd: '2026-05-08T00:00:00.000Z',
  totalUsers: 0,
  activeWindowMinutes: 15,
  users: [],
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
const VERSION_RESULT = {
  rev: 'v0.1.0-test',
  sha: 'abcdef1234567890',
  shaShort: 'abcdef1',
  branch: 'main',
  tag: 'v0.1.0-test',
  builtAt: '2026-05-15T00:00:00Z',
};

function mockByEntity(entity, opts = {}) {
  if (entity.startsWith('/auth/me')) {
    return { success: true, result: { authed: opts.authed !== false } };
  }
  if (entity.startsWith('/version')) {
    return { success: true, result: VERSION_RESULT };
  }
  if (entity.startsWith('/dashboard/llm-usage')) return { success: true, result: EMPTY_LLM_RESULT };
  if (entity.startsWith('/dashboard/email-token-usage')) return { success: true, result: EMPTY_EMAIL_RESULT };
  if (entity.startsWith('/dashboard/users/active')) return { success: true, result: EMPTY_USER_RESULT };
  if (entity.startsWith('/dashboard/users/panorama')) return { success: true, result: EMPTY_PANORAMA_RESULT };
  if (entity.startsWith('/dashboard/mcp-health')) return { success: true, result: HEALTHY_MCP_RESULT };
  if (entity.startsWith('/dashboard/logs')) return { success: true, result: EMPTY_LOGS_RESULT };
  if (entity.startsWith('/dashboard/db-summary')) return { success: true, result: EMPTY_DB_RESULT };
  return { success: false, result: null, message: `unmocked entity: ${entity}` };
}

describe('App — authed path renders dashboard (Ola/#220 D12 + #225-C)', () => {
  beforeEach(async () => {
    cleanup();
    vi.resetModules();
    requestGetMock.mockReset();
    requestPostMock.mockReset();
    requestGetMock.mockImplementation(({ entity }) =>
      Promise.resolve(mockByEntity(entity, { authed: true }))
    );
    ({ default: App } = await import('./App.jsx'));
  });

  test('renders the dashboard header + all seven tab labels after auth', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('Ola Dev Dashboard')).toBeDefined());
    expect(screen.getByText('LLM Usage')).toBeDefined();
    expect(screen.getByText('Email Token')).toBeDefined();
    expect(screen.getByText('User Activity')).toBeDefined();
    expect(screen.getByText('Users')).toBeDefined();
    expect(screen.getByText('MCP Health')).toBeDefined();
    expect(screen.getByText('Logs')).toBeDefined();
    expect(screen.getByText('DB Summary')).toBeDefined();
  });

  test('default LLM Usage tab fires a request to /dashboard/llm-usage', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('LLM Usage')).toBeDefined());
    await waitFor(() => {
      const entities = requestGetMock.mock.calls.map((c) => c[0].entity);
      expect(entities.some((e) => e.startsWith('/dashboard/llm-usage'))).toBe(true);
    });
  });

  test('switching tabs hits the right URL for each panel', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('LLM Usage')).toBeDefined());
    const tabs = [
      { label: 'Email Token', urlPrefix: '/dashboard/email-token-usage' },
      { label: 'User Activity', urlPrefix: '/dashboard/users/active' },
      { label: 'Users', urlPrefix: '/dashboard/users/panorama' },
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

  test('dashboard footer shows version (tag + shaShort)', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('LLM Usage')).toBeDefined());
    await waitFor(() => {
      // Footer renders "<tag> · <shaShort>"
      const node = document.querySelector('footer');
      expect(node).toBeTruthy();
      expect(node.textContent).toContain('v0.1.0-test');
      expect(node.textContent).toContain('abcdef1');
    });
  });

  test('Log out button is visible in the header', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('Log out')).toBeDefined());
  });
});

describe('App — unauthed path renders LoginPage (Ola/#225-C)', () => {
  beforeEach(async () => {
    cleanup();
    vi.resetModules();
    requestGetMock.mockReset();
    requestPostMock.mockReset();
    requestGetMock.mockImplementation(({ entity }) =>
      Promise.resolve(mockByEntity(entity, { authed: false }))
    );
    ({ default: App } = await import('./App.jsx'));
  });

  test('shows the Log in form + version in card footer when /auth/me returns authed:false', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('Log in')).toBeDefined());
    expect(screen.getByText('Password')).toBeDefined();
    // Version pinned to LoginPage card
    await waitFor(() => {
      const card = document.querySelector('.ant-card');
      expect(card).toBeTruthy();
      expect(card.textContent).toContain('v0.1.0-test');
    });
  });

  test('bad password → Alert error; good password → dashboard renders', async () => {
    requestPostMock.mockImplementation(({ entity, body }) => {
      if (entity === '/auth/login') {
        if (body && body.password === 'correct') {
          return Promise.resolve({ success: true, result: { authed: true } });
        }
        return Promise.resolve({
          success: false,
          result: null,
          message: 'Invalid password',
        });
      }
      return Promise.resolve({ success: false });
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText('Log in')).toBeDefined());

    const passwordInput = document.querySelector('input[type="password"]');
    expect(passwordInput).toBeTruthy();

    // Wrong password → Alert "Invalid password"
    fireEvent.change(passwordInput, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByText('Log in'));
    await waitFor(() => expect(screen.getByText('Invalid password')).toBeDefined());

    // Correct password → dashboard renders (tabs become visible)
    fireEvent.change(passwordInput, { target: { value: 'correct' } });
    fireEvent.click(screen.getByText('Log in'));
    await waitFor(() => expect(screen.getByText('LLM Usage')).toBeDefined());
  });
});
