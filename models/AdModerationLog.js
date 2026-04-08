const mongoose = require('mongoose');

const adModerationLogSchema = new mongoose.Schema(
  {
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'AdCampaign', required: true, index: true },
    website: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', index: true },
    action: { type: String, required: true, trim: true, maxlength: 64 },
    fromStatus: { type: String, trim: true, default: '' },
    toStatus: { type: String, trim: true, required: true },
    reason: { type: String, trim: true, maxlength: 1000, default: '' },
    fieldChanges: {
      type: [
        {
          path: { type: String, required: true, trim: true, maxlength: 200 },
          before: { type: String, default: '' },
          after: { type: String, default: '' },
        },
      ],
      default: undefined,
    },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true },
);

adModerationLogSchema.index({ campaign: 1, createdAt: -1 });

module.exports = mongoose.model('AdModerationLog', adModerationLogSchema);
