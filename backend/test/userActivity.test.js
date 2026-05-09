// Endpoint-only tests. The trackActivity middleware lives in CRM
// (devboard never sits in the request path that could write
// Admin.lastActivity); the corresponding middleware unit tests stay in
// CRM and are not duplicated here.

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

require('@/models');
const getUserActivity = require('@/controllers/userActivity');

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

describe('getUserActivity controller', () => {
  test('Joi rejects bad windowMinutes with 400', async () => {
    const res = stubRes();
    await getUserActivity({ query: { windowMinutes: 'forever' } }, res);
    expect(res._status).toBe(400);
  });

  test('empty DB returns zero counts and empty lists', async () => {
    const res = stubRes();
    await getUserActivity({ query: {} }, res);
    expect(res._status).toBe(200);
    expect(res._body.result.activeSessionsLast).toBe(0);
    expect(res._body.result.aiActiveUsersLast).toBe(0);
    expect(res._body.result.sessions).toEqual([]);
    expect(res._body.result.aiUsers).toEqual([]);
    expect(res._body.result.windowMinutes).toBe(15);
  });

  test('counts both signals: lastActivity-recent admins AND LlmUsage-recent userIds', async () => {
    const now = Date.now();
    const inWindow = new Date(now - 5 * 60 * 1000);
    const outWindow = new Date(now - 30 * 60 * 1000);

    const sessionUser1 = await Admin.create({
      email: 'session1@x.com', name: 'S1', enabled: true, removed: false,
      lastActivity: inWindow,
    });
    const sessionUser2 = await Admin.create({
      email: 'session2@x.com', name: 'S2', enabled: true, removed: false,
      lastActivity: inWindow,
    });
    await Admin.create({
      email: 'stale@x.com', name: 'St', enabled: true, removed: false,
      lastActivity: outWindow,
    });
    await Admin.create({
      email: 'disabled@x.com', name: 'D', enabled: false, removed: false,
      lastActivity: inWindow,
    });
    await Admin.create({
      email: 'removed@x.com', name: 'R', enabled: true, removed: true,
      lastActivity: inWindow,
    });

    const aiOnlyUser = await Admin.create({
      email: 'aionly@x.com', name: 'A', enabled: true, removed: false,
      lastActivity: outWindow,
    });
    await LlmUsage.create([
      makeUsageRow(aiOnlyUser._id, { created: new Date(now - 2 * 60 * 1000) }),
      makeUsageRow(sessionUser1._id, { created: new Date(now - 1 * 60 * 1000) }),
      makeUsageRow(sessionUser2._id, { created: outWindow }),
    ]);

    const res = stubRes();
    await getUserActivity({ query: { windowMinutes: 15 } }, res);
    expect(res._status).toBe(200);
    const r = res._body.result;
    expect(r.activeSessionsLast).toBe(2);
    expect(r.aiActiveUsersLast).toBe(2);

    const sessionEmails = r.sessions.map((s) => s.email).sort();
    expect(sessionEmails).toEqual(['session1@x.com', 'session2@x.com']);
    const aiEmails = r.aiUsers.map((u) => u.email).sort();
    expect(aiEmails).toEqual(['aionly@x.com', 'session1@x.com']);
  });
});
