const { rangeSchema, rangeToWindow, aggregateUsage } = require('./_aggregations');

// Match `email`, `email-imap`, etc. (case-insensitive).
const EMAIL_CHANNEL_MATCH = { $regex: /^email/i };
const EMPTY_HINT = 'No email channel data yet — pending email channel instrumentation';

async function getEmailToken(req, res) {
  const { value, error } = rangeSchema.validate(req.query, { stripUnknown: true });
  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: error.message,
    });
  }
  const { range } = value;
  const { start, end } = rangeToWindow(range);

  const match = {
    removed: false,
    channel: EMAIL_CHANNEL_MATCH,
    created: { $gte: start, $lte: end },
  };
  const agg = await aggregateUsage(match);

  // Empty state surfaced explicitly so the UI can show an Alert, not zeros.
  if (agg.totals.records === 0) {
    return res.status(200).json({
      success: true,
      result: {
        range,
        windowStart: start.toISOString(),
        windowEnd: end.toISOString(),
        empty: true,
        hint: EMPTY_HINT,
      },
      message: `No email channel LLM usage in ${range} window`,
    });
  }

  return res.status(200).json({
    success: true,
    result: {
      range,
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      empty: false,
      ...agg,
    },
    message: `Email channel LLM usage aggregated for ${range} window`,
  });
}

module.exports = getEmailToken;
