const Joi = require('joi');
const mongoose = require('mongoose');

const { rangeToWindow } = require('./_aggregations');

const ACTIVE_WINDOW_MINUTES = 15;

const querySchema = Joi.object({
  range: Joi.string().valid('today', '7d', '30d').default('7d'),
  limit: Joi.number().integer().min(1).max(200).default(50),
});

async function getUserPanorama(req, res) {
  const { value, error } = querySchema.validate(req.query, { stripUnknown: true });
  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: error.message,
    });
  }
  const { range, limit } = value;
  const { start, end } = rangeToWindow(range);
  const activeStart = new Date(Date.now() - ACTIVE_WINDOW_MINUTES * 60 * 1000);

  const Admin = mongoose.model('Admin');
  const LlmUsage = mongoose.model('LlmUsage');

  const usageMatch = { removed: false, created: { $gte: start, $lte: end } };

  const [totalUsers, admins, usageByUser] = await Promise.all([
    Admin.countDocuments({ removed: false }),
    Admin.find(
      { removed: false },
      { email: 1, name: 1, surname: 1, enabled: 1, created: 1, lastActivity: 1 }
    )
      .sort({ lastActivity: -1 })
      .limit(limit),
    LlmUsage.aggregate([
      { $match: usageMatch },
      {
        $group: {
          _id: '$userId',
          requests: { $sum: 1 },
          totalTokens: { $sum: '$totalTokens' },
          costUsd: { $sum: '$costUsd' },
        },
      },
    ]),
  ]);

  const usageById = new Map(usageByUser.map((u) => [String(u._id), u]));
  const users = admins.map((a) => {
    const u = usageById.get(String(a._id));
    return {
      userId: a._id,
      email: a.email,
      name: `${a.name || ''} ${a.surname || ''}`.trim(),
      enabled: a.enabled !== false,
      created: a.created,
      lastActivity: a.lastActivity,
      activeNow: !!(a.lastActivity && a.lastActivity >= activeStart),
      requests: u ? u.requests : 0,
      totalTokens: u ? u.totalTokens : 0,
      costUsd: u ? u.costUsd : 0,
    };
  });

  return res.status(200).json({
    success: true,
    result: {
      range,
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      totalUsers,
      activeWindowMinutes: ACTIVE_WINDOW_MINUTES,
      users,
    },
    message: `User panorama for ${range} window`,
  });
}

module.exports = getUserPanorama;
module.exports.ACTIVE_WINDOW_MINUTES = ACTIVE_WINDOW_MINUTES;
