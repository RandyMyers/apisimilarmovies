const tmdbService = require('../services/tmdbService');
const { getCached, setCached } = require('./tmdbCache');
const { normalizeLanguage } = require('./tmdbLocale');

const REF_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function getCountryNameMap(language) {
  const lang = normalizeLanguage(language);
  const cacheKey = `ref:countries:${lang}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;
  try {
    const rows = await tmdbService.getConfigurationCountries(lang);
    const map = {};
    for (const row of rows || []) {
      if (!row?.iso_3166_1) continue;
      map[row.iso_3166_1] = row.native_name || row.english_name || row.iso_3166_1;
    }
    await setCached(cacheKey, map, REF_TTL_MS);
    return map;
  } catch {
    return {};
  }
}

async function getLanguageNameMap(language) {
  const lang = normalizeLanguage(language);
  const cacheKey = `ref:languages:${lang}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;
  try {
    const rows = await tmdbService.getConfigurationLanguages(lang);
    const map = {};
    for (const row of rows || []) {
      if (!row?.iso_639_1) continue;
      map[row.iso_639_1] = row.name || row.english_name || row.iso_639_1;
    }
    await setCached(cacheKey, map, REF_TTL_MS);
    return map;
  } catch {
    return {};
  }
}

async function getCertificationMaps() {
  const cacheKey = 'ref:certifications:all';
  const cached = await getCached(cacheKey);
  if (cached) return cached;
  try {
    const [movie, tv] = await Promise.all([
      tmdbService.getMovieCertifications(),
      tmdbService.getTVCertifications(),
    ]);
    const payload = {
      movie: movie?.certifications || {},
      tv: tv?.certifications || {},
    };
    await setCached(cacheKey, payload, REF_TTL_MS);
    return payload;
  } catch {
    return { movie: {}, tv: {} };
  }
}

function lookupCertificationMeaning(maps, tmdbKind, watchRegion, code) {
  if (!code) return null;
  const bucket = tmdbKind === 'movie' ? maps.movie : maps.tv;
  const region = String(watchRegion || 'US').toUpperCase();
  const rows = bucket?.[region] || bucket?.US || [];
  const hit = rows.find((r) => String(r.certification || '') === String(code));
  return hit?.meaning || null;
}

module.exports = {
  getCountryNameMap,
  getLanguageNameMap,
  getCertificationMaps,
  lookupCertificationMeaning,
};
