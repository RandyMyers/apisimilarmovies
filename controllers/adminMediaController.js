const Media = require('../models/Media');
const CuratedSimilar = require('../models/CuratedSimilar');
const MediaDetailSEO = require('../models/MediaDetailSEO');
const SimilarityVote = require('../models/SimilarityVote');
const SimilarSuggestion = require('../models/SimilarSuggestion');
const MediaReview = require('../models/MediaReview');
const { logAdminAction } = require('../utils/adminAudit');

const MEDIA_CATEGORIES = ['movie', 'tv', 'anime_movie', 'anime_tv'];
const TMDB_KINDS = ['movie', 'tv'];

exports.createMedia = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const {
      category,
      tmdbKind,
      tmdbMovieId,
      tmdbTvId,
      displayName,
      availableRegions,
      posterPath,
      genreSlugs,
    } = req.body || {};

    const cat = String(category || '').toLowerCase();
    const kind = String(tmdbKind || '').toLowerCase();
    if (!MEDIA_CATEGORIES.includes(cat) || !TMDB_KINDS.includes(kind)) {
      return res.status(400).json({ error: 'Invalid category or tmdbKind' });
    }
    if (!String(displayName || '').trim()) return res.status(400).json({ error: 'displayName is required' });

    const update = {
      siteKey,
      category: cat,
      tmdbKind: kind,
      tmdbMovieId: tmdbMovieId != null ? parseInt(tmdbMovieId, 10) : null,
      tmdbTvId: tmdbTvId != null ? parseInt(tmdbTvId, 10) : null,
      displayName: String(displayName).trim(),
      availableRegions: Array.isArray(availableRegions)
        ? availableRegions.map((r) => String(r).trim().toLowerCase()).filter(Boolean)
        : [],
      posterPath: posterPath != null ? String(posterPath).trim() : '',
      genreSlugs: Array.isArray(genreSlugs)
        ? genreSlugs.map((g) => String(g).trim().toLowerCase()).filter(Boolean)
        : [],
    };

    if (kind === 'movie') update.tmdbTvId = null;
    if (kind === 'tv') update.tmdbMovieId = null;

    if (!Number.isFinite(update.tmdbMovieId) && kind === 'movie') {
      return res.status(400).json({ error: 'tmdbMovieId is required for tmdbKind=movie' });
    }
    if (!Number.isFinite(update.tmdbTvId) && kind === 'tv') {
      return res.status(400).json({ error: 'tmdbTvId is required for tmdbKind=tv' });
    }

    // Upsert by category+kind id so admin can re-save.
    const query =
      kind === 'movie'
        ? { siteKey, category: cat, tmdbMovieId: update.tmdbMovieId }
        : { siteKey, category: cat, tmdbTvId: update.tmdbTvId };

    const doc = await Media.findOneAndUpdate(
      query,
      { $set: update },
      { upsert: true, new: true },
    );

    await logAdminAction(req, {
      action: 'media.create_or_upsert',
      entityType: 'media',
      entityId: String(doc._id),
      details: { category: doc.category, tmdbKind: doc.tmdbKind, tmdbMovieId: doc.tmdbMovieId, tmdbTvId: doc.tmdbTvId },
    });
    return res.json({ success: true, id: doc._id });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to create media' });
  }
};

exports.listMedia = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
    const [items, total] = await Promise.all([
      Media.find({ siteKey }).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      Media.countDocuments({ siteKey }),
    ]);
    return res.json({
      items: items.map((m) => ({
        id: m._id,
        siteKey: m.siteKey,
        category: m.category,
        tmdbKind: m.tmdbKind,
        tmdbMovieId: m.tmdbMovieId,
        tmdbTvId: m.tmdbTvId,
        displayName: m.displayName,
        posterPath: m.posterPath || '',
        genreSlugs: Array.isArray(m.genreSlugs) ? m.genreSlugs : [],
        updatedAt: m.updatedAt,
      })),
      total,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to list media' });
  }
};

exports.getMediaOne = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const id = String(req.params.id || '');
    const m = await Media.findOne({ _id: id, siteKey }).lean();
    if (!m) return res.status(404).json({ error: 'Media not found' });
    return res.json({
      id: m._id,
      siteKey: m.siteKey,
      category: m.category,
      tmdbKind: m.tmdbKind,
      tmdbMovieId: m.tmdbMovieId,
      tmdbTvId: m.tmdbTvId,
      displayName: m.displayName,
      posterPath: m.posterPath || '',
      genreSlugs: Array.isArray(m.genreSlugs) ? m.genreSlugs : [],
      availableRegions: Array.isArray(m.availableRegions) ? m.availableRegions : [],
      updatedAt: m.updatedAt,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load media' });
  }
};

exports.updateMedia = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const id = String(req.params.id || '');
    const patch = {};
    if (req.body?.displayName != null) patch.displayName = String(req.body.displayName).trim();
    if (req.body?.posterPath != null) patch.posterPath = String(req.body.posterPath).trim();
    if (req.body?.genreSlugs != null) {
      patch.genreSlugs = Array.isArray(req.body.genreSlugs)
        ? req.body.genreSlugs.map((g) => String(g).trim().toLowerCase()).filter(Boolean)
        : [];
    }
    if (req.body?.availableRegions != null) {
      patch.availableRegions = Array.isArray(req.body.availableRegions)
        ? req.body.availableRegions.map((r) => String(r).trim().toLowerCase()).filter(Boolean)
        : [];
    }
    if (req.body?.category != null) {
      const cat = String(req.body.category).toLowerCase();
      if (!MEDIA_CATEGORIES.includes(cat)) return res.status(400).json({ error: 'Invalid category' });
      patch.category = cat;
    }
    const doc = await Media.findOneAndUpdate({ _id: id, siteKey }, { $set: patch }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Media not found' });
    await logAdminAction(req, {
      action: 'media.update',
      entityType: 'media',
      entityId: String(doc._id),
      details: { patch },
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to update media' });
  }
};

exports.deleteMedia = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const id = String(req.params.id || '');
    const force = String(req.query.force || '').toLowerCase() === 'true';

    const doc = await Media.findOne({ _id: id, siteKey }).lean();
    if (!doc) return res.status(404).json({ error: 'Media not found' });

    const tmdbId = doc.tmdbKind === 'movie' ? doc.tmdbMovieId : doc.tmdbTvId;
    const seoFilter =
      doc.tmdbKind === 'movie'
        ? { siteKey, category: doc.category, tmdbMovieId: tmdbId }
        : { siteKey, category: doc.category, tmdbTvId: tmdbId };

    const [
      curatedAsBase,
      curatedAsSimilar,
      seoCount,
      suggestionsAsBase,
      suggestionsAsSimilar,
      votesAsBase,
      votesAsAlt,
      reviewsCount,
    ] = await Promise.all([
      CuratedSimilar.countDocuments({ siteKey, baseCategory: doc.category, baseTmdbId: tmdbId }),
      CuratedSimilar.countDocuments({
        siteKey,
        similarCategory: doc.category,
        similarTmdbKind: doc.tmdbKind,
        similarTmdbId: tmdbId,
      }),
      MediaDetailSEO.countDocuments(seoFilter),
      SimilarSuggestion.countDocuments({ siteKey, baseCategory: doc.category, baseTmdbId: tmdbId }),
      SimilarSuggestion.countDocuments({
        siteKey,
        similarCategory: doc.category,
        similarTmdbKind: doc.tmdbKind,
        similarTmdbId: tmdbId,
      }),
      SimilarityVote.countDocuments({ siteKey, baseCategory: doc.category, baseId: tmdbId }),
      SimilarityVote.countDocuments({ siteKey, alternativeCategory: doc.category, alternativeId: tmdbId }),
      MediaReview.countDocuments({ siteKey, baseCategory: doc.category, baseTmdbId: tmdbId }),
    ]);

    const dependencies = {
      curatedAsBase,
      curatedAsSimilar,
      seoCount,
      suggestionsAsBase,
      suggestionsAsSimilar,
      votesAsBase,
      votesAsAlt,
      reviewsCount,
    };
    const hasDeps = Object.values(dependencies).some((n) => Number(n) > 0);

    if (hasDeps && !force) {
      return res.status(409).json({
        error: 'Media has related records. Re-run with ?force=true to cascade delete.',
        dependencies,
      });
    }

    if (hasDeps && force) {
      await Promise.all([
        CuratedSimilar.deleteMany({ siteKey, baseCategory: doc.category, baseTmdbId: tmdbId }),
        CuratedSimilar.deleteMany({
          siteKey,
          similarCategory: doc.category,
          similarTmdbKind: doc.tmdbKind,
          similarTmdbId: tmdbId,
        }),
        MediaDetailSEO.deleteMany(seoFilter),
        SimilarSuggestion.deleteMany({ siteKey, baseCategory: doc.category, baseTmdbId: tmdbId }),
        SimilarSuggestion.deleteMany({
          siteKey,
          similarCategory: doc.category,
          similarTmdbKind: doc.tmdbKind,
          similarTmdbId: tmdbId,
        }),
        SimilarityVote.deleteMany({ siteKey, baseCategory: doc.category, baseId: tmdbId }),
        SimilarityVote.deleteMany({ siteKey, alternativeCategory: doc.category, alternativeId: tmdbId }),
        MediaReview.deleteMany({ siteKey, baseCategory: doc.category, baseTmdbId: tmdbId }),
      ]);
    }

    await Media.findOneAndDelete({ _id: id, siteKey });
    await logAdminAction(req, {
      action: force ? 'media.delete_force' : 'media.delete',
      entityType: 'media',
      entityId: id,
      details: { category: doc.category, tmdbKind: doc.tmdbKind, tmdbId, dependencies },
    });
    return res.json({ success: true, dependenciesRemoved: hasDeps ? dependencies : {} });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to delete media' });
  }
};

