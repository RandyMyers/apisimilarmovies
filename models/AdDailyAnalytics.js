const mongoose = require('mongoose');

const adDailyAnalyticsSchema = new mongoose.Schema(
  {
    day: { type: String, required: true, index: true },
    website: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', default: null, index: true },
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'AdCampaign', default: null, index: true },
    impressions: { type: Number, default: 0, min: 0 },
    clicks: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

adDailyAnalyticsSchema.index({ day: 1, website: 1, campaign: 1 }, { unique: true });

module.exports = mongoose.model('AdDailyAnalytics', adDailyAnalyticsSchema);
