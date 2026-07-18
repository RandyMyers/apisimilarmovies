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

function resolveSimilarPageSeoMeta(seoDoc, language) {
  const block = seoDoc?.similarPage || null;
  if (!block) {
    return {
      metaTitle: '',
      metaDescription: '',
      keywords: [],
      robots: 'index, follow',
      slug: '',
      headline: '',
      canonicalPath: '',
      ogImage: '',
      content: '',
      includeInSitemap: true,
      changefreq: 'weekly',
      priority: 0.65,
    };
  }

  const langKey = String(language || 'en-US').toLowerCase();
  const translation =
    (block.translations || []).find((t) => String(t.language || '').toLowerCase() === langKey) || null;

  return {
    metaTitle:
      translation?.metaTitle?.trim() ? translation.metaTitle.trim() : block.metaTitle?.trim() || '',
    metaDescription:
      translation?.metaDescription?.trim()
        ? translation.metaDescription.trim()
        : block.metaDescription?.trim() || '',
    keywords:
      Array.isArray(translation?.keywords) && translation.keywords.length
        ? translation.keywords.filter(Boolean)
        : Array.isArray(block.keywords)
          ? block.keywords.filter(Boolean)
          : [],
    robots: block.robots || 'index, follow',
    slug: translation?.slug?.trim() ? translation.slug.trim() : '',
    headline: translation?.title?.trim() ? translation.title.trim() : '',
    canonicalPath:
      translation?.canonicalPath?.trim()
        ? translation.canonicalPath.trim()
        : block.canonicalPath?.trim() || '',
    ogImage:
      translation?.ogImage?.trim() ? translation.ogImage.trim() : block.ogImage?.trim() || '',
    content:
      translation?.content?.trim()
        ? translation.content.trim()
        : block.content?.trim() || '',
    includeInSitemap: block.includeInSitemap !== false,
    changefreq: block.changefreq || 'weekly',
    priority: Number.isFinite(Number(block.priority)) ? Number(block.priority) : 0.65,
  };
}

module.exports = {
  DEFAULT_LANGUAGE,
  resolveMediaSeoMeta,
  resolveSimilarPageSeoMeta,
};
