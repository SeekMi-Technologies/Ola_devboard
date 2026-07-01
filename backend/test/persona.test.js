// Unit tests for the persona control-plane BFF. nanobot + Mongo are mocked so
// the jest run never needs a real box or Atlas.

jest.mock('@/config/personaEnvs', () => ({
  listEnvs: () => ['staging'],
  envConfig: (e) => (e === 'staging' ? { nanobotUrl: 'http://fake', token: 'tok' } : null),
  resolveNames: jest.fn(async () => new Map()),
}));

const persona = require('@/controllers/persona');
const { resolveNames } = require('@/config/personaEnvs');

function stubRes() {
  return {
    _status: 200,
    _body: null,
    status(s) {
      this._status = s;
      return this;
    },
    json(b) {
      this._body = b;
      return this;
    },
  };
}

function mockFetch(status, payload) {
  global.fetch = jest.fn(async () => ({
    status,
    text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
  }));
}

afterEach(() => {
  jest.clearAllMocks();
  delete global.fetch;
});

describe('persona control-plane BFF', () => {
  test('getPersonaEnvs returns configured envs', async () => {
    const res = stubRes();
    await persona.getPersonaEnvs({}, res);
    expect(res._body).toEqual({ success: true, result: ['staging'] });
  });

  test('unknown/unconfigured env -> 400', async () => {
    const res = stubRes();
    await persona.listPersonas({ query: { env: 'nope' } }, res);
    expect(res._status).toBe(400);
    expect(res._body.success).toBe(false);
  });

  test('listPersonas joins nanobot admins with CRM names', async () => {
    mockFetch(200, {
      admins: [
        { adminId: '6a03e003dcaca7e136b3fc03', soulSource: 'override', updatedAt: 1 },
        { adminId: '6a24c414ba8b01b0c5e8584b', soulSource: 'global', updatedAt: null },
      ],
    });
    resolveNames.mockResolvedValueOnce(
      new Map([['6a03e003dcaca7e136b3fc03', { name: 'Sydy', surname: 'Liu', email: 's@x.com' }]])
    );
    const res = stubRes();
    await persona.listPersonas({ query: { env: 'staging' } }, res);
    const rows = res._body.result.admins;
    expect(rows[0]).toEqual({
      adminId: '6a03e003dcaca7e136b3fc03',
      name: 'Sydy Liu',
      email: 's@x.com',
      soulSource: 'override',
      updatedAt: 1,
    });
    // no CRM record -> name null, not a crash
    expect(rows[1].name).toBeNull();
    expect(rows[1].email).toBeNull();
  });

  test('listPersonas surfaces nanobot failure as 502', async () => {
    mockFetch(500, { error: 'boom' });
    const res = stubRes();
    await persona.listPersonas({ query: { env: 'staging' } }, res);
    expect(res._status).toBe(502);
  });

  test('getPersona proxies effective files', async () => {
    mockFetch(200, { adminId: 'x', files: { 'SOUL.md': { content: 'hi', source: 'override' } } });
    const res = stubRes();
    await persona.getPersona({ query: {}, params: { env: 'staging', adminId: 'x' } }, res);
    expect(res._body.success).toBe(true);
    expect(res._body.result.files['SOUL.md'].content).toBe('hi');
  });

  test('putPersona rejects non-string content without calling nanobot', async () => {
    global.fetch = jest.fn();
    const res = stubRes();
    await persona.putPersona(
      { query: {}, params: { env: 'staging', adminId: 'x', file: 'SOUL.md' }, body: { content: 123 } },
      res
    );
    expect(res._status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('putPersona writes SOUL and returns nanobot result', async () => {
    mockFetch(200, { adminId: 'x', file: 'SOUL.md', bytes: 5, source: 'override' });
    const res = stubRes();
    await persona.putPersona(
      { query: {}, params: { env: 'staging', adminId: 'x', file: 'SOUL.md' }, body: { content: 'hello' } },
      res
    );
    expect(res._body.success).toBe(true);
    expect(res._body.result.source).toBe('override');
  });

  test('putPersona passes through a 403 (AGENTS/TOOLS forbidden) from nanobot', async () => {
    mockFetch(403, { error: 'AGENTS.md is not editable per-admin' });
    const res = stubRes();
    await persona.putPersona(
      { query: {}, params: { env: 'staging', adminId: 'x', file: 'AGENTS.md' }, body: { content: 'x' } },
      res
    );
    expect(res._status).toBe(403);
  });
});
