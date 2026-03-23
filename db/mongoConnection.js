/**
 * MongoDB connection for long-running Node and Vercel serverless.
 * - Caches the connection across warm invocations.
 * - Awaits before any route that uses Mongoose (avoids "buffering timed out").
 */
const mongoose = require('mongoose');

/** @type {Promise<typeof mongoose> | null} */
let connectingPromise = null;

function getGlobalCache() {
  if (typeof globalThis !== 'undefined') {
    if (!globalThis.__mongoose_similarmovies) {
      globalThis.__mongoose_similarmovies = { listenersAttached: false };
    }
    return globalThis.__mongoose_similarmovies;
  }
  return { listenersAttached: false };
}

function parseIntEnv(name, fallback) {
  const v = process.env[name];
  if (v == null || v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function getConnectionOptions() {
  return {
    serverSelectionTimeoutMS: parseIntEnv('MONGODB_SERVER_SELECTION_TIMEOUT', 10000),
    socketTimeoutMS: parseIntEnv('MONGODB_SOCKET_TIMEOUT', 45000),
    connectTimeoutMS: parseIntEnv('MONGODB_CONNECT_TIMEOUT', 10000),
    maxPoolSize: parseIntEnv('MONGODB_MAX_POOL_SIZE', 1),
    minPoolSize: parseIntEnv('MONGODB_MIN_POOL_SIZE', 0),
    maxIdleTimeMS: parseIntEnv('MONGODB_MAX_IDLE_TIME_MS', 30000),
    heartbeatFrequencyMS: 10000,
    retryWrites: true,
    retryReads: true,
    family: 4,
  };
}

function attachConnectionListenersOnce() {
  const g = getGlobalCache();
  if (g.listenersAttached) return;
  g.listenersAttached = true;

  mongoose.connection.on('error', (err) => {
    console.error('[similarmovies] MongoDB connection error:', err.message);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[similarmovies] MongoDB disconnected');
  });
}

/**
 * Ensure Mongoose is connected. Safe to call on every request (idempotent).
 * @returns {Promise<void>}
 */
async function connectToDatabase() {
  const MONGO_URL = process.env.MONGO_URL;
  if (!MONGO_URL) {
    console.warn('[similarmovies] MONGO_URL not set; DB-backed routes will be skipped where guarded.');
    return;
  }

  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (!connectingPromise) {
    attachConnectionListenersOnce();
    connectingPromise = mongoose
      .connect(MONGO_URL, getConnectionOptions())
      .then(() => {
        console.log('[similarmovies] Connected to MongoDB');
        return mongoose;
      })
      .catch((err) => {
        console.error('[similarmovies] MongoDB connection error:', err.message);
        throw err;
      })
      .finally(() => {
        connectingPromise = null;
      });
  }

  await connectingPromise;
}

/**
 * Run a function with an ensured connection; retry on transient errors.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ maxRetries?: number }} [opts]
 * @returns {Promise<T>}
 */
async function withDbConnection(fn, opts = {}) {
  const maxRetries = opts.maxRetries ?? 2;
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await connectToDatabase();
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || err || '');
      const retryable =
        msg.includes('buffering timed out') ||
        msg.includes('Pool was force closed') ||
        msg.includes('connection') ||
        err?.name === 'MongoServerSelectionError' ||
        err?.name === 'MongoNetworkError';

      if (!retryable || attempt === maxRetries) {
        throw err;
      }
      console.warn(`[similarmovies] DB operation retry ${attempt}/${maxRetries}:`, msg);
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  throw lastErr;
}

module.exports = {
  connectToDatabase,
  withDbConnection,
};
