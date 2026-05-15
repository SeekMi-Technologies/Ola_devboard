require('module-alias/register');

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local'), override: true });

const buildApp = require('./app');
const { connect: connectDb } = require('./db');

const PORT = Number(process.env.BACKEND_PORT) || 8890;
// Default loopback; only override (e.g. '0.0.0.0' on box4) once auth is on.
// Auth landed in Ola/#225-A, so off-loopback is now safe behind the gate.
const HOST = process.env.BACKEND_HOST || '127.0.0.1';

async function main() {
  await connectDb();

  const app = buildApp();

  const bindDesc = HOST === '127.0.0.1' ? 'loopback only' : `bind ${HOST}`;
  app.listen(PORT, HOST, () => {
    console.log(
      `[devboard-backend] listening on http://${HOST}:${PORT} (${bindDesc})`
    );
    const probeHost = HOST === '0.0.0.0' ? '127.0.0.1' : HOST;
    console.log(
      `[devboard-backend] health probe: curl -i http://${probeHost}:${PORT}/health`
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
