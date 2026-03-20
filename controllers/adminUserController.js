const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { logAdminAction } = require('../utils/adminAudit');

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function csvEscape(v) {
  const s = String(v == null ? '' : v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

exports.list = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const q = String(req.query.q || '').trim().toLowerCase();
    const status = String(req.query.status || '').toLowerCase();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const sortBy = String(req.query.sortBy || 'createdAt');
    const sortDir = String(req.query.sortDir || 'desc') === 'asc' ? 1 : -1;

    const moderationStatus = String(req.query.moderationStatus || '').toLowerCase();
    const filter = { siteKey, deletedAt: null };
    if (status === 'active') filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;
    if (['clean', 'flagged', 'suspended'].includes(moderationStatus)) filter.moderationStatus = moderationStatus;
    if (q) {
      filter.$or = [
        { email: { $regex: q, $options: 'i' } },
        { displayName: { $regex: q, $options: 'i' } },
      ];
    }
    const sort = {};
    sort[['email', 'displayName', 'createdAt', 'lastLoginAt'].includes(sortBy) ? sortBy : 'createdAt'] = sortDir;

    const [items, total] = await Promise.all([
      User.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    return res.json({ items, total, page, limit });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to list users' });
  }
};

exports.getOne = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const doc = await User.findOne({ _id: req.params.id, siteKey, deletedAt: null }).lean();
    if (!doc) return res.status(404).json({ error: 'User not found' });
    return res.json(doc);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load user' });
  }
};

exports.create = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const displayName = String(req.body?.displayName || '').trim();
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
    const passwordHash = await bcrypt.hash(password, 10);
    const doc = await User.create({
      siteKey,
      email,
      passwordHash,
      displayName,
      avatarUrl: String(req.body?.avatarUrl || '').trim(),
      bio: String(req.body?.bio || '').trim(),
      locale: String(req.body?.locale || 'en-US').trim(),
      timezone: String(req.body?.timezone || '').trim(),
      isActive: req.body?.isActive !== undefined ? Boolean(req.body.isActive) : true,
      moderationStatus: ['clean', 'flagged', 'suspended'].includes(String(req.body?.moderationStatus || ''))
        ? String(req.body.moderationStatus)
        : 'clean',
      moderationNote: String(req.body?.moderationNote || '').trim(),
    });
    await logAdminAction(req, {
      action: 'user.create',
      entityType: 'user',
      entityId: String(doc._id),
      details: { email: doc.email },
    });
    return res.status(201).json({ success: true, id: doc._id, item: doc });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email already exists for this site' });
    return res.status(500).json({ error: err.message || 'Failed to create user' });
  }
};

exports.update = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const patch = {};
    if (req.body?.email != null) patch.email = normalizeEmail(req.body.email);
    if (req.body?.displayName != null) patch.displayName = String(req.body.displayName || '').trim();
    if (req.body?.avatarUrl != null) patch.avatarUrl = String(req.body.avatarUrl || '').trim();
    if (req.body?.bio != null) patch.bio = String(req.body.bio || '').trim();
    if (req.body?.locale != null) patch.locale = String(req.body.locale || '').trim();
    if (req.body?.timezone != null) patch.timezone = String(req.body.timezone || '').trim();
    if (req.body?.isEmailVerified != null) patch.isEmailVerified = Boolean(req.body.isEmailVerified);
    if (req.body?.isActive != null) patch.isActive = Boolean(req.body.isActive);
    if (req.body?.moderationStatus != null) {
      const raw = String(req.body.moderationStatus || '').toLowerCase();
      if (!['clean', 'flagged', 'suspended'].includes(raw)) {
        return res.status(400).json({ error: 'Invalid moderationStatus' });
      }
      patch.moderationStatus = raw;
    }
    if (req.body?.moderationNote != null) patch.moderationNote = String(req.body.moderationNote || '').trim();
    if (req.body?.password != null && String(req.body.password).trim()) {
      patch.passwordHash = await bcrypt.hash(String(req.body.password), 10);
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'No valid fields to update' });
    const doc = await User.findOneAndUpdate(
      { _id: req.params.id, siteKey, deletedAt: null },
      { $set: patch },
      { new: true },
    ).lean();
    if (!doc) return res.status(404).json({ error: 'User not found' });
    await logAdminAction(req, {
      action: 'user.update',
      entityType: 'user',
      entityId: String(doc._id),
      details: { patch: { ...patch, passwordHash: patch.passwordHash ? '[updated]' : undefined } },
    });
    return res.json({ success: true, item: doc });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email already exists for this site' });
    return res.status(500).json({ error: err.message || 'Failed to update user' });
  }
};

exports.setStatus = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const isActive = Boolean(req.body?.isActive);
    const doc = await User.findOneAndUpdate(
      { _id: req.params.id, siteKey },
      { $set: { isActive } },
      { new: true },
    ).lean();
    if (!doc) return res.status(404).json({ error: 'User not found' });
    await logAdminAction(req, {
      action: 'user.status',
      entityType: 'user',
      entityId: String(doc._id),
      details: { isActive },
    });
    return res.json({ success: true, item: doc });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to update status' });
  }
};

exports.remove = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const doc = await User.findOneAndUpdate(
      { _id: req.params.id, siteKey, deletedAt: null },
      { $set: { deletedAt: new Date(), isActive: false } },
      { new: true },
    ).lean();
    if (!doc) return res.status(404).json({ error: 'User not found' });
    await logAdminAction(req, {
      action: 'user.delete',
      entityType: 'user',
      entityId: String(doc._id),
      details: { email: doc.email },
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to delete user' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const newPassword = String(req.body?.newPassword || '');
    if (!newPassword.trim()) return res.status(400).json({ error: 'newPassword is required' });
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const doc = await User.findOneAndUpdate(
      { _id: req.params.id, siteKey, deletedAt: null },
      { $set: { passwordHash } },
      { new: true },
    ).lean();
    if (!doc) return res.status(404).json({ error: 'User not found' });
    await logAdminAction(req, {
      action: 'user.reset_password',
      entityType: 'user',
      entityId: String(doc._id),
      details: { email: doc.email },
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to reset password' });
  }
};

exports.bulkUpdate = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((v) => String(v)) : [];
    const action = String(req.body?.action || '').trim().toLowerCase();
    if (!ids.length || !action) return res.status(400).json({ error: 'ids and action are required' });
    const query = { _id: { $in: ids }, siteKey, deletedAt: null };
    let update = {};
    if (action === 'activate') update = { isActive: true };
    if (action === 'deactivate') update = { isActive: false };
    if (action === 'flag') update = { moderationStatus: 'flagged' };
    if (action === 'suspend') update = { moderationStatus: 'suspended', isActive: false };
    if (action === 'clear_flag') update = { moderationStatus: 'clean', moderationNote: '' };
    if (action === 'delete') update = { deletedAt: new Date(), isActive: false };
    if (!Object.keys(update).length) return res.status(400).json({ error: 'Unsupported bulk action' });
    const result = await User.updateMany(query, { $set: update });
    await logAdminAction(req, {
      action: 'user.bulk_update',
      entityType: 'user',
      entityId: ids.join(','),
      details: { action, count: result.modifiedCount || 0 },
    });
    return res.json({ success: true, modified: result.modifiedCount || 0 });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Bulk update failed' });
  }
};

exports.exportCsv = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const rows = await User.find({ siteKey, deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(10000)
      .lean();
    const headers = [
      'id',
      'email',
      'displayName',
      'isActive',
      'isEmailVerified',
      'moderationStatus',
      'moderationNote',
      'locale',
      'timezone',
      'createdAt',
      'lastLoginAt',
    ];
    const lines = [headers.join(',')];
    rows.forEach((r) => {
      lines.push(
        [
          r._id,
          r.email,
          r.displayName,
          r.isActive,
          r.isEmailVerified,
          r.moderationStatus || 'clean',
          r.moderationNote || '',
          r.locale || '',
          r.timezone || '',
          r.createdAt || '',
          r.lastLoginAt || '',
        ]
          .map(csvEscape)
          .join(','),
      );
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="users-${siteKey}.csv"`);
    return res.status(200).send(lines.join('\n'));
  } catch (err) {
    return res.status(500).json({ error: err.message || 'CSV export failed' });
  }
};
