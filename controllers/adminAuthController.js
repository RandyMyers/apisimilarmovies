const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const AdminUser = require('../models/AdminUser');
const AdminPasswordReset = require('../models/AdminPasswordReset');
const { logAdminAction } = require('../utils/adminAudit');

function signToken({ userId, email, role }) {
  const secret = process.env.JWT_SECRET;
  return jwt.sign({ userId, email, role }, secret, { expiresIn: '7d' });
}

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

exports.login = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    const user = await AdminUser.findOne({ email }).lean();
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({ userId: user._id, email: user.email, role: user.role });
    return res.json({ success: true, token, role: user.role, email: user.email });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Login failed' });
  }
};

exports.register = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const role = String(req.body?.role || 'editor').toLowerCase();
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    if (!['moderator', 'editor', 'super_admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const existing = await AdminUser.findOne({ email }).lean();
    if (existing) return res.status(409).json({ error: 'Account already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const doc = await AdminUser.create({
      siteKey: req.siteKey || 'default',
      email,
      passwordHash,
      role,
    });

    const token = signToken({ userId: doc._id, email: doc.email, role: doc.role });
    return res.status(201).json({ success: true, token, role: doc.role, email: doc.email });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Register failed' });
  }
};

// MVP forgot flow: creates a reset token and returns a debug token in response.
// If you want email delivery, we can add it later (requires nodemailer or similar).
exports.forgotPassword = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: 'email is required' });

    const user = await AdminUser.findOne({ email }).lean();
    // Always respond success to avoid account enumeration.
    if (!user) return res.json({ success: true });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes

    await AdminPasswordReset.deleteMany({ email, usedAt: null });
    await AdminPasswordReset.create({
      siteKey: req.siteKey || 'default',
      email,
      tokenHash,
      expiresAt,
    });

    // Debug token for MVP
    return res.json({ success: true, debugToken: rawToken });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Forgot password failed' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const token = String(req.body?.token || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!token || !newPassword) return res.status(400).json({ error: 'token and newPassword are required' });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const doc = await AdminPasswordReset.findOne({ tokenHash, usedAt: null, expiresAt: { $gt: new Date() } });
    if (!doc) return res.status(400).json({ error: 'Invalid or expired token' });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await AdminUser.updateOne({ email: doc.email }, { $set: { passwordHash } });

    doc.usedAt = new Date();
    await doc.save();

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Reset failed' });
  }
};

exports.me = async (req, res) => {
  try {
    const userId = String(req.admin?.userId || '');
    if (!userId) return res.status(401).json({ error: 'Unauthorized admin request' });
    const doc = await AdminUser.findById(userId).lean();
    if (!doc) return res.status(404).json({ error: 'Admin user not found' });
    return res.json({
      _id: doc._id,
      email: doc.email,
      role: doc.role,
      displayName: doc.displayName || '',
      avatarUrl: doc.avatarUrl || '',
      timezone: doc.timezone || '',
      preferences: doc.preferences || {},
      siteKey: doc.siteKey || 'default',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load profile' });
  }
};

exports.updateMe = async (req, res) => {
  try {
    const userId = String(req.admin?.userId || '');
    if (!userId) return res.status(401).json({ error: 'Unauthorized admin request' });
    const patch = {};
    if (req.body?.displayName != null) patch.displayName = String(req.body.displayName || '').trim();
    if (req.body?.avatarUrl != null) patch.avatarUrl = String(req.body.avatarUrl || '').trim();
    if (req.body?.timezone != null) patch.timezone = String(req.body.timezone || '').trim();
    if (req.body?.preferences != null && typeof req.body.preferences === 'object') {
      patch.preferences = req.body.preferences;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'No valid fields to update' });
    const updated = await AdminUser.findByIdAndUpdate(userId, { $set: patch }, { new: true }).lean();
    await logAdminAction(req, {
      action: 'admin.me.update',
      entityType: 'admin_user',
      entityId: userId,
      details: { fields: Object.keys(patch) },
    });
    return res.json({ success: true, item: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to update profile' });
  }
};

exports.changeMyPassword = async (req, res) => {
  try {
    const userId = String(req.admin?.userId || '');
    if (!userId) return res.status(401).json({ error: 'Unauthorized admin request' });
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    const doc = await AdminUser.findById(userId);
    if (!doc) return res.status(404).json({ error: 'Admin user not found' });
    const ok = await bcrypt.compare(currentPassword, doc.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Current password is invalid' });
    doc.passwordHash = await bcrypt.hash(newPassword, 10);
    await doc.save();
    await logAdminAction(req, {
      action: 'admin.me.password',
      entityType: 'admin_user',
      entityId: userId,
      details: {},
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to change password' });
  }
};

