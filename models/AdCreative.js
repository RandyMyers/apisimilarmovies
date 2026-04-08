const mongoose = require('mongoose');

const adCreativeSchema = new mongoose.Schema(
  {
    website: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Website',
      required: [true, 'Website is required'],
      index: true,
    },
    internalName: { type: String, required: [true, 'Internal name is required'], trim: true, maxlength: 200 },
    type: {
      type: String,
      enum: ['image', 'text', 'native'],
      default: 'image',
    },
    title: { type: String, trim: true, maxlength: 200, default: '' },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    imageUrl: { type: String, trim: true, default: '' },
    imageWidth: { type: Number, min: 1, default: null },
    imageHeight: { type: Number, min: 1, default: null },
    ctaLabel: { type: String, trim: true, maxlength: 100, default: '' },
    destinationUrl: { type: String, trim: true, required: [true, 'Destination URL is required'] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true },
);

adCreativeSchema.index({ website: 1, createdAt: -1 });
adCreativeSchema.index({ website: 1, internalName: 1 });

module.exports = mongoose.model('AdCreative', adCreativeSchema);
