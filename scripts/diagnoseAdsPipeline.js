/* eslint-disable no-console */
/**
 * Diagnose the full ads pipeline: Mongo (Website + campaigns + creatives) and optional live HTTP
 * against the same rules as GET /api/v1/ads/placements and GET /api/v1/public/site-settings.
 *
 * Public ad routes do NOT use JWT; they never return 401. A browser "401" on load is often
 * /api/v1/auth/me (expired Simimovies login token), not ads.
 *
 * Usage (from similarmovies/server with MONGO_URL in .env):
 *   npm run diagnose:ads
 *   npm run diagnose:ads -- --siteKey=default
 *   npm run diagnose:ads -- --siteKey=fliqmatch --domain=www.fliqmatch.com --page=home --placement=top-banner
 *   npm run diagnose:ads -- --siteKey=default --apiBase=https://apisimilarmovies.vercel.app --domain=fliqmatch.com
 */
require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');

const Website = require('../models/Website');
const AdCampaign = require('../models/AdCampaign');
// Register ref model for populate('creatives.creative')
require('../models/AdCreative');

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  if (!found) return fallback;
  return String(found.slice(prefix.length));
}

const hasMatch = (ruleValues = [], value = '') => {
  if (!Array.isArray(ruleValues) || ruleValues.length === 0) return true;
  if (!value) return false;
  return ruleValues.includes(String(value).trim().toLowerCase());
};

function pickCreative(creatives = []) {
  if (!Array.isArray(creatives) || creatives.length === 0) return null;
  const row = creatives.find((c) => c.isDefault) || creatives[0] || null;
  if (!row) return null;
  const ref = row.creative;
  if (ref && typeof ref === 'object' && ref.destinationUrl) return ref;
  if (row.destinationUrl) return row;
  return null;
}

function summarizePlacementChecks(targeting, ctx) {
  const t = targeting || {};
  return {
    pages: hasMatch(t.pages, ctx.page),
    placements: hasMatch(t.placements, ctx.placement),
    domains: hasMatch(t.domains, ctx.domain),
    locales: hasMatch(t.locales, ctx.locale),
    countries: hasMatch(t.countries, ctx.country),
    devices: hasMatch(t.devices, ctx.device),
  };
}

async function httpProbe(apiBase, siteKey, query) {
  const base = String(apiBase || '').replace(/\/+$/, '');
  if (!base) return;

  console.log('\n========== Live HTTP (no auth headers) ==========');
  const headers = { 'X-Site': siteKey, Accept: 'application/json' };

  const urls = [
    [`GET ${base}/api/v1/public/site-settings`, `${base}/api/v1/public/site-settings`],
    [
      `GET ${base}/api/v1/ads/placements`,
      `${base}/api/v1/ads/placements`,
      {
        params: {
          page: query.page,
          placement: query.placement,
          domain: query.domain,
          locale: query.locale,
          country: query.country || undefined,
          device: query.device,
          limit: 6,
        },
      },
    ],
  ];

  for (const row of urls) {
    const [label, url, cfg] = row;
    try {
      const res = await axios.get(url, {
        ...cfg,
        headers,
        timeout: 20000,
        validateStatus: () => true,
      });
      const data = res.data;
      const snippet =
        typeof data === 'object' && data !== null
          ? JSON.stringify(data).slice(0, 600)
          : String(data).slice(0, 600);
      console.log(`\n${label}`);
      console.log('  status:', res.status, res.status === 401 ? '← if 401 here, report it (unexpected for these paths)' : '');
      console.log('  body:', snippet.length >= 600 ? `${snippet}…` : snippet);
      if (res.status === 401) {
        console.log('  NOTE: Production middleware should not return 401 for these routes. Check URL/proxy.');
      }
      if (label.includes('site-settings') && res.status === 200) {
        const d = data?.data ?? data;
        console.log('  parsed: adsStaticEnabled=', d?.adsStaticEnabled, 'adsManagedEnabled=', d?.adsManagedEnabled, 'siteKey=', d?.siteKey);
      }
      if (label.includes('placements') && res.status === 200 && Array.isArray(data?.data)) {
        console.log('  placements count:', data.data.length);
      }
    } catch (e) {
      console.log(`\n${label}`);
      console.log('  ERROR:', e.message || e);
    }
  }
}

async function main() {
  const MONGO_URL = process.env.MONGO_URL;
  if (!MONGO_URL) {
    console.error('Missing MONGO_URL in .env');
    process.exit(1);
  }

  const siteKey = String(getArg('siteKey', 'default')).trim().toLowerCase();
  const simulatePage = String(getArg('page', 'home')).trim().toLowerCase();
  const simulatePlacement = String(getArg('placement', 'top-banner')).trim().toLowerCase();
  const simulateDomain = String(getArg('domain', 'localhost')).trim().toLowerCase();
  const simulateLocale = String(getArg('locale', 'en')).trim().toLowerCase();
  const simulateCountry = String(getArg('country', '')).trim().toLowerCase();
  const simulateDevice = String(getArg('device', 'desktop')).trim().toLowerCase();
  const apiBase = String(getArg('apiBase', '')).trim();

  const ctx = {
    page: simulatePage,
    placement: simulatePlacement,
    domain: simulateDomain,
    locale: simulateLocale,
    country: simulateCountry,
    device: simulateDevice,
  };

  console.log('Ads pipeline diagnosis');
  console.log('======================');
  console.log('siteKey:', siteKey);
  console.log('Simulation (must match client query + campaign targeting):', ctx);
  console.log('');
  console.log('Reminder: /api/v1/public/site-settings and /api/v1/ads/* are public (no Bearer token).');
  console.log('A 401 in the browser Network tab is often GET /api/v1/auth/me (stale Simimovies session), not ads.\n');

  await mongoose.connect(MONGO_URL);
  const now = new Date();

  const site = await Website.findOne({ key: siteKey }).lean();
  console.log(`========== Website: key "${siteKey}" ==========`);

  if (!site) {
    const keys = await Website.find().select('key name isActive adsManagedEnabled').sort({ key: 1 }).lean();
    console.log('  NOT FOUND. Existing Website keys in DB:');
    if (!keys.length) console.log('    (none — create Websites in admin)');
    else {
      keys.forEach((w) => {
        console.log(
          `    - key=${w.key} active=${w.isActive !== false} managedAds=${Boolean(w.adsManagedEnabled)} name=${w.name || ''}`,
        );
      });
    }
    console.log('\n  Fix: use --siteKey=<one of the keys above> or set REACT_APP_SITE_KEY to the same key.');
    await mongoose.disconnect();
    if (apiBase) await httpProbe(apiBase, siteKey, ctx);
    process.exit(0);
  }

  console.log('  _id:', String(site._id));
  console.log('  name:', site.name);
  console.log('  isActive:', site.isActive !== false);
  console.log('  adsStaticEnabled:', Boolean(site.adsStaticEnabled));
  console.log('  adsManagedEnabled:', Boolean(site.adsManagedEnabled));

  if (site.isActive === false) {
    console.log('\n  BLOCKER: isActive is false — siteResolver will not set req.site;');
    console.log('    /api/v1/public/site-settings will report adsManagedEnabled=false and requireSiteForAds may fail.');
  }
  if (!site.adsManagedEnabled) {
    console.log('\n  BLOCKER: adsManagedEnabled is false — the Simimovies client will not fetch placements.');
    console.log('    Enable "Managed ads" for this Website in admin → Websites.');
  }

  const byStatus = await AdCampaign.aggregate([
    { $match: { website: site._id } },
    { $group: { _id: '$status', n: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  console.log('\n  Campaign counts by status (this website):');
  if (!byStatus.length) console.log('    (none)');
  else byStatus.forEach((r) => console.log(`    ${r._id}: ${r.n}`));

  const baseFilter = {
    website: site._id,
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

  console.log(`\n  Active + in-schedule campaigns: ${campaigns.length}`);

  let wouldServe = 0;
  for (const c of campaigns) {
    const t = c.targeting || {};
    const checks = summarizePlacementChecks(t, ctx);
    const targetingOk = Object.values(checks).every(Boolean);
    const cr = pickCreative(c.creatives);
    const creativeOk = !!(cr && String(cr.destinationUrl || '').trim());
    const ok = targetingOk && creativeOk;
    if (ok) wouldServe += 1;

    console.log('\n  ---', c.name, `(${String(c._id)})`, '---');
    console.log('    status:', c.status, 'priority:', c.priority, 'weight:', c.weight);
    console.log('    startAt:', c.startAt || null, 'endAt:', c.endAt || null);
    console.log('    targeting:', JSON.stringify(t));
    console.log('    targeting vs simulation:', checks, '=> all pass:', targetingOk);
    if (!targetingOk) {
      console.log('    Hint: empty targeting arrays = match all. Restricted lists must include the simulated values.');
    }
    console.log('    creative ok (populated + destinationUrl):', creativeOk);
    if (!creativeOk) {
      console.log('    BLOCKER: missing populated creative or destinationUrl — API filters this campaign out.');
    }
    console.log('    WOULD_BE_RETURNED_BY_PLACEMENTS_API:', ok);
  }

  console.log('\n========== Summary ==========');
  console.log(`  Campaigns that would match this simulation: ${wouldServe}`);
  if (site.adsManagedEnabled && wouldServe === 0 && campaigns.length > 0) {
    console.log('  Likely issue: targeting (page/placement/domain/locale/country/device) does not match how you test.');
    console.log(`    Try --domain=<exact host you use in browser> (localhost vs production).`);
  }
  if (site.adsManagedEnabled && campaigns.length === 0) {
    console.log('  No active in-window campaigns for this website. Check status=active, dates, and website assignment.');
  }

  await mongoose.disconnect();

  if (apiBase) {
    await httpProbe(apiBase, siteKey, ctx);
  } else {
    console.log('\n(Optional) Re-run with --apiBase=https://your-api-host to hit live site-settings + placements.');
  }

  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
