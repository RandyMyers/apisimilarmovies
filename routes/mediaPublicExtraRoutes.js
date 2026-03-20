const express = require('express');
const router = express.Router({ mergeParams: true });
const mediaReviewController = require('../controllers/mediaReviewController');
const similarSuggestionController = require('../controllers/similarSuggestionController');
const { optionalUserAuth } = require('../middleware/userAuth');

router.get('/:category/:id/reviews', mediaReviewController.listReviews);
router.post('/:category/:id/reviews', optionalUserAuth, mediaReviewController.createReview);
router.post('/:category/:id/similar-suggestions', optionalUserAuth, similarSuggestionController.createSuggestion);

module.exports = router;
