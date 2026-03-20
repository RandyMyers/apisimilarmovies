const SimilarSuggestion = require('../models/SimilarSuggestion');
const CuratedSimilar = require('../models/CuratedSimilar');
const mongoose = require('mongoose');
const { parseCategory } = require('../utils/parseCategory');
const { getClientIp } = require('../utils/clientIp');
const { logAdminAction } = require('../utils/adminAudit');

const KINDS = new Set(['movie', 'tv']);

exports.createSuggestion = async (req, res) => {
  try {
    const connected = mongoose.connection.readyState === 1;
    if (!connected) return res.status(503).json({ error: 'Database unavailable' });

    const siteKey = req.siteKey || 'default';
    const category = parseCategory(req.params.category);
    const baseTmdbId = parseInt(req.params.id, 10);
    if (!category || !Number.isFinite(baseTmdbId)) {
      return res.status(400).json({ error: 'Invalid category or id' });
    }
    const similarTmdbKind = String(req.body?.similarTmdbKind || '').toLowerCase();
    const similarTmdbId = parseInt(req.body?.similarTmdbId, 10);
    const reason = String(req.body?.reason || '').trim();
    const baseTitle = typeof req.body?.baseTitle === 'string' ? req.body.baseTitle.trim().slice(0, 200) : '';
    const suggestedTitle =
      typeof req.body?.suggestedTitle === 'string' ? req.body.suggestedTitle.trim().slice(0, 200) : '';
    if (!KINDS.has(similarTmdbKind) || !Number.isFinite(similarTmdbId)) {
      return res.status(400).json({ error: 'similarTmdbKind (movie|tv) and similarTmdbId required' });
    }
    const ip = getClientIp(req);
    await SimilarSuggestion.create({
      siteKey,
      baseCategory: category,
      baseTmdbId,
      similarTmdbKind,
      similarTmdbId,
      reason,
      ip,
      user: req.user?._id || null,
      status: 'pending',
      baseTitle,
      suggestedTitle,
    });
    return res.status(201).json({ success: true, message: 'Thanks — we will review your suggestion.' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to submit suggestion' });
  }
};

exports.listSuggestionsAdmin = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const status = req.query.status || 'pending';
    const items = await SimilarSuggestion.find({ siteKey, status })
      .populate('user', 'email displayName')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    return res.json({ items });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to list suggestions' });
  }
};

exports.approveSuggestion = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const doc = await SimilarSuggestion.findOne({ _id: req.params.suggestionId, siteKey });
    if (!doc || doc.status !== 'pending') {
      return res.status(404).json({ error: 'Suggestion not found or not pending' });
    }
    const similarCategory = req.body?.similarCategory || doc.similarCategory;
    if (!similarCategory) {
      return res.status(400).json({ error: 'similarCategory required (movie|tv|anime_movie|anime_tv)' });
    }
    const displayName = String(req.body?.displayName || '').trim() || 'Unknown';
    const posterPath = String(req.body?.posterPath || '').trim();

    await CuratedSimilar.findOneAndUpdate(
      {
        siteKey,
        baseCategory: doc.baseCategory,
        baseTmdbId: doc.baseTmdbId,
        similarTmdbKind: doc.similarTmdbKind,
        similarTmdbId: doc.similarTmdbId,
      },
      {
        $set: {
          siteKey,
          similarCategory,
          displayName,
          posterPath,
          sortOrder: parseInt(req.body?.sortOrder, 10) || 0,
        },
      },
      { upsert: true, new: true },
    );

    doc.status = 'approved';
    await doc.save();
    await logAdminAction(req, {
      action: 'suggestion.approve',
      entityType: 'similar_suggestion',
      entityId: String(doc._id),
      details: { baseCategory: doc.baseCategory, baseTmdbId: doc.baseTmdbId, similarCategory },
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Approve failed' });
  }
};

exports.rejectSuggestion = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const doc = await SimilarSuggestion.findOne({ _id: req.params.suggestionId, siteKey });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    doc.status = 'rejected';
    await doc.save();
    await logAdminAction(req, {
      action: 'suggestion.reject',
      entityType: 'similar_suggestion',
      entityId: String(doc._id),
      details: { baseCategory: doc.baseCategory, baseTmdbId: doc.baseTmdbId },
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Reject failed' });
  }
};

exports.removeSuggestionAdmin = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const doc = await SimilarSuggestion.findOneAndDelete({ _id: req.params.suggestionId, siteKey });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    await logAdminAction(req, {
      action: 'suggestion.delete',
      entityType: 'similar_suggestion',
      entityId: String(doc._id),
      details: { status: doc.status, baseCategory: doc.baseCategory, baseTmdbId: doc.baseTmdbId },
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Delete failed' });
  }
};
