const express = require('express');

const router = express.Router();
const adminUserController = require('../controllers/adminUserController');
const { authorizeRoles } = require('../middleware/adminAuth');

router.get('/users', authorizeRoles('moderator'), adminUserController.list);
router.get('/users/:id', authorizeRoles('moderator'), adminUserController.getOne);
router.post('/users', authorizeRoles('editor'), adminUserController.create);
router.patch('/users/:id', authorizeRoles('editor'), adminUserController.update);
router.patch('/users/:id/status', authorizeRoles('editor'), adminUserController.setStatus);
router.patch('/users/:id/reset-password', authorizeRoles('editor'), adminUserController.resetPassword);
router.patch('/users/bulk', authorizeRoles('editor'), adminUserController.bulkUpdate);
router.get('/users-export.csv', authorizeRoles('moderator'), adminUserController.exportCsv);
router.delete('/users/:id', authorizeRoles('editor'), adminUserController.remove);

module.exports = router;
