const User = require('../models/User');
const Follow = require('../models/Follow');
const SimilarityVote = require('../models/SimilarityVote');
const SimilarSuggestion = require('../models/SimilarSuggestion');
const MediaReview = require('../models/MediaReview');
const Media = require('../models/Media');
const UserProfileReport = require('../models/UserProfileReport');
const { normalizeUsername } = require('../utils/username');

/** Public viewers need publicProfile; the account owner can always see their own page. */
function canAccessProfile(user, req) {
  if (user.settings?.publicProfile === true) return true;
  const vid = req.user?._id;
  if (vid && String(vid) === String(user._id)) return true;
  return false;
}

function posterUrl(path) {
  if (!path) return '';
  if (String(path).startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/w342${path}`;
}

function mediaKey(category, tmdbId) {
  return `${category}:${Number(tmdbId)}`;
}

async function fetchMediaMap(siteKey, keys) {
  const uniq = [...new Set(keys.filter(Boolean))];
  const or = [];
  for (const k of uniq) {
    const [cat, idStr] = String(k).split(':');
    const id = Number(idStr);
    if (!cat || !Number.isFinite(id)) continue;
    const isMovie = cat === 'movie' || cat === 'anime_movie';
    if (isMovie) or.push({ siteKey, category: cat, tmdbMovieId: id });
    else or.push({ siteKey, category: cat, tmdbTvId: id });
  }
  if (!or.length) return new Map();
  const docs = await Media.find({ $or: or }).lean();
  const map = new Map();
  for (const m of docs) {
    const tid = m.tmdbMovieId != null ? m.tmdbMovieId : m.tmdbTvId;
    map.set(mediaKey(m.category, tid), m);
  }
  return map;
}

function enrichVote(v, mediaMap) {
  const baseM = mediaMap.get(mediaKey(v.baseCategory, v.baseId));
  const altM = mediaMap.get(mediaKey(v.alternativeCategory, v.alternativeId));
  return {
    id: `vote-${String(v._id)}`,
    type: 'vote',
    createdAt: v.createdAt ? new Date(v.createdAt).toISOString() : null,
    rating: v.rating,
    reason: v.reason || '',
    baseTitle: v.baseTitle || baseM?.displayName || `#${v.baseId}`,
    altTitle: v.altTitle || altM?.displayName || `#${v.alternativeId}`,
    baseCategory: v.baseCategory,
    altCategory: v.alternativeCategory,
    baseId: v.baseId,
    altId: v.alternativeId,
    basePosterUrl: posterUrl(baseM?.posterPath || ''),
    altPosterUrl: posterUrl(altM?.posterPath || ''),
  };
}

function enrichReview(r, mediaMap) {
  const m = mediaMap.get(mediaKey(r.baseCategory, r.baseTmdbId));
  return {
    id: `rev-${String(r._id)}`,
    type: 'review',
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    title: r.title || m?.displayName || `#${r.baseTmdbId}`,
    rating: r.rating,
    text: r.text || '',
    baseCategory: r.baseCategory,
    baseId: r.baseTmdbId,
    posterUrl: posterUrl(m?.posterPath || ''),
  };
}

function inferSimilarCategory(s) {
  if (s.similarCategory) return s.similarCategory;
  if (s.similarTmdbKind === 'movie') return 'movie';
  return 'tv';
}

function enrichSuggestion(s, mediaMap) {
  const baseM = mediaMap.get(mediaKey(s.baseCategory, s.baseTmdbId));
  const simCat = inferSimilarCategory(s);
  const simM = mediaMap.get(mediaKey(simCat, s.similarTmdbId));
  return {
    id: `sugg-${String(s._id)}`,
    type: 'suggestion',
    createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : null,
    reason: s.reason || '',
    status: s.status || 'pending',
    baseTitle: s.baseTitle || baseM?.displayName || `#${s.baseTmdbId}`,
    suggestedTitle: s.suggestedTitle || simM?.displayName || `#${s.similarTmdbId}`,
    baseCategory: s.baseCategory,
    similarCategory: s.similarCategory,
    baseId: s.baseTmdbId,
    suggestedId: s.similarTmdbId,
    basePosterUrl: posterUrl(baseM?.posterPath || ''),
    suggestedPosterUrl: posterUrl(simM?.posterPath || ''),
  };
}

exports.getPublicProfile = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const username = normalizeUsername(req.params.username);
    if (username.length < 3) return res.status(404).json({ error: 'User not found' });

    const user = await User.findOne({ siteKey, username, deletedAt: null }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!canAccessProfile(user, req)) {
      return res.status(404).json({ error: 'Profile is private' });
    }

    const uid = user._id;
    const [reviewsCount, votesCount, suggestionsCount, followersCount, followingCount] = await Promise.all([
      MediaReview.countDocuments({ siteKey, user: uid }),
      SimilarityVote.countDocuments({ siteKey, user: uid, isActive: true }),
      SimilarSuggestion.countDocuments({ siteKey, user: uid }),
      Follow.countDocuments({ siteKey, following: uid }),
      Follow.countDocuments({ siteKey, follower: uid }),
    ]);

    let isFollowing = false;
    const viewerId = req.user?._id ? String(req.user._id) : '';
    if (viewerId && viewerId !== String(uid)) {
      const f = await Follow.findOne({ siteKey, follower: viewerId, following: uid }).lean();
      isFollowing = Boolean(f);
    }

    return res.json({
      user: {
        username: user.username,
        displayName: user.displayName || '',
        avatarUrl: user.avatarUrl || '',
        bio: (user.profile && user.profile.bio) || '',
        createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
        lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : null,
      },
      counts: {
        reviews: reviewsCount,
        votes: votesCount,
        suggestions: suggestionsCount,
        followers: followersCount,
        following: followingCount,
      },
      isFollowing,
      isOwnProfile: viewerId === String(uid),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load profile' });
  }
};

exports.getPublicActivity = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const username = normalizeUsername(req.params.username);
    if (username.length < 3) return res.status(404).json({ error: 'User not found' });

    const user = await User.findOne({ siteKey, username, deletedAt: null }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!canAccessProfile(user, req)) {
      return res.status(404).json({ error: 'Profile is private' });
    }

    const uid = user._id;
    const type = String(req.query.type || 'all').toLowerCase();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(48, Math.max(1, parseInt(req.query.limit, 10) || 24));
    const skip = (page - 1) * limit;

    if (type === 'votes') {
      const votes = await SimilarityVote.find({ siteKey, user: uid, isActive: true })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      const vk = [];
      for (const v of votes) {
        vk.push(mediaKey(v.baseCategory, v.baseId), mediaKey(v.alternativeCategory, v.alternativeId));
      }
      const mediaMap = await fetchMediaMap(siteKey, vk);
      return res.json({
        items: votes.map((v) => enrichVote(v, mediaMap)),
        page,
        limit,
        hasMore: votes.length === limit,
      });
    }
    if (type === 'reviews') {
      const reviews = await MediaReview.find({ siteKey, user: uid })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      const rk = reviews.map((r) => mediaKey(r.baseCategory, r.baseTmdbId));
      const mediaMap = await fetchMediaMap(siteKey, rk);
      return res.json({
        items: reviews.map((r) => enrichReview(r, mediaMap)),
        page,
        limit,
        hasMore: reviews.length === limit,
      });
    }
    if (type === 'suggestions') {
      const sugs = await SimilarSuggestion.find({ siteKey, user: uid })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      const sk = [];
      for (const s of sugs) {
        sk.push(mediaKey(s.baseCategory, s.baseTmdbId));
        sk.push(mediaKey(inferSimilarCategory(s), s.similarTmdbId));
      }
      const mediaMap = await fetchMediaMap(siteKey, sk);
      return res.json({
        items: sugs.map((s) => enrichSuggestion(s, mediaMap)),
        page,
        limit,
        hasMore: sugs.length === limit,
      });
    }

    // all — merge and sort client could paginate; return first page of combined timeline
    const [votesDocs, reviewsDocs, sugsDocs] = await Promise.all([
      SimilarityVote.find({ siteKey, user: uid, isActive: true }).sort({ createdAt: -1 }).limit(200).lean(),
      MediaReview.find({ siteKey, user: uid }).sort({ createdAt: -1 }).limit(200).lean(),
      SimilarSuggestion.find({ siteKey, user: uid }).sort({ createdAt: -1 }).limit(200).lean(),
    ]);
    for (const v of votesDocs) {
      keys.push(mediaKey(v.baseCategory, v.baseId), mediaKey(v.alternativeCategory, v.alternativeId));
    }
    for (const r of reviewsDocs) keys.push(mediaKey(r.baseCategory, r.baseTmdbId));
    for (const s of sugsDocs) {
      keys.push(mediaKey(s.baseCategory, s.baseTmdbId));
      keys.push(mediaKey(inferSimilarCategory(s), s.similarTmdbId));
    }
    const mapAll = await fetchMediaMap(siteKey, keys);

    const merged = [
      ...votesDocs.map((v) => ({ sort: v.createdAt, item: enrichVote(v, mapAll), kind: 'vote' })),
      ...reviewsDocs.map((r) => ({ sort: r.createdAt, item: enrichReview(r, mapAll), kind: 'review' })),
      ...sugsDocs.map((s) => ({ sort: s.createdAt, item: enrichSuggestion(s, mapAll), kind: 'suggestion' })),
    ]
      .sort((a, b) => new Date(b.sort) - new Date(a.sort))
      .slice(skip, skip + limit);

    return res.json({
      items: merged.map((m) => m.item),
      page,
      limit,
      hasMore: merged.length === limit,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load activity' });
  }
};

exports.followUser = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const viewerId = req.user?._id;
    if (!viewerId) return res.status(401).json({ error: 'Unauthorized' });

    const username = normalizeUsername(req.params.username);
    const target = await User.findOne({ siteKey, username, deletedAt: null }).lean();
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (String(target._id) === String(viewerId)) return res.status(400).json({ error: 'Cannot follow yourself' });
    if (target.settings?.publicProfile !== true) return res.status(403).json({ error: 'Profile is private' });

    await Follow.findOneAndUpdate(
      { siteKey, follower: viewerId, following: target._id },
      { siteKey, follower: viewerId, following: target._id },
      { upsert: true, new: true },
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to follow' });
  }
};

exports.unfollowUser = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const viewerId = req.user?._id;
    if (!viewerId) return res.status(401).json({ error: 'Unauthorized' });

    const username = normalizeUsername(req.params.username);
    const target = await User.findOne({ siteKey, username, deletedAt: null }).lean();
    if (!target) return res.status(404).json({ error: 'User not found' });

    await Follow.deleteOne({ siteKey, follower: viewerId, following: target._id });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to unfollow' });
  }
};

exports.getFollowers = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const username = normalizeUsername(req.params.username);
    const user = await User.findOne({ siteKey, username, deletedAt: null }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!canAccessProfile(user, req)) return res.status(404).json({ error: 'Profile is private' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 24));
    const skip = (page - 1) * limit;

    const rows = await Follow.find({ siteKey, following: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('follower', 'username displayName avatarUrl settings')
      .lean();

    const items = rows
      .map((r) => r.follower)
      .filter(Boolean)
      .map((u) => ({
        username: u.username,
        displayName: u.displayName || '',
        avatarUrl: u.avatarUrl || '',
      }))
      .filter((u) => u.username);

    return res.json({ items, page, limit, hasMore: rows.length === limit });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load followers' });
  }
};

exports.getFollowing = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const username = normalizeUsername(req.params.username);
    const user = await User.findOne({ siteKey, username, deletedAt: null }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!canAccessProfile(user, req)) return res.status(404).json({ error: 'Profile is private' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 24));
    const skip = (page - 1) * limit;

    const rows = await Follow.find({ siteKey, follower: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('following', 'username displayName avatarUrl settings')
      .lean();

    const items = rows
      .map((r) => r.following)
      .filter(Boolean)
      .map((u) => ({
        username: u.username,
        displayName: u.displayName || '',
        avatarUrl: u.avatarUrl || '',
      }))
      .filter((u) => u.username);

    return res.json({ items, page, limit, hasMore: rows.length === limit });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load following' });
  }
};

exports.reportUser = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const reporterId = req.user?._id;
    if (!reporterId) return res.status(401).json({ error: 'Unauthorized' });

    const username = normalizeUsername(req.params.username);
    const target = await User.findOne({ siteKey, username, deletedAt: null }).lean();
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (String(target._id) === String(reporterId)) return res.status(400).json({ error: 'Cannot report yourself' });

    const reason = String(req.body?.reason || '').trim().slice(0, 500);
    await UserProfileReport.create({
      siteKey,
      reporter: reporterId,
      target: target._id,
      reason,
    });
    return res.status(201).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to submit report' });
  }
};
