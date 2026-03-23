const mongoose = require('mongoose');
const Media = require('../models/Media');
const SimilarityVote = require('../models/SimilarityVote');
const MediaReview = require('../models/MediaReview');
const tmdbService = require('../services/tmdbService');

function categoryFilterForGroup(group) {
  const g = String(group || '').toLowerCase().trim();
  if (g === 'movies') return { category: 'movie' };
  if (g === 'tv') return { category: 'tv' };
  if (g === 'anime') return { category: { $in: ['anime_movie', 'anime_tv'] } };
  if (g === 'anime-movies' || g === 'anime_movie') return { category: 'anime_movie' };
  if (g === 'anime-tv' || g === 'anime_tv') return { category: 'anime_tv' };
  return {};
}

function genreFilter(slug) {
  const s = String(slug || '').trim().toLowerCase();
  if (!s) return {};
  return { genreSlugs: s };
}

function regionFilter(region) {
  const r = String(region || '').trim().toLowerCase();
  if (!r) return {};
  return {
    $or: [
      { availableRegions: { $exists: false } },
      { availableRegions: null },
      { availableRegions: { $size: 0 } },
      { availableRegions: r },
    ],
  };
}

function buildCatalogQuery(siteKey, { group, genre, region }) {
  const parts = [{ siteKey }];
  const cat = categoryFilterForGroup(group);
  if (Object.keys(cat).length) parts.push(cat);
  const gen = genreFilter(genre);
  if (Object.keys(gen).length) parts.push(gen);
  const reg = regionFilter(region);
  if (Object.keys(reg).length) parts.push(reg);
  return parts.length === 1 ? parts[0] : { $and: parts };
}

function buildImageUrl(path, size = 'w342') {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function allowedCategoriesForGroup(group) {
  const g = String(group || '').toLowerCase().trim();
  if (g === 'movies') return ['movie'];
  if (g === 'tv') return ['tv'];
  if (g === 'anime') return ['anime_movie', 'anime_tv'];
  if (g === 'anime-movies' || g === 'anime_movie') return ['anime_movie'];
  if (g === 'anime-tv' || g === 'anime_tv') return ['anime_tv'];
  return ['movie', 'tv', 'anime_movie', 'anime_tv'];
}

function weightedMean(avg, count, priorMean = 3.5, minVotes = 8) {
  const c = Math.max(0, Number(count || 0));
  const a = Number.isFinite(Number(avg)) ? Number(avg) : 0;
  if (c <= 0) return 0;
  return ((c / (c + minVotes)) * a) + ((minVotes / (c + minVotes)) * priorMean);
}

function toTopScore({ voteAvg, voteCount, reviewAvg, reviewCount }) {
  const voteW = weightedMean(voteAvg, voteCount, 3.6, 10);
  const reviewW = weightedMean(reviewAvg, reviewCount, 3.7, 8);
  const hasVotes = Number(voteCount || 0) > 0;
  const hasReviews = Number(reviewCount || 0) > 0;
  if (!hasVotes && !hasReviews) return 0;
  if (hasVotes && hasReviews) {
    return (voteW * 0.65) + (reviewW * 0.35);
  }
  return hasVotes ? voteW : reviewW;
}

async function enrichPoster(item) {
  if (item.posterUrl) return item;
  const kind = item.tmdbKind;
  const id =
    item.tmdbId != null
      ? item.tmdbId
      : kind === 'movie'
        ? item.tmdbMovieId
        : item.tmdbTvId;
  if (!id) return item;
  try {
    const d =
      kind === 'movie'
        ? await tmdbService.getMovieDetails(id, 'en-US')
        : await tmdbService.getTVDetails(id, 'en-US');
    const p = d.poster_path;
    return { ...item, posterUrl: buildImageUrl(p) };
  } catch {
    return item;
  }
}

exports.listCatalog = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 24));
    const connected = mongoose.connection.readyState === 1;

    const items = [];
    if (!connected) {
      return res.json({ source: 'catalog', items: [], message: 'Add titles in admin (Mongo required).' });
    }

    const query = buildCatalogQuery(siteKey, {
      group: req.query.group,
      genre: req.query.genre,
      region: req.query.region,
    });

    const docs = await Media.find(query).sort({ updatedAt: -1 }).limit(limit).lean();
    for (const m of docs) {
      const id = m.tmdbKind === 'movie' ? m.tmdbMovieId : m.tmdbTvId;
      items.push({
        category: m.category,
        tmdbKind: m.tmdbKind,
        tmdbId: id,
        displayName: m.displayName,
        posterUrl: m.posterPath ? buildImageUrl(m.posterPath) : null,
        genreSlugs: Array.isArray(m.genreSlugs) ? m.genreSlugs : [],
        overview: '',
      });
    }
    const needEnrich = items.filter((i) => !i.posterUrl);
    if (needEnrich.length > 0 && needEnrich.length <= 24) {
      const enriched = await Promise.all(needEnrich.map((i) => enrichPoster(i)));
      const map = new Map(enriched.map((e) => [`${e.category}-${e.tmdbId}`, e]));
      for (let i = 0; i < items.length; i += 1) {
        const k = `${items[i].category}-${items[i].tmdbId}`;
        if (map.has(k)) items[i] = map.get(k);
      }
    }

    const payload = { source: 'catalog', items };

    if (String(req.query.counts || '') === '1') {
      const base = { siteKey };
      const [total, movies, tv, anime] = await Promise.all([
        Media.countDocuments(base),
        Media.countDocuments({ ...base, category: 'movie' }),
        Media.countDocuments({ ...base, category: 'tv' }),
        Media.countDocuments({ ...base, category: { $in: ['anime_movie', 'anime_tv'] } }),
      ]);
      payload.counts = { total, movies, tv, anime };
    }

    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Catalog failed' });
  }
};

exports.listTopCatalog = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 60));
    const connected = mongoose.connection.readyState === 1;
    if (!connected) {
      return res.json({ source: 'top-catalog', items: [], message: 'Mongo connection required.' });
    }

    const categories = allowedCategoriesForGroup(req.query.group);
    const mediaDocs = await Media.find({ siteKey, category: { $in: categories } })
      .select('category tmdbKind tmdbMovieId tmdbTvId tmdbId displayName posterPath updatedAt')
      .lean();

    if (!mediaDocs.length) {
      return res.json({ source: 'top-catalog', items: [] });
    }

    const keyRows = mediaDocs.map((m) => {
      const tmdbId = m.tmdbKind === 'movie' ? m.tmdbMovieId : m.tmdbTvId;
      return {
        key: `${m.category}:${Number(tmdbId || 0)}`,
        category: m.category,
        tmdbId: Number(tmdbId || 0),
        tmdbKind: m.tmdbKind,
        displayName: m.displayName || '',
        posterUrl: m.posterPath ? buildImageUrl(m.posterPath) : null,
        updatedAt: m.updatedAt ? new Date(m.updatedAt).getTime() : 0,
      };
    }).filter((x) => x.tmdbId > 0);

    const byCategoryIds = new Map();
    for (const row of keyRows) {
      const arr = byCategoryIds.get(row.category) || [];
      arr.push(row.tmdbId);
      byCategoryIds.set(row.category, arr);
    }

    const voteAggP = [];
    for (const [category, ids] of byCategoryIds.entries()) {
      voteAggP.push(
        SimilarityVote.aggregate([
          {
            $match: {
              siteKey,
              isActive: true,
              baseCategory: category,
              baseId: { $in: ids },
            },
          },
          {
            $group: {
              _id: { category: '$baseCategory', tmdbId: '$baseId' },
              voteAvg: { $avg: '$rating' },
              voteCount: { $sum: 1 },
            },
          },
        ]),
      );
    }

    const reviewAggP = [];
    for (const [category, ids] of byCategoryIds.entries()) {
      reviewAggP.push(
        MediaReview.aggregate([
          {
            $match: {
              siteKey,
              baseCategory: category,
              baseTmdbId: { $in: ids },
            },
          },
          {
            $group: {
              _id: { category: '$baseCategory', tmdbId: '$baseTmdbId' },
              reviewAvg: { $avg: '$rating' },
              reviewCount: { $sum: 1 },
            },
          },
        ]),
      );
    }

    const voteAggRows = (await Promise.all(voteAggP)).flat();
    const reviewAggRows = (await Promise.all(reviewAggP)).flat();
    const voteMap = new Map(
      voteAggRows.map((r) => [`${r._id.category}:${Number(r._id.tmdbId)}`, { voteAvg: r.voteAvg, voteCount: r.voteCount }]),
    );
    const reviewMap = new Map(
      reviewAggRows.map((r) => [`${r._id.category}:${Number(r._id.tmdbId)}`, { reviewAvg: r.reviewAvg, reviewCount: r.reviewCount }]),
    );

    const scored = keyRows.map((m) => {
      const v = voteMap.get(m.key) || { voteAvg: null, voteCount: 0 };
      const r = reviewMap.get(m.key) || { reviewAvg: null, reviewCount: 0 };
      const topScore = toTopScore({
        voteAvg: v.voteAvg,
        voteCount: v.voteCount,
        reviewAvg: r.reviewAvg,
        reviewCount: r.reviewCount,
      });
      return {
        category: m.category,
        tmdbKind: m.tmdbKind,
        tmdbId: m.tmdbId,
        displayName: m.displayName,
        posterUrl: m.posterUrl,
        topScore: Number(topScore.toFixed(3)),
        voteAvg: v.voteAvg != null ? Number(v.voteAvg.toFixed(2)) : null,
        voteCount: Number(v.voteCount || 0),
        reviewAvg: r.reviewAvg != null ? Number(r.reviewAvg.toFixed(2)) : null,
        reviewCount: Number(r.reviewCount || 0),
        updatedAt: m.updatedAt,
      };
    });

    scored.sort((a, b) => {
      if (b.topScore !== a.topScore) return b.topScore - a.topScore;
      const aEng = (a.voteCount + a.reviewCount);
      const bEng = (b.voteCount + b.reviewCount);
      if (bEng !== aEng) return bEng - aEng;
      return b.updatedAt - a.updatedAt;
    });

    const items = scored.slice(0, limit).map((x) => ({
      category: x.category,
      tmdbKind: x.tmdbKind,
      tmdbId: x.tmdbId,
      displayName: x.displayName,
      posterUrl: x.posterUrl,
      overview: '',
      score: {
        topScore: x.topScore,
        voteAvg: x.voteAvg,
        voteCount: x.voteCount,
        reviewAvg: x.reviewAvg,
        reviewCount: x.reviewCount,
      },
    }));
    return res.json({ source: 'top-catalog', items });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Top catalog failed' });
  }
};
