require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');

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

const app = express();

// Basic middleware
app.set('trust proxy', 1);
const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://teal-paletas-702712.netlify.app',
  'https://transcendent-entremet-8bcd5c.netlify.app',
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
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

// Multi-site resolver (adds req.siteKey from X-Site header)
app.use(siteResolver);

// Health
app.use('/api/health', healthRoutes);

// TMDB-backed search (for admin wizards + optionally client search)
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1', userAuthRoutes);

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

// Central error handler (keep last)
app.use(errorHandler);

// Connect Mongo (required for similarity votes)
const MONGO_URL = process.env.MONGO_URL;
if (MONGO_URL) {
  mongoose
    .connect(MONGO_URL)
    .then(() => {
      console.log('[similarmovies] Connected to MongoDB');
    })
    .catch((err) => {
      console.error('[similarmovies] MongoDB connection error:', err.message);
    });
} else {
  console.warn('[similarmovies] MONGO_URL not set; votes will not persist.');
}

// Start server (only if run directly)
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`[similarmovies] API listening on port ${PORT}`));
}

module.exports = app;
