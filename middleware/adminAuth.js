const jwt = require('jsonwebtoken');

const ROLES = ['moderator', 'editor', 'super_admin'];

function normalizeRole(raw) {
  const role = String(raw || '').trim().toLowerCase();
  return ROLES.includes(role) ? role : '';
}

function roleLevel(role) {
  if (role === 'super_admin') return 3;
  if (role === 'editor') return 2;
  if (role === 'moderator') return 1;
  return 0;
}

function readBearerToken(req) {
  const auth = String(req.headers.authorization || '').trim();
  if (!auth) return '';
  if (!auth.toLowerCase().startsWith('bearer ')) return '';
  return auth.slice(7).trim();
}

function authenticateAdmin(req, res, next) {
  const token = readBearerToken(req);
  if (!token) {
    // eslint-disable-next-line no-console
    console.warn('[adminAuth] missing bearer token');
    return res.status(401).json({ error: 'Unauthorized admin request' });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // eslint-disable-next-line no-console
    console.error('[adminAuth] JWT_SECRET not configured');
    return res.status(500).json({ error: 'JWT_SECRET not configured' });
  }

  try {
    const payload = jwt.verify(token, secret);
    const role = normalizeRole(payload?.role);
    if (!role) return res.status(401).json({ error: 'Unauthorized admin request' });

    req.admin = {
      authenticated: true,
      role,
      userId: payload?.userId ? String(payload.userId) : undefined,
      email: payload?.email ? String(payload.email) : undefined,
    };
    return next();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[adminAuth] jwt verify failed', { message: err?.message || err?.name || err });
    return res.status(401).json({ error: 'Unauthorized admin request' });
  }
}

function authorizeRoles(...allowedRoles) {
  const allowed = allowedRoles.map(normalizeRole).filter(Boolean);
  return function authorize(req, res, next) {
    const role = normalizeRole(req.admin?.role);
    if (!role) return res.status(403).json({ error: 'Forbidden: missing role' });
    if (!allowed.length) return next();

    const current = roleLevel(role);
    const minAllowed = Math.min(...allowed.map(roleLevel).filter(Boolean));
    if (current < minAllowed) {
      // eslint-disable-next-line no-console
      console.warn('[adminAuth] forbidden: insufficient role', { role, allowedRoles });
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }
    return next();
  };
}

module.exports = { authenticateAdmin, authorizeRoles };
