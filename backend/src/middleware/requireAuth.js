// Simple HMAC-signed session cookie for devboard v1 (Ola/#225).
//
// No JWT / no cookie-parser dep — we sign with Node's built-in crypto and
// parse the Cookie header by hand (~12 lines). This is the minimum that
// lets us flip the loopback bind in 225-D without dragging in new deps.
//
// Cookie value layout:  <payload-b64url>.<hmac-sha256-hex>
// Payload:              { v: 1, ts: <issuedMs>, exp: <expiresMs> }
//
// Verify path constant-time-compares the HMAC and re-checks `exp`. Any
// shape mismatch returns null (treated as unauthenticated, never 500).

const crypto = require('crypto');

const COOKIE_NAME = 'devboard_session';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PAYLOAD_VERSION = 1;
const MIN_SECRET_LEN = 16;

function getSecret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < MIN_SECRET_LEN) {
    throw new Error(
      `SESSION_SECRET must be set and at least ${MIN_SECRET_LEN} chars`
    );
  }
  return s;
}

function signSession() {
  const payload = {
    v: PAYLOAD_VERSION,
    ts: Date.now(),
    exp: Date.now() + COOKIE_MAX_AGE_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto
    .createHmac('sha256', getSecret())
    .update(payloadB64)
    .digest('hex');
  return `${payloadB64}.${hmac}`;
}

function verifySession(value) {
  if (!value || typeof value !== 'string') return null;
  const parts = value.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, hmacGiven] = parts;

  let hmacExpected;
  try {
    hmacExpected = crypto
      .createHmac('sha256', getSecret())
      .update(payloadB64)
      .digest('hex');
  } catch (_) {
    return null;
  }

  const a = Buffer.from(hmacGiven, 'hex');
  const b = Buffer.from(hmacExpected, 'hex');
  if (a.length !== b.length || a.length === 0) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (_) {
    return null;
  }
  if (!payload || payload.v !== PAYLOAD_VERSION) return null;
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  return payload;
}

// Tiny cookie-header parser. Populates req.cookies = { name: value, ... }.
// Mounted globally in app.js so requireAuth + controllers/auth can both read.
function cookieParser(req, _res, next) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const piece of header.split(';')) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const name = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    try {
      out[name] = decodeURIComponent(raw);
    } catch (_) {
      out[name] = raw;
    }
  }
  req.cookies = out;
  return next();
}

function requireAuth(req, res, next) {
  const cookie = req.cookies && req.cookies[COOKIE_NAME];
  const payload = cookie ? verifySession(cookie) : null;
  if (!payload) {
    return res.status(401).json({
      success: false,
      result: null,
      message: 'Authentication required',
    });
  }
  req.session = payload;
  return next();
}

module.exports = {
  cookieParser,
  requireAuth,
  signSession,
  verifySession,
  COOKIE_NAME,
  COOKIE_MAX_AGE_MS,
};
