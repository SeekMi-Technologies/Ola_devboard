const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    removed: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
    userId: { type: mongoose.Schema.ObjectId, ref: 'Admin', index: true },
    sessionId: mongoose.Schema.ObjectId,
    nanobotSessionId: String,
    requestId: String,
    channel: { type: String, default: 'ask-ola', index: true },
    provider: String,
    model: String,
    inputTokens: Number,
    outputTokens: Number,
    totalTokens: Number,
    cachedTokens: { type: Number, default: 0 },
    iterations: { type: Number, default: 1 },
    costUsd: Number,
    pricingVersion: String,
    latencyMs: Number,
    errored: { type: Boolean, default: false },
    created: { type: Date, default: Date.now, index: true },
  },
  { collection: 'llmusage', strict: false }
);

schema.index({ userId: 1, created: -1 });
schema.index({ created: -1 });
schema.index({ channel: 1, created: -1 });

module.exports = mongoose.model('LlmUsage', schema);
