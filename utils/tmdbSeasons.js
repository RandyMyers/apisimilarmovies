const tmdbService = require('../services/tmdbService');
const { buildImageUrl } = require('./tmdbMediaNormalize');

const MAX_SEASONS = 50;
const CONCURRENCY = 4;
const SEASONS_TTL_MS = 6 * 60 * 60 * 1000;

function normalizeEpisode(ep) {
  return {
    episodeNumber: ep.episode_number,
    name: ep.name || '',
    overview: ep.overview || '',
    airDate: ep.air_date || null,
    runtime: ep.runtime ?? null,
    stillUrl: buildImageUrl(ep.still_path, 'w300'),
    voteAverage: ep.vote_average ?? null,
  };
}

function normalizeSeason(season) {
  const episodes = (season.episodes || [])
    .filter((ep) => ep.episode_number != null)
    .sort((a, b) => a.episode_number - b.episode_number)
    .map(normalizeEpisode);
  return {
    seasonNumber: season.season_number,
    name: season.name || '',
    overview: season.overview || '',
    airDate: season.air_date || null,
    episodeCount: season.episode_count ?? episodes.length,
    posterUrl: buildImageUrl(season.poster_path, 'w342'),
    episodes,
  };
}

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
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

async function fetchTvSeasonsPayload(tvId, language, { getCached, setCached }) {
  const cacheKey = `seasons:tv:${tvId}:${language}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const details = await tmdbService.getTVDetails(tvId, { language, append: false });
  const seasonNumbers = (details.seasons || [])
    .map((s) => s.season_number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
    .slice(0, MAX_SEASONS);

  const seasons = await pmap(
    seasonNumbers,
    async (seasonNumber) => {
      try {
        const raw = await tmdbService.getTVSeason(tvId, seasonNumber, language);
        return normalizeSeason(raw);
      } catch {
        const summary = (details.seasons || []).find((s) => s.season_number === seasonNumber);
        if (!summary) return null;
        return {
          seasonNumber: summary.season_number,
          name: summary.name || '',
          overview: summary.overview || '',
          airDate: summary.air_date || null,
          episodeCount: summary.episode_count ?? 0,
          posterUrl: buildImageUrl(summary.poster_path, 'w342'),
          episodes: [],
        };
      }
    },
    CONCURRENCY,
  );

  const payload = {
    tvId,
    name: details.name || '',
    numberOfSeasons: details.number_of_seasons ?? seasonNumbers.length,
    numberOfEpisodes: details.number_of_episodes ?? null,
    seasons: seasons.filter(Boolean),
  };

  await setCached(cacheKey, payload, SEASONS_TTL_MS);
  return payload;
}

module.exports = { fetchTvSeasonsPayload, normalizeSeason };
