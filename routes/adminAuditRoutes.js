const express = require('express');
const router = express.Router();

const adminAuditController = require('../controllers/adminAuditController');

router.get('/audit-logs', adminAuditController.list);

module.exports = router;
