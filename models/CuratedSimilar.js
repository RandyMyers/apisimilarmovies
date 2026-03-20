const mongoose = require('mongoose');

const CATEGORIES = ['movie', 'tv', 'anime_movie', 'anime_tv'];
const KINDS = ['movie', 'tv'];

const curatedSimilarSchema = new mongoose.Schema(
  {
    siteKey: { type: String, required: true, trim: true, lowercase: true, index: true, default: 'default' },
    baseCategory: { type: String, required: true, enum: CATEGORIES, index: true },
    baseTmdbId: { type: Number, required: true, index: true },
    similarCategory: { type: String, required: true, enum: CATEGORIES },
    similarTmdbKind: { type: String, required: true, enum: KINDS },
    similarTmdbId: { type: Number, required: true },
    displayName: { type: String, required: true, trim: true },
    posterPath: { type: String, default: '' },
    genreSlugs: [{ type: String, trim: true, lowercase: true }],
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

curatedSimilarSchema.index(
  { siteKey: 1, baseCategory: 1, baseTmdbId: 1, similarTmdbKind: 1, similarTmdbId: 1 },
  { unique: true },
);

module.exports = mongoose.model('CuratedSimilar', curatedSimilarSchema);
