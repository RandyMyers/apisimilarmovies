const express = require('express');

const router = express.Router();

router.get('/site-settings', (req, res) => {
  try {
    const site = req.site;
    const siteKey = String(req.siteKey || 'default').trim().toLowerCase();
    if (!site || !site._id) {
      return res.status(200).json({
        success: true,
        data: {
          siteKey,
          adsStaticEnabled: false,
          adsManagedEnabled: false,
        },
      });
    }
    return res.status(200).json({
      success: true,
      data: {
        siteKey: site.key || siteKey,
        adsStaticEnabled: Boolean(site.adsStaticEnabled),
        adsManagedEnabled: Boolean(site.adsManagedEnabled),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load site settings' });
  }
});

module.exports = router;
