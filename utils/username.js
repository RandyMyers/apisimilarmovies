const RESERVED = new Set([
  'admin',
  'api',
  'auth',
  'login',
  'register',
  'logout',
  'me',
  'users',
  'user',
  'u',
  'profile',
  'dashboard',
  'search',
  'settings',
  'static',
  'about',
  'contact',
  'privacy',
  'terms',
  'faq',
  'categories',
  'explore',
  'similar',
  'top',
  'compare',
  'movies',
  'tv',
  'anime',
  'follow',
  'followers',
  'following',
  'report',
  'help',
  'support',
  'null',
  'undefined',
  'fliqmatch',
  'simimovies',
  'health',
]);

function normalizeUsername(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/**
 * @returns {{ ok: true, username: string } | { ok: false, error: string }}
 */
function validateUsername(raw) {
  const u = normalizeUsername(raw);
  if (!u) return { ok: false, error: 'Username is required' };
  if (u.length < 3 || u.length > 30) return { ok: false, error: 'Username must be 3–30 characters' };
  if (!/^[a-z0-9_]+$/.test(u)) return { ok: false, error: 'Use only letters, numbers, and underscores' };
  if (RESERVED.has(u)) return { ok: false, error: 'This username is reserved' };
  return { ok: true, username: u };
}

module.exports = { normalizeUsername, validateUsername, RESERVED };
