const mongoose = require('mongoose');

const adminPasswordResetSchema = new mongoose.Schema(
  {
    siteKey: { type: String, required: true, trim: true, lowercase: true, index: true, default: 'default' },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

adminPasswordResetSchema.index({ siteKey: 1, email: 1, expiresAt: -1 });

module.exports = mongoose.model('AdminPasswordReset', adminPasswordResetSchema);

