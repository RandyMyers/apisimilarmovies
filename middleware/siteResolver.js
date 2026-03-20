const Website = require('../models/Website');

const DEFAULT_SITE_KEY = 'default';

async function resolveSiteKey(req) {
  const headerKey = req.headers['x-site'];
  const raw = headerKey != null ? String(headerKey) : '';
  const key = raw.trim().toLowerCase();
  if (key) return key;
  return DEFAULT_SITE_KEY;
}

async function siteResolver(req, res, next) {
  try {
    const siteKey = await resolveSiteKey(req);
    req.siteKey = siteKey;

    // Best-effort: attach site doc if it exists; otherwise allow default.
    const site = await Website.findOne({ key: siteKey, isActive: true }).lean();
    req.site = site || null;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { siteResolver, DEFAULT_SITE_KEY };

