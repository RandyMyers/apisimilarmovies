/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

const Media = require('../models/Media');
const CuratedSimilar = require('../models/CuratedSimilar');
const SimilarityVote = require('../models/SimilarityVote');
const SimilarSuggestion = require('../models/SimilarSuggestion');

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  if (!found) return fallback;
  return String(found.slice(prefix.length));
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function normalizeSiteKey(v, fallback) {
  const x = String(v || fallback || '').trim().toLowerCase();
  return x || fallback;
}

async function migrateCollection({
  model,
  label,
  fromSiteKey,
  toSiteKey,
  uniqueSelectorForTarget,
  apply,
}) {
  const baseFilter = { siteKey: fromSiteKey };
  const totalFrom = await model.countDocuments(baseFilter);
  if (!totalFrom) {
    console.log(`[${label}] no documents with siteKey="${fromSiteKey}"`);
    return { scanned: 0, moved: 0, skippedConflict: 0, unchanged: 0 };
  }

  console.log(`\n[${label}] scanning ${totalFrom} docs from "${fromSiteKey}"...`);
  const cursor = model.find(baseFilter).lean().cursor();
  let scanned = 0;
  let moved = 0;
  let skippedConflict = 0;
  let unchanged = 0;

  for await (const doc of cursor) {
    scanned += 1;
    const targetQuery = uniqueSelectorForTarget(doc, toSiteKey);
    const existsInTarget = await model.exists(targetQuery);
    if (existsInTarget) {
      skippedConflict += 1;
      continue;
    }

    if (!apply) {
      moved += 1;
      continue;
    }

    const res = await model.updateOne(
      { _id: doc._id, siteKey: fromSiteKey },
      { $set: { siteKey: toSiteKey } },
    );
    if (res.modifiedCount > 0) moved += 1;
    else unchanged += 1;
  }

  console.log(
    `[${label}] ${apply ? 'updated' : 'would update'}=${moved}, conflicts skipped=${skippedConflict}, unchanged=${unchanged}`,
  );
  return { scanned, moved, skippedConflict, unchanged };
}

async function main() {
  const MONGO_URL = process.env.MONGO_URL;
  if (!MONGO_URL) {
    console.error('Missing MONGO_URL in server/.env');
    process.exit(1);
  }

  const fromSiteKey = normalizeSiteKey(getArg('from', 'default'), 'default');
  const toSiteKey = normalizeSiteKey(getArg('to', 'fliqmatch'), 'fliqmatch');
  const apply = hasFlag('apply');
  const includeSignals = hasFlag('includeSignals');

  if (fromSiteKey === toSiteKey) {
    console.error(`--from and --to cannot be the same ("${fromSiteKey}")`);
    process.exit(1);
  }

  console.log('Site-key content migration');
  console.log('==========================');
  console.log('from:', fromSiteKey);
  console.log('to:', toSiteKey);
  console.log('mode:', apply ? 'APPLY (writes enabled)' : 'DRY RUN (no changes)');
  console.log(
    'collections:',
    includeSignals
      ? 'Media, CuratedSimilar, SimilarityVote, SimilarSuggestion'
      : 'Media, CuratedSimilar',
  );

  await mongoose.connect(MONGO_URL);
  console.log('Connected to MongoDB');

  const jobs = [
    {
      model: Media,
      label: 'Media',
      uniqueSelectorForTarget: (doc, targetKey) => ({
        siteKey: targetKey,
        category: doc.category,
        ...(Number.isFinite(doc.tmdbMovieId) ? { tmdbMovieId: doc.tmdbMovieId } : {}),
        ...(Number.isFinite(doc.tmdbTvId) ? { tmdbTvId: doc.tmdbTvId } : {}),
      }),
    },
    {
      model: CuratedSimilar,
      label: 'CuratedSimilar',
      uniqueSelectorForTarget: (doc, targetKey) => ({
        siteKey: targetKey,
        baseCategory: doc.baseCategory,
        baseTmdbId: doc.baseTmdbId,
        similarTmdbKind: doc.similarTmdbKind,
        similarTmdbId: doc.similarTmdbId,
      }),
    },
  ];

  if (includeSignals) {
    jobs.push(
      {
        model: SimilarityVote,
        label: 'SimilarityVote',
        uniqueSelectorForTarget: (doc, targetKey) => ({
          siteKey: targetKey,
          baseCategory: doc.baseCategory,
          baseId: doc.baseId,
          alternativeCategory: doc.alternativeCategory,
          alternativeId: doc.alternativeId,
          ip: doc.ip || '',
          createdAt: doc.createdAt,
        }),
      },
      {
        model: SimilarSuggestion,
        label: 'SimilarSuggestion',
        uniqueSelectorForTarget: (doc, targetKey) => ({
          siteKey: targetKey,
          baseCategory: doc.baseCategory,
          baseTmdbId: doc.baseTmdbId,
          similarTmdbKind: doc.similarTmdbKind,
          similarTmdbId: doc.similarTmdbId,
          createdAt: doc.createdAt,
        }),
      },
    );
  }

  const summary = [];
  for (const j of jobs) {
    const out = await migrateCollection({
      model: j.model,
      label: j.label,
      fromSiteKey,
      toSiteKey,
      uniqueSelectorForTarget: j.uniqueSelectorForTarget,
      apply,
    });
    summary.push({ label: j.label, ...out });
  }

  console.log('\nSummary');
  console.log('-------');
  summary.forEach((s) => {
    console.log(
      `${s.label}: scanned=${s.scanned}, ${apply ? 'updated' : 'wouldUpdate'}=${s.moved}, conflicts=${s.skippedConflict}, unchanged=${s.unchanged}`,
    );
  });

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('[migrateSiteKeyContent] failed:', err?.message || err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
