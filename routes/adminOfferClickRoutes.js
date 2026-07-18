const express = require('express');
const { getOverview, listClicks } = require('../controllers/offerClickController');

const router = express.Router();
router.get('/overview', getOverview);
router.get('/', listClicks);

module.exports = router;
