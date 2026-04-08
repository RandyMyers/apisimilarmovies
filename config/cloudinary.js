const cloudinary = require('cloudinary').v2;

let configured = false;

function configureFromEnv() {
  if (configured) return true;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return false;
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  configured = true;
  return true;
}

function getCloudinary() {
  configureFromEnv();
  return cloudinary;
}

function isCloudinaryReady() {
  return configureFromEnv();
}

module.exports = {
  cloudinary,
  getCloudinary,
  isCloudinaryReady,
};
