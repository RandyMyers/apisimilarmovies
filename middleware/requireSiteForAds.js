const Website = require('../models/Website');

const DEBUG_ADS = process.env.DEBUG_ADS === '1';

/**
 * After siteResolver: ensure we have a Website ObjectId for ad queries.
 * Loads by req.siteKey when req.site is missing (e.g. cold path).
 */
async function requireSiteForAds(req, res, next) {
  try {
    if (req.site && req.site._id) {
      req.adWebsiteId = req.site._id;
      if (DEBUG_ADS) {
        console.log('[DEBUG_ADS] requireSiteForAds', {
          source: 'req.site',
          siteKey: req.siteKey,
          adWebsiteId: String(req.adWebsiteId),
        });
      }
      return next();
    }
    const key = String(req.siteKey || 'default').trim().toLowerCase();
    const w = await Website.findOne({ key, isActive: true }).lean();
    if (!w) {
      if (DEBUG_ADS) {
        console.warn('[DEBUG_ADS] requireSiteForAds: no Website', { siteKey: key });
      }
      return res.status(400).json({
        success: false,
        message: `No active Website for X-Site "${key}". Create one in admin (Websites) before using ads.`,
        error: `No active Website for X-Site "${key}".`,
      });
    }
    req.adWebsiteId = w._id;
    req.site = w;
    if (DEBUG_ADS) {
      console.log('[DEBUG_ADS] requireSiteForAds', {
        source: 'Website.findOne',
        siteKey: key,
        adWebsiteId: String(req.adWebsiteId),
      });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireSiteForAds };
