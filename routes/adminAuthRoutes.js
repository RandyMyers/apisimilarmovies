const express = require('express');
const router = express.Router();

const adminAuthController = require('../controllers/adminAuthController');
const { authenticateAdmin, authorizeRoles } = require('../middleware/adminAuth');

router.post('/auth/login', adminAuthController.login);
router.post('/auth/register', adminAuthController.register);
router.post('/auth/forgot-password', adminAuthController.forgotPassword);
router.post('/auth/reset-password', adminAuthController.resetPassword);
router.get('/me', authenticateAdmin, authorizeRoles('moderator'), adminAuthController.me);
router.patch('/me', authenticateAdmin, authorizeRoles('moderator'), adminAuthController.updateMe);
router.patch('/me/password', authenticateAdmin, authorizeRoles('moderator'), adminAuthController.changeMyPassword);

module.exports = router;

