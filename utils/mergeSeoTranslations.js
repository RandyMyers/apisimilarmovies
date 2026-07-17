function normalizeLang(code) {
  return String(code || '').toLowerCase().trim();
}

function toPlain(row) {
  if (!row) return {};
  return typeof row.toObject === 'function' ? row.toObject() : { ...row };
}

function mergeTranslationRow(existing, incoming) {
  const prev = existing || {};
  const next = incoming || {};
  const language = normalizeLang(next.language || prev.language);
  return {
    language,
    title: next.title !== undefined ? String(next.title || '').trim() : String(prev.title || '').trim(),
    metaTitle:
      next.metaTitle !== undefined ? String(next.metaTitle || '').trim() : String(prev.metaTitle || '').trim(),
    metaDescription:
      next.metaDescription !== undefined
        ? String(next.metaDescription || '').trim()
        : String(prev.metaDescription || '').trim(),
    keywords: Array.isArray(next.keywords)
      ? next.keywords.map(String).filter(Boolean)
      : Array.isArray(prev.keywords)
        ? prev.keywords.filter(Boolean)
        : [],
    slug: next.slug !== undefined ? String(next.slug || '').trim() : String(prev.slug || '').trim(),
    content: next.content !== undefined ? String(next.content || '').trim() : String(prev.content || '').trim(),
    canonicalPath:
      next.canonicalPath !== undefined
        ? String(next.canonicalPath || '').trim()
        : String(prev.canonicalPath || '').trim(),
    ogImage: next.ogImage !== undefined ? String(next.ogImage || '').trim() : String(prev.ogImage || '').trim(),
  };
}

function mergeTranslations(existingRows = [], incomingRows = []) {
  const byLang = new Map();

  for (const row of existingRows) {
    const key = normalizeLang(row?.language);
    if (!key) continue;
    byLang.set(key, mergeTranslationRow({}, toPlain(row)));
  }

  for (const row of incomingRows) {
    const key = normalizeLang(row?.language);
    if (!key) continue;
    byLang.set(key, mergeTranslationRow(byLang.get(key), toPlain(row)));
  }

  return Array.from(byLang.values()).sort((a, b) => a.language.localeCompare(b.language));
}

module.exports = {
  mergeTranslations,
  normalizeLang,
};
