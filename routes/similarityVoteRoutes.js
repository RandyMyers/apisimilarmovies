const express = require('express');
const router = express.Router();

const similarityVoteController = require('../controllers/similarityVoteController');
const { optionalUserAuth } = require('../middleware/userAuth');

// POST /api/v1/media/:category/:id/similarity-vote
router.post('/:category/:id/similarity-vote', optionalUserAuth, similarityVoteController.submitVote);

module.exports = router;

