const tmdbService = require('../services/tmdbService');

// GET /api/v1/search?query=...&page=1&language=en-US&include_adult=false
exports.searchMulti = async (req, res) => {
  try {
    const query = req.query.query;
    if (!query || !String(query).trim()) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    const page = parseInt(req.query.page || '1', 10);
    const language = req.query.language || 'en-US';
    const includeAdult = req.query.include_adult === 'true';

    const data = await tmdbService.searchMulti(String(query), { page, language, includeAdult });
    const results = Array.isArray(data.results) ? data.results : [];

    // Keep only movie/tv results for this app
    const filtered = results.filter((r) => r && (r.media_type === 'movie' || r.media_type === 'tv'));

    return res.json({
      ...data,
      results: filtered,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Search failed' });
  }
};

// GET /api/v1/search/details?tmdbKind=movie|tv&id=123&language=en-US
exports.getTmdbDetails = async (req, res) => {
  try {
    const tmdbKind = String(req.query.tmdbKind || '').toLowerCase();
    const id = parseInt(req.query.id, 10);
    const language = req.query.language || 'en-US';
    if (!Number.isFinite(id) || (tmdbKind !== 'movie' && tmdbKind !== 'tv')) {
      return res.status(400).json({ error: 'tmdbKind (movie|tv) and id are required' });
    }
    const details =
      tmdbKind === 'movie'
        ? await tmdbService.getMovieDetails(id, language)
        : await tmdbService.getTVDetails(id, language);
    const genreIds = Array.isArray(details?.genres) ? details.genres.map((g) => g.id).filter(Number.isFinite) : [];
    return res.json({ tmdbKind, id, genreIds, details });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load TMDB details' });
  }
};

