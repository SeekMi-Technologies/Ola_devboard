// Unit tests for mcpHealth. The probeService function takes an injectable
// fetch impl so we don't rely on a real running MCP / nanobot during the
// jest run.

const getMcpHealth = require('@/controllers/mcpHealth');
const { probeService, FETCH_TIMEOUT_MS, buildServices } = getMcpHealth;

function stubRes() {
  const res = {
    _status: null,
    _body: null,
    status(s) { this._status = s; return this; },
    json(b) { this._body = b; return this; },
  };
  return res;
}

function fakeService() {
  return { key: 't', name: 'Test', url: 'http://test/health' };
}

describe('probeService', () => {
  test('returns ok:true + latencyMs + body for a healthy 200 JSON response', async () => {
    const fetchImpl = jest.fn(async () => ({
      status: 200,
      json: async () => ({ ok: true, version: '1.2.3' }),
    }));
    const r = await probeService(fakeService(), fetchImpl);
    expect(r.ok).toBe(true);
    expect(typeof r.latencyMs).toBe('number');
    expect(r.body).toEqual({ ok: true, version: '1.2.3' });
  });

  test('returns ok:true even when response body is not valid JSON', async () => {
    const fetchImpl = jest.fn(async () => ({
      status: 200,
      json: async () => { throw new Error('not json'); },
    }));
    const r = await probeService(fakeService(), fetchImpl);
    expect(r.ok).toBe(true);
    expect(r.body).toBeUndefined();
  });

  test('HTTP 4xx/5xx returns ok:false with HTTP <status>', async () => {
    const fetchImpl = jest.fn(async () => ({
      status: 503,
      json: async () => ({}),
    }));
    const r = await probeService(fakeService(), fetchImpl);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('HTTP 503');
  });

  test('connection refused via err.code', async () => {
    const fetchImpl = jest.fn(async () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:9999');
      err.code = 'ECONNREFUSED';
      throw err;
    });
    const r = await probeService(fakeService(), fetchImpl);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('ECONNREFUSED');
  });

  test('connection refused via err.cause.code (Node 20 fetch shape)', async () => {
    const fetchImpl = jest.fn(async () => {
      const err = new Error('fetch failed');
      err.cause = { code: 'ECONNREFUSED' };
      throw err;
    });
    const r = await probeService(fakeService(), fetchImpl);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('ECONNREFUSED');
  });

  test('AbortError gives a friendly timeout message', async () => {
    const fetchImpl = (url, opts) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    const r = await probeService(fakeService(), fetchImpl);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/timeout/);
  }, FETCH_TIMEOUT_MS + 5000);
});

describe('getMcpHealth controller', () => {
  test('returns 200 + the three documented service keys', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => {
      const err = new Error('connect ECONNREFUSED');
      err.code = 'ECONNREFUSED';
      throw err;
    });
    const res = stubRes();
    try {
      await getMcpHealth({}, res);
    } finally {
      global.fetch = originalFetch;
    }
    expect(res._status).toBe(200);
    expect(res._body.success).toBe(true);
    expect(res._body.result.mcp).toBeDefined();
    expect(res._body.result.nanobotServe).toBeDefined();
    expect(res._body.result.nanobotGateway).toBeDefined();
    for (const svc of [res._body.result.mcp, res._body.result.nanobotServe, res._body.result.nanobotGateway]) {
      expect(svc.ok).toBe(false);
      expect(svc.error).toBe('ECONNREFUSED');
    }
  });

  test('buildServices returns env-driven URLs (with loopback defaults)', () => {
    const services = buildServices();
    expect(services.map((s) => s.key)).toEqual(['mcp', 'nanobotServe', 'nanobotGateway']);
    for (const svc of services) {
      expect(svc.url).toMatch(/^https?:\/\//);
    }
  });

  test('env override on MCP_HEALTH_URL is honoured at request time', () => {
    const original = process.env.MCP_HEALTH_URL;
    process.env.MCP_HEALTH_URL = 'http://10.0.0.1:9999/healthz';
    try {
      const services = buildServices();
      expect(services[0].url).toBe('http://10.0.0.1:9999/healthz');
    } finally {
      if (original === undefined) delete process.env.MCP_HEALTH_URL;
      else process.env.MCP_HEALTH_URL = original;
    }
  });
});
