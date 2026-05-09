// Express app factory for the devboard backend.
//
// Auth model (v0): no auth at all. Security comes from `server.js` binding
// 127.0.0.1 only. The CRM repo carries the real cookie-based auth and that
// gate fires before any CRM API call; devboard sits beside it on the same
// machine and trusts the loopback boundary.
//
// CORS: only the dev frontend on localhost:3001 should reach this.

const express = require('express');
const cors = require('cors');

// Side-effect: register every devboard mongoose model so
// `mongoose.model('Admin')` / `mongoose.model('LlmUsage')` resolve at
// request time. Tests do this themselves before connecting to the
// memory server; we still require here for the production path.
require('@/models');

const controllers = require('@/controllers');

// Tiny wrapper — every controller is async; surface unexpected throws as
// 500 with a generic message instead of letting Express's default
// behaviour leak the stack trace.
function safe(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch((err) => {
      console.error('[devboard] handler error:', err && err.stack ? err.stack : err);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          result: null,
          message: 'Internal error',
        });
      }
    });
}

function buildApp() {
  const app = express();

  app.use(
    cors({
      origin: ['http://localhost:3001', 'http://127.0.0.1:3001'],
      credentials: false,
    })
  );
  app.use(express.json({ limit: '256kb' }));

  // Liveness for the devboard process itself. Public, no auth. Used by the
  // FE during boot to detect "is the BE up?" before the first panel call.
  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      ts: Date.now(),
      service: 'ola-devboard-backend',
      version: '0.1.0',
    });
  });

  // 6 panel endpoints (D11). All under /api/dashboard/* — we drop the
  // CRM-era /internal/ prefix because in this repo dashboard IS the
  // entire API surface.
  app.get('/api/dashboard/llm-usage', safe(controllers.getLlmUsage));
  app.get('/api/dashboard/email-token-usage', safe(controllers.getEmailToken));
  app.get('/api/dashboard/users/active', safe(controllers.getUserActivity));
  app.get('/api/dashboard/mcp-health', safe(controllers.getMcpHealth));
  app.get('/api/dashboard/logs', safe(controllers.getLogs));
  app.get('/api/dashboard/db-summary', safe(controllers.getDbSummary));

  // Default 404 for anything else.
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      result: null,
      message: 'Not found',
    });
  });

  return app;
}

module.exports = buildApp;
module.exports.safe = safe;
