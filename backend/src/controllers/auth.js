// Auth surface for devboard v1 (Ola/#225). Single-password gate; the password
// is compared constant-time against DEVBOARD_PASSWORD. On success we set an
// HMAC-signed session cookie (see ../middleware/requireAuth.js). No DB write,
// so the read-only red line is not touched.

const Joi = require('joi');
const crypto = require('crypto');

const {
  signSession,
  verifySession,
  COOKIE_NAME,
  COOKIE_MAX_AGE_MS,
} = require('../middleware/requireAuth');

const loginSchema = Joi.object({
  password: Joi.string().min(1).max(256).required(),
});

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    // Set COOKIE_SECURE=1 when fronted by HTTPS (Cloudflare in prod, 225-E).
    secure: process.env.COOKIE_SECURE === '1',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  };
}

async function login(req, res) {
  const { value, error } = loginSchema.validate(req.body || {}, {
    stripUnknown: true,
  });
  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: error.message,
    });
  }

  const expected = process.env.DEVBOARD_PASSWORD;
  if (!expected) {
    console.error(
      '[devboard.auth] DEVBOARD_PASSWORD env not set; refusing to authenticate'
    );
    return res.status(500).json({
      success: false,
      result: null,
      message: 'Auth not configured',
    });
  }

  const a = Buffer.from(value.password);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    return res.status(401).json({
      success: false,
      result: null,
      message: 'Invalid password',
    });
  }

  let token;
  try {
    token = signSession();
  } catch (err) {
    console.error('[devboard.auth] signSession failed:', err && err.message);
    return res.status(500).json({
      success: false,
      result: null,
      message: 'Auth not configured',
    });
  }
  res.cookie(COOKIE_NAME, token, cookieOptions());
  return res.status(200).json({
    success: true,
    result: { authed: true },
    message: 'Login OK',
  });
}

async function logout(_req, res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  return res.status(200).json({
    success: true,
    result: { authed: false },
    message: 'Logout OK',
  });
}

async function me(req, res) {
  const cookie = req.cookies && req.cookies[COOKIE_NAME];
  const payload = cookie ? verifySession(cookie) : null;
  return res.status(200).json({
    success: true,
    result: { authed: !!payload },
    message: payload ? 'Authenticated' : 'Not authenticated',
  });
}

module.exports = { login, logout, me };
