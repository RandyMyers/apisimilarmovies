const mongoose = require('mongoose');

const CATEGORIES = ['movie', 'tv', 'anime_movie', 'anime_tv'];
const KINDS = ['movie', 'tv'];
const STATUSES = ['pending', 'approved', 'rejected'];

const similarSuggestionSchema = new mongoose.Schema(
  {
    siteKey: { type: String, required: true, trim: true, lowercase: true, index: true, default: 'default' },
    baseCategory: { type: String, required: true, enum: CATEGORIES, index: true },
    baseTmdbId: { type: Number, required: true, index: true },
    similarTmdbKind: { type: String, required: true, enum: KINDS },
    similarTmdbId: { type: Number, required: true },
    similarCategory: { type: String, enum: CATEGORIES, default: null },
    reason: { type: String, default: '', trim: true, maxlength: 1000 },
    status: { type: String, enum: STATUSES, default: 'pending', index: true },
    ip: { type: String, default: '', trim: true, maxlength: 45 },

    // Captured titles at submission time to power user dashboard history.
    baseTitle: { type: String, default: '', trim: true, maxlength: 200 },
    suggestedTitle: { type: String, default: '', trim: true, maxlength: 200 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  },
  { timestamps: true },
);

similarSuggestionSchema.index({ siteKey: 1, user: 1, createdAt: -1 });

module.exports = mongoose.model('SimilarSuggestion', similarSuggestionSchema);
