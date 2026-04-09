const { getCloudinary, isCloudinaryReady } = require('../config/cloudinary');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function normalizeImageMimetype(mimetype) {
  const t = String(mimetype || '').toLowerCase().trim();
  if (t === 'image/jpg' || t === 'image/pjpeg') return 'image/jpeg';
  return t;
}

function uploadAdCreativeBuffer(buffer, { mimetype } = {}) {
  if (!isCloudinaryReady()) {
    const err = new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
    );
    err.statusCode = 503;
    throw err;
  }
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    const err = new Error('Invalid or empty file');
    err.statusCode = 400;
    throw err;
  }
  const type = normalizeImageMimetype(mimetype);
  if (!ALLOWED_MIME.has(type)) {
    const err = new Error(
      `Only JPEG, PNG, WebP, and GIF images are allowed (received: ${mimetype || 'unknown'})`,
    );
    err.statusCode = 400;
    throw err;
  }

  const folder = process.env.CLOUDINARY_AD_FOLDER || 'similarmovies/ad-creatives';
  const cloudinary = getCloudinary();

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        unique_filename: true,
        overwrite: false,
      },
      (err, result) => {
        if (err) return reject(err);
        resolve({
          url: result.secure_url,
          width: result.width,
          height: result.height,
          publicId: result.public_id,
          format: result.format,
          bytes: result.bytes,
        });
      },
    );
    uploadStream.end(buffer);
  });
}

module.exports = {
  uploadAdCreativeBuffer,
  ALLOWED_MIME,
};
