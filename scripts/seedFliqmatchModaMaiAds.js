/* eslint-disable no-console */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Website = require('../models/Website');
const AdCreative = require('../models/AdCreative');
const AdCampaign = require('../models/AdCampaign');
const { uploadAdCreativeBuffer } = require('../services/adCloudinaryUploadService');

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  if (!found) return fallback;
  return String(found.slice(prefix.length));
}

function sanitizeFileName(name) {
  return String(name || '').replace(/[^a-zA-Z0-9._-]/g, '-');
}

function toDateOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Empty array = match all locales (global). */
function parseLocaleList(localeArg) {
  const s = String(localeArg ?? '').trim().toLowerCase();
  if (!s || s === 'all' || s === '*') return [];
  return s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
}

/** Empty array = match all hostnames (global). When strictDomain is false, apex adds www. variant and vice versa. */
function parseDomainList(domainArg, { strictDomain = false } = {}) {
  const s = String(domainArg ?? '').trim().toLowerCase();
  if (!s || s === 'all' || s === '*') return [];
  const parts = s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (strictDomain) return parts;
  const expanded = new Set();
  for (const d of parts) {
    expanded.add(d);
    if (d.startsWith('www.')) {
      const apex = d.slice(4);
      if (apex) expanded.add(apex);
    } else {
      expanded.add(`www.${d}`);
    }
  }
  return [...expanded];
}

function mimeFromExt(fileName) {
  const ext = String(path.extname(fileName || '')).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return '';
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyImageToPublic(imageName) {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const srcDir = path.join(repoRoot, 'simimovies', 'src', 'assets', 'newads');
  const publicDir = path.join(repoRoot, 'simimovies', 'public', 'newads');
  const wanted = String(imageName || '').trim();

  if (!fs.existsSync(srcDir)) {
    throw new Error(`Missing source image folder: ${srcDir}`);
  }

  const files = fs
    .readdirSync(srcDir)
    .filter((f) => /\.(png|jpe?g|webp|gif|svg)$/i.test(f))
    .sort((a, b) => a.localeCompare(b));

  if (!files.length) {
    throw new Error(
      `No image files found in ${srcDir}. Add one image first, then run this script again.`,
    );
  }

  const chosen = wanted
    ? files.find((f) => f.toLowerCase() === wanted.toLowerCase())
    : files[0];
  if (!chosen) {
    throw new Error(`Image "${wanted}" not found in ${srcDir}. Available: ${files.join(', ')}`);
  }

  ensureDir(publicDir);
  const ext = path.extname(chosen);
  const base = path.basename(chosen, ext);
  const safeFileName = `${sanitizeFileName(base)}${ext.toLowerCase()}`;
  const srcPath = path.join(srcDir, chosen);
  const destPath = path.join(publicDir, safeFileName);
  fs.copyFileSync(srcPath, destPath);
  return { fileName: safeFileName, publicUrlPath: `/newads/${safeFileName}` };
}

function readImageFromSource(imageName) {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const srcDir = path.join(repoRoot, 'simimovies', 'src', 'assets', 'newads');
  const wanted = String(imageName || '').trim();

  if (!fs.existsSync(srcDir)) {
    throw new Error(`Missing source image folder: ${srcDir}`);
  }

  const files = fs
    .readdirSync(srcDir)
    .filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f))
    .sort((a, b) => a.localeCompare(b));

  if (!files.length) {
    throw new Error(`No image files found in ${srcDir}. Add one image first, then run this script again.`);
  }

  const chosen = wanted
    ? files.find((f) => f.toLowerCase() === wanted.toLowerCase())
    : files[0];
  if (!chosen) {
    throw new Error(`Image "${wanted}" not found in ${srcDir}. Available: ${files.join(', ')}`);
  }

  const fullPath = path.join(srcDir, chosen);
  const buffer = fs.readFileSync(fullPath);
  const mimetype = mimeFromExt(chosen);
  if (!mimetype) throw new Error(`Unsupported image extension for Cloudinary upload: ${chosen}`);
  return { chosen, buffer, mimetype };
}

async function upsertWebsite({
  key,
  domain,
  name,
  defaultRegion = 'us',
  supportedRegions = ['us', 'gb', 'au', 'ie', 'de', 'at', 'es', 'it', 'fr', 'pt', 'nl', 'no', 'fi', 'dk', 'se'],
}) {
  return Website.findOneAndUpdate(
    { key },
    {
      key,
      name,
      domain,
      isActive: true,
      defaultRegion,
      supportedRegions,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function upsertModaMaiCreative({
  websiteId,
  destinationUrl,
  imageUrl,
  internalName,
  title,
  description,
  ctaLabel,
  imageWidth,
  imageHeight,
}) {
  return AdCreative.findOneAndUpdate(
    { website: websiteId, internalName },
    {
      website: websiteId,
      internalName,
      type: 'image',
      title,
      description,
      imageUrl,
      imageWidth,
      imageHeight,
      ctaLabel,
      destinationUrl,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function upsertModaMaiCardsCampaign({
  websiteId,
  creativeId,
  campaignName,
  advertiserName,
  targetingDomains,
  targetingLocales,
  startAt,
  endAt,
  status = 'active',
}) {
  const creatives = [{ creative: creativeId, isDefault: true }];
  const domains = Array.isArray(targetingDomains) ? targetingDomains : [];
  const locales = Array.isArray(targetingLocales) ? targetingLocales : [];
  return AdCampaign.findOneAndUpdate(
    { website: websiteId, name: campaignName },
    {
      website: websiteId,
      name: campaignName,
      advertiserName,
      status,
      startAt: startAt || new Date(),
      endAt: endAt || null,
      priority: 70,
      weight: 100,
      targeting: {
        domains,
        locales,
        countries: [],
        devices: ['desktop', 'mobile', 'tablet'],
        pages: ['home'],
        placements: ['cards'],
      },
      creatives,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function main() {
  const MONGO_URL = process.env.MONGO_URL;
  if (!MONGO_URL) {
    console.error('Missing MONGO_URL. Set it in similarmovies/server/.env');
    process.exit(1);
  }

  const websiteKey = String(getArg('websiteKey', 'fliqmatch')).trim().toLowerCase();
  const websiteDomain = String(getArg('websiteDomain', 'fliqmatch.com')).trim().toLowerCase();
  const websiteName = String(getArg('websiteName', 'FliqMatch (Hostinger)')).trim();

  const destinationUrl = String(getArg('destinationUrl', 'http://bit.ly/4mdpxoc')).trim();
  const imageName = String(getArg('image', '')).trim();
  const forceLocal = String(getArg('forceLocalImage', '0')).trim() === '1';
  const imageWidth = Number(getArg('imageWidth', '800')) || 800;
  const imageHeight = Number(getArg('imageHeight', '1000')) || 1000;
  const strictDomain = String(getArg('strictDomain', '0')).trim() === '1';
  const targetingLocales = parseLocaleList(getArg('locale', 'all'));
  const targetingDomains = parseDomainList(getArg('domainTarget', 'all'), { strictDomain });

  const creativeInternalName = String(
    getArg('creativeInternalName', 'modamai-card-creative'),
  ).trim();
  const creativeTitle = String(getArg('creativeTitle', 'ModaMai New Arrivals')).trim();
  const creativeDescription = String(
    getArg('creativeDescription', 'Fresh styles and everyday essentials from ModaMai.'),
  ).trim();
  const creativeCta = String(getArg('creativeCta', 'Shop Now')).trim();
  const campaignName = String(getArg('campaignName', 'ModaMai Cards Campaign')).trim();
  const advertiserName = String(getArg('advertiserName', 'ModaMai')).trim();
  const campaignStatus = String(getArg('campaignStatus', 'active')).trim().toLowerCase();
  const startAt = toDateOrNull(getArg('startAt', '')) || new Date();
  const endAt = toDateOrNull(getArg('endAt', ''));

  const { chosen, buffer, mimetype } = readImageFromSource(imageName);

  await mongoose.connect(MONGO_URL);
  console.log('[seedFliqmatchModaMaiAds] Connected to MongoDB');

  // Older schema versions created a compound multikey index on both pages+placements,
  // which prevents saving documents that have both arrays populated.
  try {
    await AdCampaign.collection.dropIndex('website_1_targeting.pages_1_targeting.placements_1');
    console.log('[seedFliqmatchModaMaiAds] Dropped legacy parallel-array index');
  } catch (e) {
    if (!/index not found/i.test(String(e?.message || ''))) {
      console.warn('[seedFliqmatchModaMaiAds] Could not drop legacy index:', e.message);
    }
  }

  const website = await upsertWebsite({
    key: websiteKey,
    domain: websiteDomain,
    name: websiteName,
  });

  let imageUrl = '';
  let copiedImage = '';
  let cloudinaryPublicId = '';
  try {
    if (!forceLocal) {
      const uploaded = await uploadAdCreativeBuffer(buffer, { mimetype });
      imageUrl = uploaded.url;
      cloudinaryPublicId = uploaded.publicId || '';
      console.log('[seedFliqmatchModaMaiAds] Uploaded image to Cloudinary');
    }
  } catch (e) {
    console.warn('[seedFliqmatchModaMaiAds] Cloudinary upload unavailable, falling back to local public image:', e.message);
  }
  if (!imageUrl) {
    const localCopy = copyImageToPublic(chosen);
    imageUrl = localCopy.publicUrlPath;
    copiedImage = localCopy.fileName;
  }

  const creative = await upsertModaMaiCreative({
    websiteId: website._id,
    destinationUrl,
    imageUrl,
    internalName: creativeInternalName,
    title: creativeTitle,
    description: creativeDescription,
    ctaLabel: creativeCta,
    imageWidth,
    imageHeight,
  });

  const campaign = await upsertModaMaiCardsCampaign({
    websiteId: website._id,
    creativeId: creative._id,
    campaignName,
    advertiserName,
    targetingDomains,
    targetingLocales,
    startAt,
    endAt,
    status: campaignStatus,
  });

  console.log('[seedFliqmatchModaMaiAds] Done.');
  console.log({
    website: { id: String(website._id), key: website.key, domain: website.domain, name: website.name },
    creative: {
      id: String(creative._id),
      internalName: creative.internalName,
      imageUrl: creative.imageUrl,
      copiedImage: copiedImage || null,
      cloudinaryPublicId: cloudinaryPublicId || null,
      destinationUrl: creative.destinationUrl,
    },
    campaign: {
      id: String(campaign._id),
      name: campaign.name,
      status: campaign.status,
      pages: campaign.targeting?.pages || [],
      placements: campaign.targeting?.placements || [],
      domains: campaign.targeting?.domains || [],
      locales: campaign.targeting?.locales || [],
    },
  });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[seedFliqmatchModaMaiAds] Failed:', err?.message || err);
  process.exit(1);
});

