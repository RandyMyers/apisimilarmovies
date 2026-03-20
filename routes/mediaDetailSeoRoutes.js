const express = require('express');
const router = express.Router();

const mediaDetailSeoController = require('../controllers/mediaDetailSeoController');
const { authenticateAdmin, authorizeRoles } = require('../middleware/adminAuth');

// Public meta
router.get('/meta', mediaDetailSeoController.getMeta);

// Admin list/get/upsert (no auth in MVP)
router.get('/admin/list', authenticateAdmin, authorizeRoles('moderator'), mediaDetailSeoController.listAdmin);
router.get('/admin/one', authenticateAdmin, authorizeRoles('moderator'), mediaDetailSeoController.getAdminOne);
router.post('/admin', authenticateAdmin, authorizeRoles('editor'), mediaDetailSeoController.upsert);
router.delete('/admin/one', authenticateAdmin, authorizeRoles('editor'), mediaDetailSeoController.deleteAdminOne);

module.exports = router;

