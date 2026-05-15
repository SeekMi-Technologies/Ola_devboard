// Tests for /api/version (Ola/#225-B). Two paths:
//   1. file present → 200 + parsed payload echoed back
//   2. file missing/malformed → 200 + FALLBACK (rev=unknown, tag=null, builtAt=null)
// /api/version is intentionally PUBLIC (LoginPage footer reads it before login).

const fs = require('fs');
const path = require('path');
const supertest = require('supertest');

// buildApp wires cookieParser + requireAuth which read SESSION_SECRET lazily;
// set both env keys up front to satisfy any side-effect at require time.
process.env.DEVBOARD_PASSWORD = 'version-test-password';
process.env.SESSION_SECRET = 'version-test-session-secret-32-chars';

require('@/models');
const buildApp = require('@/app');

const VERSION_FILE = path.join(__dirname, '..', 'src', 'version.json');
let originalContent = null;

beforeAll(() => {
  if (fs.existsSync(VERSION_FILE)) {
    originalContent = fs.readFileSync(VERSION_FILE, 'utf8');
  }
});

afterAll(() => {
  if (originalContent !== null) {
    fs.writeFileSync(VERSION_FILE, originalContent);
  } else {
    try { fs.unlinkSync(VERSION_FILE); } catch (_) {}
  }
});

describe('version — /api/version', () => {
  test('happy path: file present → 200 + parsed fields', async () => {
    const payload = {
      rev: 'v0.1.0',
      sha: 'abcdef1234567890',
      shaShort: 'abcdef1',
      branch: 'main',
      tag: 'v0.1.0',
      builtAt: '2026-05-15T00:00:00Z',
    };
    fs.writeFileSync(VERSION_FILE, JSON.stringify(payload));
    const app = buildApp();
    const res = await supertest(app).get('/api/version');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.result.rev).toBe('v0.1.0');
    expect(res.body.result.sha).toBe('abcdef1234567890');
    expect(res.body.result.branch).toBe('main');
    expect(res.body.result.tag).toBe('v0.1.0');
    expect(res.body.result.builtAt).toBe('2026-05-15T00:00:00Z');
    expect(typeof res.body.message).toBe('string');
  });

  test('fallback: file missing → 200 + rev=unknown / tag=null / builtAt=null', async () => {
    try { fs.unlinkSync(VERSION_FILE); } catch (_) {}
    const app = buildApp();
    const res = await supertest(app).get('/api/version');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.result.rev).toBe('unknown');
    expect(res.body.result.tag).toBeNull();
    expect(res.body.result.builtAt).toBeNull();
  });

  test('fallback: file malformed JSON → 200 + FALLBACK', async () => {
    fs.writeFileSync(VERSION_FILE, '{this-is-not-valid-json');
    const app = buildApp();
    const res = await supertest(app).get('/api/version');
    expect(res.status).toBe(200);
    expect(res.body.result.rev).toBe('unknown');
  });

  test('/api/version is public (no cookie required)', async () => {
    // Even without a session cookie, version endpoint returns 200 (not 401).
    const app = buildApp();
    const res = await supertest(app).get('/api/version');
    expect(res.status).toBe(200);
  });
});
