/**
 * When the browser calls a different host than the public site (e.g. SPA on fliqmatch.com → API on Vercel),
 * req.hostname is the API host. Use Origin / Referer / X-Client-Host to map to Website.domain.
 */

const Website = require('../models/Website');

const DEFAULT_SITE_KEY = 'default';

function stripWww(h) {
  const s = String(h || '').trim().toLowerCase();
  if (s.startsWith('www.')) return s.slice(4);
  return s;
}

/** Hostname only from Website.domain field (may include https://). */
function normalizeStoredDomain(domainRaw) {
  let s = String(domainRaw || '').trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  s = s.split('/')[0].split(':')[0];
  return stripWww(s);
}

/** Public browser hostname matches this site's domain (exact or subdomain). */
function publicHostMatchesWebsite(hostNorm, domainRaw) {
  const d = normalizeStoredDomain(domainRaw);
  if (!d) return false;
  const h = stripWww(hostNorm);
  if (h === d) return true;
  if (h.endsWith(`.${d}`)) return true;
  return false;
}

function shouldSkipClientHostLookup(hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.local')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  return false;
}

/**
 * Hostname of the public site as seen from the browser (not the API server).
 * Order: X-Client-Host (SPA), Origin, Referer, then req.hostname (same-origin API).
 */
function getClientFacingHostname(req) {
  const explicit = String(req.headers['x-client-host'] || '')
    .trim()
    .toLowerCase()
    .split(':')[0];
  if (explicit) return explicit;

  const origin = req.headers.origin || req.headers.Origin;
  if (origin) {
    try {
      return new URL(origin).hostname.toLowerCase();
    } catch (_) {
      /* ignore */
    }
  }
  const ref = req.headers.referer || req.headers.referrer;
  if (ref) {
    try {
      return new URL(ref).hostname.toLowerCase();
    } catch (_) {
      /* ignore */
    }
  }
  return String(req.hostname || '')
    .trim()
    .toLowerCase();
}

async function findWebsiteByPublicHostname(hostname) {
  const sites = await Website.find({ isActive: true, domain: { $nin: ['', null] } })
    .select('key domain name adsStaticEnabled adsManagedEnabled')
    .lean();
  const matches = sites.filter((w) => publicHostMatchesWebsite(hostname, w.domain));
  if (!matches.length) return null;
  matches.sort((a, b) => normalizeStoredDomain(b.domain).length - normalizeStoredDomain(a.domain).length);
  return matches[0];
}

/**
 * If X-Site resolves to "default", prefer Website whose domain matches the browser (Origin / X-Client-Host).
 */
async function resolveSiteDocWhenDefaultHeader(req) {
  const clientHost = getClientFacingHostname(req);
  if (shouldSkipClientHostLookup(clientHost)) return null;
  return findWebsiteByPublicHostname(clientHost);
}

module.exports = {
  DEFAULT_SITE_KEY,
  getClientFacingHostname,
  findWebsiteByPublicHostname,
  resolveSiteDocWhenDefaultHeader,
  shouldSkipClientHostLookup,
  normalizeStoredDomain,
};
