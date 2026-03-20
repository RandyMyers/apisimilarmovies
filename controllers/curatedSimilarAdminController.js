const CuratedSimilar = require('../models/CuratedSimilar');
const { parseCategory } = require('../utils/parseCategory');
const { logAdminAction } = require('../utils/adminAudit');

const KINDS = new Set(['movie', 'tv']);
const CATS = new Set(['movie', 'tv', 'anime_movie', 'anime_tv']);

exports.listForBase = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const baseCategory = parseCategory(req.query.baseCategory);
    const baseTmdbId = parseInt(req.query.baseTmdbId, 10);
    if (!baseCategory || !Number.isFinite(baseTmdbId)) {
      return res.status(400).json({ error: 'baseCategory and baseTmdbId required' });
    }
    const items = await CuratedSimilar.find({ siteKey, baseCategory, baseTmdbId })
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();
    return res.json({ items });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'List failed' });
  }
};

exports.add = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const {
      baseCategory,
      baseTmdbId,
      similarCategory,
      similarTmdbKind,
      similarTmdbId,
      displayName,
      posterPath,
      genreSlugs,
      sortOrder,
    } = req.body || {};
    const bc = parseCategory(baseCategory);
    const sc = parseCategory(similarCategory);
    const sk = String(similarTmdbKind || '').toLowerCase();
    const sid = parseInt(similarTmdbId, 10);
    const bid = parseInt(baseTmdbId, 10);
    if (!bc || !sc || !KINDS.has(sk) || !Number.isFinite(sid) || !Number.isFinite(bid)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    if (!CATS.has(sc)) return res.status(400).json({ error: 'Invalid similarCategory' });
    const doc = await CuratedSimilar.create({
      siteKey,
      baseCategory: bc,
      baseTmdbId: bid,
      similarCategory: sc,
      similarTmdbKind: sk,
      similarTmdbId: sid,
      displayName: String(displayName || '').trim() || `#${sid}`,
      posterPath: String(posterPath || '').trim(),
      genreSlugs: Array.isArray(genreSlugs)
        ? genreSlugs.map((g) => String(g).trim().toLowerCase()).filter(Boolean)
        : [],
      sortOrder: parseInt(sortOrder, 10) || 0,
    });
    await logAdminAction(req, {
      action: 'curation.create',
      entityType: 'curated_similar',
      entityId: String(doc._id),
      details: { baseCategory: bc, baseTmdbId: bid, similarCategory: sc, similarTmdbKind: sk, similarTmdbId: sid },
    });
    return res.status(201).json({ success: true, id: doc._id });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'This similar title is already linked' });
    }
    return res.status(500).json({ error: err.message || 'Add failed' });
  }
};

exports.remove = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const r = await CuratedSimilar.findOneAndDelete({ _id: req.params.id, siteKey });
    if (!r) return res.status(404).json({ error: 'Not found' });
    await logAdminAction(req, {
      action: 'curation.delete',
      entityType: 'curated_similar',
      entityId: String(r._id),
      details: { baseCategory: r.baseCategory, baseTmdbId: r.baseTmdbId },
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Delete failed' });
  }
};

exports.update = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id is required' });

    const patch = {};
    if (req.body?.displayName != null) {
      const displayName = String(req.body.displayName).trim();
      if (!displayName) return res.status(400).json({ error: 'displayName cannot be empty' });
      patch.displayName = displayName;
    }
    if (req.body?.posterPath != null) patch.posterPath = String(req.body.posterPath).trim();
    if (req.body?.genreSlugs != null) {
      patch.genreSlugs = Array.isArray(req.body.genreSlugs)
        ? req.body.genreSlugs.map((g) => String(g).trim().toLowerCase()).filter(Boolean)
        : [];
    }
    if (req.body?.sortOrder != null) {
      const n = parseInt(req.body.sortOrder, 10);
      if (!Number.isFinite(n)) return res.status(400).json({ error: 'sortOrder must be a number' });
      patch.sortOrder = n;
    }
    if (req.body?.similarCategory != null) {
      const sc = parseCategory(req.body.similarCategory);
      if (!sc || !CATS.has(sc)) return res.status(400).json({ error: 'Invalid similarCategory' });
      patch.similarCategory = sc;
    }

    if (!Object.keys(patch).length) return res.status(400).json({ error: 'No valid fields to update' });

    const doc = await CuratedSimilar.findOneAndUpdate({ _id: id, siteKey }, { $set: patch }, { new: true }).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    await logAdminAction(req, {
      action: 'curation.update',
      entityType: 'curated_similar',
      entityId: String(doc._id),
      details: { patch },
    });

    return res.json({ success: true, item: doc });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'This similar title is already linked' });
    }
    return res.status(500).json({ error: err.message || 'Update failed' });
  }
};
