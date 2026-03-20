const AdminAuditLog = require('../models/AdminAuditLog');

exports.list = async (req, res) => {
  try {
    const siteKey = req.siteKey || 'default';
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
    const action = String(req.query.action || '').trim();
    const entityType = String(req.query.entityType || '').trim();
    const actor = String(req.query.actor || '').trim();
    const q = String(req.query.q || '').trim();

    const filter = { siteKey };
    if (action) filter.action = action;
    if (entityType) filter.entityType = entityType;
    if (actor) filter.actor = actor;
    if (q) {
      filter.$or = [
        { action: { $regex: q, $options: 'i' } },
        { entityType: { $regex: q, $options: 'i' } },
        { entityId: { $regex: q, $options: 'i' } },
        { actor: { $regex: q, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      AdminAuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AdminAuditLog.countDocuments(filter),
    ]);

    return res.json({
      total,
      items: items.map((x) => ({
        id: x._id,
        siteKey: x.siteKey,
        actor: x.actor,
        action: x.action,
        entityType: x.entityType,
        entityId: x.entityId,
        ip: x.ip,
        userAgent: x.userAgent,
        details: x.details || {},
        createdAt: x.createdAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to list audit logs' });
  }
};
