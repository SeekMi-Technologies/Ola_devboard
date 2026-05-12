// Endpoint-only tests for the Users panorama panel. Reads Admin + LlmUsage
// and joins JS-side; mongodb-memory-server lets us assert the join logic
// against real mongoose queries.

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

require('@/models');
const getUserPanorama = require('@/controllers/userPanorama');

let mongo;
let Admin;
let LlmUsage;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  Admin = mongoose.model('Admin');
  LlmUsage = mongoose.model('LlmUsage');
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  await Admin.deleteMany({});
  await LlmUsage.deleteMany({});
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

function makeUsageRow(userId, overrides = {}) {
  return {
    userId,
    sessionId: new mongoose.Types.ObjectId(),
    nanobotSessionId: 'sess', requestId: 'r',
    channel: 'ask-ola',
    provider: 'gemini', model: 'gemini-2.0-flash',
    inputTokens: 1, outputTokens: 1, totalTokens: 2,
    cachedTokens: 0, iterations: 1,
    costUsd: 0, pricingVersion: 't',
    latencyMs: 10, errored: false,
    created: new Date(),
    ...overrides,
  };
}

describe('getUserPanorama controller', () => {
  test('Joi rejects bad range with 400', async () => {
    const res = stubRes();
    await getUserPanorama({ query: { range: 'forever' } }, res);
    expect(res._status).toBe(400);
    expect(res._body.success).toBe(false);
    expect(res._body.message).toMatch(/range/);
  });

  test('Joi rejects out-of-band limit with 400', async () => {
    const res = stubRes();
    await getUserPanorama({ query: { limit: 9999 } }, res);
    expect(res._status).toBe(400);
    expect(res._body.success).toBe(false);
  });

  test('empty DB returns zero totalUsers and empty users[]', async () => {
    const res = stubRes();
    await getUserPanorama({ query: {} }, res);
    expect(res._status).toBe(200);
    const r = res._body.result;
    expect(r.totalUsers).toBe(0);
    expect(r.users).toEqual([]);
    expect(r.range).toBe('7d');
    expect(r.activeWindowMinutes).toBe(15);
    expect(typeof r.windowStart).toBe('string');
    expect(typeof r.windowEnd).toBe('string');
  });

  test('removed admins are excluded from totalUsers and users[]', async () => {
    await Admin.create({
      email: 'live@x.com', name: 'L', enabled: true, removed: false,
    });
    await Admin.create({
      email: 'gone@x.com', name: 'G', enabled: true, removed: true,
    });

    const res = stubRes();
    await getUserPanorama({ query: {} }, res);
    expect(res._status).toBe(200);
    expect(res._body.result.totalUsers).toBe(1);
    expect(res._body.result.users.map((u) => u.email)).toEqual(['live@x.com']);
  });

  test('joins LlmUsage totals onto matching admin; missing users get zeros', async () => {
    const now = Date.now();
    const inWindow = new Date(now - 60 * 60 * 1000);

    const heavyUser = await Admin.create({
      email: 'heavy@x.com', name: 'H', enabled: true, removed: false,
      lastActivity: new Date(now - 60 * 1000),
    });
    const quietUser = await Admin.create({
      email: 'quiet@x.com', name: 'Q', enabled: true, removed: false,
      lastActivity: new Date(now - 24 * 60 * 60 * 1000),
    });

    await LlmUsage.create([
      makeUsageRow(heavyUser._id, {
        created: inWindow, inputTokens: 100, outputTokens: 50, totalTokens: 150, costUsd: 0.001,
      }),
      makeUsageRow(heavyUser._id, {
        created: inWindow, inputTokens: 10, outputTokens: 5, totalTokens: 15, costUsd: 0.0005,
      }),
    ]);

    const res = stubRes();
    await getUserPanorama({ query: { range: '7d' } }, res);
    expect(res._status).toBe(200);
    const byEmail = Object.fromEntries(res._body.result.users.map((u) => [u.email, u]));

    expect(byEmail['heavy@x.com'].requests).toBe(2);
    expect(byEmail['heavy@x.com'].totalTokens).toBe(165);
    expect(byEmail['heavy@x.com'].costUsd).toBeCloseTo(0.0015, 6);

    expect(byEmail['quiet@x.com'].requests).toBe(0);
    expect(byEmail['quiet@x.com'].totalTokens).toBe(0);
    expect(byEmail['quiet@x.com'].costUsd).toBe(0);
  });

  test('activeNow flag honors the 15-minute boundary', async () => {
    const now = Date.now();
    await Admin.create({
      email: 'active@x.com', name: 'A', enabled: true, removed: false,
      lastActivity: new Date(now - 5 * 60 * 1000),
    });
    await Admin.create({
      email: 'stale@x.com', name: 'S', enabled: true, removed: false,
      lastActivity: new Date(now - 30 * 60 * 1000),
    });
    await Admin.create({
      email: 'never@x.com', name: 'N', enabled: true, removed: false,
      lastActivity: null,
    });

    const res = stubRes();
    await getUserPanorama({ query: {} }, res);
    expect(res._status).toBe(200);
    const byEmail = Object.fromEntries(res._body.result.users.map((u) => [u.email, u]));
    expect(byEmail['active@x.com'].activeNow).toBe(true);
    expect(byEmail['stale@x.com'].activeNow).toBe(false);
    expect(byEmail['never@x.com'].activeNow).toBe(false);
  });

  test('limit caps users[] length; totalUsers still counts entire DB', async () => {
    const now = Date.now();
    for (let i = 0; i < 6; i++) {
      await Admin.create({
        email: `u${i}@x.com`, name: `U${i}`, enabled: true, removed: false,
        lastActivity: new Date(now - i * 1000),
      });
    }

    const res = stubRes();
    await getUserPanorama({ query: { limit: 3 } }, res);
    expect(res._status).toBe(200);
    expect(res._body.result.totalUsers).toBe(6);
    expect(res._body.result.users.length).toBe(3);
    expect(res._body.result.users[0].email).toBe('u0@x.com');
  });

  test('disabled admins are still listed with enabled:false', async () => {
    await Admin.create({
      email: 'on@x.com', name: 'On', enabled: true, removed: false,
    });
    await Admin.create({
      email: 'off@x.com', name: 'Off', enabled: false, removed: false,
    });

    const res = stubRes();
    await getUserPanorama({ query: {} }, res);
    expect(res._status).toBe(200);
    const byEmail = Object.fromEntries(res._body.result.users.map((u) => [u.email, u]));
    expect(byEmail['on@x.com'].enabled).toBe(true);
    expect(byEmail['off@x.com'].enabled).toBe(false);
  });
});
