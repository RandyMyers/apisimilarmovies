const mongoose = require('mongoose');
const Website = require('../models/Website');
const {
  DEFAULT_SITE_KEY,
  resolveSiteDocWhenDefaultHeader,
  getClientFacingHostname,
} = require('../utils/resolvePublicSiteFromClient');

const DEBUG_ADS = process.env.DEBUG_ADS === '1';

async function resolveSiteKey(req) {
  const headerKey = req.headers['x-site'];
  const raw = headerKey != null ? String(headerKey) : '';
  const key = raw.trim().toLowerCase();
  if (key) return key;
  return DEFAULT_SITE_KEY;
}

async function siteResolver(req, res, next) {
  try {
    const headerKey = await resolveSiteKey(req);

    // Avoid Mongoose buffering when Mongo is not connected (e.g. missing MONGO_URL or cold start race).
    if (mongoose.connection.readyState !== 1) {
      req.siteKey = headerKey;
      req.site = null;
      return next();
    }

    let siteKey = headerKey;
    let site = await Website.findOne({ key: siteKey, isActive: true }).lean();

    /**
     * SPA on fliqmatch.com with REACT_APP_SITE_KEY=default calls API on another host (e.g. Vercel).
     * req.hostname is wrong; map via Origin / X-Client-Host → Website.domain.
     */
    if (headerKey === DEFAULT_SITE_KEY) {
      const byClient = await resolveSiteDocWhenDefaultHeader(req);
      if (byClient) {
        siteKey = byClient.key;
        site = byClient;
        if (DEBUG_ADS) {
          console.log('[DEBUG_ADS] siteResolver: default X-Site → matched Website by client host', {
            clientHost: getClientFacingHostname(req),
            siteKey: siteKey,
            domain: byClient.domain,
          });
        }
      }
    }

    req.siteKey = siteKey;
    req.site = site || null;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { siteResolver, DEFAULT_SITE_KEY };

