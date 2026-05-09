// 3-service probe with 1s timeouts. URLs from env (default loopback).
// Always returns 200 — per-service ok/error lives in result. URLs are NOT
// query-string-driven (would be SSRF on the loopback network).

const FETCH_TIMEOUT_MS = 1000;

const DEFAULT_SERVICES = [
  { key: 'mcp', name: 'MCP Server', envKey: 'MCP_HEALTH_URL', defaultUrl: 'http://127.0.0.1:8889/health' },
  { key: 'nanobotServe', name: 'Nanobot Serve', envKey: 'NANOBOT_SERVE_HEALTH_URL', defaultUrl: 'http://127.0.0.1:8900/health' },
  { key: 'nanobotGateway', name: 'Nanobot Gateway', envKey: 'NANOBOT_GATEWAY_HEALTH_URL', defaultUrl: 'http://127.0.0.1:8901/health' },
];

function buildServices() {
  return DEFAULT_SERVICES.map(({ key, name, envKey, defaultUrl }) => ({
    key,
    name,
    url: process.env[envKey] || defaultUrl,
  }));
}

async function probeService(svc, fetchImpl = fetch) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetchImpl(svc.url, { signal: controller.signal });
    const latencyMs = Date.now() - startedAt;
    if (r.status >= 400) {
      return {
        name: svc.name, url: svc.url,
        ok: false, latencyMs,
        error: `HTTP ${r.status}`,
      };
    }
    let body = null;
    try {
      body = await r.json();
    } catch (_) {
      body = null;
    }
    return {
      name: svc.name, url: svc.url,
      ok: true, latencyMs,
      ...(body && typeof body === 'object' ? { body } : {}),
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    let error;
    if (err.name === 'AbortError') {
      error = `timeout after ${FETCH_TIMEOUT_MS}ms`;
    } else if (err.cause && err.cause.code) {
      error = err.cause.code;
    } else if (err.code) {
      error = err.code;
    } else {
      error = err.message || 'unknown error';
    }
    return {
      name: svc.name, url: svc.url,
      ok: false, latencyMs,
      error,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function getMcpHealth(req, res) {
  const services = buildServices();
  const probes = await Promise.all(services.map((svc) => probeService(svc)));
  const result = {};
  for (let i = 0; i < services.length; i++) {
    result[services[i].key] = probes[i];
  }
  return res.status(200).json({
    success: true,
    result,
    message: 'MCP / Nanobot health probe',
  });
}

module.exports = getMcpHealth;
module.exports.probeService = probeService;
module.exports.buildServices = buildServices;
module.exports.FETCH_TIMEOUT_MS = FETCH_TIMEOUT_MS;
