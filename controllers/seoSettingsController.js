const axios = require('axios');
const SeoSettings = require('../models/SeoSettings');
const Website = require('../models/Website');
const { asyncHandler } = require('../middleware/errorHandler');

function normalizeVerificationToken(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  const metaContent = value.match(/content\s*=\s*["']([^"']+)["']/i);
  if (metaContent?.[1]) return metaContent[1].trim();
  const eqForm = value.match(/google-site-verification\s*=\s*([^\s"'<>]+)/i);
  if (eqForm?.[1]) return eqForm[1].trim();
  if (!/[<>]/.test(value)) return value;
  return value.replace(/<[^>]*>/g, '').trim();
}

function normalizeSiteUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s.replace(/\/+$/, '');
  return `https://${s}`.replace(/\/+$/, '');
}

async function resolveSiteUrl(siteKey, settingsDoc) {
  const fromSettings = normalizeSiteUrl(settingsDoc?.siteUrl);
  if (fromSettings) return fromSettings;
  const site = await Website.findOne({ key: siteKey }).lean();
  return normalizeSiteUrl(site?.domain);
}

function toPublicPayload(doc, siteUrl) {
  const obj = doc?.toObject?.() || doc || {};
  return {
    siteName: obj.siteName || 'FliqMatch',
    siteUrl: siteUrl || '',
    twitterHandle: obj.twitterHandle || '',
    googleSiteVerification: normalizeVerificationToken(obj.googleSiteVerification),
    bingSiteVerification: normalizeVerificationToken(obj.bingSiteVerification),
    hreflang: obj.hreflang || { enabled: true, xDefaultLanguage: 'en', includeRegionalVariants: true },
    organization: obj.organization || {},
    sitemap: obj.sitemap || {},
    robotsTxt: obj.robotsTxt || {},
    staticPages: obj.staticPages || {},
  };
}

exports.getPublicSettings = asyncHandler(async (req, res) => {
  const siteKey = req.siteKey || 'default';
  const doc = await SeoSettings.getForSite(siteKey);
  const siteUrl = await resolveSiteUrl(siteKey, doc);
  return res.json({ success: true, data: toPublicPayload(doc, siteUrl) });
});

exports.getAdminSettings = asyncHandler(async (req, res) => {
  const siteKey = req.siteKey || 'default';
  const doc = await SeoSettings.getForSite(siteKey);
  const siteUrl = await resolveSiteUrl(siteKey, doc);
  const obj = doc.toObject();
  return res.json({
    success: true,
    data: {
      ...obj,
      siteUrl: obj.siteUrl || siteUrl || '',
      googleSiteVerification: normalizeVerificationToken(obj.googleSiteVerification),
      bingSiteVerification: normalizeVerificationToken(obj.bingSiteVerification),
    },
  });
});

exports.patchAdminSettings = asyncHandler(async (req, res) => {
  const siteKey = req.siteKey || 'default';
  const body = req.body || {};
  const patch = { ...body };
  if (patch.googleSiteVerification !== undefined) {
    patch.googleSiteVerification = normalizeVerificationToken(patch.googleSiteVerification);
  }
  if (patch.bingSiteVerification !== undefined) {
    patch.bingSiteVerification = normalizeVerificationToken(patch.bingSiteVerification);
  }
  const doc = await SeoSettings.patchForSite(siteKey, patch);
  const siteUrl = await resolveSiteUrl(siteKey, doc);
  return res.json({
    success: true,
    data: {
      ...doc.toObject(),
      siteUrl: doc.siteUrl || siteUrl || '',
    },
  });
});

exports.pingSitemap = asyncHandler(async (req, res) => {
  const siteKey = req.siteKey || 'default';
  const doc = await SeoSettings.getForSite(siteKey);
  const siteUrl = await resolveSiteUrl(siteKey, doc);
  if (!siteUrl) {
    return res.status(400).json({ success: false, message: 'Set a canonical site URL before pinging sitemaps.' });
  }
  const sitemapUrl = `${siteUrl}/sitemap.xml`;
  const pingUrls = [`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`];
  if (doc.searchConsole?.autoSubmitSitemap !== false) {
    pingUrls.push(`https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`);
  }
  const results = await Promise.all(
    pingUrls.map(async (url) => {
      try {
        const resp = await axios.get(url, { timeout: 12000, validateStatus: () => true });
        return { url, ok: resp.status >= 200 && resp.status < 400, status: resp.status };
      } catch (err) {
        return { url, ok: false, status: 0, error: err.message };
      }
    }),
  );
  return res.json({ success: true, sitemapUrl, results });
});
