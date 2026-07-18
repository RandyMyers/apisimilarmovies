const Media = require('../models/Media');
const CuratedSimilar = require('../models/CuratedSimilar');
const MediaDetailSEO = require('../models/MediaDetailSEO');
const SimilarityVote = require('../models/SimilarityVote');
const SimilarSuggestion = require('../models/SimilarSuggestion');
const MediaReview = require('../models/MediaReview');
const { logAdminAction } = require('../utils/adminAudit');

const MEDIA_CATEGORIES = ['movie', 'tv', 'anime_movie', 'anime_tv'];
const TMDB_KINDS = ['movie', 'tv'];
const CURATED_COLLECTION = 'curatedsimilars';

async function getSimilarCountMap(siteKey, mediaItems) {
  if (!Array.isArray(mediaItems) || !mediaItems.length) return new Map();
  const or = mediaItems
    .map((m) => {
      const baseTmdbId = m.tmdbKind === 'movie' ? m.tmdbMovieId : m.tmdbTvId;
      if (!Number.isFinite(baseTmdbId)) return null;
      return { baseCategory: m.category, baseTmdbId };
    })
    .filter(Boolean);
  if (!or.length) return new Map();

  const rows = await CuratedSimilar.aggregate([
    { $match: { siteKey, $or: or } },
    {
      $group: {
        _id: { baseCategory: '$baseCategory', baseTmdbId: '$baseTmdbId' },
        similarCount: { $sum: 1 },
      },
    },
  ]);

  return new Map(
    rows.map((r) => [`${r._id.baseCategory}:${r._id.baseTmdbId}`, Number(r.similarCount || 0)]),
  );
}

function mapMediaRow(m, similarCount = 0) {
  return {
    id: m._id,
    siteKey: m.siteKey,
    category: m.category,
    tmdbKind: m.tmdbKind,
    tmdbMovieId: m.tmdbMovieId,
    tmdbTvId: m.tmdbTvId,
    displayName: m.displayName,
    posterPath: m.posterPath || '',
    genreSlugs: Array.isArray(m.genreSlugs) ? m.genreSlugs : [],
    similarCount: Number(similarCount || 0),
    updatedAt: m.updatedAt,
  };
}

function buildMediaMatchFilter(siteKey, category, q) {
  const filter = { siteKey };
  if (category && MEDIA_CATEGORIES.includes(category)) filter.category = category;
  if (q) {
    const or = [{ displayName: { $regex: q, $options: 'i' } }];
    const n = parseInt(q, 10);
    if (Number.isFinite(n)) {
      or.push({ tmdbMovieId: n }, { tmdbTvId: n });
    }
    filter.$or = or;
  }
  return filter;
}

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
      posterAlt,
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
      posterAlt: posterAlt != null ? String(posterAlt).trim() : '',
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
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
    const q = String(req.query.q || '').trim();
    const category = String(req.query.category || '').trim().toLowerCase();
    const sortByRaw = String(req.query.sortBy || 'updatedAt').trim();
    const sortBy = ['displayName', 'category', 'updatedAt', 'similarCount'].includes(sortByRaw)
      ? sortByRaw
      : 'updatedAt';
    const sortDir = String(req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 1 : -1;
    const similarFilter = String(req.query.similarFilter || '').trim().toLowerCase();

    const filter = buildMediaMatchFilter(siteKey, category, q);
    const useSimilarPipeline = sortBy === 'similarCount' || similarFilter === 'has' || similarFilter === 'none';

    if (useSimilarPipeline) {
      const pipeline = [
        { $match: filter },
        {
          $addFields: {
            baseTmdbId: {
              $cond: [{ $eq: ['$tmdbKind', 'movie'] }, '$tmdbMovieId', '$tmdbTvId'],
            },
          },
        },
        {
          $lookup: {
            from: CURATED_COLLECTION,
            let: { cat: '$category', tid: '$baseTmdbId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$siteKey', siteKey] },
                      { $eq: ['$baseCategory', '$$cat'] },
                      { $eq: ['$baseTmdbId', '$$tid'] },
                    ],
                  },
                },
              },
              { $count: 'n' },
            ],
            as: 'curatedStats',
          },
        },
        {
          $addFields: {
            similarCount: { $ifNull: [{ $arrayElemAt: ['$curatedStats.n', 0] }, 0] },
          },
        },
      ];

      if (similarFilter === 'has') pipeline.push({ $match: { similarCount: { $gt: 0 } } });
      if (similarFilter === 'none') pipeline.push({ $match: { similarCount: { $eq: 0 } } });

      pipeline.push({ $sort: { [sortBy]: sortDir, displayName: 1 } });
      pipeline.push({
        $facet: {
          items: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: 'count' }],
        },
      });

      const [result] = await Media.aggregate(pipeline);
      const total = result?.total?.[0]?.count || 0;
      const items = (result?.items || []).map((m) => mapMediaRow(m, m.similarCount));

      return res.json({
        items,
        total,
        page: Math.floor(skip / limit) + 1,
        pages: Math.max(1, Math.ceil(total / limit)),
      });
    }

    const [rawItems, total] = await Promise.all([
      Media.find(filter).sort({ [sortBy]: sortDir }).skip(skip).limit(limit).lean(),
      Media.countDocuments(filter),
    ]);
    const countMap = await getSimilarCountMap(siteKey, rawItems);
    const items = rawItems.map((m) => {
      const baseTmdbId = m.tmdbKind === 'movie' ? m.tmdbMovieId : m.tmdbTvId;
      const key = `${m.category}:${baseTmdbId}`;
      return mapMediaRow(m, countMap.get(key) || 0);
    });

    return res.json({
      items,
      total,
      page: Math.floor(skip / limit) + 1,
      pages: Math.max(1, Math.ceil(total / limit)),
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
      posterAlt: m.posterAlt || '',
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
    if (req.body?.posterAlt != null) patch.posterAlt = String(req.body.posterAlt).trim();
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

