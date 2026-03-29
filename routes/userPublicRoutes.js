const express = require('express');

const publicUserController = require('../controllers/publicUserController');
const { optionalUserAuth, authenticateUser } = require('../middleware/userAuth');

const router = express.Router();

router.get('/users/:username', optionalUserAuth, publicUserController.getPublicProfile);
router.get('/users/:username/activity', optionalUserAuth, publicUserController.getPublicActivity);
router.get('/users/:username/followers', optionalUserAuth, publicUserController.getFollowers);
router.get('/users/:username/following', optionalUserAuth, publicUserController.getFollowing);
router.post('/users/:username/follow', authenticateUser, publicUserController.followUser);
router.delete('/users/:username/follow', authenticateUser, publicUserController.unfollowUser);
router.post('/users/:username/report', authenticateUser, publicUserController.reportUser);

module.exports = router;
