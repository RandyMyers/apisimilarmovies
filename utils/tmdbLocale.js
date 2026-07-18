const REGION_WATCH_COUNTRY = {
  us: 'US',
  gb: 'GB',
  au: 'AU',
  ie: 'IE',
  de: 'DE',
  at: 'AT',
  es: 'ES',
  it: 'IT',
  fr: 'FR',
  pt: 'PT',
  nl: 'NL',
  no: 'NO',
  fi: 'FI',
  dk: 'DK',
  se: 'SE',
};

function normalizeLanguage(language) {
  const s = String(language || 'en-US').trim();
  return s || 'en-US';
}

function watchRegionFromSiteRegion(region) {
  const r = String(region || '').trim().toLowerCase();
  return REGION_WATCH_COUNTRY[r] || 'US';
}

function watchRegionFromLanguage(language) {
  const parts = normalizeLanguage(language).split('-');
  if (parts.length >= 2) return parts[1].toUpperCase();
  return 'US';
}

function resolveMediaTitle({ seoTitle, details, displayName, id }) {
  if (seoTitle) return String(seoTitle);
  const localized = details?.title || details?.name;
  if (localized) return String(localized);
  const original = details?.original_title || details?.original_name;
  if (original) return String(original);
  if (displayName) return String(displayName);
  return `#${id}`;
}

function resolveCatalogTitle({ tmdbTitle, displayName, id }) {
  if (tmdbTitle) return String(tmdbTitle);
  if (displayName) return String(displayName);
  return `#${id}`;
}

function isDefaultEnglish(language) {
  const l = normalizeLanguage(language).toLowerCase();
  return l === 'en-us' || l === 'en-gb' || l === 'en-au';
}

module.exports = {
  REGION_WATCH_COUNTRY,
  normalizeLanguage,
  watchRegionFromSiteRegion,
  watchRegionFromLanguage,
  resolveMediaTitle,
  resolveCatalogTitle,
  isDefaultEnglish,
};
