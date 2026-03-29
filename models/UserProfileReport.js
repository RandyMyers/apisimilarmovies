const mongoose = require('mongoose');

const userProfileReportSchema = new mongoose.Schema(
  {
    siteKey: { type: String, required: true, trim: true, lowercase: true, index: true, default: 'default' },
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    target: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reason: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

userProfileReportSchema.index({ siteKey: 1, reporter: 1, target: 1, createdAt: -1 });

module.exports = mongoose.model('UserProfileReport', userProfileReportSchema);
