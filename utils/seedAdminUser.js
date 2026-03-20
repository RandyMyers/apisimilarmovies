const bcrypt = require('bcryptjs');

const AdminUser = require('../models/AdminUser');

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

async function seedAdminUser() {
  const seedEmail = normalizeEmail(process.env.ADMIN_SEED_EMAIL) || normalizeEmail(process.env.USER) || '';
  const seedPassword = String(process.env.ADMIN_SEED_PASSWORD || process.env.PASSWORD || '');
  const seedRole = String(process.env.ADMIN_SEED_ROLE || 'super_admin').toLowerCase();

  if (!seedEmail || !seedPassword) {
    console.warn('[seedAdminUser] No seed email/password provided. Set ADMIN_SEED_EMAIL + ADMIN_SEED_PASSWORD (or use USER/PASSWORD).');
    return;
  }

  if (!['moderator', 'editor', 'super_admin'].includes(seedRole)) {
    console.warn('[seedAdminUser] Invalid ADMIN_SEED_ROLE; using super_admin.');
  }

  const role = ['moderator', 'editor', 'super_admin'].includes(seedRole) ? seedRole : 'super_admin';

  const existing = await AdminUser.findOne({ email: seedEmail }).lean();
  if (existing) {
    console.log(`[seedAdminUser] Admin user already exists: ${seedEmail}`);
    return;
  }

  const passwordHash = await bcrypt.hash(seedPassword, 10);
  await AdminUser.create({
    siteKey: 'default',
    email: seedEmail,
    passwordHash,
    role,
  });

  // Only log email + role (never password).
  console.log(`[seedAdminUser] Seeded admin user: ${seedEmail} (role: ${role})`);
}

module.exports = { seedAdminUser };

