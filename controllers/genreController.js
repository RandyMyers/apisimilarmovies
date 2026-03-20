const Genre = require('../models/Genre');
const { logAdminAction } = require('../utils/adminAudit');
const GLOBAL_SITE_KEY = 'global';
const LEGACY_SITE_KEYS = ['default'];
const GLOBAL_GENRE_SITE_KEYS = [GLOBAL_SITE_KEY];

function toSlug(raw) {
  return String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// GET /api/v1/admin/genres
exports.list = async (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
    const filter = includeInactive
      ? { siteKey: { $in: GLOBAL_GENRE_SITE_KEYS } }
      : { siteKey: { $in: GLOBAL_GENRE_SITE_KEYS }, isActive: true };

    const items = await Genre.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
    return res.json({
      items: items
        .map((g) => ({
          id: g._id,
          slug: String(g.slug || '').trim().toLowerCase(),
          name: g.name,
          description: g.description || '',
          isActive: Boolean(g.isActive),
          sortOrder: Number(g.sortOrder || 0),
          updatedAt: g.updatedAt,
        }))
        .filter((g) => Boolean(g.slug)),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to list genres' });
  }
};

// POST /api/v1/admin/genres
exports.create = async (req, res) => {
  try {
    const siteKey = GLOBAL_SITE_KEY;
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    const slug = toSlug(req.body?.slug || name);
    if (!slug) return res.status(400).json({ error: 'slug is required' });
    const existing = await Genre.findOne({
      siteKey: { $in: GLOBAL_GENRE_SITE_KEYS },
      slug,
    })
      .select('name slug siteKey isActive')
      .lean();
    if (existing) {
      return res.status(409).json({
        error: `Genre slug already exists: ${existing.slug} (${existing.name || 'unnamed'})`,
      });
    }

    const doc = await Genre.create({
      siteKey,
      slug,
      name,
      description: String(req.body?.description || '').trim(),
      isActive: req.body?.isActive !== undefined ? Boolean(req.body.isActive) : true,
      sortOrder: Number.isFinite(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : 0,
    });
    await logAdminAction(req, {
      action: 'genre.create',
      entityType: 'genre',
      entityId: String(doc._id),
      details: { slug: doc.slug, name: doc.name },
    });
    return res.status(201).json({ success: true, id: doc._id });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Genre slug already exists' });
    return res.status(500).json({ error: err.message || 'Failed to create genre' });
  }
};

// PATCH /api/v1/admin/genres/:id
exports.update = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id is required' });

    const patch = {};
    if (req.body?.name != null) {
      const n = String(req.body.name || '').trim();
      if (!n) return res.status(400).json({ error: 'name cannot be empty' });
      patch.name = n;
    }
    if (req.body?.slug != null) {
      const s = toSlug(req.body.slug);
      if (!s) return res.status(400).json({ error: 'slug cannot be empty' });
      patch.slug = s;
    }
    if (req.body?.description != null) patch.description = String(req.body.description || '').trim();
    if (req.body?.isActive != null) patch.isActive = Boolean(req.body.isActive);
    if (req.body?.sortOrder != null) {
      const n = Number(req.body.sortOrder);
      if (!Number.isFinite(n)) return res.status(400).json({ error: 'sortOrder must be a number' });
      patch.sortOrder = n;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'No valid fields to update' });

    const doc = await Genre.findOneAndUpdate(
      { _id: id, siteKey: GLOBAL_SITE_KEY },
      { $set: { ...patch, siteKey: GLOBAL_SITE_KEY } },
      { new: true },
    ).lean();
    if (!doc) return res.status(404).json({ error: 'Genre not found' });
    await logAdminAction(req, {
      action: 'genre.update',
      entityType: 'genre',
      entityId: String(doc._id),
      details: { patch },
    });
    return res.json({ success: true, item: doc });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Genre slug already exists' });
    return res.status(500).json({ error: err.message || 'Failed to update genre' });
  }
};

// DELETE /api/v1/admin/genres/:id
exports.remove = async (req, res) => {
  try {
    const doc = await Genre.findOneAndDelete({ _id: req.params.id, siteKey: GLOBAL_SITE_KEY });
    if (!doc) return res.status(404).json({ error: 'Genre not found' });
    await logAdminAction(req, {
      action: 'genre.delete',
      entityType: 'genre',
      entityId: String(doc._id),
      details: { slug: doc.slug, name: doc.name },
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to delete genre' });
  }
};

// DELETE /api/v1/admin/genres (bulk clear)
exports.removeAll = async (req, res) => {
  try {
    const result = await Genre.deleteMany({
      $or: [{ siteKey: GLOBAL_SITE_KEY }, { siteKey: { $in: LEGACY_SITE_KEYS } }, { siteKey: { $exists: false } }],
    });
    await logAdminAction(req, {
      action: 'genre.clear_all',
      entityType: 'genre',
      details: { deletedCount: Number(result?.deletedCount || 0) },
    });
    return res.json({ success: true, deletedCount: Number(result?.deletedCount || 0) });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to clear genres' });
  }
};

/** Public read-only list (same shape as admin GET; no auth). */
exports.listPublic = exports.list;

