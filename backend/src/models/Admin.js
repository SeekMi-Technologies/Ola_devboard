const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const adminSchema = new Schema(
  {
    removed: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
    email: { type: String, lowercase: true, trim: true },
    name: String,
    surname: String,
    lastActivity: { type: Date, default: null, index: true },
    created: { type: Date, default: Date.now },
  },
  { strict: false }
);

module.exports = mongoose.model('Admin', adminSchema);
