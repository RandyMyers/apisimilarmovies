/* eslint-disable no-console */
/**
 * Align the `genres` collection indexes with models/Genre.js.
 * Drops legacy indexes (e.g. tmdbKind / tmdbGenreId) that no longer exist on the schema,
 * and creates the unique compound index on (siteKey, slug).
 *
 * Usage (from similarmovies/server):
 *   npm run sync:genre-indexes
 *
 * Requires: MONGO_URL in .env (same as app.js)
 */
require('dotenv').config();
const mongoose = require('mongoose');

const Genre = require('../models/Genre');

function maskUrl(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return String(url || '').replace(/:[^:@]+@/, ':***@');
  }
}

async function main() {
  const MONGO_URL = process.env.MONGO_URL;
  if (!MONGO_URL) {
    console.error('Missing MONGO_URL in similarmovies/server/.env');
    process.exit(1);
  }

  console.log('Mongo URL (masked):', maskUrl(MONGO_URL));
  await mongoose.connect(MONGO_URL);
  console.log('Connected.\n');

  const before = await Genre.collection.indexes();
  console.log(`Indexes before sync: ${before.length}`);
  before.forEach((ix) => console.log('  -', ix.name, JSON.stringify(ix.key)));

  console.log('\nRunning Genre.syncIndexes() …');
  try {
    await Genre.syncIndexes();
  } catch (err) {
    console.error('\n[syncIndexes] failed:', err.message);
    if (err.code === 11000) {
      console.error(
        'Hint: duplicate (siteKey, slug) in data — fix or remove duplicate documents, then re-run.',
      );
    }
    await mongoose.disconnect();
    process.exit(1);
  }

  const after = await Genre.collection.indexes();
  console.log(`\nIndexes after sync: ${after.length}`);
  after.forEach((ix) => console.log('  -', ix.name, JSON.stringify(ix.key), ix.unique ? '(unique)' : ''));

  const hasCompound = after.some(
    (ix) =>
      ix.key &&
      Object.keys(ix.key).length === 2 &&
      ix.key.siteKey === 1 &&
      ix.key.slug === 1 &&
      ix.unique,
  );
  if (!hasCompound) {
    console.warn('\n⚠ Expected unique index on { siteKey: 1, slug: 1 } not found — check model.');
  } else {
    console.log('\n✓ Unique (siteKey + slug) index is present.');
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
