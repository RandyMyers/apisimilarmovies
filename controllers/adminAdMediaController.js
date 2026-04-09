const { asyncHandler } = require('../middleware/errorHandler');
const { isCloudinaryReady } = require('../config/cloudinary');
const { uploadAdCreativeBuffer } = require('../services/adCloudinaryUploadService');

function pickUploadedFile(req) {
  const files = req.files;
  if (!files || typeof files !== 'object') return null;
  const candidates = [files.image, files.file, files.creative, files.upload];
  for (const c of candidates) {
    if (!c) continue;
    const f = Array.isArray(c) ? c[0] : c;
    if (f && f.data && Buffer.isBuffer(f.data) && f.data.length) return f;
  }
  const keys = Object.keys(files);
  if (keys.length === 1) {
    const f = files[keys[0]];
    const one = Array.isArray(f) ? f[0] : f;
    if (one && one.data && Buffer.isBuffer(one.data) && one.data.length) return one;
  }
  return null;
}

exports.mediaStatus = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      cloudinary: isCloudinaryReady(),
    },
  });
});

exports.uploadAdCreativeImage = asyncHandler(async (req, res) => {
  const file = pickUploadedFile(req);
  if (!file) {
    return res.status(400).json({
      success: false,
      message:
        'Missing image file. Send multipart field "image" (or "file") via express-fileupload; check client is not sending JSON.',
    });
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
