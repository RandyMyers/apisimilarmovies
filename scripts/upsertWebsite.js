/* eslint-disable no-console */
require('dotenv').config();
const path = require('path');
const mongoose = require('mongoose');

const Website = require('../models/Website');

function getArg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  if (!found) return '';
  return found.slice(prefix.length);
}

function splitCsv(v) {
  return String(v || '')
    .split(',')
    .map((x) => String(x).trim())
    .filter(Boolean);
}

async function main() {
  const MONGO_URL = process.env.MONGO_URL;
  if (!MONGO_URL) {
    console.error('Missing MONGO_URL. Set it in similarmovies/server/.env');
    process.exit(1);
  }

  const domain = (getArg('domain') || 'fliqmatch.com').trim().toLowerCase();
  const key = (getArg('key') || 'default').trim().toLowerCase();
  const name = (getArg('name') || `SimiMovies (${domain})`).trim();

  const defaultRegion = (getArg('defaultRegion') || 'us').trim().toLowerCase();
  const supportedRegions = splitCsv(getArg('supportedRegions') || 'us,gb,au,ie,de,at,es,it,fr,pt,nl,no,fi,dk,se');

  await mongoose.connect(MONGO_URL);
  console.log('[upsertWebsite] connected to MongoDB');

  const doc = await Website.findOneAndUpdate(
    { key },
    {
      key,
      name,
      domain,
      isActive: true,
      defaultRegion,
      supportedRegions,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  console.log('[upsertWebsite] done:', { id: doc._id, key: doc.key, domain: doc.domain, name: doc.name });
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[upsertWebsite] failed:', err?.message || err);
  process.exit(1);
});

