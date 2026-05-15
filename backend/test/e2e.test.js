// End-to-end test for the devboard surface (Ola/#220 D11 + Ola/#225-A auth).
//
// Boots the real Express tree against an in-process Mongo and exercises
// every panel endpoint via supertest. After #225-A, /api/dashboard/* is
// gated by requireAuth — `beforeAll` logs in and stashes the Set-Cookie
// header, then every protected call replays it via `.set('Cookie', ...)`.
// Public surfaces (/health, /api/auth/*, /unknown-path 404) stay cookie-less.

const path = require('path');
const fs = require('fs');
const os = require('os');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Logs panel needs MCP_LOG_FILE_PATH env. Wire to a temp file so the e2e
// log endpoint returns deterministic content.
const tmpLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devboard-e2e-'));
const tmpLogFile = path.join(tmpLogDir, 'mcp.log');
fs.writeFileSync(
  tmpLogFile,
  JSON.stringify({
    ts: new Date().toISOString(),
    tool: 'tools/list',
    input_hash: 'abc',
    latency_ms: 5,
    ok: true,
    code: null,
  }) + '\n'
);
process.env.MCP_LOG_FILE_PATH = tmpLogFile;

// Auth env — set before buildApp() so cookieParser + requireAuth can use them.
process.env.DEVBOARD_PASSWORD = 'e2e-test-password';
process.env.SESSION_SECRET = 'e2e-test-session-secret-32-chars-x';

require('@/models');
const buildApp = require('@/app');

let mongo;
let app;
let sessionCookie;

const ENDPOINTS = [
  { name: 'llm-usage', url: '/api/dashboard/llm-usage?range=7d' },
  { name: 'email-token-usage', url: '/api/dashboard/email-token-usage?range=7d' },
  { name: 'users/active', url: '/api/dashboard/users/active?windowMinutes=15' },
  { name: 'users/panorama', url: '/api/dashboard/users/panorama?range=7d' },
  { name: 'mcp-health', url: '/api/dashboard/mcp-health' },
  { name: 'logs', url: '/api/dashboard/logs?source=mcp&limit=5' },
  { name: 'db-summary', url: '/api/dashboard/db-summary' },
];

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = buildApp();
  const login = await supertest(app)
    .post('/api/auth/login')
    .send({ password: process.env.DEVBOARD_PASSWORD });
  if (login.status !== 200) {
    throw new Error(`e2e setup login failed: HTTP ${login.status}`);
  }
  sessionCookie = login.headers['set-cookie'];
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
  fs.rmSync(tmpLogDir, { recursive: true, force: true });
});

describe('e2e — every panel returns 200 + success:true (with session cookie)', () => {
  test.each(ENDPOINTS)('GET $url -> 200', async ({ url }) => {
    const res = await supertest(app).get(url).set('Cookie', sessionCookie);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.result).toBeDefined();
    expect(typeof res.body.message).toBe('string');
  });
});

describe('e2e — endpoint-specific shape contract', () => {
  test('llm-usage carries the documented top-level keys', async () => {
    const res = await supertest(app)
      .get('/api/dashboard/llm-usage?range=7d')
      .set('Cookie', sessionCookie);
    for (const k of [
      'range', 'totals', 'byProviderModel', 'topUsers',
      'erroredCount', 'byChannel',
    ]) {
      expect(res.body.result[k]).toBeDefined();
    }
  });

  test('email-token returns the empty-state envelope when no email rows seeded', async () => {
    const res = await supertest(app)
      .get('/api/dashboard/email-token-usage?range=7d')
      .set('Cookie', sessionCookie);
    expect(res.body.result.empty).toBe(true);
    expect(res.body.result.hint).toMatch(/email/i);
  });

  test('users/active carries dual-source metric keys', async () => {
    const res = await supertest(app)
      .get('/api/dashboard/users/active?windowMinutes=15')
      .set('Cookie', sessionCookie);
    for (const k of [
      'windowMinutes', 'activeSessionsLast', 'aiActiveUsersLast',
      'sessions', 'aiUsers',
    ]) {
      expect(res.body.result[k]).toBeDefined();
    }
  });

  test('users/panorama carries the documented top-level keys and rejects bad range', async () => {
    const ok = await supertest(app)
      .get('/api/dashboard/users/panorama?range=7d')
      .set('Cookie', sessionCookie);
    for (const k of [
      'range', 'windowStart', 'windowEnd', 'totalUsers',
      'activeWindowMinutes', 'users',
    ]) {
      expect(ok.body.result[k]).toBeDefined();
    }
    expect(Array.isArray(ok.body.result.users)).toBe(true);

    const bad = await supertest(app)
      .get('/api/dashboard/users/panorama?range=forever')
      .set('Cookie', sessionCookie);
    expect(bad.status).toBe(400);
    expect(bad.body.success).toBe(false);
  });

  test('mcp-health carries the three documented service keys', async () => {
    const res = await supertest(app)
      .get('/api/dashboard/mcp-health')
      .set('Cookie', sessionCookie);
    for (const k of ['mcp', 'nanobotServe', 'nanobotGateway']) {
      expect(res.body.result[k]).toBeDefined();
      expect(res.body.result[k].url).toMatch(/^https?:\/\//);
    }
  });

  test('logs returns logs[]/source/limit and rejects out-of-band limit', async () => {
    const ok = await supertest(app)
      .get('/api/dashboard/logs?source=mcp&limit=5')
      .set('Cookie', sessionCookie);
    expect(Array.isArray(ok.body.result.logs)).toBe(true);
    expect(ok.body.result.source).toBe('mcp');
    expect(ok.body.result.limit).toBe(5);

    const bad = await supertest(app)
      .get('/api/dashboard/logs?limit=501')
      .set('Cookie', sessionCookie);
    expect(bad.status).toBe(400);
    expect(bad.body.success).toBe(false);
  });

  test('db-summary carries collections[]/collectionCount and does not leak connection info', async () => {
    const res = await supertest(app)
      .get('/api/dashboard/db-summary')
      .set('Cookie', sessionCookie);
    expect(Array.isArray(res.body.result.collections)).toBe(true);
    expect(res.body.result.collectionCount).toBe(res.body.result.collections.length);

    const json = JSON.stringify(res.body);
    expect(json).not.toMatch(/mongodb(?:\+srv)?:\/\//i);
    expect(json).not.toMatch(/27017/);
  });
});

describe('e2e — auth gate on /api/dashboard/* (Ola/#225-A)', () => {
  test('GET /api/dashboard/llm-usage WITHOUT cookie → 401', async () => {
    const res = await supertest(app).get('/api/dashboard/llm-usage?range=7d');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('GET /api/dashboard/logs WITHOUT cookie → 401 (Joi runs after auth)', async () => {
    const res = await supertest(app).get('/api/dashboard/logs?limit=501');
    expect(res.status).toBe(401);
  });

  test('POST /api/auth/login wrong password → 401', async () => {
    const res = await supertest(app)
      .post('/api/auth/login')
      .send({ password: 'definitely-not-the-password' });
    expect(res.status).toBe(401);
  });
});

describe('e2e — top-level scaffold remains intact', () => {
  test('GET /health is unchanged from D10 (200 + ok:true)', async () => {
    const res = await supertest(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe('ola-devboard-backend');
  });

  test('GET /unknown-path returns the default 404', async () => {
    const res = await supertest(app).get('/totally-not-a-thing');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
