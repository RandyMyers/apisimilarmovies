const mongoose = require('mongoose');
const AdCreative = require('../models/AdCreative');
const AdCampaign = require('../models/AdCampaign');
const Website = require('../models/Website');
const { asyncHandler } = require('../middleware/errorHandler');
const { resolveWebsiteIdForAds } = require('../utils/resolveWebsiteIdForAds');

const ALLOWED_TYPES = new Set(['image', 'text', 'native']);
const URL_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
const toPositiveIntOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
};

function adminActorId(req) {
  const id = req.admin?.userId;
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return null;
  return String(id);
}

const validateCreativeBody = (body, { isUpdate = false } = {}) => {
  const errors = [];
  const internalName = String(body?.internalName || '').trim();
  if (!isUpdate || body.internalName !== undefined) {
    if (!internalName) errors.push('internalName is required');
    if (internalName.length > 200) errors.push('internalName must be 200 characters or less');
  }
  if (body?.type !== undefined && !ALLOWED_TYPES.has(String(body.type).trim())) {
    errors.push('invalid creative type');
  }
  const dest = body?.destinationUrl != null ? String(body.destinationUrl).trim() : '';
  if (!isUpdate || body.destinationUrl !== undefined) {
    if (!dest || !URL_PATTERN.test(dest)) errors.push('destinationUrl must be a valid http/https URL');
  }
  if (body?.imageUrl && !URL_PATTERN.test(String(body.imageUrl).trim())) {
    errors.push('imageUrl must be a valid http/https URL');
  }
  return errors;
};

exports.list = asyncHandler(async (req, res) => {
  const websiteParam = req.query.website;
  const websiteId = websiteParam ? await resolveWebsiteIdForAds(websiteParam) : null;
  if (websiteParam && !websiteId) {
    return res.status(400).json({ success: false, message: 'Invalid website (id or site key)' });
  }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const skip = (page - 1) * limit;
  const filter = {};
  if (websiteId) filter.website = websiteId;

  const [items, total] = await Promise.all([
    AdCreative.find(filter).populate('website', 'name key').sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    AdCreative.countDocuments(filter),
  ]);
  res.status(200).json({ success: true, data: items, pagination: { page, limit, total } });
});

exports.getById = asyncHandler(async (req, res) => {
  const item = await AdCreative.findById(req.params.id).populate('website', 'name key').lean();
  if (!item) return res.status(404).json({ success: false, message: 'Ad creative not found' });
  res.status(200).json({ success: true, data: item });
});

exports.create = asyncHandler(async (req, res) => {
  const errors = validateCreativeBody(req.body);
  if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });
  const websiteId = req.body.website;
  if (!websiteId) return res.status(400).json({ success: false, message: 'website (id) is required' });
  const website = await Website.findById(websiteId).lean();
  if (!website) return res.status(400).json({ success: false, message: 'Website not found' });

  const actor = adminActorId(req);
  const doc = await AdCreative.create({
    website: websiteId,
    internalName: String(req.body.internalName).trim(),
    type: ALLOWED_TYPES.has(String(req.body.type || '').trim()) ? String(req.body.type).trim() : 'image',
    title: req.body.title || '',
    description: req.body.description || '',
    imageUrl: req.body.imageUrl || '',
    imageWidth: toPositiveIntOrNull(req.body.imageWidth),
    imageHeight: toPositiveIntOrNull(req.body.imageHeight),
    ctaLabel: req.body.ctaLabel || '',
    destinationUrl: String(req.body.destinationUrl).trim(),
    createdBy: actor,
    updatedBy: actor,
  });
  res.status(201).json({ success: true, data: doc });
});

exports.update = asyncHandler(async (req, res) => {
  const errors = validateCreativeBody(req.body, { isUpdate: true });
  if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });
  const prev = await AdCreative.findById(req.params.id).lean();
  if (!prev) return res.status(404).json({ success: false, message: 'Ad creative not found' });

  const actor = adminActorId(req);
  const updates = { ...req.body, updatedBy: actor };
  if (updates.internalName !== undefined) updates.internalName = String(updates.internalName).trim();
  if (updates.destinationUrl !== undefined) updates.destinationUrl = String(updates.destinationUrl).trim();
  if (updates.imageWidth !== undefined) updates.imageWidth = toPositiveIntOrNull(updates.imageWidth);
  if (updates.imageHeight !== undefined) updates.imageHeight = toPositiveIntOrNull(updates.imageHeight);
  delete updates.website;

  const doc = await AdCreative.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).lean();
  if (!doc) return res.status(404).json({ success: false, message: 'Ad creative not found' });
  res.status(200).json({ success: true, data: doc });
});

exports.remove = asyncHandler(async (req, res) => {
  const inUse = await AdCampaign.countDocuments({ 'creatives.creative': req.params.id });
  if (inUse > 0) {
    return res.status(409).json({
      success: false,
      message: 'Creative is attached to one or more campaigns; remove it from campaigns first',
    });
  }
  const doc = await AdCreative.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ success: false, message: 'Ad creative not found' });
  res.status(200).json({ success: true, message: 'Ad creative deleted' });
});
