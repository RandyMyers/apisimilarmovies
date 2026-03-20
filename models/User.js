const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    siteKey: { type: String, required: true, trim: true, lowercase: true, index: true, default: 'default' },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, default: '', trim: true },
    avatarUrl: { type: String, default: '', trim: true },
    locale: { type: String, default: 'en-US', trim: true },
    timezone: { type: String, default: '', trim: true },
    isActive: { type: Boolean, default: true, index: true },
    isEmailVerified: { type: Boolean, default: false, index: true },
    role: { type: String, default: 'user', trim: true },
    lastLoginAt: { type: Date, default: null },
    profile: {
      bio: { type: String, default: '', trim: true },
    },
    settings: {
      emailNotifs: { type: Boolean, default: true },
      contentTips: { type: Boolean, default: true },
      publicProfile: { type: Boolean, default: false },
    },
    moderationStatus: {
      type: String,
      enum: ['clean', 'flagged', 'suspended'],
      default: 'clean',
      index: true,
    },
    moderationNote: { type: String, default: '', trim: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

userSchema.index({ siteKey: 1, email: 1 }, { unique: true });
userSchema.index({ siteKey: 1, isActive: 1, createdAt: -1 });

module.exports = mongoose.model('User', userSchema);
