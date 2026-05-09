// Smoke for the D10 scaffold. Verifies the health endpoint responds and
// the unimplemented panel routes 404 cleanly. Real panel tests land in D11.

const request = require('supertest');
const buildApp = require('../src/app');

describe('devboard scaffold (D10)', () => {
  test('GET /health returns 200 + ok:true', async () => {
    const app = buildApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe('ola-devboard-backend');
    expect(typeof res.body.ts).toBe('number');
    expect(res.body.version).toBe('0.1.0');
  });

  test('GET /api/dashboard/anything returns 404 with the documented stub message', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/dashboard/llm-usage');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not implemented/i);
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
