const mongoose = require('mongoose');

const MEDIA_CATEGORIES = ['movie', 'tv', 'anime_movie', 'anime_tv'];

const translationSchema = new mongoose.Schema(
  {
    language: { type: String, required: true, lowercase: true, trim: true },
    // Shown as the page headline in the public MediaDetail hero/header area.
    title: { type: String, default: '' },
    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    keywords: [{ type: String, trim: true }],
    slug: { type: String, default: '' },
    content: { type: String, default: '' },
  },
  { _id: false },
);

const mediaDetailSeoSchema = new mongoose.Schema(
  {
    siteKey: { type: String, required: true, trim: true, lowercase: true, index: true, default: 'default' },
    category: { type: String, required: true, enum: MEDIA_CATEGORIES, index: true },

    tmdbMovieId: { type: Number, default: null, index: true },
    tmdbTvId: { type: Number, default: null, index: true },

    isActive: { type: Boolean, default: true, index: true },
    includeInSitemap: { type: Boolean, default: true, index: true },

    // Used by SEOHead and robots meta.
    robots: { type: String, default: 'index, follow', trim: true },

    metaTitle: { type: String, required: true, trim: true },
    metaDescription: { type: String, default: '', trim: true },
    keywords: [{ type: String, trim: true }],
    content: { type: String, default: '', trim: true },

    translations: [translationSchema],

    // Sitemap hints
    changefreq: { type: String, default: 'weekly' },
    priority: { type: Number, default: 0.8 },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

mediaDetailSeoSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

mediaDetailSeoSchema.index({ siteKey: 1, category: 1, tmdbMovieId: 1 });
mediaDetailSeoSchema.index({ siteKey: 1, category: 1, tmdbTvId: 1 });
mediaDetailSeoSchema.index({ siteKey: 1, category: 1, isActive: 1, includeInSitemap: 1 });

module.exports = mongoose.model('MediaDetailSEO', mediaDetailSeoSchema);

