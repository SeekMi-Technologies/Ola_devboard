const fs = require('fs');
const os = require('os');
const path = require('path');

const maskSecrets = require('@/utils/redactor');
const getLogs = require('@/controllers/logs');

let tmpDir;
let tmpFile;
let originalEnv;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devboard-logs-'));
  tmpFile = path.join(tmpDir, 'mcp.log');
  originalEnv = process.env.MCP_LOG_FILE_PATH;
  process.env.MCP_LOG_FILE_PATH = tmpFile;
});

afterAll(() => {
  if (originalEnv === undefined) delete process.env.MCP_LOG_FILE_PATH;
  else process.env.MCP_LOG_FILE_PATH = originalEnv;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
});

function stubRes() {
  const res = {
    _status: null,
    _body: null,
    status(s) { this._status = s; return this; },
    json(b) { this._body = b; return this; },
  };
  return res;
}

function makeLine(overrides = {}) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    tool: 'mcp.request',
    input_hash: 'aaaaaaaa',
    latency_ms: 42,
    ok: true,
    code: null,
    ...overrides,
  });
}

describe('redactor util', () => {
  test('masks Bearer tokens (case-insensitive)', () => {
    expect(maskSecrets('Authorization: Bearer abc123def456')).toContain('***MASKED***');
    expect(maskSecrets('Authorization: bearer xyz789')).toContain('***MASKED***');
  });

  test('masks sk- keys but not innocuous "sk-" substrings', () => {
    expect(maskSecrets('key=sk-abc123def456ghi789')).toContain('***MASKED***');
    expect(maskSecrets('item-sku-12 not a credential')).toBe('item-sku-12 not a credential');
  });

  test('masks Slack tokens and GitHub PATs', () => {
    expect(maskSecrets('xoxb-1234-5678-abcdef')).toContain('***MASKED***');
    expect(maskSecrets('ghp_aaaaaaaaaaaaaaaaaaaaaaaaa')).toContain('***MASKED***');
  });

  test('masks MongoDB connection strings', () => {
    expect(maskSecrets('mongodb://user:pass@host/db')).toContain('***MASKED***');
    expect(maskSecrets('mongodb+srv://u:p@cluster.x.net/d')).toContain('***MASKED***');
  });

  test('passes through null/undefined/empty', () => {
    expect(maskSecrets(null)).toBeNull();
    expect(maskSecrets(undefined)).toBeUndefined();
    expect(maskSecrets('')).toBe('');
  });

  test('does not retain a partial token after masking', () => {
    const out = maskSecrets('Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig');
    expect(out).not.toContain('eyJhbGc');
    expect(out).not.toContain('payload');
  });
});

describe('getLogs controller', () => {
  test('Joi rejects bad source', async () => {
    const res = stubRes();
    await getLogs({ query: { source: 'nanobot' } }, res);
    expect(res._status).toBe(400);
  });

  test('Joi rejects limit out of [1, 500]', async () => {
    const res0 = stubRes();
    await getLogs({ query: { limit: 0 } }, res0);
    expect(res0._status).toBe(400);
    const res501 = stubRes();
    await getLogs({ query: { limit: 501 } }, res501);
    expect(res501._status).toBe(400);
  });

  test('returns empty 200 (not 500) when log file is missing', async () => {
    const res = stubRes();
    await getLogs({ query: {} }, res);
    expect(res._status).toBe(200);
    expect(res._body.result.logs).toEqual([]);
  });

  test('returns hint when MCP_LOG_FILE_PATH env is unset', async () => {
    const saved = process.env.MCP_LOG_FILE_PATH;
    delete process.env.MCP_LOG_FILE_PATH;
    try {
      const res = stubRes();
      await getLogs({ query: {} }, res);
      expect(res._status).toBe(200);
      expect(res._body.result.logs).toEqual([]);
      expect(res._body.result.hint).toMatch(/not configured/i);
    } finally {
      process.env.MCP_LOG_FILE_PATH = saved;
    }
  });

  test('tails 100 most-recent valid lines, drops malformed, masks secrets', async () => {
    const valid = [];
    for (let i = 0; i < 200; i++) valid.push(makeLine({ tool: `t${i}`, latency_ms: i }));
    const malformed = ['{not json', '}{}', 'plain text', '{"unclosed":', '{"tool":}'];
    const bearerLine = makeLine({
      ok: false, code: 'INTERNAL', tool: 'leak.bearer',
      message: 'failed: Authorization: Bearer abc123def456 was rejected',
    });
    const skLine = makeLine({
      ok: false, code: 'INTERNAL', tool: 'leak.sk',
      message: 'OpenAI returned 401 for sk-proj-AbCdEf12345xyz',
    });
    fs.writeFileSync(tmpFile, [...valid, ...malformed, bearerLine, skLine].join('\n') + '\n');

    const res = stubRes();
    await getLogs({ query: { limit: 100 } }, res);
    expect(res._status).toBe(200);

    const r = res._body.result;
    expect(r.logs.length).toBeGreaterThanOrEqual(95);
    expect(r.logs.length).toBeLessThanOrEqual(100);

    const tools = r.logs.map((l) => l.tool);
    expect(tools[0]).toBe('leak.sk');
    expect(tools[1]).toBe('leak.bearer');

    expect(r.logs[0].message).toContain('***MASKED***');
    expect(r.logs[0].message).not.toContain('AbCdEf12345xyz');
    expect(r.logs[1].message).toContain('***MASKED***');
    expect(r.logs[1].message).not.toContain('abc123def456');
  });

  test('respects custom limit (limit=10 returns ≤10 entries)', async () => {
    const lines = [];
    for (let i = 0; i < 50; i++) lines.push(makeLine({ tool: `t${i}` }));
    fs.writeFileSync(tmpFile, lines.join('\n') + '\n');
    const res = stubRes();
    await getLogs({ query: { limit: 10 } }, res);
    expect(res._body.result.logs.length).toBeLessThanOrEqual(10);
  });
});
