const crypto = require('crypto');
const AdCampaign = require('../models/AdCampaign');
const AdEvent = require('../models/AdEvent');
const { asyncHandler } = require('../middleware/errorHandler');
const mongoose = require('mongoose');

function normalizeEventIp(ip) {
  const raw = (ip || '').toString().trim().slice(0, 80);
  if (process.env.AD_EVENT_HASH_IP !== '1') return raw;
  const salt = (process.env.AD_EVENT_IP_SALT || '').trim();
  if (!salt || !raw) return raw;
  return crypto.createHash('sha256').update(`${salt}:${raw}`).digest('hex').slice(0, 64);
}

const hasMatch = (ruleValues = [], value = '') => {
  if (!Array.isArray(ruleValues) || ruleValues.length === 0) return true;
  if (!value) return false;
  return ruleValues.includes(String(value).trim().toLowerCase());
};

const DEBUG_ADS = process.env.DEBUG_ADS === '1';

function targetingCheckSummary(targeting, { page, placement, domain, locale, country, device }) {
  const t = targeting || {};
  return {
    pages: hasMatch(t.pages, page),
    placements: hasMatch(t.placements, placement),
    domains: hasMatch(t.domains, domain),
    locales: hasMatch(t.locales, locale),
    countries: hasMatch(t.countries, country),
    devices: hasMatch(t.devices, device),
  };
}

const pickCreative = (creatives = []) => {
  if (!Array.isArray(creatives) || creatives.length === 0) return null;
  const row = creatives.find((c) => c.isDefault) || creatives[0] || null;
  if (!row) return null;
  const ref = row.creative;
  if (ref && typeof ref === 'object' && ref.destinationUrl) {
    return {
      _id: ref._id,
      type: ref.type,
      title: ref.title,
      description: ref.description,
      imageUrl: ref.imageUrl,
      imageWidth: ref.imageWidth,
      imageHeight: ref.imageHeight,
      ctaLabel: ref.ctaLabel,
      destinationUrl: ref.destinationUrl,
      isDefault: row.isDefault,
    };
  }
  if (row.destinationUrl) return row;
  return null;
};

exports.getPlacements = asyncHandler(async (req, res) => {
  const websiteId = req.adWebsiteId;
  const page = String(req.query.page || '').trim().toLowerCase();
  const placement = String(req.query.placement || '').trim().toLowerCase();
  const domain = String(req.query.domain || '').trim().toLowerCase();
  const locale = String(req.query.locale || req.adLocale || '').trim().toLowerCase();
  const device = String(req.query.device || '').trim().toLowerCase();
  let country = String(req.query.country || req.adCountryHeader || '').trim().toLowerCase();
  if (!country || !/^[a-z]{2}$/.test(country)) {
    const cf = String(req.headers['cf-ipcountry'] || req.headers['CF-IPCountry'] || '').trim().toLowerCase();
    if (/^[a-z]{2}$/.test(cf)) country = cf;
    else country = '';
  }
  const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 6));
  const now = new Date();

  const baseFilter = {
    website: websiteId,
    status: 'active',
    $and: [
      { $or: [{ startAt: null }, { startAt: { $lte: now } }] },
      { $or: [{ endAt: null }, { endAt: { $gte: now } }] },
    ],
  };

  const campaigns = await AdCampaign.find(baseFilter)
    .populate({ path: 'creatives.creative', model: 'AdCreative' })
    .sort({ priority: -1, weight: -1, createdAt: -1 })
    .limit(100)
    .lean();

  const data = campaigns
    .filter((campaign) => {
      const targeting = campaign.targeting || {};
      return (
        hasMatch(targeting.pages, page) &&
        hasMatch(targeting.placements, placement) &&
        hasMatch(targeting.domains, domain) &&
        hasMatch(targeting.locales, locale) &&
        hasMatch(targeting.countries, country) &&
        hasMatch(targeting.devices, device)
      );
    })
    .slice(0, limit)
    .map((campaign) => ({
      _id: campaign._id,
      name: campaign.name,
      advertiserName: campaign.advertiserName,
      priority: campaign.priority,
      weight: campaign.weight,
      creative: pickCreative(campaign.creatives),
      targeting: campaign.targeting || {},
    }))
    .filter((x) => x.creative && x.creative.destinationUrl);

  if (DEBUG_ADS) {
    const siteKey = String(req.siteKey || '').trim();
    console.log('[DEBUG_ADS] GET /placements context', {
      siteKey,
      websiteId: String(websiteId),
      query: { page, placement, domain, locale, device, country, limit },
    });
    console.log('[DEBUG_ADS] campaigns from DB (active + schedule):', campaigns.length);
    campaigns.slice(0, 30).forEach((c) => {
      const checks = targetingCheckSummary(c.targeting, { page, placement, domain, locale, country, device });
      const targetingOk = Object.values(checks).every(Boolean);
      const cr = pickCreative(c.creatives);
      const crOk = !!(cr && cr.destinationUrl);
      console.log('[DEBUG_ADS] campaign row', {
        id: String(c._id),
        name: c.name,
        status: c.status,
        priority: c.priority,
        targeting: c.targeting || {},
        targetingChecks: checks,
        targetingOk,
        creativesLength: Array.isArray(c.creatives) ? c.creatives.length : 0,
        creativePopulated: !!(c.creatives && c.creatives[0] && typeof c.creatives[0].creative === 'object'),
        creativeOk: crOk,
        inResponse: targetingOk && crOk,
      });
    });
    if (campaigns.length > 30) {
      console.log('[DEBUG_ADS] … truncated campaign logs (max 30)');
    }
    console.log('[DEBUG_ADS] placements returned after filter:', data.length);
  }

  res.status(200).json({ success: true, data });
});

const createEvent = (eventType) =>
  asyncHandler(async (req, res) => {
    const websiteId = req.adWebsiteId;
    const campaign = String(req.body.campaign || '').trim();
    if (!campaign || !mongoose.Types.ObjectId.isValid(campaign)) {
      return res.status(400).json({ success: false, message: 'valid campaign id is required' });
    }
    const page = String(req.body.page || '').trim().toLowerCase();
    const placement = String(req.body.placement || '').trim().toLowerCase();
    const domain = String(req.body.domain || '').trim().toLowerCase();
    const locale = String(req.body.locale || req.adLocale || '').trim().toLowerCase();
    const rawBodyCountry = String(req.body.country || '').trim().toLowerCase();
    if (rawBodyCountry && !/^[a-z]{2}$/.test(rawBodyCountry)) {
      return res.status(400).json({ success: false, message: 'country must be a 2-letter ISO code' });
    }
    let country = rawBodyCountry && /^[a-z]{2}$/.test(rawBodyCountry) ? rawBodyCountry : '';
    if (!country) country = String(req.adCountryHeader || '').trim().toLowerCase();
    if (!country || !/^[a-z]{2}$/.test(country)) {
      const cf = String(req.headers['cf-ipcountry'] || '').trim().toLowerCase();
      if (/^[a-z]{2}$/.test(cf)) country = cf;
      else country = '';
    }
    const device = String(req.body.device || '').trim().toLowerCase();
    const ip = normalizeEventIp((req.ip || req.connection?.remoteAddress || '').toString().trim().slice(0, 80));
    const userAgent = (req.get && req.get('User-Agent')) || '';
    const ua = String(userAgent).trim().slice(0, 512);
    const rawKey = req.body.eventKey != null ? String(req.body.eventKey).trim().slice(0, 256) : '';
    const eventKey = rawKey || null;
    if (!page || !placement) {
      return res.status(400).json({ success: false, message: 'page and placement are required' });
    }
    if (device && !['desktop', 'mobile', 'tablet'].includes(device)) {
      return res.status(400).json({ success: false, message: 'device must be desktop, mobile, or tablet' });
    }
    const doc = {
      website: websiteId,
      campaign,
      eventType,
      page,
      placement,
      domain,
      locale,
      country,
      device,
      ip,
      userAgent: ua,
      ...(eventKey ? { eventKey } : {}),
    };

    try {
      await AdEvent.create(doc);
      return res.status(201).json({ success: true });
    } catch (err) {
      if (eventKey && err && err.code === 11000) {
        return res.status(200).json({ success: true, duplicate: true });
      }
      throw err;
    }
  });

exports.trackImpression = createEvent('impression');
exports.trackClick = createEvent('click');
