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

async function aggregateBySiteKey(model) {
  return model.aggregate([{ $group: { _id: '$siteKey', n: { $sum: 1 } } }, { $sort: { n: -1, _id: 1 } }]);
}

function printRows(label, rows) {
  console.log(`\n${label}`);
  if (!rows.length) {
    console.log('  (no rows)');
    return;
  }
  rows.forEach((r) => console.log(`  ${r._id || '(empty)'}: ${r.n}`));
}

async function main() {
  const MONGO_URL = process.env.MONGO_URL;
  if (!MONGO_URL) {
    console.error('Missing MONGO_URL in server/.env');
    process.exit(1);
  }

  const siteKey = String(getArg('siteKey', 'fliqmatch')).trim().toLowerCase();
  await mongoose.connect(MONGO_URL);
  console.log('[check:site-content] connected');

  const [media, curated, votes, suggestions] = await Promise.all([
    aggregateBySiteKey(Media),
    aggregateBySiteKey(CuratedSimilar),
    aggregateBySiteKey(SimilarityVote),
    aggregateBySiteKey(SimilarSuggestion),
  ]);

  printRows('Media by siteKey', media);
  printRows('CuratedSimilar by siteKey', curated);
  printRows('SimilarityVote by siteKey', votes);
  printRows('SimilarSuggestion by siteKey', suggestions);

  const [
    mediaForSite,
    mediaDefault,
    curatedForSite,
    curatedDefault,
    votesForSite,
    suggestionsForSite,
  ] = await Promise.all([
    Media.countDocuments({ siteKey }),
    Media.countDocuments({ siteKey: 'default' }),
    CuratedSimilar.countDocuments({ siteKey }),
    CuratedSimilar.countDocuments({ siteKey: 'default' }),
    SimilarityVote.countDocuments({ siteKey }),
    SimilarSuggestion.countDocuments({ siteKey }),
  ]);

  console.log('\nSummary');
  console.log('-------');
  console.log(`Target site "${siteKey}": media=${mediaForSite}, curated=${curatedForSite}, votes=${votesForSite}, suggestions=${suggestionsForSite}`);
  console.log(`Default site: media=${mediaDefault}, curated=${curatedDefault}`);

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('[check:site-content] failed:', err?.message || err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
