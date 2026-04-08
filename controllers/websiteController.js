const mongoose = require('mongoose');
const Website = require('../models/Website');
const { logAdminAction } = require('../utils/adminAudit');

function normalizeKey(raw) {
  return String(raw || '').trim().toLowerCase();
}

exports.list = async (req, res) => {
  try {
    const connected = mongoose.connection.readyState === 1;
    if (!connected) return res.status(503).json({ error: 'Database unavailable' });

    const items = await Website.find().sort({ updatedAt: -1 }).limit(200).lean();
    return res.json({
      items: items.map((s) => ({
        id: s._id,
        key: s.key,
        name: s.name,
        domain: s.domain,
        isActive: s.isActive,
        defaultRegion: s.defaultRegion,
        supportedRegions: s.supportedRegions || [],
        adsStaticEnabled: Boolean(s.adsStaticEnabled),
        adsManagedEnabled: Boolean(s.adsManagedEnabled),
        updatedAt: s.updatedAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to list websites' });
  }
};

exports.create = async (req, res) => {
  try {
    const connected = mongoose.connection.readyState === 1;
    if (!connected) return res.status(503).json({ error: 'Database unavailable' });

    const key = normalizeKey(req.body?.key);
    const name = String(req.body?.name || '').trim();
    const domain = normalizeKey(req.body?.domain);
    const isActive = req.body?.isActive !== undefined ? Boolean(req.body.isActive) : true;
    const defaultRegion = normalizeKey(req.body?.defaultRegion) || 'us';
    const supportedRegions = Array.isArray(req.body?.supportedRegions)
      ? req.body.supportedRegions.map(normalizeKey).filter(Boolean)
      : [];

    if (!key) return res.status(400).json({ error: 'key is required' });
    if (!name) return res.status(400).json({ error: 'name is required' });

    const adsStaticEnabled = req.body?.adsStaticEnabled != null ? Boolean(req.body.adsStaticEnabled) : false;
    const adsManagedEnabled = req.body?.adsManagedEnabled != null ? Boolean(req.body.adsManagedEnabled) : false;

    const doc = await Website.create({
      key,
      name,
      domain,
      isActive,
      defaultRegion,
      supportedRegions,
      adsStaticEnabled,
      adsManagedEnabled,
    });
    await logAdminAction(req, {
      action: 'website.create',
      entityType: 'website',
      entityId: String(doc._id),
      details: { key: doc.key, name: doc.name },
    });
    return res.status(201).json({ success: true, id: doc._id });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Website key already exists' });
    return res.status(500).json({ error: err.message || 'Failed to create website' });
  }
};

exports.update = async (req, res) => {
  try {
    const connected = mongoose.connection.readyState === 1;
    if (!connected) return res.status(503).json({ error: 'Database unavailable' });

    const id = req.params.id;
    const patch = {};
    if (req.body?.name != null) patch.name = String(req.body.name).trim();
    if (req.body?.domain != null) patch.domain = normalizeKey(req.body.domain);
    if (req.body?.isActive != null) patch.isActive = Boolean(req.body.isActive);
    if (req.body?.defaultRegion != null) patch.defaultRegion = normalizeKey(req.body.defaultRegion) || 'us';
    if (req.body?.supportedRegions != null) {
      patch.supportedRegions = Array.isArray(req.body.supportedRegions)
        ? req.body.supportedRegions.map(normalizeKey).filter(Boolean)
        : [];
    }
    if (req.body?.adsStaticEnabled != null) patch.adsStaticEnabled = Boolean(req.body.adsStaticEnabled);
    if (req.body?.adsManagedEnabled != null) patch.adsManagedEnabled = Boolean(req.body.adsManagedEnabled);

    const doc = await Website.findByIdAndUpdate(id, { $set: patch }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    await logAdminAction(req, {
      action: 'website.update',
      entityType: 'website',
      entityId: String(doc._id),
      details: { patch },
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to update website' });
  }
};

exports.remove = async (req, res) => {
  try {
    const connected = mongoose.connection.readyState === 1;
    if (!connected) return res.status(503).json({ error: 'Database unavailable' });

    const doc = await Website.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    await logAdminAction(req, {
      action: 'website.delete',
      entityType: 'website',
      entityId: String(doc._id),
      details: { key: doc.key, name: doc.name },
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to delete website' });
  }
};

