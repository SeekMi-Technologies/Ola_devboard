// Devboard backend entry point.
//
// Hard rule (v0): bind 127.0.0.1 only. Off-loopback exposure is a follow-up
// issue — we'd need real auth before binding 0.0.0.0.
//
// .env loading order: top-level `.env` first (which is the convention for
// this single-process app — backend and frontend share the same .env);
// then a per-process override at backend/.env.local if it exists.

const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '..', '..', '.env'),
});
require('dotenv').config({
  path: path.resolve(__dirname, '..', '.env.local'),
  override: true,
});

const buildApp = require('./app');

const PORT = Number(process.env.BACKEND_PORT) || 8890;
const HOST = '127.0.0.1';

const app = buildApp();

app.listen(PORT, HOST, () => {
  console.log(
    `[devboard-backend] listening on http://${HOST}:${PORT} (loopback only)`
  );
  console.log(
    `[devboard-backend] health probe: curl -i http://${HOST}:${PORT}/health`
  );
  if (!process.env.DATABASE) {
    console.warn(
      '[devboard-backend] WARNING: DATABASE env not set — D11 panel endpoints will fail at request time. Copy .env.example -> .env at the repo root.'
    );
  }
});

// Crash-fast on the surprising stuff. Keep matching CRM/MCP behaviour.
process.on('unhandledRejection', (reason) => {
  console.error('[devboard-backend] unhandledRejection:', reason);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('[devboard-backend] uncaughtException:', err);
  process.exit(1);
});
