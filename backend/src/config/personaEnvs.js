// Per-environment config for the persona control-plane. Each environment points
// at that env's nanobot persona API (Tailscale) plus the Mongo it stores admins
// in (so we can render id -> name). Values come from env vars; nothing hardcoded.
//
// Read-only against Mongo (id -> name lookups only). Persona edits go to nanobot
// over HTTP, never to Mongo — so the repo's read-only guard still holds.
const mongoose = require('mongoose');

const ENVS = {
  prod: {
    nanobotUrl: process.env.PERSONA_PROD_NANOBOT_URL, // e.g. http://100.83.72.110:8902
    token: process.env.PERSONA_PROD_TOKEN,
    mongoUri: process.env.PERSONA_PROD_MONGO, // optional; falls back to default DATABASE
  },
  staging: {
    nanobotUrl: process.env.PERSONA_STAGING_NANOBOT_URL,
    token: process.env.PERSONA_STAGING_TOKEN,
    mongoUri: process.env.PERSONA_STAGING_MONGO,
  },
};

function isConfigured(env) {
  const c = ENVS[env];
  return !!(c && c.nanobotUrl && c.token);
}

function listEnvs() {
  return Object.keys(ENVS).filter(isConfigured);
}

function envConfig(env) {
  return isConfigured(env) ? ENVS[env] : null;
}

// Slim, read-only Admin view for name resolution — separate from the default
// connection's Admin model so a per-env Mongo (e.g. staging=dev DB) works too.
const adminSchema = new mongoose.Schema(
  { email: String, name: String, surname: String },
  { strict: false, collection: 'admins' }
);
const _conns = {};
const _models = {};

function adminModel(env) {
  const uri = ENVS[env] && ENVS[env].mongoUri;
  if (!uri) return mongoose.model('Admin'); // default connection (DATABASE)
  if (!_conns[env]) _conns[env] = mongoose.createConnection(uri);
  if (!_models[env]) _models[env] = _conns[env].model('Admin', adminSchema);
  return _models[env];
}

// ids -> Map(id -> {name, surname, email}); only 24-hex ObjectId strings queried.
async function resolveNames(env, ids) {
  const valid = ids.filter((id) => /^[a-fA-F0-9]{24}$/.test(id));
  if (!valid.length) return new Map();
  const docs = await adminModel(env)
    .find({ _id: { $in: valid } }, { email: 1, name: 1, surname: 1 })
    .lean();
  return new Map(docs.map((d) => [String(d._id), d]));
}

module.exports = { listEnvs, envConfig, isConfigured, resolveNames };
