const express = require('express');
const router = express.Router();

const searchController = require('../controllers/searchController');

// TMDB multi-search (movie + tv)
router.get('/', searchController.searchMulti);
router.get('/details', searchController.getTmdbDetails);

module.exports = router;

