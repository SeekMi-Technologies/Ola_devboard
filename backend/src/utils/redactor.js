// Replace the WHOLE match (not a prefix) — partial tokens still leak.
const PATTERNS = [
  /Bearer\s+\S+/gi,                         // HTTP Authorization
  /\bsk-[A-Za-z0-9_-]{8,}/g,                // OpenAI / Anthropic
  /\bxox[bopa]-[A-Za-z0-9-]+/gi,            // Slack
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,          // GitHub PATs
  /mongodb(?:\+srv)?:\/\/\S+/gi,            // Mongo URIs
];

function maskSecrets(input) {
  if (input === null || input === undefined) return input;
  let s = String(input);
  for (const re of PATTERNS) {
    s = s.replace(re, '***MASKED***');
  }
  return s;
}

module.exports = maskSecrets;
module.exports.PATTERNS = PATTERNS;
