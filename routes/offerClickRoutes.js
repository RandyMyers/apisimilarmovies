const express = require('express');
const { trackOfferClick } = require('../controllers/offerClickController');

const router = express.Router();
router.post('/click', trackOfferClick);

module.exports = router;
