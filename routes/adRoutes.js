const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { getPlacements, trackImpression, trackClick } = require('../controllers/adController');

const adEventLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many ad events', error: 'Too many ad events' },
});

router.get('/placements', getPlacements);
router.post('/events/impression', adEventLimiter, trackImpression);
router.post('/events/click', adEventLimiter, trackClick);

module.exports = router;
