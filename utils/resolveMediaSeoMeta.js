const DEFAULT_LANGUAGE = 'en-us';

function resolveMediaSeoMeta(seoDoc, language) {
  if (!seoDoc) {
    return {
      metaTitle: '',
      metaDescription: '',
      keywords: [],
      robots: 'index, follow',
      slug: '',
      headline: '',
      canonicalPath: '',
      ogImage: '',
    };
  }

  const langKey = String(language || 'en-US').toLowerCase();
  const translation = (seoDoc.translations || []).find((t) => String(t.language || '').toLowerCase() === langKey) || null;

  return {
    metaTitle:
      translation?.metaTitle?.trim() ? translation.metaTitle.trim() : seoDoc.metaTitle?.trim() || '',
    metaDescription:
      translation?.metaDescription?.trim()
        ? translation.metaDescription.trim()
        : seoDoc.metaDescription?.trim() || '',
    keywords:
      Array.isArray(translation?.keywords) && translation.keywords.length
        ? translation.keywords.filter(Boolean)
        : Array.isArray(seoDoc.keywords)
          ? seoDoc.keywords.filter(Boolean)
          : [],
    robots: seoDoc.robots || 'index, follow',
    slug: translation?.slug?.trim() ? translation.slug.trim() : '',
    headline: translation?.title?.trim() ? translation.title.trim() : '',
    canonicalPath:
      translation?.canonicalPath?.trim()
        ? translation.canonicalPath.trim()
        : seoDoc.canonicalPath?.trim() || '',
    ogImage:
      translation?.ogImage?.trim() ? translation.ogImage.trim() : seoDoc.ogImage?.trim() || '',
  };
}

module.exports = {
  DEFAULT_LANGUAGE,
  resolveMediaSeoMeta,
};
