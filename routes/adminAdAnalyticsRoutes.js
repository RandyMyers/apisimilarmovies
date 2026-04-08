const express = require('express');
const router = express.Router();
const { getAnalytics, getDailyAnalytics, refreshDailyAnalytics } = require('../controllers/adminAdAnalyticsController');

router.get('/', getAnalytics);
router.get('/daily', getDailyAnalytics);
router.post('/daily/refresh', refreshDailyAnalytics);

module.exports = router;
