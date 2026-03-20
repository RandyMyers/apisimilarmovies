const mongoose = require('mongoose');

const ALLOWED_KEYS = new Set(['movie', 'tv', 'anime_movie', 'anime_tv']);
const TMDB_KINDS = new Set(['movie', 'tv']);

const mediaTypeSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    label: { type: String, required: true, trim: true },
    tmdbKind: { type: String, required: true, enum: Array.from(TMDB_KINDS) },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0, index: true },
  },
  { timestamps: true },
);

mediaTypeSchema.pre('validate', function (next) {
  const k = String(this.slug || '').trim().toLowerCase();
  this.slug = k;

  if (!ALLOWED_KEYS.has(k)) {
    this.invalidate('slug', 'Unsupported type slug');
  }
  next();
});

module.exports = mongoose.model('MediaType', mediaTypeSchema);

