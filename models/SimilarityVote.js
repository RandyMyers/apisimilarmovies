const mongoose = require('mongoose');

const similarityVoteSchema = new mongoose.Schema({
  siteKey: { type: String, required: true, trim: true, lowercase: true, index: true, default: 'default' },
  baseCategory: { type: String, required: true, index: true },
  baseId: { type: Number, required: true, index: true },

  alternativeCategory: { type: String, required: true, index: true },
  alternativeId: { type: Number, required: true, index: true },

  rating: { type: Number, required: true, min: 1, max: 5 },
  reason: { type: String, default: '', trim: true, maxlength: 500 },
  isActive: { type: Boolean, default: true, index: true },

  // Titles captured at submission time to power user dashboard history.
  baseTitle: { type: String, default: '', trim: true, maxlength: 200 },
  altTitle: { type: String, default: '', trim: true, maxlength: 200 },

  // Anonymous voting: store IP to rate limit later
  ip: { type: String, default: '', trim: true, maxlength: 45, index: true },
  // If you later add auth, you can store a user reference:
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now },
});

similarityVoteSchema.index({ siteKey: 1, baseCategory: 1, baseId: 1, alternativeCategory: 1, alternativeId: 1 });
similarityVoteSchema.index({ siteKey: 1, baseCategory: 1, baseId: 1, ip: 1, createdAt: -1 });
similarityVoteSchema.index({ siteKey: 1, isActive: 1, createdAt: -1 });
similarityVoteSchema.index({ siteKey: 1, user: 1, createdAt: -1 });

module.exports = mongoose.model('SimilarityVote', similarityVoteSchema);

