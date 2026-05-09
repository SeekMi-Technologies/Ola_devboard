// Express app factory for the devboard backend.
//
// Auth model (v0): no auth at all. Security comes from `server.js` binding
// 127.0.0.1 only. The CRM repo carries the real cookie-based auth and that
// gate fires before any CRM API call; devboard sits beside it on the same
// machine and trusts the loopback boundary.
//
// CORS: only the dev frontend on localhost:3001 should reach this. The
// frontend's vite proxy normally rewrites /api → 127.0.0.1:8890 so requests
// arrive same-origin, but if the FE is hit directly during local poking we
// still want the browser to allow XHR.

const express = require('express');
const cors = require('cors');

function buildApp() {
  const app = express();

  app.use(
    cors({
      origin: ['http://localhost:3001', 'http://127.0.0.1:3001'],
      credentials: false,
    })
  );
  app.use(express.json({ limit: '256kb' }));

  // Liveness probe for the devboard process itself. Public, no auth — the
  // FE can use this as a "is the BE up?" signal during boot.
  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      ts: Date.now(),
      service: 'ola-devboard-backend',
      version: '0.1.0',
    });
  });

  // 6 panel endpoints land in D11. For the D10 scaffold, anything under
  // /api/dashboard/* is intentionally unimplemented so a stray FE request
  // surfaces as 404 (instead of a broken handler).
  app.use('/api/dashboard', (_req, res) => {
    res.status(404).json({
      success: false,
      result: null,
      message: 'Panel endpoint not implemented — wired in D11',
    });
  });

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
