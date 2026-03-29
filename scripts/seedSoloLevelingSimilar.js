/* eslint-disable no-console */
/**
 * Upsert Media rows (anime_tv) + CuratedSimilar links from Solo Leveling → listed anime TV shows.
 *
 * Prerequisites:
 *   - similarmovies/server/.env with MONGO_URL and TMDB_API_KEY
 *   - Optional: SITE_KEY (default: default)
 *
 * Usage (from similarmovies/server):
 *   node scripts/seedSoloLevelingSimilar.js
 *   node scripts/seedSoloLevelingSimilar.js --dry-run
 *
 * Re-run safe: uses upserts; curated rows updated by unique key.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const Media = require('../models/Media');
const CuratedSimilar = require('../models/CuratedSimilar');
const tmdbService = require('../services/tmdbService');

const SITE_KEY = String(process.env.SITE_KEY || process.env.REACT_APP_SITE_KEY || 'default')
  .trim()
  .toLowerCase();

/** Solo Leveling (anime) — verify: https://www.themoviedb.org/tv/127532 */
const SOLO_LEVELING_TV_ID = 127532;

/**
 * TMDB TV IDs — “similar to Solo Leveling” (all TV; app category `anime_tv`).
 * Sourced from themoviedb.org TV URLs (verified Feb 2026). If a show moves ID, edit here.
 */
const SIMILAR_TV_IDS = [
  // Category 1 – Core four
  { tmdbTvId: 83095, note: 'The Rising of the Shield Hero' },
  { tmdbTvId: 86034, note: 'Arifureta: From Commonplace to World’s Strongest' },
  { tmdbTvId: 97860, note: 'Tower of God' },
  { tmdbTvId: 64196, note: 'Overlord' },
  // Category 2 – Guilds & ranks
  { tmdbTvId: 46298, note: 'Hunter x Hunter (2011)' },
  { tmdbTvId: 95479, note: 'Jujutsu Kaisen' },
  { tmdbTvId: 62745, note: 'Is It Wrong to Try to Pick Up Girls in a Dungeon?' },
  { tmdbTvId: 250598, note: 'The Ossan Newbie Adventurer…' },
  { tmdbTvId: 157842, note: 'Black Summoner' },
  // Category 3 – Underdog
  { tmdbTvId: 245285, note: 'Failure Frame' },
  { tmdbTvId: 197848, note: 'The Unwanted Undead Adventurer' },
  { tmdbTvId: 100825, note: 'Suppose a Kid From the Last Dungeon Boonies…' },
  { tmdbTvId: 35935, note: 'Berserk (1997)' },
  // Category 4 – Banished / party
  { tmdbTvId: 285166, note: 'Jack-of-All-Trades, Party of None' },
  { tmdbTvId: 206324, note: "Chillin' in My 30s After Getting Fired From the Demon King's Army" },
  { tmdbTvId: 131365, note: 'The Wrong Way to Use Healing Magic' },
  // Category 5 – Isekai / game mechanics
  { tmdbTvId: 94664, note: 'Mushoku Tensei: Jobless Reincarnation' },
  { tmdbTvId: 82684, note: 'That Time I Got Reincarnated as a Slime' },
  { tmdbTvId: 99618, note: "So I'm a Spider, So What?" },
  { tmdbTvId: 123528, note: 'Skeleton Knight in Another World' },
  // Category 6 – Dungeon / survival
  { tmdbTvId: 65369, note: 'Grimgar of Fantasy and Ash' },
  { tmdbTvId: 45782, note: 'Sword Art Online' },
  { tmdbTvId: 60846, note: 'Log Horizon' },
  { tmdbTvId: 205050, note: 'Shangri-La Frontier' },
];

function getArg(name) {
  const prefix = `--${name}`;
  return process.argv.includes(prefix);
}

async function fetchTvMeta(tvId) {
  const d = await tmdbService.getTVDetails(tvId, 'en-US');
  const name = d.name || d.original_name || `#${tvId}`;
  const posterPath = d.poster_path ? String(d.poster_path) : '';
  return { name, posterPath };
}

async function upsertAnimeTvMedia(siteKey, tmdbTvId, dryRun) {
  const meta = await fetchTvMeta(tmdbTvId);
  const update = {
    siteKey,
    category: 'anime_tv',
    tmdbKind: 'tv',
    tmdbMovieId: null,
    tmdbTvId,
    displayName: meta.name,
    posterPath: meta.posterPath,
    availableRegions: [],
    genreSlugs: [],
  };

  if (dryRun) {
    console.log(`  [dry-run] Media anime_tv tv=${tmdbTvId} → "${meta.name}"`);
    return { id: null, displayName: meta.name, posterPath: meta.posterPath };
  }

  const doc = await Media.findOneAndUpdate(
    { siteKey, category: 'anime_tv', tmdbTvId },
    { $set: update },
    { upsert: true, new: true },
  );
  return {
    id: doc._id,
    displayName: doc.displayName,
    posterPath: doc.posterPath || meta.posterPath,
  };
}

async function upsertCurated(siteKey, baseTmdbId, similarTmdbId, sortOrder, displayName, posterPath, dryRun) {
  if (similarTmdbId === baseTmdbId) return;

  const payload = {
    siteKey,
    baseCategory: 'anime_tv',
    baseTmdbId,
    similarCategory: 'anime_tv',
    similarTmdbKind: 'tv',
    similarTmdbId,
    displayName: displayName || `#${similarTmdbId}`,
    posterPath: posterPath || '',
    genreSlugs: [],
    sortOrder,
  };

  if (dryRun) {
    console.log(`  [dry-run] Curated ${baseTmdbId} → ${similarTmdbId} (${displayName}) order=${sortOrder}`);
    return;
  }

  await CuratedSimilar.findOneAndUpdate(
    {
      siteKey,
      baseCategory: 'anime_tv',
      baseTmdbId,
      similarTmdbKind: 'tv',
      similarTmdbId,
    },
    { $set: payload },
    { upsert: true, new: true },
  );
}

async function main() {
  const dryRun = getArg('dry-run');
  const MONGO_URL = process.env.MONGO_URL;
  if (!MONGO_URL) {
    console.error('Missing MONGO_URL in .env');
    process.exit(1);
  }
  if (!process.env.TMDB_API_KEY) {
    console.error('Missing TMDB_API_KEY in .env (needed to load TV names/posters).');
    process.exit(1);
  }

  console.log(`SITE_KEY=${SITE_KEY}`);
  console.log(`Solo Leveling base TMDB TV id=${SOLO_LEVELING_TV_ID}`);
  console.log(dryRun ? 'DRY RUN — no DB writes\n' : '');

  await mongoose.connect(MONGO_URL);

  const allTvIds = [SOLO_LEVELING_TV_ID, ...SIMILAR_TV_IDS.map((x) => x.tmdbTvId)];
  const unique = [...new Set(allTvIds)];
  if (unique.length !== allTvIds.length) {
    console.warn('Warning: duplicate TMDB TV ids in list — check SIMILAR_TV_IDS.');
  }

  console.log('Upserting Media (anime_tv)…');
  const mediaByTvId = new Map();
  for (const tvId of unique) {
    try {
      const m = await upsertAnimeTvMedia(SITE_KEY, tvId, dryRun);
      mediaByTvId.set(tvId, m);
    } catch (e) {
      console.error(`  FAIL Media tv=${tvId}:`, e.message || e);
    }
  }

  console.log('Upserting CuratedSimilar (Solo Leveling → each similar)…');
  let order = 0;
  for (const row of SIMILAR_TV_IDS) {
    const sid = row.tmdbTvId;
    const meta = mediaByTvId.get(sid) || {};
    try {
      await upsertCurated(
        SITE_KEY,
        SOLO_LEVELING_TV_ID,
        sid,
        order,
        meta.displayName,
        meta.posterPath,
        dryRun,
      );
      order += 1;
    } catch (e) {
      if (e.code === 11000) {
        console.warn(`  skip duplicate curated ${SOLO_LEVELING_TV_ID} → ${sid}`);
      } else {
        console.error(`  FAIL curated → ${sid}:`, e.message || e);
      }
    }
  }

  if (!dryRun) {
    const nCurated = await CuratedSimilar.countDocuments({
      siteKey: SITE_KEY,
      baseCategory: 'anime_tv',
      baseTmdbId: SOLO_LEVELING_TV_ID,
    });
    console.log(`\nDone. Curated rows for this base: ${nCurated}`);
  }

  await mongoose.disconnect();
  console.log('Disconnected.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
