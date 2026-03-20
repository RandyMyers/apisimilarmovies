const mongoose = require('mongoose');

const genreSchema = new mongoose.Schema(
  {
    siteKey: { type: String, required: true, trim: true, lowercase: true, index: true, default: 'default' },
    slug: { type: String, required: true, trim: true, lowercase: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    description: { type: String, default: '', trim: true },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0, index: true },
  },
  { timestamps: true },
);

genreSchema.index({ siteKey: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('Genre', genreSchema);

