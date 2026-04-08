const { asyncHandler } = require('../middleware/errorHandler');
const { isCloudinaryReady } = require('../config/cloudinary');
const { uploadAdCreativeBuffer } = require('../services/adCloudinaryUploadService');

exports.mediaStatus = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      cloudinary: isCloudinaryReady(),
    },
  });
});

exports.uploadAdCreativeImage = asyncHandler(async (req, res) => {
  const file = req.files && req.files.image;
  if (!file || !file.data) {
    return res.status(400).json({ success: false, message: 'Missing file: use form field "image"' });
  }

  try {
    const data = await uploadAdCreativeBuffer(file.data, {
      mimetype: file.mimetype,
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    const status = err.statusCode || 500;
    const message = err.message || err.http_code?.toString() || 'Upload failed';
    return res.status(status).json({ success: false, message });
  }
});
