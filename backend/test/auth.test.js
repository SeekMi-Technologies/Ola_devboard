// Unit-ish tests for the auth surface (Ola/#225-A). Boots the real Express
// tree against in-process Mongo (matches the e2e pattern), but only exercises
// /api/auth/* and one protected route to prove the gate. Per-test cookies are
// captured via supertest's `headers['set-cookie']` array.

const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Env must be set BEFORE buildApp() is required, because cookieParser /
// requireAuth read SESSION_SECRET lazily at sign/verify time but the
// auth controllers read DEVBOARD_PASSWORD per request, so order is OK
// either way. We set both up front to be explicit.
process.env.DEVBOARD_PASSWORD = 'unit-test-password';
process.env.SESSION_SECRET = 'unit-test-session-secret-32-chars-x';

require('@/models');
const buildApp = require('@/app');

let mongo;
let app;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = buildApp();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

describe('auth — login / logout / me', () => {
  test('POST /api/auth/login with correct password → 200 + Set-Cookie devboard_session (HttpOnly)', async () => {
    const res = await supertest(app)
      .post('/api/auth/login')
      .send({ password: 'unit-test-password' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.result.authed).toBe(true);
    const setCookie = res.headers['set-cookie'];
    expect(Array.isArray(setCookie)).toBe(true);
    const joined = setCookie.join(';');
    expect(joined).toMatch(/devboard_session=/);
    expect(joined).toMatch(/HttpOnly/i);
  });

  test('POST /api/auth/login with wrong password → 401 + no cookie', async () => {
    const res = await supertest(app)
      .post('/api/auth/login')
      .send({ password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('POST /api/auth/login with missing password → 400 Joi', async () => {
    const res = await supertest(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('GET /api/auth/me without cookie → 200 + { authed:false } (public)', async () => {
    const res = await supertest(app).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.result.authed).toBe(false);
  });

  test('GET /api/auth/me with valid cookie → 200 + { authed:true }', async () => {
    const login = await supertest(app)
      .post('/api/auth/login')
      .send({ password: 'unit-test-password' });
    const cookie = login.headers['set-cookie'];
    const res = await supertest(app).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.result.authed).toBe(true);
  });

  test('POST /api/auth/logout clears cookie', async () => {
    const res = await supertest(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.result.authed).toBe(false);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie.join(';')).toMatch(/devboard_session=;/);
  });
});

describe('auth — gate on /api/dashboard/*', () => {
  test('GET /api/dashboard/llm-usage without cookie → 401', async () => {
    const res = await supertest(app).get('/api/dashboard/llm-usage?range=7d');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/auth/i);
  });

  test('GET /api/dashboard/llm-usage with tampered cookie → 401', async () => {
    const res = await supertest(app)
      .get('/api/dashboard/llm-usage?range=7d')
      .set('Cookie', 'devboard_session=junk.invalid');
    expect(res.status).toBe(401);
  });

  test('GET /api/dashboard/llm-usage with valid cookie → 200', async () => {
    const login = await supertest(app)
      .post('/api/auth/login')
      .send({ password: 'unit-test-password' });
    const cookie = login.headers['set-cookie'];
    const res = await supertest(app)
      .get('/api/dashboard/llm-usage?range=7d')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('auth — sanity for the public surface', () => {
  test('GET /health is public (no cookie needed)', async () => {
    const res = await supertest(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
