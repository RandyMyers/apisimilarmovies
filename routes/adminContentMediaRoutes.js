const express = require('express');
const fileUpload = require('express-fileupload');
const router = express.Router();
const { uploadContentImage, mediaStatus } = require('../controllers/adminContentMediaController');

router.get('/status', mediaStatus);

router.post(
  '/upload',
  fileUpload({
    limits: { fileSize: 10 * 1024 * 1024 },
    abortOnLimit: true,
    useTempFiles: false,
    createParentPath: false,
  }),
  uploadContentImage,
);

module.exports = router;
