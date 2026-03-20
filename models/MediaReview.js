const mongoose = require('mongoose');

const CATEGORIES = ['movie', 'tv', 'anime_movie', 'anime_tv'];

const mediaReviewSchema = new mongoose.Schema(
  {
    siteKey: { type: String, required: true, trim: true, lowercase: true, index: true, default: 'default' },
    baseCategory: { type: String, required: true, enum: CATEGORIES, index: true },
    baseTmdbId: { type: Number, required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, default: '', trim: true, maxlength: 2000 },
    ip: { type: String, default: '', trim: true, maxlength: 45 },

    // Captured title and user reference for dashboard history.
    title: { type: String, default: '', trim: true, maxlength: 200 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  },
  { timestamps: true },
);

mediaReviewSchema.index({ siteKey: 1, baseCategory: 1, baseTmdbId: 1, createdAt: -1 });
mediaReviewSchema.index({ siteKey: 1, user: 1, createdAt: -1 });

module.exports = mongoose.model('MediaReview', mediaReviewSchema);
