const mongoose = require('mongoose');

const MEDIA_CATEGORIES = ['movie', 'tv', 'anime_movie', 'anime_tv'];
const TMDB_KINDS = ['movie', 'tv'];

const mediaSchema = new mongoose.Schema(
  {
    siteKey: { type: String, required: true, trim: true, lowercase: true, index: true, default: 'default' },
    category: { type: String, required: true, enum: MEDIA_CATEGORIES, index: true },
    tmdbKind: { type: String, required: true, enum: TMDB_KINDS, index: true },

    tmdbMovieId: { type: Number, default: null, index: true },
    tmdbTvId: { type: Number, default: null, index: true },

    displayName: { type: String, required: true, trim: true },
    posterPath: { type: String, default: '', trim: true },
    genreSlugs: [{ type: String, trim: true, lowercase: true }],

    // List of region codes (urlCodes) where this media should be shown/indexed.
    // Keep lowercase, e.g. ['us','gb','ie'].
    availableRegions: [{ type: String, trim: true, lowercase: true }],

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

mediaSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Enforce uniqueness per category+kind id (movie categories use tmdbMovieId, tv categories use tmdbTvId)
mediaSchema.index(
  { siteKey: 1, category: 1, tmdbMovieId: 1 },
  { unique: true, partialFilterExpression: { tmdbMovieId: { $type: 'number' } } },
);
mediaSchema.index(
  { siteKey: 1, category: 1, tmdbTvId: 1 },
  { unique: true, partialFilterExpression: { tmdbTvId: { $type: 'number' } } },
);

module.exports = mongoose.model('Media', mediaSchema);

