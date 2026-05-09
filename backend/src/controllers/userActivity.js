const Joi = require('joi');
const mongoose = require('mongoose');

// 24h cap prevents a query string from triggering a full-table scan.
const querySchema = Joi.object({
  windowMinutes: Joi.number().integer().min(1).max(1440).default(15),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

async function getUserActivity(req, res) {
  const { value, error } = querySchema.validate(req.query, { stripUnknown: true });
  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: error.message,
    });
  }
  const { windowMinutes, limit } = value;
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  const Admin = mongoose.model('Admin');
  const LlmUsage = mongoose.model('LlmUsage');

  const sessionMatch = {
    removed: false,
    enabled: true,
    lastActivity: { $gte: windowStart },
  };

  const [sessionsList, sessionsCount, aiUserIds] = await Promise.all([
    Admin.find(sessionMatch, { email: 1, name: 1, surname: 1, lastActivity: 1 })
      .sort({ lastActivity: -1 })
      .limit(limit),
    Admin.countDocuments(sessionMatch),
    LlmUsage.distinct('userId', {
      removed: false,
      created: { $gte: windowStart },
    }),
  ]);

  // Filter soft-deleted admins so ghost LLM-only rows don't surface.
  const aiUsers = aiUserIds.length
    ? await Admin.find(
        { _id: { $in: aiUserIds }, removed: false },
        { email: 1, name: 1, surname: 1 }
      )
    : [];

  return res.status(200).json({
    success: true,
    result: {
      windowMinutes,
      windowStart: windowStart.toISOString(),
      activeSessionsLast: sessionsCount,
      aiActiveUsersLast: aiUsers.length,
      sessions: sessionsList.map((a) => ({
        userId: a._id,
        email: a.email,
        name: `${a.name || ''} ${a.surname || ''}`.trim(),
        lastActivity: a.lastActivity,
      })),
      aiUsers: aiUsers.map((a) => ({
        userId: a._id,
        email: a.email,
        name: `${a.name || ''} ${a.surname || ''}`.trim(),
      })),
    },
    message: `User activity for last ${windowMinutes} minutes`,
  });
}

module.exports = getUserActivity;
