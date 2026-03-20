const mongoose = require('mongoose');
const Media = require('../models/Media');
const tmdbService = require('../services/tmdbService');

function categoryFilterForGroup(group) {
  const g = String(group || '').toLowerCase().trim();
  if (g === 'movies') return { category: 'movie' };
  if (g === 'tv') return { category: 'tv' };
  if (g === 'anime') return { category: { $in: ['anime_movie', 'anime_tv'] } };
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
