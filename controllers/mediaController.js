const mongoose = require('mongoose');
const tmdbService = require('../services/tmdbService');
const SimilarityVote = require('../models/SimilarityVote');
const CuratedSimilar = require('../models/CuratedSimilar');
const MediaDetailSEO = require('../models/MediaDetailSEO');
const Media = require('../models/Media');
const Genre = require('../models/Genre');
const { parseCategory, categoryToTmdbKind } = require('../utils/parseCategory');

function buildImageUrl(path, size = 'w500') {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function humanizeSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

exports.getMedia = async (req, res) => {
  try {
    const category = parseCategory(req.params.category);
    const id = parseInt(req.params.id, 10);
    if (!category || !Number.isFinite(id)) return res.status(400).json({ error: 'Invalid category or id' });

    const language = req.query.language || 'en-US';
    const tmdbKind = categoryToTmdbKind(category);

    const details =
      tmdbKind === 'movie'
        ? await tmdbService.getMovieDetails(id, language)
        : await tmdbService.getTVDetails(id, language);

    const fallbackTitle = details.title || details.name || details.original_name || `#${id}`;
    const posterUrl = buildImageUrl(details.poster_path, 'w500');
    const backdropUrl = buildImageUrl(details.backdrop_path, 'w780');
    const siteKey = req.siteKey || 'default';
    let mediaDoc = null;
    try {
      mediaDoc = await Media.findOne({
        siteKey,
        category,
        tmdbKind,
        ...(tmdbKind === 'movie' ? { tmdbMovieId: id } : { tmdbTvId: id }),
      })
        .select('genreSlugs')
        .lean();
    } catch {
      mediaDoc = null;
    }
    const serverGenreSlugs = Array.isArray(mediaDoc?.genreSlugs) ? mediaDoc.genreSlugs.filter(Boolean) : [];
    let genres = Array.isArray(details.genres) ? details.genres.map((g) => ({ id: g.id, name: g.name })) : [];
    if (serverGenreSlugs.length > 0) {
      const docs = await Genre.find({
        siteKey: { $in: ['global', 'default'] },
        slug: { $in: serverGenreSlugs },
      })
        .select('slug name')
        .lean();
      const bySlug = Object.fromEntries(docs.map((g) => [String(g.slug), String(g.name || '')]));
      genres = serverGenreSlugs.map((slug) => ({ id: slug, name: bySlug[slug] || humanizeSlug(slug) }));
    }
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
      // Public page should still work with TMDB data even if SEO storage is temporarily unavailable.
      seoDoc = null;
    }
    const langKey = String(language || 'en-US').toLowerCase();
    const translation = seoDoc?.translations?.find((t) => t.language === langKey) || null;
    const translatedContent = translation?.content;
    const translatedTitle = translation?.title;

    return res.json({
      category,
      tmdbKind,
      id,
      title: translatedTitle ? String(translatedTitle) : fallbackTitle,
      overview: details.overview || '',
      posterUrl,
      backdropUrl,
      releaseDate: details.release_date || details.first_air_date || null,
      voteAverage: details.vote_average || null,
      genres,
      content: translatedContent
        ? String(translatedContent)
        : seoDoc?.content
          ? String(seoDoc.content)
          : '',
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

    const language = req.query.language || 'en-US';
    const results = await Promise.all(
      rows.map(async (row) => {
        let title = row.displayName;
        let overview = '';
        let posterUrl = row.posterPath ? buildImageUrl(row.posterPath) : null;
        try {
          const d =
            row.similarTmdbKind === 'movie'
              ? await tmdbService.getMovieDetails(row.similarTmdbId, language)
              : await tmdbService.getTVDetails(row.similarTmdbId, language);
          title = d.title || d.name || title;
          overview = d.overview || '';
          posterUrl = buildImageUrl(d.poster_path || row.posterPath);
        } catch {
          /* keep stored fields */
        }
        const vk = `${row.similarCategory}:${row.similarTmdbId}`;
        const stats = voteMap[vk] || { averageRating: 0, voteCount: 0 };
        return {
          id: row.similarTmdbId,
          category: row.similarCategory,
          title,
          overview,
          posterUrl,
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
