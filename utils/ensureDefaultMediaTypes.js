const MediaType = require('../models/MediaType');

async function ensureDefaultMediaTypes() {
  // Legacy cleanup:
  // Older schemas used `key` and created a unique `key_1` index.
  // With slug-only schema, that stale index can trigger:
  // E11000 duplicate key error ... index: key_1 dup key: { key: null }
  try {
    const indexes = await MediaType.collection.indexes();
    const legacyKeyIndex = indexes.find((idx) => idx && idx.key && Object.prototype.hasOwnProperty.call(idx.key, 'key'));
    if (legacyKeyIndex?.name) {
      await MediaType.collection.dropIndex(legacyKeyIndex.name);
      // eslint-disable-next-line no-console
      console.log(`[ensureDefaultMediaTypes] Dropped legacy index: ${legacyKeyIndex.name}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[ensureDefaultMediaTypes] Could not inspect/drop legacy key index:', err?.message || err);
  }

  const defaults = [
    { slug: 'movie', label: 'Movie', tmdbKind: 'movie', sortOrder: 10, isActive: true },
    { slug: 'tv', label: 'TV series', tmdbKind: 'tv', sortOrder: 20, isActive: true },
    { slug: 'anime_movie', label: 'Anime movie', tmdbKind: 'movie', sortOrder: 30, isActive: true },
    { slug: 'anime_tv', label: 'Anime TV series', tmdbKind: 'tv', sortOrder: 40, isActive: true },
  ];

  // Create missing types; update known defaults.
  await Promise.all(
    defaults.map(async (d) => {
      await MediaType.findOneAndUpdate(
        { slug: d.slug },
        { $set: d },
        { upsert: true, new: true },
      );
    }),
  );
}

module.exports = { ensureDefaultMediaTypes };

