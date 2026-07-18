const express = require('express');
const router = express.Router();
const { getOverview, listAggregated } = require('../controllers/visitorController');

router.get('/overview', getOverview);
router.get('/aggregated', listAggregated);

module.exports = router;
