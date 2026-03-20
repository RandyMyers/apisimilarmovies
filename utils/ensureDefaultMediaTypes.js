const MediaType = require('../models/MediaType');

async function ensureDefaultMediaTypes() {
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

