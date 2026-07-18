const {
  getCountryNameMap,
  getLanguageNameMap,
  getCertificationMaps,
  lookupCertificationMeaning,
} = require('./tmdbReferenceData');
const {
  localizeMediaStatus,
  localizeTvType,
  localizeCrewJob,
  localizeVideoType,
  formatCertification,
} = require('./tmdbValueLocalize');
const { localizeCertificationMeaning } = require('./tmdbCertificationLabels');

function buildImageUrl(path, size = 'w500') {
  if (!path) return null;
  const p = String(path).trim();
  if (/^https?:\/\//i.test(p)) return p;
  return `https://image.tmdb.org/t/p/${size}${p.startsWith('/') ? p : `/${p}`}`;
}

function pickCertification(details, watchRegion, tmdbKind) {
  if (tmdbKind === 'movie') {
    const rows = details.release_dates?.results || [];
    const country = rows.find((r) => r.iso_3166_1 === watchRegion) || rows.find((r) => r.iso_3166_1 === 'US');
    const cert = (country?.release_dates || []).find((d) => d.certification)?.certification;
    return cert || null;
  }
  const rows = details.content_ratings?.results || [];
  const country = rows.find((r) => r.iso_3166_1 === watchRegion) || rows.find((r) => r.iso_3166_1 === 'US');
  return country?.rating || null;
}

function normalizeVideos(details, language) {
  const results = details.videos?.results || [];
  const yt = results.filter((v) => v.site === 'YouTube' && v.key);
  const mapVideo = (v) => ({
    id: v.id,
    key: v.key,
    name: v.name || '',
    type: localizeVideoType(v.type, language) || v.type || '',
    url: `https://www.youtube.com/watch?v=${v.key}`,
  });
  return {
    trailers: yt.filter((v) => v.type === 'Trailer').slice(0, 6).map(mapVideo),
    teasers: yt.filter((v) => v.type === 'Teaser').slice(0, 3).map(mapVideo),
  };
}

function normalizeWatchProviders(details, watchRegion) {
  const regionData = details['watch/providers']?.results?.[watchRegion];
  if (!regionData) return null;
  const mapProvider = (p) => ({
    id: p.provider_id,
    name: p.provider_name,
    logoUrl: buildImageUrl(p.logo_path, 'w92'),
  });
  return {
    link: regionData.link || null,
    flatrate: (regionData.flatrate || []).map(mapProvider),
    rent: (regionData.rent || []).slice(0, 8).map(mapProvider),
    buy: (regionData.buy || []).slice(0, 8).map(mapProvider),
  };
}

function normalizeCredits(details, tmdbKind, language) {
  const credits = tmdbKind === 'tv' ? details.aggregate_credits : details.credits;
  const cast = (credits?.cast || []).slice(0, 12).map((c) => ({
    id: c.id,
    name: c.name,
    character: c.character || c.roles?.[0]?.character || '',
    profileUrl: buildImageUrl(c.profile_path, 'w185'),
  }));
  const keyJobs = new Set(['Director', 'Creator', 'Writer', 'Screenplay', 'Executive Producer']);
  const crew = (credits?.crew || [])
    .filter((c) => keyJobs.has(c.job))
    .slice(0, 8)
    .map((c) => ({
      id: c.id,
      name: c.name,
      job: localizeCrewJob(c.job, language) || c.job,
    }));
  return { cast, crew };
}

function normalizeKeywords(details) {
  const kw = details.keywords?.keywords || details.keywords?.results || [];
  return kw.slice(0, 20).map((k) => ({ id: k.id, name: k.name }));
}

function normalizeExternalIds(details) {
  const ext = details.external_ids || {};
  return {
    imdbId: ext.imdb_id || null,
    wikidataId: ext.wikidata_id || null,
  };
}

function normalizeCollection(details) {
  const col = details.belongs_to_collection;
  if (!col) return null;
  return {
    id: col.id,
    name: col.name,
    posterUrl: buildImageUrl(col.poster_path, 'w342'),
  };
}

function normalizeRecommendations(details) {
  return (details.recommendations?.results || []).slice(0, 8).map((r) => ({
    id: r.id,
    title: r.title || r.name || '',
    posterUrl: buildImageUrl(r.poster_path, 'w342'),
    voteAverage: r.vote_average ?? null,
  }));
}

async function normalizeMediaExtras(details, { watchRegion, tmdbKind, language }) {
  const isMovie = tmdbKind === 'movie';
  const lang = language || 'en-US';

  const [countryMap, languageMap, certMaps] = await Promise.all([
    getCountryNameMap(lang),
    getLanguageNameMap(lang),
    getCertificationMaps(),
  ]);

  const spokenLanguages = (details.spoken_languages || [])
    .map((l) => {
      if (l.iso_639_1 && languageMap[l.iso_639_1]) return languageMap[l.iso_639_1];
      return l.name || l.english_name || '';
    })
    .filter(Boolean);

  const productionCountries = (details.production_countries || [])
    .map((c) => {
      if (c.iso_3166_1 && countryMap[c.iso_3166_1]) return countryMap[c.iso_3166_1];
      return c.name || '';
    })
    .filter(Boolean);

  const certificationCode = pickCertification(details, watchRegion, tmdbKind);
  const tmdbCertMeaning = lookupCertificationMeaning(
    certMaps,
    tmdbKind,
    watchRegion,
    certificationCode,
  );
  const certificationMeaning = localizeCertificationMeaning(
    certificationCode,
    lang,
    tmdbCertMeaning,
  );

  return {
    originalTitle: details.original_title || details.original_name || null,
    tagline: details.tagline || null,
    runtime: isMovie ? details.runtime ?? null : null,
    episodeRunTime:
      !isMovie && Array.isArray(details.episode_run_time) ? details.episode_run_time[0] ?? null : null,
    numberOfSeasons: details.number_of_seasons ?? null,
    numberOfEpisodes: details.number_of_episodes ?? null,
    status: localizeMediaStatus(details.status, tmdbKind, lang),
    statusRaw: details.status || null,
    seriesType: !isMovie ? localizeTvType(details.type, lang) : null,
    inProduction: details.in_production ?? null,
    voteCount: details.vote_count ?? null,
    popularity: details.popularity ?? null,
    spokenLanguages,
    productionCountries,
    homepage: details.homepage || null,
    certification: formatCertification(certificationCode, certificationMeaning),
    certificationCode,
    credits: normalizeCredits(details, tmdbKind, lang),
    videos: normalizeVideos(details, lang),
    keywords: normalizeKeywords(details),
    externalIds: normalizeExternalIds(details),
    watchProviders: normalizeWatchProviders(details, watchRegion),
    belongsToCollection: normalizeCollection(details),
    recommendations: normalizeRecommendations(details),
    budget: isMovie ? details.budget ?? null : null,
    revenue: isMovie ? details.revenue ?? null : null,
    networks: !isMovie ? (details.networks || []).map((n) => n.name).filter(Boolean) : [],
    createdBy: !isMovie ? (details.created_by || []).map((c) => c.name).filter(Boolean) : [],
  };
}

module.exports = {
  buildImageUrl,
  normalizeMediaExtras,
};
