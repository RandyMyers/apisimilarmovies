const mongoose = require('mongoose');
const os = require('os');
const AdEvent = require('../models/AdEvent');
const AdDailyAnalytics = require('../models/AdDailyAnalytics');
const AdSchedulerLock = require('../models/AdSchedulerLock');

const LOCK_KEY = 'ad-daily-rollup';
const DEFAULT_LEASE_MS = 55 * 60 * 1000;

const toObjectId = (v) => (v ? new mongoose.Types.ObjectId(v) : null);

const buildDailyMatch = ({ from, to, websiteId, campaignId }) => ({
  createdAt: { $gte: from, $lte: to },
  ...(websiteId ? { website: toObjectId(websiteId) } : {}),
  ...(campaignId ? { campaign: toObjectId(campaignId) } : {}),
});

async function refreshDailyRollups({ from, to, websiteId = null, campaignId = null }) {
  const match = buildDailyMatch({ from, to, websiteId, campaignId });
  const rows = await AdEvent.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          website: '$website',
          campaign: '$campaign',
        },
        impressions: { $sum: { $cond: [{ $eq: ['$eventType', 'impression'] }, 1, 0] } },
        clicks: { $sum: { $cond: [{ $eq: ['$eventType', 'click'] }, 1, 0] } },
      },
    },
  ]);

  if (!rows.length) return 0;
  const ops = rows.map((row) => ({
    updateOne: {
      filter: {
        day: row._id.day,
        website: row._id.website || null,
        campaign: row._id.campaign || null,
      },
      update: {
        $set: {
          impressions: row.impressions || 0,
          clicks: row.clicks || 0,
        },
      },
      upsert: true,
    },
  }));
  await AdDailyAnalytics.bulkWrite(ops, { ordered: false });
  return rows.length;
}

async function tryAcquireDistributedLock({ leaseMs = DEFAULT_LEASE_MS }) {
  const now = new Date();
  const owner = `${process.pid}-${os.hostname()}`;
  const lockedUntil = new Date(now.getTime() + leaseMs);
  try {
    await AdSchedulerLock.updateOne({ key: LOCK_KEY }, { $setOnInsert: { lockedUntil: new Date(0), owner: '' } }, { upsert: true });
    const doc = await AdSchedulerLock.findOneAndUpdate(
      { key: LOCK_KEY, lockedUntil: { $lte: now } },
      { $set: { lockedUntil, owner } },
      { new: true },
    ).lean();
    return !!doc;
  } catch (err) {
    console.warn('Ad rollup lock error:', err.message);
    return false;
  }
}

function startDailyRollupScheduler({ intervalMs = 60 * 60 * 1000, lookbackDays = 35, leaseMs = DEFAULT_LEASE_MS } = {}) {
  let running = false;
  const tick = async () => {
    if (running) return;
    if (mongoose.connection.readyState !== 1) return;
    const acquired = await tryAcquireDistributedLock({ leaseMs: Math.max(leaseMs, intervalMs - 60 * 1000) });
    if (!acquired) return;
    running = true;
    try {
      const now = new Date();
      const from = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
      const affected = await refreshDailyRollups({ from, to: now });
      console.info(`Ad daily rollup refreshed (${affected} group rows)`);
    } catch (err) {
      console.error('Ad daily rollup scheduler error:', err.message);
    } finally {
      running = false;
    }
  };

  setTimeout(() => {
    tick();
  }, 30 * 1000);
  return setInterval(tick, intervalMs);
}

module.exports = {
  refreshDailyRollups,
  startDailyRollupScheduler,
  tryAcquireDistributedLock,
};
