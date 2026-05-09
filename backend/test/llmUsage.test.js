const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

require('@/models');
const getLlmUsage = require('@/controllers/llmUsage');

let mongo;
let LlmUsage;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  LlmUsage = mongoose.model('LlmUsage');
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  await LlmUsage.deleteMany({});
  await mongoose.model('Admin').deleteMany({});
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

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function makeRow(overrides = {}) {
  const userId = overrides.userId || new mongoose.Types.ObjectId();
  return {
    userId,
    sessionId: new mongoose.Types.ObjectId(),
    nanobotSessionId: 'sess', requestId: 'r',
    channel: 'ask-ola',
    provider: 'gemini', model: 'gemini-2.0-flash',
    inputTokens: 100, outputTokens: 50, totalTokens: 150,
    cachedTokens: 0, iterations: 1,
    costUsd: 0.0001, pricingVersion: 't',
    latencyMs: 500, errored: false,
    created: new Date(),
    ...overrides,
  };
}

describe('getLlmUsage controller', () => {
  test('Joi rejects invalid range with 400', async () => {
    const res = stubRes();
    await getLlmUsage({ query: { range: 'foo' } }, res);
    expect(res._status).toBe(400);
    expect(res._body.success).toBe(false);
  });

  test('empty collection returns zero totals and empty arrays', async () => {
    const res = stubRes();
    await getLlmUsage({ query: { range: 'today' } }, res);
    expect(res._status).toBe(200);
    expect(res._body.result.totals).toEqual({
      records: 0, input: 0, output: 0, cached: 0, total: 0, costUsd: 0,
    });
    expect(res._body.result.byProviderModel).toEqual([]);
    expect(res._body.result.topUsers).toEqual([]);
    expect(res._body.result.erroredCount).toBe(0);
    expect(res._body.result.byChannel).toEqual([]);
  });

  test('7d window aggregates totals + groups + errored', async () => {
    const u1 = new mongoose.Types.ObjectId();
    const u2 = new mongoose.Types.ObjectId();
    const now = Date.now();
    await LlmUsage.create([
      ...Array.from({ length: 6 }, (_, i) => makeRow({
        userId: u1, channel: 'ask-ola',
        provider: 'gemini', model: 'gemini-2.0-flash',
        inputTokens: 100, outputTokens: 50, totalTokens: 150,
        cachedTokens: 10, costUsd: 0.0001,
        created: new Date(now - i * HOUR_MS),
      })),
      ...Array.from({ length: 4 }, (_, i) => makeRow({
        userId: u2, channel: 'email',
        provider: 'openai', model: 'gpt-4o',
        inputTokens: 200, outputTokens: 100, totalTokens: 300,
        cachedTokens: 0, costUsd: 0.001,
        created: new Date(now - (i + 1) * HOUR_MS),
      })),
      makeRow({ userId: u1, errored: true, totalTokens: 999, costUsd: 0,
        created: new Date(now - 2 * HOUR_MS) }),
      makeRow({ userId: u2, errored: true, totalTokens: 999, costUsd: 0,
        created: new Date(now - 3 * HOUR_MS) }),
    ]);

    const res = stubRes();
    await getLlmUsage({ query: { range: '7d' } }, res);
    const r = res._body.result;
    expect(r.totals.records).toBe(12);
    expect(r.totals.total).toBe(6 * 150 + 4 * 300 + 2 * 999);
    expect(r.totals.input).toBe(6 * 100 + 4 * 200 + 2 * 100);
    expect(r.totals.cached).toBe(6 * 10);
    expect(r.totals.costUsd).toBeCloseTo(6 * 0.0001 + 4 * 0.001, 6);
    expect(r.erroredCount).toBe(2);

    const buckets = new Set(r.byProviderModel.map((b) => `${b.provider}/${b.model}`));
    expect(buckets.has('gemini/gemini-2.0-flash')).toBe(true);
    expect(buckets.has('openai/gpt-4o')).toBe(true);

    const channels = new Set(r.byChannel.map((c) => c.channel));
    expect(channels.has('ask-ola')).toBe(true);
    expect(channels.has('email')).toBe(true);
  });

  test('topUsers sorted by totalTokens desc, limit 10 + Admin populate', async () => {
    const userIds = Array.from({ length: 12 }, () => new mongoose.Types.ObjectId());
    await LlmUsage.create(
      userIds.map((userId, i) => makeRow({ userId, totalTokens: (12 - i) * 100 }))
    );
    const Admin = mongoose.model('Admin');
    await Admin.create([
      { _id: userIds[0], email: 'top@x.com', name: 'Top', surname: 'User', enabled: true, removed: false },
      { _id: userIds[1], email: 'second@x.com', name: 'Second', surname: 'User', enabled: true, removed: false },
    ]);

    const res = stubRes();
    await getLlmUsage({ query: { range: '7d' } }, res);
    const top = res._body.result.topUsers;
    expect(top.length).toBe(10);
    for (let i = 0; i < top.length - 1; i++) {
      expect(top[i].totalTokens).toBeGreaterThanOrEqual(top[i + 1].totalTokens);
    }
    expect(top[0].email).toBe('top@x.com');
    expect(top[2].email).toBeNull();
    expect(top[2].name).toBe('(unknown)');
  });

  test('time window includes/excludes the right rows', async () => {
    const now = Date.now();
    await LlmUsage.create([
      makeRow({ created: new Date(now - 2 * DAY_MS), totalTokens: 1 }),
      makeRow({ created: new Date(now - 25 * DAY_MS), totalTokens: 10 }),
      makeRow({ created: new Date(now - 90 * DAY_MS), totalTokens: 100 }),
    ]);

    const todayRes = stubRes();
    await getLlmUsage({ query: { range: 'today' } }, todayRes);
    expect(todayRes._body.result.totals.records).toBe(0);

    const sevenRes = stubRes();
    await getLlmUsage({ query: { range: '7d' } }, sevenRes);
    expect(sevenRes._body.result.totals.records).toBe(1);

    const thirtyRes = stubRes();
    await getLlmUsage({ query: { range: '30d' } }, thirtyRes);
    expect(thirtyRes._body.result.totals.records).toBe(2);
  });
});
