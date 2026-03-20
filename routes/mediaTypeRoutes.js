const express = require('express');
const router = express.Router();

const mediaTypeController = require('../controllers/mediaTypeController');

// Admin: CRUD for media classification types
router.get('/types', mediaTypeController.list);
router.post('/types', mediaTypeController.create);
router.patch('/types/:id', mediaTypeController.update);
router.delete('/types/:id', mediaTypeController.remove);

module.exports = router;

