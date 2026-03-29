const jwt = require('jsonwebtoken');
const User = require('../models/User');

function readBearerToken(req) {
  const auth = String(req.headers.authorization || '').trim();
  if (!auth.toLowerCase().startsWith('bearer ')) return '';
  return auth.slice(7).trim();
}

function getUserJwtSecret() {
  return process.env.USER_JWT_SECRET || process.env.JWT_SECRET;
}

async function attachUserIfPresent(req) {
  const token = readBearerToken(req);
  if (!token) return;
  const secret = getUserJwtSecret();
  if (!secret) return;
  const payload = jwt.verify(token, secret);
  const userId = payload?.userId ? String(payload.userId) : '';
  if (!userId) return;
  const siteKey = req.siteKey || 'default';
  const user = await User.findOne({ _id: userId, siteKey, deletedAt: null }).lean();
  if (!user) return;
  req.user = {
    _id: String(user._id),
    email: user.email,
    username: user.username || '',
    displayName: user.displayName || '',
  };
}

async function optionalUserAuth(req, _res, next) {
  try {
    await attachUserIfPresent(req);
  } catch (_err) {
    // Continue as guest on any token issue.
  }
  return next();
}

async function authenticateUser(req, res, next) {
  try {
    await attachUserIfPresent(req);
    if (!req.user?._id) return res.status(401).json({ error: 'Unauthorized user request' });
    return next();
  } catch (_err) {
    return res.status(401).json({ error: 'Unauthorized user request' });
  }
}

module.exports = { optionalUserAuth, authenticateUser, getUserJwtSecret };
