const express = require('express');
const {
  getAdminSettings,
  patchAdminSettings,
  pingSitemap,
} = require('../controllers/seoSettingsController');

const router = express.Router();

router.get('/seo-settings', getAdminSettings);
router.patch('/seo-settings', patchAdminSettings);
router.post('/seo-settings/ping-sitemap', pingSitemap);

module.exports = router;
