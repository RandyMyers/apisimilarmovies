const express = require('express');

const router = express.Router();
const userAuthController = require('../controllers/userAuthController');
const userActivityController = require('../controllers/userActivityController');
const { authenticateUser } = require('../middleware/userAuth');

router.post('/auth/register', userAuthController.register);
router.post('/auth/login', userAuthController.login);
router.post('/auth/forgot-password', userAuthController.forgotPassword);
router.post('/auth/reset-password', userAuthController.resetPassword);
router.get('/auth/me', authenticateUser, userAuthController.me);
router.patch('/auth/me', authenticateUser, userAuthController.updateMe);
router.patch('/auth/me/password', authenticateUser, userAuthController.changeMyPassword);
router.get('/auth/me/activity', authenticateUser, userActivityController.getMyActivity);

module.exports = router;
