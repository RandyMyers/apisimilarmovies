const express = require('express');
const router = express.Router();
const curatedSimilarAdminController = require('../controllers/curatedSimilarAdminController');
const similarSuggestionController = require('../controllers/similarSuggestionController');

router.get('/similar', curatedSimilarAdminController.listForBase);
router.post('/similar', curatedSimilarAdminController.add);
router.patch('/similar/:id', curatedSimilarAdminController.update);
router.delete('/similar/:id', curatedSimilarAdminController.remove);

router.get('/similar-suggestions', similarSuggestionController.listSuggestionsAdmin);
router.post('/similar-suggestions/:suggestionId/approve', similarSuggestionController.approveSuggestion);
router.post('/similar-suggestions/:suggestionId/reject', similarSuggestionController.rejectSuggestion);
router.delete('/similar-suggestions/:suggestionId', similarSuggestionController.removeSuggestionAdmin);

module.exports = router;
