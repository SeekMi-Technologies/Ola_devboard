const express = require('express');
const cors = require('cors');

require('@/models'); // side-effect: register mongoose models

const controllers = require('@/controllers');

// Wraps async handlers so unexpected throws return 500 without leaking stack.
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

  // Public liveness probe.
  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      ts: Date.now(),
      service: 'ola-devboard-backend',
      version: '0.1.0',
    });
  });

  app.get('/api/dashboard/llm-usage', safe(controllers.getLlmUsage));
  app.get('/api/dashboard/email-token-usage', safe(controllers.getEmailToken));
  app.get('/api/dashboard/users/active', safe(controllers.getUserActivity));
  app.get('/api/dashboard/users/panorama', safe(controllers.getUserPanorama));
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
