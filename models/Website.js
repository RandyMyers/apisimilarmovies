const mongoose = require('mongoose');

const websiteSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    name: { type: String, required: true, trim: true },
    domain: { type: String, default: '', trim: true, lowercase: true },
    isActive: { type: Boolean, default: true, index: true },

    /** Public Simimovies: show static placeholder ads (per-site; toggled in admin Websites). */
    adsStaticEnabled: { type: Boolean, default: false },
    /** Public Simimovies: fetch /api/v1/ads/placements (per-site; toggled in admin Websites). */
    adsManagedEnabled: { type: Boolean, default: false },

    // Optional: used later for SEO/sitemap defaults
    defaultRegion: { type: String, default: 'us', trim: true, lowercase: true },
    supportedRegions: [{ type: String, trim: true, lowercase: true }],
  },
  { timestamps: true },
);

module.exports = mongoose.model('Website', websiteSchema);

