// Persona control-plane BFF. Reads/writes a tenant's per-admin SOUL/USER by
// proxying the env's nanobot persona API, and renders id -> name from CRM Mongo.
// Mongo access is read-only; all writes go to nanobot over HTTP.
const { listEnvs, envConfig, resolveNames } = require('@/config/personaEnvs');

function pickEnv(req, res) {
  const env = String(req.query.env || req.params.env || '');
  const cfg = envConfig(env);
  if (!cfg) {
    res.status(400).json({
      success: false,
      result: null,
      message: `unknown or unconfigured environment '${env}' (configured: ${listEnvs().join(', ') || 'none'})`,
    });
    return null;
  }
  return { env, cfg };
}

async function callNanobot(cfg, path, opts = {}) {
  const r = await fetch(`${cfg.nanobotUrl}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_e) {
    body = { raw: text };
  }
  return { status: r.status, body };
}

function fullName(d) {
  if (!d) return null;
  return `${d.name || ''} ${d.surname || ''}`.trim() || null;
}

async function getPersonaEnvs(_req, res) {
  res.json({ success: true, result: listEnvs() });
}

async function listPersonas(req, res) {
  const picked = pickEnv(req, res);
  if (!picked) return;
  const { env, cfg } = picked;
  const { status, body } = await callNanobot(cfg, '/internal/persona');
  if (status !== 200) {
    return res
      .status(502)
      .json({ success: false, result: null, message: `persona API returned ${status}` });
  }
  const admins = Array.isArray(body.admins) ? body.admins : [];
  const names = await resolveNames(env, admins.map((a) => a.adminId));
  const rows = admins.map((a) => {
    const d = names.get(a.adminId);
    return {
      adminId: a.adminId,
      name: fullName(d),
      email: d ? d.email : null,
      soulSource: a.soulSource,
      userSource: a.userSource,
      updatedAt: a.updatedAt,
    };
  });
  res.json({ success: true, result: { env, admins: rows } });
}

async function getGlobal(req, res) {
  const picked = pickEnv(req, res);
  if (!picked) return;
  const { status, body } = await callNanobot(picked.cfg, '/internal/global');
  if (status !== 200) {
    return res
      .status(502)
      .json({ success: false, result: null, message: body.error || `persona API returned ${status}` });
  }
  res.json({ success: true, result: body });
}

async function getPersona(req, res) {
  const picked = pickEnv(req, res);
  if (!picked) return;
  const { status, body } = await callNanobot(
    picked.cfg,
    `/internal/persona/${encodeURIComponent(req.params.adminId)}`
  );
  if (status !== 200) {
    return res
      .status(status === 400 ? 400 : 502)
      .json({ success: false, result: null, message: body.error || `persona API returned ${status}` });
  }
  res.json({ success: true, result: body });
}

async function putPersona(req, res) {
  const picked = pickEnv(req, res);
  if (!picked) return;
  const content = req.body && req.body.content;
  if (typeof content !== 'string') {
    return res
      .status(400)
      .json({ success: false, result: null, message: 'body.content (string) is required' });
  }
  const { adminId, file } = req.params;
  const { status, body } = await callNanobot(
    picked.cfg,
    `/internal/persona/${encodeURIComponent(adminId)}/${encodeURIComponent(file)}`,
    { method: 'PUT', body: JSON.stringify({ content }) }
  );
  if (status !== 200) {
    return res
      .status(status === 400 || status === 403 ? status : 502)
      .json({ success: false, result: null, message: body.error || `persona API returned ${status}` });
  }
  res.json({ success: true, result: body });
}

module.exports = { getPersonaEnvs, listPersonas, getGlobal, getPersona, putPersona };
