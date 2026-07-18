const tmdbService = require('../services/tmdbService');
const { getCached, setCached } = require('./tmdbCache');
const { normalizeLanguage, resolveCatalogTitle } = require('./tmdbLocale');
const { buildImageUrl } = require('./tmdbMediaNormalize');

const CATALOG_ENRICH_CAP = 40;
const CONCURRENCY = 5;
const BRIEF_TTL_MS = 4 * 60 * 60 * 1000;

async function pmap(items, fn, limit) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index;
      index += 1;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

async function fetchBrief(tmdbKind, tmdbId, language) {
  const lang = normalizeLanguage(language);
  const key = `brief:${tmdbKind}:${tmdbId}:${lang}`;
  const cached = await getCached(key);
  if (cached) return cached;
  try {
    const d =
      tmdbKind === 'movie'
        ? await tmdbService.getMovieDetails(tmdbId, { language: lang, append: false })
        : await tmdbService.getTVDetails(tmdbId, { language: lang, append: false });
    const payload = {
      title: d.title || d.name || '',
      overview: d.overview || '',
      posterPath: d.poster_path || null,
    };
    await setCached(key, payload, BRIEF_TTL_MS);
    return payload;
  } catch {
    return null;
  }
}

async function enrichCatalogItems(items, language) {
  if (!Array.isArray(items) || items.length === 0) return items;
  const lang = normalizeLanguage(language);
  const toEnrich = items.slice(0, CATALOG_ENRICH_CAP);
  const enrichedMap = new Map();

  await pmap(
    toEnrich,
    async (item) => {
      if (!item.tmdbKind || !item.tmdbId) return;
      const brief = await fetchBrief(item.tmdbKind, item.tmdbId, lang);
      if (brief) enrichedMap.set(`${item.category}-${item.tmdbId}`, brief);
    },
    CONCURRENCY,
  );

  return items.map((item) => {
    const brief = enrichedMap.get(`${item.category}-${item.tmdbId}`);
    const title = resolveCatalogTitle({
      tmdbTitle: brief?.title,
      displayName: item.displayName,
      id: item.tmdbId,
    });
    const overview = brief?.overview ? String(brief.overview).slice(0, 280) : item.overview || '';
    let posterUrl = item.posterUrl;
    if (!posterUrl && brief?.posterPath) {
      posterUrl = buildImageUrl(brief.posterPath, 'w342');
    }
    return {
      ...item,
      title,
      overview,
      posterUrl,
    };
  });
}

module.exports = { enrichCatalogItems, CATALOG_ENRICH_CAP };
