const express = require('express');
const router = express.Router();

const genreController = require('../controllers/genreController');

router.get('/', genreController.list);
router.post('/', genreController.create);
router.delete('/', genreController.removeAll);
router.patch('/:id', genreController.update);
router.delete('/:id', genreController.remove);

module.exports = router;

