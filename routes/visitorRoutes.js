const express = require('express');
const router = express.Router();
const { trackPageView } = require('../controllers/visitorController');

router.post('/track', trackPageView);

module.exports = router;
