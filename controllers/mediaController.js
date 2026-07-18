const mongoose = require('mongoose');
const tmdbService = require('../services/tmdbService');
const SimilarityVote = require('../models/SimilarityVote');
const CuratedSimilar = require('../models/CuratedSimilar');
const MediaDetailSEO = require('../models/MediaDetailSEO');
const Media = require('../models/Media');
const Genre = require('../models/Genre');
const { parseCategory, categoryToTmdbKind } = require('../utils/parseCategory');
const { resolveMediaSeoMeta, resolveSimilarPageSeoMeta } = require('../utils/resolveMediaSeoMeta');
const { getCached, setCached } = require('../utils/tmdbCache');
const {
  normalizeLanguage,
  watchRegionFromLanguage,
  resolveMediaTitle,
  isDefaultEnglish,
} = require('../utils/tmdbLocale');
const { buildImageUrl, normalizeMediaExtras } = require('../utils/tmdbMediaNormalize');
const { fetchTvSeasonsPayload } = require('../utils/tmdbSeasons');

const FULL_DETAIL_TTL_MS = 12 * 60 * 60 * 1000;

function humanizeSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function resolveGenres(serverGenreSlugs, tmdbGenres, adminGenreBySlug) {
  if (Array.isArray(tmdbGenres) && tmdbGenres.length > 0) {
    return tmdbGenres.map((g) => ({ id: g.id, name: g.name }));
  }
  if (!serverGenreSlugs.length) return [];
  return serverGenreSlugs.map((slug) => ({
    id: slug,
    name: adminGenreBySlug[slug] || humanizeSlug(slug),
  }));
}

async function fetchTmdbDetails(tmdbKind, id, language, watchRegion) {
  const lang = normalizeLanguage(language);
  const cacheKey = `full:${tmdbKind}:${id}:${lang}:${watchRegion}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;
  const details =
    tmdbKind === 'movie'
      ? await tmdbService.getMovieDetails(id, { language: lang, append: true })
      : await tmdbService.getTVDetails(id, { language: lang, append: true });
  await setCached(cacheKey, details, FULL_DETAIL_TTL_MS);
  return details;
}

exports.getMedia = async (req, res) => {
  try {
    const category = parseCategory(req.params.category);
    const id = parseInt(req.params.id, 10);
    if (!category || !Number.isFinite(id)) return res.status(400).json({ error: 'Invalid category or id' });

    const language = normalizeLanguage(req.query.language);
    const watchRegion =
      String(req.query.watchRegion || '').trim().toUpperCase() || watchRegionFromLanguage(language);
    const tmdbKind = categoryToTmdbKind(category);

    const details = await fetchTmdbDetails(tmdbKind, id, language, watchRegion);

    const siteKey = req.siteKey || 'default';
    let mediaDoc = null;
    try {
      mediaDoc = await Media.findOne({
        siteKey,
        category,
        tmdbKind,
        ...(tmdbKind === 'movie' ? { tmdbMovieId: id } : { tmdbTvId: id }),
      })
        .select('genreSlugs posterAlt displayName')
        .lean();
    } catch {
      mediaDoc = null;
    }

    const serverGenreSlugs = Array.isArray(mediaDoc?.genreSlugs) ? mediaDoc.genreSlugs.filter(Boolean) : [];
    const tmdbGenres = Array.isArray(details.genres) ? details.genres : [];
    let adminGenreBySlug = {};
    if (serverGenreSlugs.length > 0) {
      const docs = await Genre.find({
        siteKey: { $in: ['global', 'default'] },
        slug: { $in: serverGenreSlugs },
      })
        .select('slug name')
        .lean();
      adminGenreBySlug = Object.fromEntries(docs.map((g) => [String(g.slug), String(g.name || '')]));
    }
    const genres = resolveGenres(serverGenreSlugs, tmdbGenres, adminGenreBySlug);

    let seoDoc = null;
    try {
      seoDoc = await MediaDetailSEO.findOne({
        siteKey,
        category,
        isActive: true,
        tmdbMovieId: tmdbKind === 'movie' ? id : null,
        tmdbTvId: tmdbKind === 'tv' ? id : null,
      }).lean();
    } catch {
      seoDoc = null;
    }

    const langKey = language.toLowerCase();
    const translation = seoDoc?.translations?.find((t) => String(t.language || '').toLowerCase() === langKey) || null;
    const translatedContent = translation?.content;
    const translatedTitle = translation?.title;
    const seo = resolveMediaSeoMeta(seoDoc, language);
    const similarSeo = resolveSimilarPageSeoMeta(seoDoc, language);
    const offers = Array.isArray(translation?.offers)
      ? translation.offers.filter((o) => o && (o.title || o.url))
      : [];
    const similarTranslation =
      seoDoc?.similarPage?.translations?.find(
        (t) => String(t.language || '').toLowerCase() === langKey,
      ) || null;
    const similarOffers = Array.isArray(similarTranslation?.offers)
      ? similarTranslation.offers.filter((o) => o && (o.title || o.url))
      : [];

    const resolvedTitle = resolveMediaTitle({
      seoTitle: translatedTitle || null,
      details,
      displayName: mediaDoc?.displayName,
      id,
    });
    const title = translatedTitle ? String(translatedTitle) : seo.headline || resolvedTitle;
    const posterUrl = buildImageUrl(details.poster_path, 'w500');
    const backdropUrl = buildImageUrl(details.backdrop_path, 'w780');
    const extras = await normalizeMediaExtras(details, { watchRegion, tmdbKind, language });

    return res.json({
      category,
      tmdbKind,
      id,
      title,
      overview: details.overview || '',
      posterUrl,
      posterAlt:
        String(mediaDoc?.posterAlt || '').trim() ||
        (translatedTitle ? String(translatedTitle) : seo.headline || resolvedTitle),
      backdropUrl,
      releaseDate: details.release_date || details.first_air_date || null,
      voteAverage: details.vote_average ?? null,
      genres,
      content: translatedContent
        ? String(translatedContent)
        : seoDoc?.content
          ? String(seoDoc.content)
          : '',
      seo,
      similarSeo,
      offers,
      similarOffers,
      ...extras,
    });
  } catch (err) {
    const status = err.response?.status || 500;
    return res.status(status === 404 ? 404 : 500).json({ error: err.message || 'Failed to load media' });
  }
};

exports.getSimilar = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const category = parseCategory(req.params.category);
    const baseId = parseInt(req.params.id, 10);
    if (!category || !Number.isFinite(baseId)) return res.status(400).json({ error: 'Invalid category or id' });

    const connected = mongoose.connection.readyState === 1;
    if (!connected) {
      return res.json({
        base: { category, id: baseId },
        results: [],
        message: 'Database unavailable — similar titles are managed in admin.',
      });
    }

    const rows = await CuratedSimilar.find({ siteKey, baseCategory: category, baseTmdbId: baseId })
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();

    const altKeys = rows.map((r) => ({
      alternativeCategory: r.similarCategory,
      alternativeId: r.similarTmdbId,
    }));

    let voteMap = {};
    if (altKeys.length > 0) {
      const or = altKeys.map((k) => ({
        alternativeCategory: k.alternativeCategory,
        alternativeId: k.alternativeId,
      }));
      const votes = await SimilarityVote.aggregate([
        { $match: { siteKey, isActive: true, baseCategory: category, baseId, $or: or } },
        {
          $group: {
            _id: { altCat: '$alternativeCategory', altId: '$alternativeId' },
            avgRating: { $avg: '$rating' },
            voteCount: { $sum: 1 },
          },
        },
      ]);
      voteMap = votes.reduce((acc, v) => {
        const key = `${v._id.altCat}:${v._id.altId}`;
        acc[key] = {
          averageRating: Math.round((v.avgRating || 0) * 10) / 10,
          voteCount: v.voteCount || 0,
        };
        return acc;
      }, {});
    }

    const language = normalizeLanguage(req.query.language);
    const preferLocalized = !isDefaultEnglish(language);
    const allGenreSlugs = [...new Set(rows.flatMap((row) => (Array.isArray(row.genreSlugs) ? row.genreSlugs : [])))];
    let genreNameBySlug = {};
    if (allGenreSlugs.length > 0) {
      const genreDocs = await Genre.find({
        siteKey: { $in: ['global', siteKey, 'default'] },
        slug: { $in: allGenreSlugs },
      })
        .select('slug name')
        .lean();
      genreNameBySlug = Object.fromEntries(genreDocs.map((g) => [String(g.slug), String(g.name || '')]));
    }

    const results = await Promise.all(
      rows.map(async (row) => {
        const storedName = String(row.displayName || '').trim();
        let title = storedName;
        let originalTitle = null;
        let overview = '';
        let posterUrl = row.posterPath ? buildImageUrl(row.posterPath) : null;
        try {
          const d =
            row.similarTmdbKind === 'movie'
              ? await tmdbService.getMovieDetails(row.similarTmdbId, { language, append: false })
              : await tmdbService.getTVDetails(row.similarTmdbId, { language, append: false });
          const tmdbTitle = d.title || d.name || '';
          originalTitle = d.original_title || d.original_name || null;
          if (tmdbTitle && (preferLocalized || !storedName)) {
            title = tmdbTitle;
          } else if (!storedName) {
            title = tmdbTitle || title;
          }
          overview = d.overview || '';
          if (!row.posterPath) {
            posterUrl = buildImageUrl(d.poster_path);
          }
        } catch {
          /* keep stored fields */
        }
        const genreSlugs = Array.isArray(row.genreSlugs) ? row.genreSlugs.filter(Boolean) : [];
        const tags = genreSlugs.map((slug) => genreNameBySlug[slug] || humanizeSlug(slug)).filter(Boolean);
        const vk = `${row.similarCategory}:${row.similarTmdbId}`;
        const stats = voteMap[vk] || { averageRating: 0, voteCount: 0 };
        return {
          id: row.similarTmdbId,
          category: row.similarCategory,
          title,
          originalTitle,
          overview,
          posterUrl,
          posterAlt: String(row.posterAlt || '').trim() || title,
          genreSlugs,
          tags,
          similarityScore: 50,
          similarityVoteStats: stats,
          _curatedId: row._id,
        };
      }),
    );

    results.sort((a, b) => {
      const av = a.similarityVoteStats.voteCount;
      const bv = b.similarityVoteStats.voteCount;
      if (av > 0 || bv > 0) {
        if (b.similarityVoteStats.averageRating !== a.similarityVoteStats.averageRating) {
          return b.similarityVoteStats.averageRating - a.similarityVoteStats.averageRating;
        }
        return bv - av;
      }
      return 0;
    });

    return res.json({ base: { category, id: baseId }, results });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load similar list' });
  }
};

exports.getSeasons = async (req, res) => {
  try {
    const category = parseCategory(req.params.category);
    const id = parseInt(req.params.id, 10);
    if (!category || !Number.isFinite(id)) return res.status(400).json({ error: 'Invalid category or id' });

    const tmdbKind = categoryToTmdbKind(category);
    if (tmdbKind !== 'tv') {
      return res.status(400).json({ error: 'Seasons are only available for TV series' });
    }

    const language = normalizeLanguage(req.query.language);
    const payload = await fetchTvSeasonsPayload(id, language, { getCached, setCached });
    return res.json({ category, id, ...payload });
  } catch (err) {
    const status = err.response?.status || 500;
    return res.status(status === 404 ? 404 : 500).json({ error: err.message || 'Failed to load seasons' });
  }
};
