const ALLOWED = new Set(['movie', 'tv', 'anime_movie', 'anime_tv']);

function parseCategory(categoryRaw) {
  const category = String(categoryRaw || '').toLowerCase().trim();
  return ALLOWED.has(category) ? category : null;
}

function categoryToTmdbKind(category) {
  if (category === 'movie' || category === 'anime_movie') return 'movie';
  return 'tv';
}

module.exports = { parseCategory, categoryToTmdbKind };
