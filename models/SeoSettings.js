const mongoose = require('mongoose');

const seoSettingsSchema = new mongoose.Schema(
  {
    siteKey: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    siteName: { type: String, default: 'FliqMatch', trim: true },
    siteUrl: { type: String, default: '', trim: true },
    twitterHandle: { type: String, default: '', trim: true },
    googleSiteVerification: { type: String, default: '', trim: true },
    bingSiteVerification: { type: String, default: '', trim: true },
    sitemap: {
      enabled: { type: Boolean, default: true },
      includeMediaSimilar: { type: Boolean, default: true },
      includeStaticPages: { type: Boolean, default: true },
      includeCategories: { type: Boolean, default: true },
    },
    indexNow: {
      enabled: { type: Boolean, default: false },
      apiKey: { type: String, default: '', trim: true },
    },
    searchConsole: {
      autoSubmitSitemap: { type: Boolean, default: false },
    },
    hreflang: {
      enabled: { type: Boolean, default: true },
      xDefaultLanguage: { type: String, default: 'en', trim: true },
      includeRegionalVariants: { type: Boolean, default: true },
    },
    contentSeo: {
      minPublishScore: { type: Number, default: 0 },
      warnPublishScore: { type: Number, default: 60 },
      requireFocusKeyword: { type: Boolean, default: false },
      requireMetaOnPublish: { type: Boolean, default: true },
      metaTitleTemplate: { type: String, default: '{{title}} | {{siteName}}' },
      metaDescriptionTemplate: { type: String, default: '{{description}}' },
      similarMetaTitleTemplate: { type: String, default: 'Similar to {{title}} | {{siteName}}' },
      similarMetaDescriptionTemplate: {
        type: String,
        default: 'Find titles similar to {{title}} with community rankings.',
      },
    },
    organization: {
      name: { type: String, default: 'FliqMatch', trim: true },
      url: { type: String, default: '', trim: true },
      logo: { type: String, default: '', trim: true },
      sameAs: { type: [String], default: [] },
    },
    robotsTxt: {
      allowAll: { type: Boolean, default: true },
      disallowPaths: {
        type: [String],
        default: ['/dashboard', '/login', '/register', '/forgot-password', '/reset-password', '/profile/'],
      },
      crawlDelay: { type: Number, default: null },
    },
    staticPages: {
      enabled: { type: Boolean, default: true },
      maxMediaPagesPerBuild: { type: Number, default: 250 },
    },
  },
  { timestamps: true },
);

function defaultForSite(siteKey) {
  return {
    siteKey: String(siteKey || 'default').trim().toLowerCase(),
    siteName: 'FliqMatch',
    siteUrl: '',
    twitterHandle: '',
    googleSiteVerification: '',
    bingSiteVerification: '',
  };
}

seoSettingsSchema.statics.getForSite = async function getForSite(siteKey) {
  const key = String(siteKey || 'default').trim().toLowerCase();
  let doc = await this.findOne({ siteKey: key });
  if (!doc) {
    doc = await this.create(defaultForSite(key));
  }
  return doc;
};

seoSettingsSchema.statics.patchForSite = async function patchForSite(siteKey, updates = {}) {
  const key = String(siteKey || 'default').trim().toLowerCase();
  const doc = await this.getForSite(key);
  const mergeObjects = ['sitemap', 'indexNow', 'searchConsole', 'hreflang', 'contentSeo', 'organization', 'robotsTxt', 'staticPages'];
  const topLevel = [
    'siteName',
    'siteUrl',
    'twitterHandle',
    'googleSiteVerification',
    'bingSiteVerification',
  ];
  topLevel.forEach((field) => {
    if (updates[field] !== undefined) doc[field] = updates[field];
  });
  mergeObjects.forEach((field) => {
    if (updates[field] && typeof updates[field] === 'object') {
      doc[field] = { ...(doc[field]?.toObject?.() || doc[field] || {}), ...updates[field] };
      doc.markModified(field);
    }
  });
  await doc.save();
  return doc;
};

module.exports = mongoose.model('SeoSettings', seoSettingsSchema);
