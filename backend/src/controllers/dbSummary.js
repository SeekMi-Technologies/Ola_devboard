// Per-collection ops time-out at 5s; allSettled isolates failures.
// Response: name + count + lastInserted{Id,At} only — no URI/host/user.
// No query parameters (would be SSRF-style).

const mongoose = require('mongoose');

const PER_COLLECTION_TIMEOUT_MS = 5000;

function withTimeout(promise, ms, onTimeout) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function summarizeCollection(coll) {
  const name = coll.name;
  const handle = mongoose.connection.db.collection(name);

  const countPromise = handle.countDocuments({}).catch((err) => ({
    __error: err && err.message ? err.message : 'count failed',
  }));
  const lastDocPromise = handle
    .find({}, { projection: { _id: 1, created: 1, removed: 1 } })
    .sort({ _id: -1 })
    .limit(1)
    .toArray()
    .then((arr) => arr[0] || null)
    .catch((err) => ({
      __error: err && err.message ? err.message : 'last-doc fetch failed',
    }));

  const [countResult, lastDocResult] = await Promise.all([
    withTimeout(countPromise, PER_COLLECTION_TIMEOUT_MS, () => '__timeout'),
    withTimeout(lastDocPromise, PER_COLLECTION_TIMEOUT_MS, () => '__timeout'),
  ]);

  const out = { name };

  if (countResult === '__timeout') {
    out.count = null;
    out.countError = 'timeout';
  } else if (countResult && typeof countResult === 'object' && countResult.__error) {
    out.count = null;
    out.countError = countResult.__error;
  } else {
    out.count = countResult;
  }

  if (lastDocResult === '__timeout') {
    out.lastInsertedAt = null;
    out.lastInsertedId = null;
    out.lastInsertedError = 'timeout';
  } else if (lastDocResult && lastDocResult.__error) {
    out.lastInsertedAt = null;
    out.lastInsertedId = null;
    out.lastInsertedError = lastDocResult.__error;
  } else if (lastDocResult) {
    out.lastInsertedId = String(lastDocResult._id);
    // ObjectId timestamp as fallback when `created` is missing.
    const idTs = lastDocResult._id && lastDocResult._id.getTimestamp
      ? lastDocResult._id.getTimestamp().toISOString()
      : null;
    out.lastInsertedAt = lastDocResult.created
      ? new Date(lastDocResult.created).toISOString()
      : idTs;
    if (typeof lastDocResult.removed === 'boolean') {
      out.lastDocRemoved = lastDocResult.removed;
    }
  } else {
    out.lastInsertedAt = null;
    out.lastInsertedId = null;
  }

  return out;
}

async function getDbSummary(req, res) {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      result: null,
      message: 'Database not connected',
    });
  }

  const collections = await mongoose.connection.db
    .listCollections({}, { nameOnly: true })
    .toArray();

  const settled = await Promise.allSettled(
    collections.map((c) => summarizeCollection(c))
  );

  const summaries = settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    // Defensive: summarizeCollection catches its own rejections.
    return {
      name: collections[i].name,
      count: null,
      countError: s.reason && s.reason.message ? s.reason.message : 'unknown error',
    };
  });

  // Default sort: newest activity first; FE table can re-sort.
  summaries.sort((a, b) => {
    const ta = a.lastInsertedAt ? Date.parse(a.lastInsertedAt) : 0;
    const tb = b.lastInsertedAt ? Date.parse(b.lastInsertedAt) : 0;
    if (tb !== ta) return tb - ta;
    return (b.count || 0) - (a.count || 0);
  });

  return res.status(200).json({
    success: true,
    result: {
      generatedAt: new Date().toISOString(),
      collectionCount: summaries.length,
      collections: summaries,
    },
    message: `DB summary across ${summaries.length} collections`,
  });
}

module.exports = getDbSummary;
module.exports.PER_COLLECTION_TIMEOUT_MS = PER_COLLECTION_TIMEOUT_MS;
