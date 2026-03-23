const express = require('express');
const router = express.Router();

const sitemapDataController = require('../controllers/sitemapDataController');

// GET /api/v1/sitemap-data/media-detail-pages
router.get('/media-detail-pages', sitemapDataController.getMediaDetailPagesForSitemap);
router.get('/static-pages', sitemapDataController.getStaticPagesForSitemap);
router.get('/regions', sitemapDataController.getRegionsForSitemap);
router.get('/site', sitemapDataController.getSiteForSitemap);

module.exports = router;

