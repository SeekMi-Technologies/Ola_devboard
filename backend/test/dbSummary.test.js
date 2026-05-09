const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

require('@/models');
const getDbSummary = require('@/controllers/dbSummary');

let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  const collections = await mongoose.connection.db.listCollections().toArray();
  for (const c of collections) {
    await mongoose.connection.db.collection(c.name).deleteMany({});
  }
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

describe('getDbSummary controller', () => {
  test('returns 503 when mongoose is not connected', async () => {
    await mongoose.disconnect();
    try {
      const res = stubRes();
      await getDbSummary({}, res);
      expect(res._status).toBe(503);
      expect(res._body.success).toBe(false);
      expect(res._body.message).toMatch(/not connected/i);
    } finally {
      await mongoose.connect(mongo.getUri());
    }
  });

  test('lists all collections with count + lastInserted shape', async () => {
    const Admin = mongoose.model('Admin');
    const LlmUsage = mongoose.model('LlmUsage');

    const admin = await Admin.create({
      email: 'a@x.com', name: 'A', enabled: true, removed: false,
    });
    await LlmUsage.create({
      userId: admin._id,
      sessionId: new mongoose.Types.ObjectId(),
      nanobotSessionId: 'sess', requestId: 'req-1',
      provider: 'gemini', model: 'gemini-2.0-flash',
      inputTokens: 1, outputTokens: 1, totalTokens: 2,
      cachedTokens: 0, iterations: 1,
      costUsd: 0, pricingVersion: 't',
      latencyMs: 10, errored: false,
    });

    const res = stubRes();
    await getDbSummary({}, res);
    expect(res._status).toBe(200);
    expect(res._body.success).toBe(true);
    expect(Array.isArray(res._body.result.collections)).toBe(true);
    expect(res._body.result.collectionCount).toBe(res._body.result.collections.length);

    const names = res._body.result.collections.map((c) => c.name);
    expect(names).toContain('admins');
    expect(names).toContain('llmusage');

    const adminEntry = res._body.result.collections.find((c) => c.name === 'admins');
    expect(adminEntry.count).toBe(1);
    expect(typeof adminEntry.lastInsertedId).toBe('string');
    expect(typeof adminEntry.lastInsertedAt).toBe('string');
    expect(adminEntry.lastInsertedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('empty collection reports count:0 and null lastInserted fields', async () => {
    const Admin = mongoose.model('Admin');
    const a = await Admin.create({
      email: 'tmp@x.com', name: 'T', enabled: true, removed: false,
    });
    await Admin.deleteOne({ _id: a._id });

    const res = stubRes();
    await getDbSummary({}, res);

    const adminEntry = res._body.result.collections.find((c) => c.name === 'admins');
    expect(adminEntry).toBeDefined();
    expect(adminEntry.count).toBe(0);
    expect(adminEntry.lastInsertedAt).toBeNull();
    expect(adminEntry.lastInsertedId).toBeNull();
  });

  test('does not leak connection string / db name / mongo user in the response', async () => {
    const res = stubRes();
    await getDbSummary({}, res);

    const json = JSON.stringify(res._body);
    expect(json).not.toMatch(/mongodb(?:\+srv)?:\/\//i);
    expect(json).not.toMatch(/27017/);
    expect(res._body.result.dbName).toBeUndefined();
    expect(res._body.result.connectionString).toBeUndefined();
    expect(res._body.result.host).toBeUndefined();
  });

  test('default sort puts freshest-write collection first', async () => {
    const Admin = mongoose.model('Admin');
    const LlmUsage = mongoose.model('LlmUsage');

    const admin = await Admin.create({
      email: 'a@x.com', name: 'A', enabled: true, removed: false,
    });
    await new Promise((r) => setTimeout(r, 25));
    await LlmUsage.create({
      userId: admin._id,
      sessionId: new mongoose.Types.ObjectId(),
      nanobotSessionId: 'sess', requestId: 'req-2',
      provider: 'gemini', model: 'gemini-2.0-flash',
      inputTokens: 1, outputTokens: 1, totalTokens: 2,
      cachedTokens: 0, iterations: 1,
      costUsd: 0, pricingVersion: 't',
      latencyMs: 10, errored: false,
    });

    const res = stubRes();
    await getDbSummary({}, res);
    const names = res._body.result.collections.map((c) => c.name);
    const idxAdmin = names.indexOf('admins');
    const idxLlm = names.indexOf('llmusage');
    expect(idxLlm).toBeGreaterThanOrEqual(0);
    expect(idxAdmin).toBeGreaterThanOrEqual(0);
    expect(idxLlm).toBeLessThan(idxAdmin);
  });

  test('rejects no query parameters — endpoint is parameterless by design', async () => {
    const res = stubRes();
    await getDbSummary({ query: { coll: 'admins', evil: 'x' } }, res);
    expect(res._status).toBe(200);
    const json = JSON.stringify(res._body);
    expect(json).not.toMatch(/"coll"/);
    expect(json).not.toMatch(/"evil"/);
  });
});
