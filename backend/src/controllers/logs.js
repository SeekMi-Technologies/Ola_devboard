// Logs panel controller (#220 D7 → ported to Ola_devboard D11).
//
// Tails the structured JSON-Lines log produced by CRM's mcp/logger.js. The
// log file path is read from `process.env.MCP_LOG_FILE_PATH` so devboard
// stays decoupled from CRM's filesystem layout — operators point at any
// path their CRM checkout uses.
//
// Read strategy: cap the read window at MAX_TAIL_BYTES so this endpoint
// stays bounded even if the log file balloons. We seek to (size - cap)
// and read forward; the very first line in that window is likely a
// partial line from mid-line truncation, which we drop via the
// JSON.parse try/catch. That same try/catch also drops genuinely
// malformed lines (e.g. a partially flushed write).
//
// What we strip before returning: every entry's `message` field passes
// through maskSecrets() — operators read this in a browser and we don't
// want a credential drifting from a backend log into a screenshare.
//
// What we DO NOT include: the absolute filesystem path. A read failure
// surfaces as a generic "Failed to read log file" rather than echoing
// /Users/duke/... back to the client.

const fs = require('fs');
const Joi = require('joi');

const maskSecrets = require('../utils/redactor');

// Source whitelist. v0 only exposes mcp; nanobot / email-channel logs are
// tracked as out-of-scope tech debt and will be added in a follow-up.
//
// We resolve the underlying path lazily inside the handler instead of at
// module load. Reading process.env at request time lets tests rewrite the
// env var without re-loading the module.
const SOURCE_KEYS = ['mcp'];

function resolvePath(source) {
  if (source === 'mcp') {
    return process.env.MCP_LOG_FILE_PATH || null;
  }
  return null;
}

const querySchema = Joi.object({
  source: Joi.string().valid(...SOURCE_KEYS).default('mcp'),
  limit: Joi.number().integer().min(1).max(500).default(100),
});

const MAX_TAIL_BYTES = 2 * 1024 * 1024; // 2 MB window — comfortably > 500 typical lines.

async function readTail(filePath) {
  let fd;
  try {
    const stat = await fs.promises.stat(filePath);
    const start = Math.max(0, stat.size - MAX_TAIL_BYTES);
    const len = stat.size - start;
    if (len === 0) return [];

    fd = await fs.promises.open(filePath, 'r');
    const buf = Buffer.alloc(len);
    await fd.read(buf, 0, len, start);
    const text = buf.toString('utf8');
    return text.split('\n').filter(Boolean);
  } finally {
    if (fd) await fd.close();
  }
}

async function getLogs(req, res) {
  const { value, error } = querySchema.validate(req.query, { stripUnknown: true });
  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: error.message,
    });
  }
  const { source, limit } = value;
  const filePath = resolvePath(source);

  if (!filePath) {
    // Env not configured yet. Devboard returns an empty 200 envelope with a
    // hint so the panel can render a friendly empty state rather than 500.
    return res.status(200).json({
      success: true,
      result: {
        source,
        limit,
        logs: [],
        totalLinesScanned: 0,
        empty: true,
        hint: 'MCP_LOG_FILE_PATH not configured — set it in .env to point at CRM’s backend/logs/mcp.log',
      },
      message: `Log path for ${source} not configured`,
    });
  }

  let lines;
  try {
    lines = await readTail(filePath);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      // Log file hasn't been written yet (fresh dev box). Treat as empty.
      return res.status(200).json({
        success: true,
        result: { source, limit, logs: [], totalLinesScanned: 0 },
        message: `Log file for ${source} not yet created`,
      });
    }
    console.error('[devboard.getLogs] read failed:', err && err.message);
    return res.status(500).json({
      success: false,
      result: null,
      message: 'Failed to read log file',
    });
  }

  const tailLines = lines.slice(-limit);
  const logs = [];
  for (const line of tailLines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (_) {
      // Malformed — skip silently. Listing half-lines adds panel noise.
      continue;
    }
    if (entry && typeof entry === 'object' && entry.message) {
      entry.message = maskSecrets(String(entry.message));
    }
    logs.push(entry);
  }
  // Newest-first for the UI.
  logs.reverse();

  return res.status(200).json({
    success: true,
    result: {
      source,
      limit,
      logs,
      totalLinesScanned: tailLines.length,
    },
    message: `Tail of ${source} log`,
  });
}

module.exports = getLogs;
module.exports.MAX_TAIL_BYTES = MAX_TAIL_BYTES;
module.exports.SOURCE_KEYS = SOURCE_KEYS;
