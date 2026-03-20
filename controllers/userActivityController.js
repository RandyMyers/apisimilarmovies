const SimilarityVote = require('../models/SimilarityVote');
const SimilarSuggestion = require('../models/SimilarSuggestion');
const MediaReview = require('../models/MediaReview');

exports.getMyActivity = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const userId = req.user?._id ? String(req.user._id) : '';
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const [votesDocs, suggestionsDocs, reviewsDocs] = await Promise.all([
      SimilarityVote.find({ siteKey, user: userId, isActive: true })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean(),
      SimilarSuggestion.find({ siteKey, user: userId })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean(),
      MediaReview.find({ siteKey, user: userId })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean(),
    ]);

    const votes = (votesDocs || []).map((v) => ({
      id: `vote-${String(v._id)}`,
      type: 'vote',
      createdAt: v.createdAt ? new Date(v.createdAt).toISOString() : null,
      rating: v.rating,
      reason: v.reason || '',
      baseTitle: v.baseTitle || `#${v.baseId}`,
      altTitle: v.altTitle || `#${v.alternativeId}`,
      baseCategory: v.baseCategory,
      altCategory: v.alternativeCategory,
      baseId: v.baseId,
      altId: v.alternativeId,
    }));

    const suggestions = (suggestionsDocs || []).map((s) => ({
      id: `sugg-${String(s._id)}`,
      type: 'suggestion',
      createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : null,
      reason: s.reason || '',
      status: s.status || 'pending',
      baseTitle: s.baseTitle || `#${s.baseTmdbId}`,
      suggestedTitle: s.suggestedTitle || `#${s.similarTmdbId}`,
      baseCategory: s.baseCategory,
      similarCategory: s.similarCategory,
      baseId: s.baseTmdbId,
      suggestedId: s.similarTmdbId,
    }));

    const reviews = (reviewsDocs || []).map((r) => ({
      id: `rev-${String(r._id)}`,
      type: 'review',
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      title: r.title || `#${r.baseTmdbId}`,
      rating: r.rating,
      text: r.text || '',
      baseCategory: r.baseCategory,
      baseId: r.baseTmdbId,
    }));

    return res.json({
      votes,
      suggestions,
      reviews,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load activity' });
  }
};

