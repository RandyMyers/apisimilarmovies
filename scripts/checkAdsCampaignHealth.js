/* eslint-disable no-console */
/**
 * Verify Website + AdCampaign + AdCreative data against the same rules as GET /api/v1/ads/placements.
 *
 * Usage (from similarmovies/server):
 *   node scripts/checkAdsCampaignHealth.js
 *   node scripts/checkAdsCampaignHealth.js --siteKeys=fliqmatch
 *   node scripts/checkAdsCampaignHealth.js --siteKeys=default,fliqmatch --domain=www.fliqmatch.com --locale=de
 *
 * Requires MONGO_URL in .env
 */
require('dotenv').config();
const mongoose = require('mongoose');

const Website = require('../models/Website');
const AdCampaign = require('../models/AdCampaign');

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

async function main() {
  const MONGO_URL = process.env.MONGO_URL;
  if (!MONGO_URL) {
    console.error('Missing MONGO_URL in .env');
    process.exit(1);
  }

  const siteKeys = getArg('siteKeys', 'default,fliqmatch')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const simulatePage = String(getArg('page', 'home')).trim().toLowerCase();
  const simulatePlacement = String(getArg('placement', 'cards')).trim().toLowerCase();
  const simulateDomain = String(getArg('domain', 'fliqmatch.com')).trim().toLowerCase();
  const simulateLocale = String(getArg('locale', 'en')).trim().toLowerCase();
  const simulateCountry = String(getArg('country', '')).trim().toLowerCase();
  const simulateDevice = String(getArg('device', 'desktop')).trim().toLowerCase();

  console.log('Simulation (must match client query + targeting):');
  console.log({
    page: simulatePage,
    placement: simulatePlacement,
    domain: simulateDomain,
    locale: simulateLocale,
    country: simulateCountry || '(empty — common for / or non-region paths)',
    device: simulateDevice,
  });
  console.log('');

  await mongoose.connect(MONGO_URL);
  const now = new Date();

  for (const key of siteKeys) {
    const site = await Website.findOne({ key }).lean();
    console.log(`========== Website key: "${key}" ==========`);
    if (!site) {
      console.log('  Document: MISSING — API returns 400 for X-Site with this key.');
      console.log('');
      continue;
    }
    console.log('  Document: OK');
    console.log('  _id:', String(site._id));
    console.log('  isActive:', site.isActive);
    console.log('  name:', site.name);
    if (!site.isActive) {
      console.log('  WARNING: isActive is false — requireSiteForAds may skip this site.');
    }

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

    console.log(`  Campaigns matching Mongo filter (active + schedule): ${campaigns.length}`);

    let matchCount = 0;
    for (const c of campaigns) {
      const t = c.targeting || {};
      const targetingOk =
        hasMatch(t.pages, simulatePage) &&
        hasMatch(t.placements, simulatePlacement) &&
        hasMatch(t.domains, simulateDomain) &&
        hasMatch(t.locales, simulateLocale) &&
        hasMatch(t.countries, simulateCountry) &&
        hasMatch(t.devices, simulateDevice);

      const row = Array.isArray(c.creatives) ? c.creatives.find((x) => x.isDefault) || c.creatives[0] : null;
      const ref = row && row.creative;
      const creativeOk = Boolean(
        ref && typeof ref === 'object' && String(ref.destinationUrl || '').trim(),
      );

      const wouldReturn = targetingOk && creativeOk;
      if (wouldReturn) matchCount += 1;

      console.log('');
      console.log(`  --- ${c.name} (${String(c._id)}) ---`);
      console.log('    priority / weight:', c.priority, '/', c.weight);
      console.log('    startAt / endAt:', c.startAt || null, '/', c.endAt || null);
      console.log('    targeting:', JSON.stringify(t, null, 2));
      console.log('    targetingOk (simulation):', targetingOk);
      if (!targetingOk) {
        console.log('    check:', {
          pages: hasMatch(t.pages, simulatePage),
          placements: hasMatch(t.placements, simulatePlacement),
          domains: hasMatch(t.domains, simulateDomain),
          locales: hasMatch(t.locales, simulateLocale),
          countries: hasMatch(t.countries, simulateCountry),
          devices: hasMatch(t.devices, simulateDevice),
        });
      }
      console.log('    creatives count:', Array.isArray(c.creatives) ? c.creatives.length : 0);
      console.log('    creative populated (object):', !!(ref && typeof ref === 'object'));
      const dest = creativeOk ? String(ref.destinationUrl) : '';
      console.log(
        '    destinationUrl:',
        creativeOk ? (dest.length > 90 ? `${dest.slice(0, 90)}…` : dest) : 'MISSING — API drops this campaign',
      );
      console.log('    WOULD_APPEAR_IN_API:', wouldReturn);
    }

    console.log('');
    console.log(`  Summary for "${key}": ${matchCount} campaign(s) would be returned for this simulation.`);
    console.log('');
  }

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
