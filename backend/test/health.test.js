// Scaffold smoke. Keeps the cheap, infra-level assertions out of the
// e2e/panel files so a build break in /health is obvious. Panel HTTP
// behaviour lives in `e2e.test.js` (which boots a real mongo) and the
// per-panel jest files.

const request = require('supertest');

// Side-effect register so app.js's `require('@/models')` doesn't trip.
require('@/models');
const buildApp = require('@/app');

describe('devboard scaffold smoke', () => {
  test('GET /health returns 200 + ok:true', async () => {
    const app = buildApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe('ola-devboard-backend');
    expect(typeof res.body.ts).toBe('number');
    expect(res.body.version).toBe('0.1.0');
  });

  test('GET /unknown-path returns the default 404 envelope', async () => {
    const app = buildApp();
    const res = await request(app).get('/unknown');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('CORS allows the frontend dev origin', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:3001');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3001');
  });
});
