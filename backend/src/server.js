// Devboard backend entry point.
//
// Hard rule (v0): bind 127.0.0.1 only. Off-loopback exposure is a follow-up
// issue — we'd need real auth before binding 0.0.0.0.

// module-alias must be registered before any other require so subsequent
// `require('@/...')` calls resolve correctly at runtime (jest uses
// moduleNameMapper so tests don't need this register).
require('module-alias/register');

const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '..', '..', '.env'),
});
require('dotenv').config({
  path: path.resolve(__dirname, '..', '.env.local'),
  override: true,
});

const buildApp = require('./app');
const { connect: connectDb } = require('./db');

const PORT = Number(process.env.BACKEND_PORT) || 8890;
const HOST = '127.0.0.1';

async function main() {
  await connectDb();

  const app = buildApp();

  app.listen(PORT, HOST, () => {
    console.log(
      `[devboard-backend] listening on http://${HOST}:${PORT} (loopback only)`
    );
    console.log(
      `[devboard-backend] health probe: curl -i http://${HOST}:${PORT}/health`
    );
  });
}

main().catch((err) => {
  console.error('[devboard-backend] fatal during boot:', err && err.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[devboard-backend] unhandledRejection:', reason);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('[devboard-backend] uncaughtException:', err);
  process.exit(1);
});
