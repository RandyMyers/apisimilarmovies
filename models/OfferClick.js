const mongoose = require('mongoose');

const offerClickSchema = new mongoose.Schema(
  {
    siteKey: { type: String, required: true, trim: true, lowercase: true, index: true, default: 'default' },
    category: { type: String, default: '', trim: true, lowercase: true, index: true },
    tmdbId: { type: Number, default: null, index: true },
    language: { type: String, default: 'en-us', trim: true, lowercase: true, index: true },
    offerIndex: { type: Number, default: 0 },
    offerTitle: { type: String, default: '', trim: true },
    offerUrl: { type: String, default: '', trim: true },
    sessionId: { type: String, default: '', index: true },
    ipHash: { type: String, default: '', index: true },
    referrer: { type: String, default: '' },
    clickedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

offerClickSchema.index({ siteKey: 1, clickedAt: -1 });
offerClickSchema.index({ siteKey: 1, category: 1, tmdbId: 1, language: 1 });

module.exports = mongoose.model('OfferClick', offerClickSchema);
