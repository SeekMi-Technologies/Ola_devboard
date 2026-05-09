const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

require('@/models');
const getEmailToken = require('@/controllers/emailToken');

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

describe('getEmailToken controller', () => {
  test('returns { empty:true, hint } when no email-channel rows in window', async () => {
    await LlmUsage.create([
      makeRow({ channel: 'ask-ola' }),
      makeRow({ channel: 'ask-ola-autotitle' }),
      makeRow({ channel: 'whatsapp' }),
    ]);
    const res = stubRes();
    await getEmailToken({ query: { range: '7d' } }, res);
    expect(res._status).toBe(200);
    expect(res._body.result.empty).toBe(true);
    expect(res._body.result.hint).toMatch(/email/i);
    expect(res._body.result.totals).toBeUndefined();
  });

  test('aggregates email-channel rows + excludes non-email rows', async () => {
    const u1 = new mongoose.Types.ObjectId();
    const u2 = new mongoose.Types.ObjectId();
    await LlmUsage.create([
      ...Array.from({ length: 5 }, () =>
        makeRow({ userId: u1, channel: 'email', totalTokens: 200, costUsd: 0.001 })),
      ...Array.from({ length: 3 }, () =>
        makeRow({ userId: u2, channel: 'email-imap', totalTokens: 100, costUsd: 0.0005 })),
      ...Array.from({ length: 4 }, () =>
        makeRow({ channel: 'ask-ola', totalTokens: 9999, costUsd: 99 })),
    ]);

    const res = stubRes();
    await getEmailToken({ query: { range: '7d' } }, res);
    const r = res._body.result;
    expect(r.empty).toBe(false);
    expect(r.totals.records).toBe(8);
    expect(r.totals.total).toBe(5 * 200 + 3 * 100);

    const channels = r.byChannel.map((c) => c.channel).sort();
    expect(channels).toEqual(['email', 'email-imap']);
    expect(r.topUsers.length).toBe(2);
  });
});
