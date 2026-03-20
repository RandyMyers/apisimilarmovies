const express = require('express');
const router = express.Router();

const mediaController = require('../controllers/mediaController');

// GET /api/v1/media/:category/:id
router.get('/:category/:id', mediaController.getMedia);

// GET /api/v1/media/:category/:id/similar
router.get('/:category/:id/similar', mediaController.getSimilar);

module.exports = router;

