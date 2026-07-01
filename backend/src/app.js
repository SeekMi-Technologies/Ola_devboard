const express = require('express');
const cors = require('cors');

require('@/models'); // side-effect: register mongoose models

const controllers = require('@/controllers');
const { cookieParser, requireAuth } = require('@/middleware/requireAuth');

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
      credentials: true,
    })
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser);

  // Public liveness probe.
  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      ts: Date.now(),
      service: 'ola-devboard-backend',
      version: '0.1.0',
    });
  });

  // Public auth surface (Ola/#225-A). /me is intentionally public so the
  // frontend can probe { authed: bool } on boot without bouncing on 401.
  app.post('/api/auth/login', safe(controllers.login));
  app.post('/api/auth/logout', safe(controllers.logout));
  app.get('/api/auth/me', safe(controllers.me));

  // Public version probe (Ola/#225-B). Used by the LoginPage footer before
  // any session is established, and by hot-update scripts to confirm the
  // running commit hash post-deploy.
  app.get('/api/version', safe(controllers.getVersion));

  // Protected dashboard surface. The requireAuth middleware short-circuits
  // with 401 when the session cookie is missing/expired/tampered.
  app.get('/api/dashboard/llm-usage', requireAuth, safe(controllers.getLlmUsage));
  app.get('/api/dashboard/email-token-usage', requireAuth, safe(controllers.getEmailToken));
  app.get('/api/dashboard/users/active', requireAuth, safe(controllers.getUserActivity));
  app.get('/api/dashboard/users/panorama', requireAuth, safe(controllers.getUserPanorama));
  app.get('/api/dashboard/mcp-health', requireAuth, safe(controllers.getMcpHealth));
  app.get('/api/dashboard/logs', requireAuth, safe(controllers.getLogs));
  app.get('/api/dashboard/db-summary', requireAuth, safe(controllers.getDbSummary));

  // Persona control-plane (edit per-tenant SOUL/USER on prod/staging via nanobot).
  app.get('/api/personas/envs', requireAuth, safe(controllers.getPersonaEnvs));
  app.get('/api/global', requireAuth, safe(controllers.getGlobal));
  app.get('/api/personas', requireAuth, safe(controllers.listPersonas));
  app.get('/api/personas/:env/:adminId', requireAuth, safe(controllers.getPersona));
  app.put('/api/personas/:env/:adminId/:file', requireAuth, safe(controllers.putPersona));

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
