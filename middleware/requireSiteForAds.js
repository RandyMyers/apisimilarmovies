const Website = require('../models/Website');

/**
 * After siteResolver: ensure we have a Website ObjectId for ad queries.
 * Loads by req.siteKey when req.site is missing (e.g. cold path).
 */
async function requireSiteForAds(req, res, next) {
  try {
    if (req.site && req.site._id) {
      req.adWebsiteId = req.site._id;
      return next();
    }
    const key = String(req.siteKey || 'default').trim().toLowerCase();
    const w = await Website.findOne({ key, isActive: true }).lean();
    if (!w) {
      return res.status(400).json({
        success: false,
        message: `No active Website for X-Site "${key}". Create one in admin (Websites) before using ads.`,
        error: `No active Website for X-Site "${key}".`,
      });
    }
    req.adWebsiteId = w._id;
    req.site = w;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireSiteForAds };
