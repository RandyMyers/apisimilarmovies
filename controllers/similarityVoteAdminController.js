const SimilarityVote = require('../models/SimilarityVote');

exports.list = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const includeInactive = req.query.includeInactive === 'true';
    const filter = includeInactive ? { siteKey } : { siteKey, isActive: true };
    const items = await SimilarityVote.find(filter)
      .populate('user', 'email displayName')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return res.json({ items });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to list votes' });
  }
};

exports.remove = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const doc = await SimilarityVote.findOneAndDelete({ _id: req.params.id, siteKey });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to delete vote' });
  }
};

exports.setActive = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const active = Boolean(req.body?.isActive);
    const doc = await SimilarityVote.findOneAndUpdate(
      { _id: req.params.id, siteKey },
      { $set: { isActive: active } },
      { new: true },
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to update vote state' });
  }
};

exports.summary = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const [ratingDist, topPairs] = await Promise.all([
      SimilarityVote.aggregate([
        { $match: { siteKey, isActive: true } },
        { $group: { _id: '$rating', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      SimilarityVote.aggregate([
        { $match: { siteKey, isActive: true } },
        {
          $group: {
            _id: {
              baseCategory: '$baseCategory',
              baseId: '$baseId',
              alternativeCategory: '$alternativeCategory',
              alternativeId: '$alternativeId',
            },
            avgRating: { $avg: '$rating' },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]),
    ]);
    return res.json({ ratingDist, topPairs });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to build votes summary' });
  }
};

