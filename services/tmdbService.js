/**
 * TMDB API service (minimal wrapper)
 * Uses TMDB_API_KEY from .env
 */
const axios = require('axios');

const BASE = 'https://api.themoviedb.org/3';

const MOVIE_APPEND =
  'credits,videos,keywords,watch/providers,external_ids,release_dates,recommendations';
const TV_APPEND =
  'aggregate_credits,videos,keywords,watch/providers,external_ids,content_ratings,recommendations';

function getApiKey() {
  return process.env.TMDB_API_KEY || '';
}

async function request(path, params = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('TMDB_API_KEY is not configured');

  const { data } = await axios.get(`${BASE}${path}`, {
    params: { api_key: apiKey, ...params },
    timeout: 15000,
  });
  return data;
}

function resolveOptions(options) {
  if (typeof options === 'string') return { language: options, append: true };
  return { language: 'en-US', append: true, ...options };
}

// Multi-search (movies + tv)
async function searchMulti(query, options = {}) {
  const { page = 1, language = 'en-US', includeAdult = false } = options;
  return request('/search/multi', {
    query,
    page,
    language,
    include_adult: includeAdult,
  });
}

// Hero detail
async function getMovieDetails(movieId, options = 'en-US') {
  const opts = resolveOptions(options);
  const params = { language: opts.language || 'en-US' };
  if (opts.append !== false) params.append_to_response = MOVIE_APPEND;
  return request(`/movie/${movieId}`, params);
}

async function getTVDetails(tvId, options = 'en-US') {
  const opts = resolveOptions(options);
  const params = { language: opts.language || 'en-US' };
  if (opts.append !== false) params.append_to_response = TV_APPEND;
  return request(`/tv/${tvId}`, params);
}

// Similar list
async function getSimilarMovies(movieId, page = 1, language = 'en-US') {
  return request(`/movie/${movieId}/similar`, { page, language });
}

async function getSimilarTV(tvId, page = 1, language = 'en-US') {
  return request(`/tv/${tvId}/similar`, { page, language });
}

async function trendingMovies(page = 1, language = 'en-US') {
  return request('/trending/movie/day', { page, language });
}

async function trendingTV(page = 1, language = 'en-US') {
  return request('/trending/tv/day', { page, language });
}

async function getMovieGenres(language = 'en-US') {
  return request('/genre/movie/list', { language });
}

async function getTVGenres(language = 'en-US') {
  return request('/genre/tv/list', { language });
}

module.exports = {
  searchMulti,
  getMovieDetails,
  getTVDetails,
  getSimilarMovies,
  getSimilarTV,
  trendingMovies,
  trendingTV,
  getMovieGenres,
  getTVGenres,
};
