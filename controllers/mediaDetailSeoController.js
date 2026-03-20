const MediaDetailSEO = require('../models/MediaDetailSEO');
const Media = require('../models/Media');
const { logAdminAction } = require('../utils/adminAudit');

const MEDIA_CATEGORIES = ['movie', 'tv', 'anime_movie', 'anime_tv'];
const DEFAULT_LANGUAGE = 'en';

function resolveMeta(doc, language) {
  const lang = (language || DEFAULT_LANGUAGE).toLowerCase();
  const translation = (doc.translations || []).find((t) => t.language === lang);
  return {
    metaTitle:
      translation?.metaTitle?.trim() ? translation.metaTitle.trim() : doc.metaTitle?.trim() || '',
    metaDescription:
      translation?.metaDescription?.trim()
        ? translation.metaDescription.trim()
        : doc.metaDescription?.trim() || '',
    keywords:
      Array.isArray(translation?.keywords) && translation.keywords.length
        ? translation.keywords.filter(Boolean)
        : Array.isArray(doc.keywords)
          ? doc.keywords.filter(Boolean)
          : [],
    content:
      translation?.content?.trim() ? String(translation.content).trim() : doc.content ? String(doc.content).trim() : '',
    robots: doc.robots || 'index, follow',
    includeInSitemap: doc.includeInSitemap,
    changefreq: doc.changefreq,
    priority: doc.priority,
  };
}

// GET /api/v1/media-detail-seo/meta?category=movie&tmdbId=123&language=en&site=...
exports.getMeta = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const category = String(req.query.category || '').toLowerCase();
    const tmdbId = req.query.tmdbId ? parseInt(req.query.tmdbId, 10) : null;
    const language = req.query.language || DEFAULT_LANGUAGE;

    if (!MEDIA_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'category is required and must be one of: movie,tv,anime_movie,anime_tv' });
    }
    if (!Number.isFinite(tmdbId)) {
      return res.status(400).json({ error: 'tmdbId is required' });
    }

    // category determines which id field is used
    const query = { siteKey, category, isActive: true };
    if (category === 'movie' || category === 'anime_movie') {
      query.tmdbMovieId = tmdbId;
    } else {
      query.tmdbTvId = tmdbId;
    }

    const doc = await MediaDetailSEO.findOne(query).lean();
    if (!doc) return res.status(404).json({ error: 'No SEO config for this page' });

    const meta = resolveMeta(doc, language);
    return res.json(meta);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load meta' });
  }
};

// ADMIN: GET /api/v1/media-detail-seo/admin/list?category=...&q=...&skip=0&limit=50
exports.listAdmin = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const category = req.query.category != null ? String(req.query.category).toLowerCase() : '';
    const q = String(req.query.q || '').trim().toLowerCase();
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);

    const filter = { siteKey, isActive: true };
    if (category) {
      if (!MEDIA_CATEGORIES.includes(category)) {
        return res
          .status(400)
          .json({ error: 'category must be one of: movie,tv,anime_movie,anime_tv' });
      }
      filter.category = category;
    }
    if (q) {
      filter.$or = [
        { metaTitle: { $regex: q, $options: 'i' } },
        { metaDescription: { $regex: q, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      MediaDetailSEO.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      MediaDetailSEO.countDocuments(filter),
    ]);

    // Enrich with displayName from Media when possible
    const mediaLookups = items.map((doc) => {
      const id = doc.category === 'movie' || doc.category === 'anime_movie' ? doc.tmdbMovieId : doc.tmdbTvId;
      const query =
        doc.category === 'movie' || doc.category === 'anime_movie'
          ? { siteKey, category: doc.category, tmdbMovieId: id }
          : { siteKey, category: doc.category, tmdbTvId: id };
      return Media.findOne(query).select('displayName').lean();
    });
    const medias = await Promise.all(mediaLookups);

    return res.json({
      total,
      items: items.map((doc, idx) => {
        const tmdbId =
          doc.category === 'movie' || doc.category === 'anime_movie' ? doc.tmdbMovieId : doc.tmdbTvId;
        return {
          id: doc._id,
          category: doc.category,
          tmdbId,
          displayName: medias[idx]?.displayName || '',
          metaTitle: doc.metaTitle,
          metaDescription: doc.metaDescription,
          robots: doc.robots,
          includeInSitemap: Boolean(doc.includeInSitemap),
          changefreq: doc.changefreq,
          priority: doc.priority,
          updatedAt: doc.updatedAt,
        };
      }),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to list admin SEO pages' });
  }
};

// ADMIN: GET /api/v1/media-detail-seo/admin/one?category=...&tmdbId=...
exports.getAdminOne = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const category = String(req.query.category || '').toLowerCase();
    const tmdbId = req.query.tmdbId != null ? parseInt(req.query.tmdbId, 10) : null;
    if (!MEDIA_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'category is required' });
    }
    if (!Number.isFinite(tmdbId)) {
      return res.status(400).json({ error: 'tmdbId is required' });
    }

    const query = { siteKey, category, isActive: true };
    if (category === 'movie' || category === 'anime_movie') query.tmdbMovieId = tmdbId;
    else query.tmdbTvId = tmdbId;

    const doc = await MediaDetailSEO.findOne(query).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const mediaQuery =
      category === 'movie' || category === 'anime_movie'
        ? { siteKey, category, tmdbMovieId: tmdbId }
        : { siteKey, category, tmdbTvId: tmdbId };
    const media = await Media.findOne(mediaQuery).select('displayName').lean();

    return res.json({
      id: doc._id,
      category: doc.category,
      tmdbId,
      displayName: media?.displayName || '',
      metaTitle: doc.metaTitle,
      metaDescription: doc.metaDescription,
      keywords: Array.isArray(doc.keywords) ? doc.keywords : [],
      content: doc.content || '',
      robots: doc.robots || 'index, follow',
      includeInSitemap: Boolean(doc.includeInSitemap),
      changefreq: doc.changefreq,
      priority: doc.priority,
      translations: Array.isArray(doc.translations) ? doc.translations : [],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load admin SEO page' });
  }
};

// ADMIN: DELETE /api/v1/media-detail-seo/admin/one?category=...&tmdbId=...
exports.deleteAdminOne = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const category = String(req.query.category || '').toLowerCase();
    const tmdbId = req.query.tmdbId != null ? parseInt(req.query.tmdbId, 10) : null;
    if (!MEDIA_CATEGORIES.includes(category) || !Number.isFinite(tmdbId)) {
      return res.status(400).json({ error: 'category and tmdbId are required' });
    }
    const query = { siteKey, category, isActive: true };
    if (category === 'movie' || category === 'anime_movie') query.tmdbMovieId = tmdbId;
    else query.tmdbTvId = tmdbId;

    const doc = await MediaDetailSEO.findOneAndDelete(query);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    await logAdminAction(req, {
      action: 'seo.delete',
      entityType: 'media_detail_seo',
      entityId: String(doc._id),
      details: { category, tmdbId },
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Delete failed' });
  }
};

// ADMIN: POST /api/v1/admin/media-detail-seo (create/update by category+id)
exports.upsert = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const {
      category,
      tmdbId,
      metaTitle,
      metaDescription,
      keywords,
      content,
      robots,
      includeInSitemap,
      changefreq,
      priority,
      translations,
    } = req.body || {};

    const cat = String(category || '').toLowerCase();
    const idNum = tmdbId != null ? parseInt(tmdbId, 10) : null;
    if (!MEDIA_CATEGORIES.includes(cat) || !Number.isFinite(idNum)) {
      return res.status(400).json({ error: 'category and tmdbId are required' });
    }
    if (!String(metaTitle || '').trim()) {
      return res.status(400).json({ error: 'metaTitle is required' });
    }

    const update = {
      siteKey,
      category: cat,
      metaTitle: String(metaTitle).trim(),
      metaDescription: metaDescription != null ? String(metaDescription).trim() : '',
      keywords: Array.isArray(keywords) ? keywords.map(String).filter(Boolean) : [],
      content: content != null ? String(content).trim() : '',
      robots: robots != null ? String(robots).trim() : 'index, follow',
      includeInSitemap: includeInSitemap !== undefined ? Boolean(includeInSitemap) : true,
      changefreq: changefreq != null ? String(changefreq) : 'weekly',
      priority: priority != null ? Number(priority) : 0.8,
      translations: Array.isArray(translations) ? translations : [],
    };

    const query = { siteKey, category: cat, isActive: true };
    if (cat === 'movie' || cat === 'anime_movie') {
      query.tmdbMovieId = idNum;
    } else {
      query.tmdbTvId = idNum;
    }

    // If record doesn't exist, create it even if isActive wasn't set.
    const doc = await MediaDetailSEO.findOneAndUpdate(
      query,
      { $set: update, $setOnInsert: { isActive: true } },
      { upsert: true, new: true },
    );
    await logAdminAction(req, {
      action: 'seo.upsert',
      entityType: 'media_detail_seo',
      entityId: String(doc._id),
      details: { category: cat, tmdbId: idNum, includeInSitemap: update.includeInSitemap },
    });

    return res.json({ success: true, id: doc._id });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to upsert SEO' });
  }
};

