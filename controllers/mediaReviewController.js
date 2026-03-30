const MediaReview = require('../models/MediaReview');
const mongoose = require('mongoose');
const { parseCategory } = require('../utils/parseCategory');
const { getClientIp } = require('../utils/clientIp');

/**
 * For private profiles, other users see "Member" with no link or avatar.
 * Public profile OR the signed-in author always gets label + avatar + profileUsername (for linking).
 */
function serializeReviewAuthor(user, viewerId) {
  if (!user || !user._id) return null;
  const uid = String(user._id);
  const viewer = viewerId ? String(viewerId) : '';
  const publicProfile = user.settings?.publicProfile === true;
  const isViewer = Boolean(viewer && uid === viewer);
  const username = String(user.username || '').trim().toLowerCase();
  const hasUsername = username.length >= 3;

  if (!publicProfile && !isViewer) {
    return {
      label: 'Member',
      avatarUrl: '',
      profileUsername: null,
    };
  }

  const label =
    (user.displayName && String(user.displayName).trim()) ||
    (hasUsername ? `@${username}` : 'Member');

  return {
    label,
    avatarUrl: user.avatarUrl || '',
    profileUsername: hasUsername ? username : null,
  };
}

exports.listReviews = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const category = parseCategory(req.params.category);
    const baseTmdbId = parseInt(req.params.id, 10);
    if (!category || !Number.isFinite(baseTmdbId)) {
      return res.status(400).json({ error: 'Invalid category or id' });
    }
    const viewerId = req.user?._id ? String(req.user._id) : '';
    const reviews = await MediaReview.find({ siteKey, baseCategory: category, baseTmdbId })
      .populate('user', 'username displayName avatarUrl settings')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const shaped = reviews.map((r) => {
      const { user: u, ...rest } = r;
      return {
        ...rest,
        author: serializeReviewAuthor(u, viewerId),
      };
    });

    return res.json({ reviews: shaped });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load reviews' });
  }
};

exports.createReview = async (req, res) => {
  try {
    const connected = mongoose.connection.readyState === 1;
    if (!connected) return res.status(503).json({ error: 'Database unavailable' });

    const siteKey = req.siteKey || 'default';
    const category = parseCategory(req.params.category);
    const baseTmdbId = parseInt(req.params.id, 10);
    if (!category || !Number.isFinite(baseTmdbId)) {
      return res.status(400).json({ error: 'Invalid category or id' });
    }
    const rating = parseInt(req.body?.rating, 10);
    const text = String(req.body?.text || '').trim();
    const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 200) : '';
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'rating must be 1-5' });
    }
    const ip = getClientIp(req);
    await MediaReview.create({
      siteKey,
      baseCategory: category,
      baseTmdbId,
      rating,
      text,
      ip,
      title,
      user: req.user?._id || null,
    });
    return res.status(201).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to submit review' });
  }
};
