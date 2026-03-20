const mongoose = require('mongoose');

const roles = ['moderator', 'editor', 'super_admin'];

const adminUserSchema = new mongoose.Schema(
  {
    siteKey: { type: String, required: true, trim: true, lowercase: true, index: true, default: 'default' },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, default: '', trim: true },
    avatarUrl: { type: String, default: '', trim: true },
    timezone: { type: String, default: '', trim: true },
    preferences: { type: Object, default: {} },
    role: { type: String, required: true, enum: roles, index: true },
  },
  { timestamps: true },
);

adminUserSchema.index({ siteKey: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('AdminUser', adminUserSchema);

