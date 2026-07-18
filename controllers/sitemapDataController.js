/**
 * Build-time sitemap data endpoints.
 * Returns configured media detail pages from MediaDetailSEO where includeInSitemap is true.
 */

const MediaDetailSEO = require('../models/MediaDetailSEO');
const Media = require('../models/Media');
const Website = require('../models/Website');
// Keep in sync with admin MediaManagement.jsx LANGUAGES[].countryCode (no br; not in admin sidebar).
const DEFAULT_REGIONS = ['us', 'gb', 'au', 'ie', 'de', 'at', 'es', 'it', 'fr', 'pt', 'nl', 'no', 'fi', 'dk', 'se'];
const DEFAULT_HREFLANG_MAP = {
  us: 'en-US',
  gb: 'en-GB',
  au: 'en-AU',
  ie: 'ga-IE',
  de: 'de-DE',
  at: 'de-AT',
  es: 'es-ES',
  it: 'it-IT',
  fr: 'fr-FR',
  pt: 'pt-PT',
  nl: 'nl-NL',
  no: 'no-NO',
  fi: 'fi-FI',
  dk: 'da-DK',
  se: 'sv-SE',
};
const DEFAULT_STATIC_PATHS = [
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/faq',
  '/categories',
  '/similar/movies',
  '/similar/tv',
  '/similar/anime',
  '/similar/anime-movies',
  '/similar/anime-tv',
  '/top/movies',
  '/top/tv',
  '/top/anime',
  '/top/anime-movies',
  '/top/anime-tv',
];

function hasNoindex(robots) {
  return /noindex/i.test(String(robots || ''));
}

function slugForLanguage(translations = [], language) {
  const langKey = String(language || '').toLowerCase();
  const match = translations.find((t) => String(t.language || '').toLowerCase() === langKey);
  if (match?.slug?.trim()) return match.slug.trim();
  const fallback = translations.find((t) => String(t.language || '').toLowerCase() === 'en-us');
  return fallback?.slug?.trim() || '';
}

function buildSlugByRegion(translations = [], hreflangMap = DEFAULT_HREFLANG_MAP) {
  const slugByRegion = {};
  for (const [region, language] of Object.entries(hreflangMap)) {
    const slug = slugForLanguage(translations, language);
    if (slug) slugByRegion[region] = slug;
  }
  return slugByRegion;
}

exports.getMediaDetailPagesForSitemap = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const pages = [];

    const docs = await MediaDetailSEO.find({ siteKey, isActive: true, includeInSitemap: true })
      .select(
        'category tmdbMovieId tmdbTvId updatedAt includeInSitemap priority changefreq robots translations similarPage',
      )
      .lean();

    if (!docs.length) return res.json({ pages: [] });

    for (const doc of docs) {
      const similarPage = doc.similarPage || {};
      if (similarPage.includeInSitemap === false) continue;

      const effectiveRobots = similarPage.robots || doc.robots || 'index, follow';
      if (hasNoindex(doc.robots) || hasNoindex(similarPage.robots) || hasNoindex(effectiveRobots)) continue;

      const mediaQuery =
        doc.category === 'movie' || doc.category === 'anime_movie'
          ? { siteKey, category: doc.category, tmdbMovieId: doc.tmdbMovieId }
          : { siteKey, category: doc.category, tmdbTvId: doc.tmdbTvId };

      const media = await Media.findOne(mediaQuery).select('displayName availableRegions').lean();
      const id = doc.category === 'movie' || doc.category === 'anime_movie' ? doc.tmdbMovieId : doc.tmdbTvId;
      if (!media || !id) continue;

      pages.push({
        category: doc.category,
        id,
        displayName: media.displayName,
        updatedAt: doc.updatedAt,
        availableRegions: media.availableRegions || [],
        priority: Number.isFinite(Number(similarPage.priority)) ? Number(similarPage.priority) : doc.priority,
        changefreq: similarPage.changefreq || doc.changefreq,
        robots: effectiveRobots,
        slugByRegion: buildSlugByRegion(doc.translations || []),
      });
    }

    return res.json({ pages });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to build sitemap pages' });
  }
};

exports.getStaticPagesForSitemap = async (_req, res) => {
  const pages = DEFAULT_STATIC_PATHS.map((pathTemplate) => ({
    pathTemplate,
    updatedAt: null,
    priority: 0.7,
    changefreq: 'weekly',
    availableRegions: DEFAULT_REGIONS,
  }));
  return res.json({ pages });
};

exports.getRegionsForSitemap = async (_req, res) => {
  return res.json({
    regions: DEFAULT_REGIONS,
    hreflangMap: DEFAULT_HREFLANG_MAP,
  });
};

// GET /api/v1/sitemap-data/site
// Public endpoint used by sitemap generation to resolve the base domain for the current X-Site.
exports.getSiteForSitemap = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const site = await Website.findOne({ key: siteKey }).lean();
    if (!site) return res.json({ domain: null, siteKey });

    const raw = String(site.domain || '').trim();
    const domain = raw
      ? /^https?:\/\//i.test(raw)
        ? raw
        : `https://${raw}`
      : null;

    return res.json({
      siteKey,
      domain,
      key: site.key,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to resolve site for sitemap' });
  }
};
