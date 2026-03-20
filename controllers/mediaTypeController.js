const MediaType = require('../models/MediaType');
const { logAdminAction } = require('../utils/adminAudit');

const ALLOWED_SLUGS = new Set(['movie', 'tv', 'anime_movie', 'anime_tv']);
const TMDB_KINDS = new Set(['movie', 'tv']);

function normalizeSlug(raw) {
  return String(raw || '').trim().toLowerCase();
}

function normalizeTmdbKind(raw) {
  const kind = String(raw || '').trim().toLowerCase();
  return TMDB_KINDS.has(kind) ? kind : '';
}

exports.list = async (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
    const q = includeInactive ? {} : { isActive: true };
    const items = await MediaType.find(q).sort({ sortOrder: 1, createdAt: 1 }).lean();
    return res.json({
      items: items
        .map((i) => ({ ...i, slug: String(i.slug || i.key || '').trim().toLowerCase() }))
        .filter((i) => Boolean(i.slug)),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to list types' });
  }
};

exports.create = async (req, res) => {
  try {
    const slug = normalizeSlug(req.body?.slug || req.body?.key);
    const label = String(req.body?.label || '').trim();
    const tmdbKind = normalizeTmdbKind(req.body?.tmdbKind);
    const isActive = req.body?.isActive !== undefined ? Boolean(req.body.isActive) : true;
    const sortOrder = req.body?.sortOrder != null ? Number(req.body.sortOrder) : 0;

    if (!ALLOWED_SLUGS.has(slug)) return res.status(400).json({ error: 'Unsupported type slug' });
    if (!label) return res.status(400).json({ error: 'label is required' });
    if (!tmdbKind) return res.status(400).json({ error: 'tmdbKind must be movie or tv' });

    const existing = await MediaType.findOne({ slug }).lean();
    if (existing) return res.status(409).json({ error: 'Type already exists' });

    const doc = await MediaType.create({ slug, label, tmdbKind, isActive, sortOrder });

    await logAdminAction(req, {
      action: 'type.create',
      entityType: 'media_type',
      entityId: String(doc._id),
      details: { slug: doc.slug, tmdbKind: doc.tmdbKind, isActive: doc.isActive },
    });

    return res.status(201).json({ success: true, id: doc._id, item: doc });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Create type failed' });
  }
};

exports.update = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const patch = {};

    if (req.body?.label != null) patch.label = String(req.body.label).trim();
    if (req.body?.slug != null || req.body?.key != null) patch.slug = normalizeSlug(req.body?.slug || req.body?.key);
    if (req.body?.tmdbKind != null) patch.tmdbKind = normalizeTmdbKind(req.body.tmdbKind);
    if (patch.slug && !ALLOWED_SLUGS.has(patch.slug)) {
      return res.status(400).json({ error: 'Unsupported type slug' });
    }
    if (req.body?.isActive != null) patch.isActive = Boolean(req.body.isActive);
    if (req.body?.sortOrder != null) patch.sortOrder = Number(req.body.sortOrder);

    if (patch.tmdbKind && !TMDB_KINDS.has(patch.tmdbKind)) {
      return res.status(400).json({ error: 'tmdbKind must be movie or tv' });
    }
    if (patch.label != null && !patch.label) return res.status(400).json({ error: 'label is required' });

    const doc = await MediaType.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
    if (!doc) return res.status(404).json({ error: 'Type not found' });

    await logAdminAction(req, {
      action: 'type.update',
      entityType: 'media_type',
      entityId: String(doc._id),
      details: { patch },
    });

    return res.json({ success: true, item: doc });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Update type failed' });
  }
};

exports.remove = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const doc = await MediaType.findByIdAndDelete(id).lean();
    if (!doc) return res.status(404).json({ error: 'Type not found' });

    await logAdminAction(req, {
      action: 'type.delete',
      entityType: 'media_type',
      entityId: String(doc._id),
      details: { slug: doc.slug, tmdbKind: doc.tmdbKind },
    });

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Delete type failed' });
  }
};

