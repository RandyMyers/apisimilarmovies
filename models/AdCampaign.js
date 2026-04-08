const mongoose = require('mongoose');

const adCampaignCreativeAssignmentSchema = new mongoose.Schema(
  {
    creative: { type: mongoose.Schema.Types.ObjectId, ref: 'AdCreative', required: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true },
);

const adTargetingSchema = new mongoose.Schema(
  {
    domains: [{ type: String, trim: true, lowercase: true }],
    locales: [{ type: String, trim: true, lowercase: true }],
    countries: [{ type: String, trim: true, lowercase: true, minlength: 2, maxlength: 2 }],
    devices: [{ type: String, trim: true, lowercase: true, enum: ['desktop', 'mobile', 'tablet'] }],
    pages: [{ type: String, trim: true, lowercase: true }],
    placements: [{ type: String, trim: true, lowercase: true }],
  },
  { _id: false },
);

const adCampaignSchema = new mongoose.Schema(
  {
    website: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Website',
      required: [true, 'Website is required'],
      index: true,
    },
    name: { type: String, required: [true, 'Campaign name is required'], trim: true, maxlength: 200 },
    advertiserName: { type: String, trim: true, maxlength: 200, default: '' },
    status: {
      type: String,
      enum: ['draft', 'pending_review', 'approved', 'active', 'paused', 'rejected', 'expired', 'archived'],
      default: 'draft',
      index: true,
    },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    priority: { type: Number, default: 0, min: 0, max: 1000 },
    weight: { type: Number, default: 1, min: 1, max: 1000 },
    targeting: { type: adTargetingSchema, default: () => ({}) },
    creatives: { type: [adCampaignCreativeAssignmentSchema], default: [] },
    moderation: {
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
      reviewedAt: { type: Date, default: null },
      rejectionReason: { type: String, trim: true, maxlength: 1000, default: '' },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true },
);

adCampaignSchema.index({ website: 1, status: 1, startAt: 1, endAt: 1 });
adCampaignSchema.index({ website: 1, 'targeting.pages': 1, 'targeting.placements': 1 });
adCampaignSchema.index({ website: 1, 'targeting.countries': 1 });
adCampaignSchema.index({ 'creatives.creative': 1 });

module.exports = mongoose.model('AdCampaign', adCampaignSchema);
