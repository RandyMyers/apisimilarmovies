const mongoose = require('mongoose');

const followSchema = new mongoose.Schema(
  {
    siteKey: { type: String, required: true, trim: true, lowercase: true, index: true, default: 'default' },
    follower: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    following: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true },
);

followSchema.index({ siteKey: 1, follower: 1, following: 1 }, { unique: true });
followSchema.index({ siteKey: 1, following: 1, createdAt: -1 });
followSchema.index({ siteKey: 1, follower: 1, createdAt: -1 });

module.exports = mongoose.model('Follow', followSchema);
