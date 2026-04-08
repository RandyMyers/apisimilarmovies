const mongoose = require('mongoose');
const AdCampaign = require('../models/AdCampaign');
const AdCreative = require('../models/AdCreative');
const AdModerationLog = require('../models/AdModerationLog');
const Website = require('../models/Website');
const { asyncHandler } = require('../middleware/errorHandler');
const { resolveWebsiteIdForAds } = require('../utils/resolveWebsiteIdForAds');

function adminActorId(req) {
  const id = req.admin?.userId;
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return null;
  return String(id);
}

const appendModerationLog = async ({ campaignId, websiteId, action, fromStatus, toStatus, reason, actorId, fieldChanges }) => {
  if (!campaignId || !toStatus) return;
  const payload = {
    campaign: campaignId,
    website: websiteId || undefined,
    action: String(action || 'status_change').slice(0, 64),
    fromStatus: fromStatus != null ? String(fromStatus) : '',
    toStatus: String(toStatus),
    reason: reason != null ? String(reason).slice(0, 1000) : '',
    actor: actorId || null,
  };
  if (Array.isArray(fieldChanges) && fieldChanges.length > 0) {
    payload.fieldChanges = fieldChanges;
  }
  await AdModerationLog.create(payload);
};

const stringifyStable = (v) => {
  try {
    return JSON.stringify(v ?? null);
  } catch (_e) {
    return String(v ?? '');
  }
};

const truncateLogValue = (val, maxLen = 400) => {
  const s = typeof val === 'string' ? val : stringifyStable(val);
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}…`;
};

const buildFieldChanges = (prevDoc, nextDoc, keys, { maxKeys = 40 } = {}) => {
  const out = [];
  for (const k of keys) {
    if (!k || k === 'updatedBy') continue;
    if (stringifyStable(prevDoc?.[k]) === stringifyStable(nextDoc?.[k])) continue;
    out.push({
      path: String(k).slice(0, 200),
      before: truncateLogValue(prevDoc?.[k]),
      after: truncateLogValue(nextDoc?.[k]),
    });
    if (out.length >= maxKeys) break;
  }
  return out;
};

const ALLOWED_STATUSES = new Set(['draft', 'pending_review', 'approved', 'active', 'paused', 'rejected', 'expired', 'archived']);

const normalizeTargeting = (targeting = {}) => ({
  domains: Array.isArray(targeting.domains) ? targeting.domains.map((x) => String(x).trim().toLowerCase()).filter(Boolean) : [],
  locales: Array.isArray(targeting.locales) ? targeting.locales.map((x) => String(x).trim().toLowerCase()).filter(Boolean) : [],
  countries: Array.isArray(targeting.countries)
    ? targeting.countries.map((x) => String(x).trim().toLowerCase().slice(0, 2)).filter((c) => /^[a-z]{2}$/.test(c))
    : [],
  devices: Array.isArray(targeting.devices) ? targeting.devices.map((x) => String(x).trim().toLowerCase()).filter(Boolean) : [],
  pages: Array.isArray(targeting.pages) ? targeting.pages.map((x) => String(x).trim().toLowerCase()).filter(Boolean) : [],
  placements: Array.isArray(targeting.placements) ? targeting.placements.map((x) => String(x).trim().toLowerCase()).filter(Boolean) : [],
});

const resolveCreativeAssignments = async (creatives = [], websiteId) => {
  if (!websiteId) {
    const err = new Error('website is required to resolve creatives');
    err.statusCode = 400;
    throw err;
  }
  if (!Array.isArray(creatives) || creatives.length === 0) {
    const err = new Error('at least one creative is required');
    err.statusCode = 400;
    throw err;
  }
  const normalized = creatives.map((item) => ({
    creative: item.creative,
    isDefault: item.isDefault === true,
  }));
  const rawIds = normalized.map((x) => String(x.creative || '').trim()).filter(Boolean);
  if (new Set(rawIds).size !== rawIds.length) {
    const err = new Error('each creative may only appear once per campaign');
    err.statusCode = 400;
    throw err;
  }
  for (const id of rawIds) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error('invalid creative id');
      err.statusCode = 400;
      throw err;
    }
  }
  let defaultCount = normalized.filter((x) => x.isDefault).length;
  if (defaultCount === 0) normalized[0].isDefault = true;
  if (defaultCount > 1) {
    let first = true;
    normalized.forEach((x) => {
      if (x.isDefault) {
        if (!first) x.isDefault = false;
        first = false;
      }
    });
  }
  const count = await AdCreative.countDocuments({ _id: { $in: rawIds }, website: websiteId });
  if (count !== rawIds.length) {
    const err = new Error('one or more creatives were not found for this website');
    err.statusCode = 400;
    throw err;
  }
  return normalized.map((x) => ({
    creative: x.creative,
    isDefault: x.isDefault,
  }));
};

const validateCampaignPayload = ({ body, isUpdate = false }) => {
  const errors = [];
  const name = String(body?.name || '').trim();
  if (!isUpdate || body?.name !== undefined) {
    if (!name) errors.push('name is required');
    if (name.length > 200) errors.push('name must be 200 characters or less');
  }
  if (body?.status !== undefined && !ALLOWED_STATUSES.has(String(body.status).trim())) {
    errors.push('invalid status');
  }
  const startAt = body?.startAt ? new Date(body.startAt) : null;
  const endAt = body?.endAt ? new Date(body.endAt) : null;
  if (startAt && Number.isNaN(startAt.getTime())) errors.push('startAt is invalid');
  if (endAt && Number.isNaN(endAt.getTime())) errors.push('endAt is invalid');
  if (startAt && endAt && startAt > endAt) errors.push('startAt cannot be after endAt');
  if (body?.priority !== undefined && (!Number.isFinite(Number(body.priority)) || Number(body.priority) < 0 || Number(body.priority) > 1000)) {
    errors.push('priority must be a number between 0 and 1000');
  }
  if (body?.weight !== undefined && (!Number.isFinite(Number(body.weight)) || Number(body.weight) < 1 || Number(body.weight) > 1000)) {
    errors.push('weight must be a number between 1 and 1000');
  }
  if (body?.creatives !== undefined) {
    if (!Array.isArray(body.creatives) || body.creatives.length === 0) {
      errors.push('at least one creative is required');
    } else {
      body.creatives.forEach((c, idx) => {
        const id = c?.creative;
        if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
          errors.push(`creative[${idx}] creative id is required`);
        }
      });
    }
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
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;
  const status = req.query.status ? String(req.query.status).trim() : '';

  const filter = {};
  if (websiteId) filter.website = websiteId;
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    AdCampaign.find(filter).populate('website', 'name key').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AdCampaign.countDocuments(filter),
  ]);

  res.status(200).json({ success: true, data: items, pagination: { page, limit, total } });
});

exports.getModerationLog = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid campaign id' });
  }
  const campaign = await AdCampaign.findById(req.params.id).select('_id').lean();
  if (!campaign) {
    return res.status(404).json({ success: false, message: 'Ad campaign not found' });
  }
  const logs = await AdModerationLog.find({ campaign: req.params.id })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate('actor', 'displayName email')
    .lean();
  res.status(200).json({ success: true, data: logs });
});

exports.getById = asyncHandler(async (req, res) => {
  const item = await AdCampaign.findById(req.params.id)
    .populate('website', 'name key')
    .populate({
      path: 'creatives.creative',
      select: 'internalName type title description imageUrl imageWidth imageHeight ctaLabel destinationUrl website',
    })
    .lean();
  if (!item) {
    return res.status(404).json({ success: false, message: 'Ad campaign not found' });
  }
  res.status(200).json({ success: true, data: item });
});

exports.create = asyncHandler(async (req, res) => {
  const errors = validateCampaignPayload({ body: req.body });
  if (errors.length) {
    return res.status(400).json({ success: false, message: errors[0], errors });
  }
  const websiteId = req.body.website;
  if (!websiteId) {
    return res.status(400).json({ success: false, message: 'website (id) is required' });
  }
  const website = await Website.findById(websiteId).lean();
  if (!website) {
    return res.status(400).json({ success: false, message: 'Website not found' });
  }

  let creativeAssignments;
  try {
    creativeAssignments = await resolveCreativeAssignments(req.body.creatives, websiteId);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ success: false, message: e.message });
  }

  const actor = adminActorId(req);
  const campaign = await AdCampaign.create({
    website: websiteId,
    name: req.body.name,
    advertiserName: req.body.advertiserName || '',
    status: req.body.status || 'draft',
    startAt: req.body.startAt || null,
    endAt: req.body.endAt || null,
    priority: req.body.priority ?? 0,
    weight: req.body.weight ?? 1,
    targeting: normalizeTargeting(req.body.targeting),
    creatives: creativeAssignments,
    createdBy: actor,
    updatedBy: actor,
  });

  await appendModerationLog({
    campaignId: campaign._id,
    websiteId: campaign.website,
    action: 'create',
    fromStatus: '',
    toStatus: campaign.status,
    reason: '',
    actorId: actor,
  });

  res.status(201).json({ success: true, data: campaign });
});

exports.update = asyncHandler(async (req, res) => {
  const errors = validateCampaignPayload({ body: req.body, isUpdate: true });
  if (errors.length) {
    return res.status(400).json({ success: false, message: errors[0], errors });
  }
  const prev = await AdCampaign.findById(req.params.id).lean();
  if (!prev) {
    return res.status(404).json({ success: false, message: 'Ad campaign not found' });
  }

  const actor = adminActorId(req);
  const updates = { ...req.body, updatedBy: actor };
  if (updates.targeting !== undefined) updates.targeting = normalizeTargeting(updates.targeting);
  const websiteIdForCreatives = updates.website !== undefined ? updates.website : prev.website;
  if (updates.creatives !== undefined) {
    try {
      updates.creatives = await resolveCreativeAssignments(updates.creatives, websiteIdForCreatives);
    } catch (e) {
      return res.status(e.statusCode || 400).json({ success: false, message: e.message });
    }
  }
  const candidateKeys = Object.keys(updates).filter((k) => k !== 'updatedBy');

  const campaign = await AdCampaign.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).lean();
  if (!campaign) {
    return res.status(404).json({ success: false, message: 'Ad campaign not found' });
  }

  const changedKeys = candidateKeys.filter((k) => stringifyStable(prev[k]) !== stringifyStable(campaign[k]));
  const nonStatusChanged = changedKeys.filter((k) => k !== 'status');

  if (updates.status !== undefined && String(updates.status) !== String(prev.status)) {
    await appendModerationLog({
      campaignId: campaign._id,
      websiteId: campaign.website,
      action: 'update_status',
      fromStatus: prev.status,
      toStatus: campaign.status,
      reason: '',
      actorId: actor,
    });
  }

  if (nonStatusChanged.length > 0) {
    const fieldChanges = buildFieldChanges(prev, campaign, nonStatusChanged);
    await appendModerationLog({
      campaignId: campaign._id,
      websiteId: campaign.website,
      action: 'update_fields',
      fromStatus: prev.status,
      toStatus: campaign.status,
      reason: `fields: ${nonStatusChanged.join(', ')}`.slice(0, 1000),
      fieldChanges,
      actorId: actor,
    });
  }

  res.status(200).json({ success: true, data: campaign });
});

exports.remove = asyncHandler(async (req, res) => {
  const campaign = await AdCampaign.findByIdAndDelete(req.params.id);
  if (!campaign) {
    return res.status(404).json({ success: false, message: 'Ad campaign not found' });
  }
  res.status(200).json({ success: true, message: 'Ad campaign deleted' });
});

const transitionStatus = (nextStatus, actionLabel) =>
  asyncHandler(async (req, res) => {
    const prev = await AdCampaign.findById(req.params.id).lean();
    if (!prev) {
      return res.status(404).json({ success: false, message: 'Ad campaign not found' });
    }
    const rejectionReason = nextStatus === 'rejected' ? String(req.body.reason || '').trim().slice(0, 1000) : '';
    const actor = adminActorId(req);
    const updates = {
      status: nextStatus,
      updatedBy: actor,
    };
    if (nextStatus === 'approved' || nextStatus === 'rejected') {
      updates.moderation = {
        reviewedBy: actor,
        reviewedAt: new Date(),
        rejectionReason,
      };
    }
    const campaign = await AdCampaign.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).lean();
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Ad campaign not found' });
    }
    await appendModerationLog({
      campaignId: campaign._id,
      websiteId: campaign.website,
      action: actionLabel,
      fromStatus: prev.status,
      toStatus: nextStatus,
      reason: nextStatus === 'rejected' ? rejectionReason : '',
      actorId: actor,
    });
    return res.status(200).json({ success: true, data: campaign });
  });

exports.submit = transitionStatus('pending_review', 'submit');
exports.approve = transitionStatus('approved', 'approve');
exports.reject = transitionStatus('rejected', 'reject');
exports.activate = transitionStatus('active', 'activate');
exports.pause = transitionStatus('paused', 'pause');
exports.archive = transitionStatus('archived', 'archive');
