require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const { connectToDatabase } = require('./db/mongoConnection');
const { writeLimiter, voteLimiter } = require('./middleware/rateLimiters');
const { errorHandler } = require('./middleware/errorHandler');
const { siteResolver } = require('./middleware/siteResolver');
const { authenticateAdmin, authorizeRoles } = require('./middleware/adminAuth');

const healthRoutes = require('./routes/healthRoutes');
const searchRoutes = require('./routes/searchRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const similarityVoteRoutes = require('./routes/similarityVoteRoutes');
const sitemapDataRoutes = require('./routes/sitemapDataRoutes');
const catalogRoutes = require('./routes/catalogRoutes');
const mediaDetailSeoRoutes = require('./routes/mediaDetailSeoRoutes');
const genreRoutes = require('./routes/genreRoutes');
const publicGenreRoutes = require('./routes/publicGenreRoutes');
const adminMediaRoutes = require('./routes/adminMediaRoutes');
const mediaPublicExtraRoutes = require('./routes/mediaPublicExtraRoutes');
const curatedAdminRoutes = require('./routes/curatedAdminRoutes');
const websiteRoutes = require('./routes/websiteRoutes');
const similarityVoteAdminRoutes = require('./routes/similarityVoteAdminRoutes');
const adminAuditRoutes = require('./routes/adminAuditRoutes');
const adminAuthRoutes = require('./routes/adminAuthRoutes');
const mediaTypeRoutes = require('./routes/mediaTypeRoutes');
const adminUserRoutes = require('./routes/adminUserRoutes');
const userAuthRoutes = require('./routes/userAuthRoutes');
const userPublicRoutes = require('./routes/userPublicRoutes');
const adRoutes = require('./routes/adRoutes');
const adminAdCampaignRoutes = require('./routes/adminAdCampaignRoutes');
const adminAdCreativeRoutes = require('./routes/adminAdCreativeRoutes');
const adminAdAnalyticsRoutes = require('./routes/adminAdAnalyticsRoutes');
const adminAdMediaRoutes = require('./routes/adminAdMediaRoutes');
const { requireSiteForAds } = require('./middleware/requireSiteForAds');
const { parseAdContext } = require('./middleware/parseAdContext');
const publicSiteRoutes = require('./routes/publicSiteRoutes');
const { startDailyRollupScheduler } = require('./services/adDailyRollupService');

const app = express();

/** Ensure Mongo is ready before any handler that uses Mongoose (required for Vercel serverless). */
async function ensureMongoConnection(req, res, next) {
  try {
    await connectToDatabase();
    next();
  } catch (err) {
    console.error('[similarmovies] Database connection failed:', err.message);
    return res.status(503).json({
      error: 'Database Unavailable',
      message: 'Service temporarily unavailable. Please try again.',
      timestamp: new Date().toISOString(),
    });
  }
}

// Basic middleware
app.set('trust proxy', 1);
const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://teal-paletas-702712.netlify.app',
  'https://transcendent-entremet-8bcd5c.netlify.app',
  'https://fliqmatch.com',
  'https://www.fliqmatch.com',
  ...(process.env.CORS_ALLOWED_ORIGINS
    ? String(process.env.CORS_ALLOWED_ORIGINS)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    : []),
]);
app.use(
  cors({
    origin(origin, cb) {
      // Allow non-browser clients (no Origin header) and configured browser origins.
      if (!origin || allowedOrigins.has(origin)) return cb(null, true);
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Site',
      'X-Client-Host',
      'X-Locale',
      'X-Country-Code',
    ],
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

// Connect before routes / siteResolver (Website.findOne) — avoids Mongoose buffering timeouts on Vercel
app.use(ensureMongoConnection);

// Multi-site: X-Site header + when X-Site is "default", match Website.domain to Origin / X-Client-Host (SPA on custom domain → API elsewhere)
app.use(siteResolver);

// Public per-site settings (no auth; uses X-Site → Website)
app.use('/api/v1/public', publicSiteRoutes);

// Public ads (per-tenant via X-Site → Website)
app.use('/api/v1/ads', requireSiteForAds, parseAdContext, adRoutes);

// Health
app.use('/api/health', healthRoutes);

// TMDB-backed search (for admin wizards + optionally client search)
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1', userAuthRoutes);
app.use('/api/v1', userPublicRoutes);

// Homepage catalog (curated Media or trending fallback)
app.use('/api/v1/catalog', catalogRoutes);

// Public genres (read-only; global taxonomy)
app.use('/api/v1/genres', publicGenreRoutes);

// Reviews + user similar suggestions (paths before generic /:category/:id)
app.use('/api/v1/media', writeLimiter, mediaPublicExtraRoutes);

// Media hero + curated similar list
app.use('/api/v1/media', mediaRoutes);

// Votes
app.use('/api/v1/media', voteLimiter, similarityVoteRoutes);

// Sitemap data
app.use('/api/v1/sitemap-data', sitemapDataRoutes);

// Media SEO meta + admin upsert
app.use('/api/v1/media-detail-seo', mediaDetailSeoRoutes);

// Genres (admin-managed custom genres)
app.use('/api/v1/admin/genres', authenticateAdmin, authorizeRoles('editor'), genreRoutes);

// Admin auth routes (public)
app.use('/api/v1/admin', adminAuthRoutes);

// Admin media + curation
app.use('/api/v1/admin', authenticateAdmin, authorizeRoles('editor'), adminMediaRoutes);
app.use('/api/v1/admin/curation', authenticateAdmin, authorizeRoles('moderator'), curatedAdminRoutes);
app.use('/api/v1/admin', authenticateAdmin, authorizeRoles('super_admin'), websiteRoutes);
app.use('/api/v1/admin', authenticateAdmin, authorizeRoles('moderator'), similarityVoteAdminRoutes);
app.use('/api/v1/admin', authenticateAdmin, authorizeRoles('moderator'), adminAuditRoutes);
app.use('/api/v1/admin', authenticateAdmin, authorizeRoles('editor'), mediaTypeRoutes);
app.use('/api/v1/admin', authenticateAdmin, authorizeRoles('moderator'), adminUserRoutes);

app.use('/api/v1/admin/ads/creatives', authenticateAdmin, authorizeRoles('moderator'), adminAdCreativeRoutes);
app.use('/api/v1/admin/ads/campaigns', authenticateAdmin, authorizeRoles('moderator'), adminAdCampaignRoutes);
app.use('/api/v1/admin/ads/analytics', authenticateAdmin, authorizeRoles('moderator'), adminAdAnalyticsRoutes);
app.use('/api/v1/admin/ads/media', authenticateAdmin, authorizeRoles('moderator'), adminAdMediaRoutes);

// Central error handler (keep last)
app.use(errorHandler);

// Start server (only if run directly — still pre-connect so first request is fast)
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  connectToDatabase()
    .then(() => {
      if (process.env.AD_ROLLUP_SCHEDULER === '1') {
        startDailyRollupScheduler();
      }
      app.listen(PORT, () => console.log(`[similarmovies] API listening on port ${PORT}`));
    })
    .catch((err) => {
      console.error('[similarmovies] Failed to connect to MongoDB:', err.message);
      process.exit(1);
    });
}

module.exports = app;
module.exports.connectToDatabase = connectToDatabase;
