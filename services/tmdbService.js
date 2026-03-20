/**
 * TMDB API service (minimal wrapper)
 * Uses TMDB_API_KEY from .env
 */
const axios = require('axios');

const BASE = 'https://api.themoviedb.org/3';

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
async function getMovieDetails(movieId, language = 'en-US') {
  return request(`/movie/${movieId}`, { language });
}

async function getTVDetails(tvId, language = 'en-US') {
  return request(`/tv/${tvId}`, { language });
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

