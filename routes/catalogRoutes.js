const express = require('express');
const router = express.Router();
const catalogController = require('../controllers/catalogController');

router.get('/', catalogController.listCatalog);
router.get('/top', catalogController.listTopCatalog);

module.exports = router;
