const express = require('express');
const router = express.Router();

const websiteController = require('../controllers/websiteController');

// Admin websites CRUD (no auth in MVP)
router.get('/websites', websiteController.list);
router.post('/websites', websiteController.create);
router.patch('/websites/:id', websiteController.update);
router.delete('/websites/:id', websiteController.remove);

module.exports = router;

