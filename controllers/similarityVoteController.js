const SimilarityVote = require('../models/SimilarityVote');
const mongoose = require('mongoose');

function parseCategory(categoryRaw) {
  const category = String(categoryRaw || '').toLowerCase().trim();
  const allowed = new Set(['movie', 'tv', 'anime_movie', 'anime_tv']);
  return allowed.has(category) ? category : null;
}

exports.submitVote = async (req, res) => {
  try {
    const connected = mongoose.connection.readyState === 1;
    if (!connected) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const siteKey = req.siteKey || 'default';
    const baseCategory = parseCategory(req.params.category);
    const baseId = parseInt(req.params.id, 10);

    const {
      alternativeCategory,
      alternativeId,
      rating,
      reason,
      baseTitle,
      altTitle,
    } = req.body || {};

    const altCategory = parseCategory(alternativeCategory);
    const altId = parseInt(alternativeId, 10);
    const r = parseInt(rating, 10);

    if (!baseCategory || !Number.isFinite(baseId)) {
      return res.status(400).json({ error: 'Invalid base category or id' });
    }
    if (!altCategory || !Number.isFinite(altId)) {
      return res.status(400).json({ error: 'Invalid alternative category or id' });
    }
    if (!Number.isFinite(r) || r < 1 || r > 5) {
      return res.status(400).json({ error: 'rating must be between 1 and 5' });
    }

    const ip = (req.ip || req.connection?.remoteAddress || '').toString().trim().slice(0, 45);

    await SimilarityVote.create({
      siteKey,
      baseCategory,
      baseId,
      alternativeCategory: altCategory,
      alternativeId: altId,
      rating: r,
      reason: typeof reason === 'string' ? reason.trim().slice(0, 500) : '',
      ip: ip || '',
      user: req.user?._id || null,
      baseTitle: typeof baseTitle === 'string' ? baseTitle.trim().slice(0, 200) : '',
      altTitle: typeof altTitle === 'string' ? altTitle.trim().slice(0, 200) : '',
    });

    return res.status(201).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to submit vote' });
  }
};

