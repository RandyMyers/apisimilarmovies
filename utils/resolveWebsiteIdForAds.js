const mongoose = require('mongoose');
const Website = require('../models/Website');

async function resolveWebsiteIdForAds(websiteParam) {
  if (!websiteParam) return null;
  const s = String(websiteParam).trim();
  if (mongoose.Types.ObjectId.isValid(s) && String(new mongoose.Types.ObjectId(s)) === s) {
    return s;
  }
  const w = await Website.findOne({ key: s.toLowerCase() }).select('_id').lean();
  return w ? w._id : null;
}

module.exports = { resolveWebsiteIdForAds };
