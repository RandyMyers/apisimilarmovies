const express = require('express');
const fileUpload = require('express-fileupload');
const router = express.Router();
const { uploadAdCreativeImage, mediaStatus } = require('../controllers/adminAdMediaController');

router.get('/status', mediaStatus);

router.post(
  '/upload',
  fileUpload({
    limits: { fileSize: 5 * 1024 * 1024 },
    abortOnLimit: true,
    useTempFiles: false,
    createParentPath: false,
  }),
  uploadAdCreativeImage,
);

module.exports = router;
