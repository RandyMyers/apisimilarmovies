const express = require('express');
const router = express.Router();

const adminMediaController = require('../controllers/adminMediaController');

router.get('/media', adminMediaController.listMedia);
router.get('/media/:id', adminMediaController.getMediaOne);
router.post('/media', adminMediaController.createMedia);
router.patch('/media/:id', adminMediaController.updateMedia);
router.delete('/media/:id', adminMediaController.deleteMedia);

module.exports = router;

