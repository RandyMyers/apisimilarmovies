const express = require('express');
const router = express.Router();
const { list, getById, create, update, remove } = require('../controllers/adminAdCreativeController');

router.get('/', list);
router.get('/:id', getById);
router.post('/', create);
router.put('/:id', update);
router.patch('/:id', update);
router.delete('/:id', remove);

module.exports = router;
