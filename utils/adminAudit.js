const AdminAuditLog = require('../models/AdminAuditLog');
const { getClientIp } = require('./clientIp');

function getAdminActor(req) {
  const fromHeader = String(req.headers['x-admin-user'] || '').trim();
  if (fromHeader) return fromHeader.slice(0, 120);
  return 'system';
}

async function logAdminAction(req, payload) {
  try {
    await AdminAuditLog.create({
      siteKey: req.siteKey || 'default',
      actor: getAdminActor(req),
      action: String(payload?.action || '').trim(),
      entityType: String(payload?.entityType || '').trim(),
      entityId: String(payload?.entityId || '').trim(),
      ip: getClientIp(req),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
      details: payload?.details || {},
    });
  } catch (_err) {
    // Do not block primary request flow on audit failures.
  }
}

module.exports = { logAdminAction, getAdminActor };
