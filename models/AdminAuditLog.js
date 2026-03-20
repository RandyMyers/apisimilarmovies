const mongoose = require('mongoose');

const adminAuditLogSchema = new mongoose.Schema(
  {
    siteKey: { type: String, required: true, trim: true, lowercase: true, index: true, default: 'default' },
    actor: { type: String, trim: true, default: 'system', index: true },
    action: { type: String, required: true, trim: true, index: true },
    entityType: { type: String, required: true, trim: true, index: true },
    entityId: { type: String, required: true, trim: true, index: true },
    ip: { type: String, default: '', trim: true, maxlength: 45 },
    userAgent: { type: String, default: '', trim: true, maxlength: 500 },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

adminAuditLogSchema.index({ siteKey: 1, createdAt: -1 });

module.exports = mongoose.model('AdminAuditLog', adminAuditLogSchema);
