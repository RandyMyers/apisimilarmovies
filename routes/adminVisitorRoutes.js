const express = require('express');
const router = express.Router();
const { getOverview, listAggregated, getDeviceBreakdown, getLiveActivity } = require('../controllers/visitorController');

router.get('/overview', getOverview);
router.get('/aggregated', listAggregated);
router.get('/devices', getDeviceBreakdown);
router.get('/live', getLiveActivity);

module.exports = router;
