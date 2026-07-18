const mongoose = require('mongoose');
const TmdbCache = require('../models/TmdbCache');

async function getCached(key) {
  if (mongoose.connection.readyState !== 1) return null;
  try {
    const doc = await TmdbCache.findOne({ key, expiresAt: { $gt: new Date() } }).lean();
    return doc?.payload ?? null;
  } catch {
    return null;
  }
}

async function setCached(key, payload, ttlMs = 6 * 60 * 60 * 1000) {
  if (mongoose.connection.readyState !== 1) return;
  try {
    const expiresAt = new Date(Date.now() + ttlMs);
    await TmdbCache.findOneAndUpdate(
      { key },
      { key, payload, expiresAt },
      { upsert: true, new: true },
    );
  } catch {
    /* cache write is best-effort */
  }
}

module.exports = { getCached, setCached };
