/* eslint-disable no-console */
/**
 * Inspect Genre documents in MongoDB using the same MONGO_URL as app.js.
 *
 * Usage (from similarmovies/server):
 *   node scripts/checkGenres.js
 *   node scripts/checkGenres.js --slug=fantasy
 *
 * Requires: similarmovies/server/.env with MONGO_URL=...
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

function getArg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  if (!found) return '';
  return found.slice(prefix.length);
}

async function main() {
  const MONGO_URL = process.env.MONGO_URL;
  if (!MONGO_URL) {
    console.error('Missing MONGO_URL. Set it in similarmovies/server/.env (same variable app.js uses).');
    process.exit(1);
  }

  console.log('Mongo URL (password masked):', maskUrl(MONGO_URL));
  await mongoose.connect(MONGO_URL);
  console.log('Connected.\n');

  const slugFilter = (getArg('slug') || '').trim().toLowerCase();

  const indexes = await Genre.collection.indexes().catch(() => []);
  console.log('Collection indexes on genres:');
  console.log(JSON.stringify(indexes, null, 2));
  console.log('');

  const query = slugFilter ? { slug: slugFilter } : {};
  const all = await Genre.find(query).sort({ siteKey: 1, slug: 1 }).lean();

  console.log(`Total Genre documents${slugFilter ? ` matching slug="${slugFilter}"` : ''}: ${all.length}\n`);

  if (!all.length) {
    console.log('No documents. If create still says "slug exists", check:');
    console.log('  1) Admin app points to the SAME API as this server (same DB).');
    console.log('  2) You are not hitting a cached/stale response.');
    await mongoose.disconnect();
    return;
  }

  const rows = all.map((g) => ({
    _id: String(g._id),
    siteKey: g.siteKey ?? '(missing)',
    slug: g.slug,
    name: g.name,
    isActive: g.isActive,
    sortOrder: g.sortOrder,
    updatedAt: g.updatedAt,
  }));

  console.table(rows);

  // Slugs that appear more than once (across siteKeys)
  const bySlug = {};
  for (const g of all) {
    const s = String(g.slug || '').toLowerCase();
    if (!bySlug[s]) bySlug[s] = [];
    bySlug[s].push(g);
  }
  const dupSlugs = Object.entries(bySlug).filter(([, docs]) => docs.length > 1);
  if (dupSlugs.length) {
    console.log('\n⚠ Same slug appears multiple times (different siteKey or duplicates):');
    for (const [slug, docs] of dupSlugs) {
      console.log(`  ${slug}: ${docs.map((d) => `${d.siteKey}(${d._id})`).join(', ')}`);
    }
  }

  // What admin UI lists (GET /api/v1/admin/genres default)
  const globalOnly = all.filter((g) => String(g.siteKey || '').toLowerCase() === 'global');
  const globalActive = globalOnly.filter((g) => g.isActive !== false);
  console.log('\n--- Admin list (matches API filter siteKey=global) ---');
  console.log(`  global total: ${globalOnly.length}, active (isActive=true): ${globalActive.length}`);

  const hiddenInactive = globalOnly.filter((g) => g.isActive === false);
  if (hiddenInactive.length) {
    console.log('\n⚠ Inactive global genres (hidden if "Show inactive" is OFF in admin):');
    console.table(
      hiddenInactive.map((g) => ({
        slug: g.slug,
        name: g.name,
        isActive: g.isActive,
        _id: String(g._id),
      })),
    );
  }

  const nonGlobal = all.filter((g) => String(g.siteKey || '').toLowerCase() !== 'global');
  if (nonGlobal.length) {
    console.log('\n⚠ Non-global siteKey rows (admin list only shows siteKey=global):');
    console.table(
      nonGlobal.map((g) => ({
        siteKey: g.siteKey,
        slug: g.slug,
        name: g.name,
        _id: String(g._id),
      })),
    );
  }

  console.log('\nDone. Disconnecting.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
