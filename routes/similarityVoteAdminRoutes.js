const express = require('express');
const router = express.Router();

const similarityVoteAdminController = require('../controllers/similarityVoteAdminController');

router.get('/similarity-votes', similarityVoteAdminController.list);
router.get('/similarity-votes/summary', similarityVoteAdminController.summary);
router.patch('/similarity-votes/:id', similarityVoteAdminController.setActive);
router.delete('/similarity-votes/:id', similarityVoteAdminController.remove);

module.exports = router;

