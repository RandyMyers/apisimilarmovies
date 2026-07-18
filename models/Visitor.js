const mongoose = require('mongoose');

const visitorSchema = new mongoose.Schema(
  {
    siteKey: { type: String, required: true, trim: true, lowercase: true, index: true, default: 'default' },
    ipHash: { type: String, index: true },
    country: { type: String, uppercase: true, trim: true, index: true },
    region: { type: String, default: '' },
    city: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    referrer: { type: String, default: '' },
    path: { type: String, default: '', index: true },
    pageType: { type: String, default: '', trim: true, index: true },
    category: { type: String, default: '', trim: true, lowercase: true },
    tmdbId: { type: Number, default: null, index: true },
    sessionId: { type: String, default: '', index: true },
    device: { type: String, enum: ['desktop', 'mobile', 'tablet', 'unknown'], default: 'unknown' },
    browser: { type: String, default: 'unknown' },
    os: { type: String, default: 'unknown' },
    language: { type: String, default: 'en-us', trim: true, lowercase: true },
    isBot: { type: Boolean, default: false, index: true },
    visitedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

visitorSchema.index({ siteKey: 1, visitedAt: -1 });
visitorSchema.index({ siteKey: 1, sessionId: 1, visitedAt: -1 });

module.exports = mongoose.model('Visitor', visitorSchema);
