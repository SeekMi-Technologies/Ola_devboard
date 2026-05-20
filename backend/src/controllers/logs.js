// Tails CRM's mcp.log (path from env). 2MB read window caps memory; first
// line in the window may be truncated and is dropped via JSON.parse skip.
// Messages run through redactor; error responses don't echo the path.

const fs = require('fs');
const Joi = require('joi');

const maskSecrets = require('../utils/redactor');

// Lazy env read so tests can swap *_LOG_FILE_PATH without reloading.
const SOURCE_KEYS = ['mcp', 'transcription'];

function resolvePath(source) {
  if (source === 'mcp') {
    return process.env.MCP_LOG_FILE_PATH || null;
  }
  if (source === 'transcription') {
    return process.env.TRANSCRIPTION_LOG_FILE_PATH || null;
  }
  return null;
}

const HINT_BY_SOURCE = {
  mcp: 'MCP_LOG_FILE_PATH not configured — set it in .env to point at CRM’s backend/logs/mcp.log',
  transcription:
    'TRANSCRIPTION_LOG_FILE_PATH not configured — set it in .env to point at CRM’s backend/logs/transcription.log',
};

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
    // Env not set → 200 empty + hint, not 500.
    return res.status(200).json({
      success: true,
      result: {
        source,
        limit,
        logs: [],
        totalLinesScanned: 0,
        empty: true,
        hint: HINT_BY_SOURCE[source] || `Log source ${source} not configured`,
      },
      message: `Log path for ${source} not configured`,
    });
  }

  let lines;
  try {
    lines = await readTail(filePath);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      // Fresh dev box, no log file yet.
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
      continue; // skip malformed line
    }
    if (entry && typeof entry === 'object' && entry.message) {
      entry.message = maskSecrets(String(entry.message));
    }
    logs.push(entry);
  }
  logs.reverse(); // newest-first

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
