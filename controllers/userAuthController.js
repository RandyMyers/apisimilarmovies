const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const User = require('../models/User');
const UserPasswordReset = require('../models/UserPasswordReset');
const { getUserJwtSecret } = require('../middleware/userAuth');
const { normalizeUsername, validateUsername } = require('../utils/username');

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function signUserToken({ userId, email, siteKey }) {
  const secret = getUserJwtSecret();
  if (!secret) throw new Error('USER_JWT_SECRET not configured');
  return jwt.sign({ userId, email, siteKey }, secret, { expiresIn: '14d' });
}

function toSafeUser(user) {
  const u = user.toObject ? user.toObject() : user;
  return {
    _id: u._id,
    email: u.email,
    username: u.username || '',
    displayName: u.displayName || '',
    avatarUrl: u.avatarUrl || '',
    bio: (u.profile && u.profile.bio) || '',
    locale: u.locale || 'en-US',
    timezone: u.timezone || '',
    settings: {
      emailNotifs: u?.settings?.emailNotifs !== false,
      contentTips: u?.settings?.contentTips !== false,
      publicProfile: u?.settings?.publicProfile === true,
    },
    siteKey: u.siteKey || 'default',
    createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : undefined,
  };
}

exports.register = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const displayName = String(req.body?.displayName || req.body?.name || '').trim();
    const uName = validateUsername(req.body?.username);
    if (!uName.ok) return res.status(400).json({ error: uName.error });
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      siteKey,
      email,
      username: uName.username,
      passwordHash,
      displayName,
      locale: String(req.body?.locale || 'en-US').trim(),
      timezone: String(req.body?.timezone || '').trim(),
      isActive: true,
      isEmailVerified: false,
    });
    const token = signUserToken({ userId: user._id, email: user.email, siteKey });
    return res.status(201).json({ success: true, token, user: toSafeUser(user) });
  } catch (err) {
    if (err.code === 11000) {
      const msg = String(err.message || '');
      if (msg.includes('username')) return res.status(409).json({ error: 'Username already taken' });
      return res.status(409).json({ error: 'Account already exists' });
    }
    return res.status(500).json({ error: err.message || 'Register failed' });
  }
};

exports.login = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const identifier = String(req.body?.identifier || req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    if (!identifier || !password) return res.status(400).json({ error: 'identifier and password are required' });

    let user;
    if (identifier.includes('@')) {
      const email = normalizeEmail(identifier);
      user = await User.findOne({ siteKey, email, deletedAt: null });
    } else {
      const nu = normalizeUsername(identifier);
      if (nu.length < 3) return res.status(401).json({ error: 'Invalid credentials' });
      user = await User.findOne({ siteKey, username: nu, deletedAt: null });
    }

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.isActive) return res.status(403).json({ error: 'Account is inactive' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    user.lastLoginAt = new Date();
    await user.save();
    const token = signUserToken({ userId: user._id, email: user.email, siteKey });
    return res.json({ success: true, token, user: toSafeUser(user) });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Login failed' });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: 'email is required' });
    const user = await User.findOne({ siteKey, email, deletedAt: null }).lean();
    if (!user) return res.json({ success: true });
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);
    await UserPasswordReset.deleteMany({ siteKey, email, usedAt: null });
    await UserPasswordReset.create({ siteKey, email, tokenHash, expiresAt });
    return res.json({ success: true, debugToken: rawToken });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Forgot password failed' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const token = String(req.body?.token || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!token || !newPassword) return res.status(400).json({ error: 'token and newPassword are required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'newPassword must be at least 6 characters' });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const doc = await UserPasswordReset.findOne({ siteKey, tokenHash, usedAt: null, expiresAt: { $gt: new Date() } });
    if (!doc) return res.status(400).json({ error: 'Invalid or expired token' });
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await User.updateOne({ siteKey, email: doc.email, deletedAt: null }, { $set: { passwordHash } });
    doc.usedAt = new Date();
    await doc.save();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Reset failed' });
  }
};

exports.me = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const userId = String(req.user?._id || '');
    const user = await User.findOne({ _id: userId, siteKey, deletedAt: null }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: toSafeUser(user) });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load profile' });
  }
};

exports.updateMe = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const userId = String(req.user?._id || '');
    const patch = {};

    if (req.body?.displayName != null) patch.displayName = String(req.body.displayName || '').trim();
    if (req.body?.avatarUrl != null) patch.avatarUrl = String(req.body.avatarUrl || '').trim();

    if (req.body?.avatarDataUrl != null && String(req.body.avatarDataUrl).trim() !== '') {
      const raw = String(req.body.avatarDataUrl || '').trim();
      if (!/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(raw)) {
        return res.status(400).json({ error: 'Avatar must be a JPEG, PNG, WebP, or GIF image.' });
      }
      if (raw.length > 600000) {
        return res.status(400).json({ error: 'Avatar image is too large. Try a smaller file.' });
      }
      patch.avatarUrl = raw;
    }
    if (req.body?.locale != null) patch.locale = String(req.body.locale || 'en-US').trim();
    if (req.body?.timezone != null) patch.timezone = String(req.body.timezone || '').trim();

    if (req.body?.bio != null) {
      patch['profile.bio'] = String(req.body.bio || '').trim().slice(0, 500);
    }

    if (req.body?.username != null && String(req.body.username).trim() !== '') {
      const v = validateUsername(req.body.username);
      if (!v.ok) return res.status(400).json({ error: v.error });
      const clash = await User.findOne({
        siteKey,
        username: v.username,
        deletedAt: null,
        _id: { $ne: userId },
      }).lean();
      if (clash) return res.status(409).json({ error: 'Username already taken' });
      patch.username = v.username;
    }

    if (req.body?.settings != null && typeof req.body.settings === 'object') {
      patch.settings = {
        emailNotifs: req.body.settings?.emailNotifs !== false,
        contentTips: req.body.settings?.contentTips !== false,
        publicProfile: req.body.settings?.publicProfile === true,
      };
    }

    if (!Object.keys(patch).length) return res.status(400).json({ error: 'No valid fields to update' });
    const user = await User.findOneAndUpdate({ _id: userId, siteKey, deletedAt: null }, { $set: patch }, { new: true }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ success: true, user: toSafeUser(user) });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Username already taken' });
    return res.status(500).json({ error: err.message || 'Failed to update profile' });
  }
};

exports.changeMyPassword = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const userId = String(req.user?._id || '');
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 6) return res.status(400).json({ error: 'newPassword must be at least 6 characters' });
    const user = await User.findOne({ _id: userId, siteKey, deletedAt: null });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Current password is invalid' });
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to change password' });
  }
};
