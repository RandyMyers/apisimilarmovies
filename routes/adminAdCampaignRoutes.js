const express = require('express');
const router = express.Router();
const {
  list,
  getModerationLog,
  getById,
  create,
  update,
  remove,
  submit,
  approve,
  reject,
  activate,
  pause,
  archive,
} = require('../controllers/adminAdCampaignController');

router.get('/', list);
router.get('/:id/moderation-log', getModerationLog);
router.get('/:id', getById);
router.post('/', create);
router.put('/:id', update);
router.patch('/:id', update);
router.delete('/:id', remove);

router.post('/:id/submit', submit);
router.post('/:id/approve', approve);
router.post('/:id/reject', reject);
router.post('/:id/activate', activate);
router.post('/:id/pause', pause);
router.post('/:id/archive', archive);

module.exports = router;
