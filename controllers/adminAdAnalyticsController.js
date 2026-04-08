const mongoose = require('mongoose');
const AdEvent = require('../models/AdEvent');
const AdCampaign = require('../models/AdCampaign');
const AdDailyAnalytics = require('../models/AdDailyAnalytics');
const { asyncHandler } = require('../middleware/errorHandler');
const { resolveWebsiteIdForAds } = require('../utils/resolveWebsiteIdForAds');
const { refreshDailyRollups } = require('../services/adDailyRollupService');

const parseDate = (v, fallback) => {
  if (!v) return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d;
};

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 10000) / 100 : 0);

exports.getAnalytics = asyncHandler(async (req, res) => {
  const websiteParam = req.query.website;
  const websiteId = websiteParam ? await resolveWebsiteIdForAds(websiteParam) : null;
  if (websiteParam && !websiteId) {
    return res.status(400).json({ success: false, message: 'Invalid website (id or site key)' });
  }

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = parseDate(req.query.from, defaultFrom);
  const to = parseDate(req.query.to, now);

  const match = {
    createdAt: { $gte: from, $lte: to },
    ...(websiteId ? { website: new mongoose.Types.ObjectId(websiteId) } : {}),
  };

  if (req.query.campaign && mongoose.Types.ObjectId.isValid(req.query.campaign)) {
    match.campaign = new mongoose.Types.ObjectId(req.query.campaign);
  }

  const [totalsAgg, byCampaign, byPlacement, byCountryAgg] = await Promise.all([
    AdEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$eventType',
          count: { $sum: 1 },
        },
      },
    ]),
    AdEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$campaign',
          impressions: { $sum: { $cond: [{ $eq: ['$eventType', 'impression'] }, 1, 0] } },
          clicks: { $sum: { $cond: [{ $eq: ['$eventType', 'click'] }, 1, 0] } },
        },
      },
      { $sort: { impressions: -1, clicks: -1 } },
      { $limit: 100 },
    ]),
    AdEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: { placement: '$placement', eventType: '$eventType' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 200 },
    ]),
    AdEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $cond: [{ $eq: [{ $ifNull: ['$country', ''] }, ''] }, '(unknown)', '$country'],
          },
          impressions: { $sum: { $cond: [{ $eq: ['$eventType', 'impression'] }, 1, 0] } },
          clicks: { $sum: { $cond: [{ $eq: ['$eventType', 'click'] }, 1, 0] } },
        },
      },
      { $sort: { impressions: -1 } },
      { $limit: 80 },
    ]),
  ]);

  let impressions = 0;
  let clicks = 0;
  totalsAgg.forEach((row) => {
    if (row._id === 'impression') impressions = row.count;
    if (row._id === 'click') clicks = row.count;
  });

  const campaignIds = byCampaign.map((x) => x._id).filter(Boolean);
  const campaigns = await AdCampaign.find({ _id: { $in: campaignIds } })
    .select('name advertiserName status website')
    .populate('website', 'name key')
    .lean();
  const campaignById = new Map(campaigns.map((c) => [String(c._id), c]));

  const rows = byCampaign.map((row) => {
    const camp = campaignById.get(String(row._id));
    const imp = row.impressions || 0;
    const clk = row.clicks || 0;
    return {
      campaignId: row._id,
      name: camp?.name || 'Unknown',
      advertiserName: camp?.advertiserName || '',
      status: camp?.status || '',
      website: camp?.website || null,
      impressions: imp,
      clicks: clk,
      ctr: pct(clk, imp),
    };
  });

  const placementRows = {};
  byPlacement.forEach((row) => {
    const pl = row._id?.placement || '(none)';
    const type = row._id?.eventType;
    if (!placementRows[pl]) placementRows[pl] = { placement: pl, impressions: 0, clicks: 0 };
    if (type === 'impression') placementRows[pl].impressions += row.count;
    if (type === 'click') placementRows[pl].clicks += row.count;
  });
  const byPlacementOut = Object.values(placementRows).map((p) => ({
    ...p,
    ctr: pct(p.clicks, p.impressions),
  }));

  const byCountry = byCountryAgg.map((row) => {
    const imp = row.impressions || 0;
    const clk = row.clicks || 0;
    return {
      country: row._id,
      impressions: imp,
      clicks: clk,
      ctr: pct(clk, imp),
    };
  });

  res.status(200).json({
    success: true,
    data: {
      range: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        impressions,
        clicks,
        ctr: pct(clicks, impressions),
      },
      byCampaign: rows,
      byPlacement: byPlacementOut.sort((a, b) => b.impressions - a.impressions),
      byCountry,
    },
  });
});

exports.getDailyAnalytics = asyncHandler(async (req, res) => {
  const websiteParam = req.query.website;
  const websiteId = websiteParam ? await resolveWebsiteIdForAds(websiteParam) : null;
  if (websiteParam && !websiteId) {
    return res.status(400).json({ success: false, message: 'Invalid website (id or site key)' });
  }

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = parseDate(req.query.from, defaultFrom);
  const to = parseDate(req.query.to, now);
  const campaignId = req.query.campaign && mongoose.Types.ObjectId.isValid(req.query.campaign) ? req.query.campaign : null;

  await refreshDailyRollups({ from, to, websiteId, campaignId });
  const dayFrom = from.toISOString().slice(0, 10);
  const dayTo = to.toISOString().slice(0, 10);
  const docs = await AdDailyAnalytics.aggregate([
    {
      $match: {
        day: { $gte: dayFrom, $lte: dayTo },
        ...(websiteId ? { website: new mongoose.Types.ObjectId(websiteId) } : {}),
        ...(campaignId ? { campaign: new mongoose.Types.ObjectId(campaignId) } : {}),
      },
    },
    {
      $group: {
        _id: '$day',
        impressions: { $sum: '$impressions' },
        clicks: { $sum: '$clicks' },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  const daily = docs.map((x) => ({
    day: x._id,
    impressions: x.impressions || 0,
    clicks: x.clicks || 0,
    ctr: pct(x.clicks || 0, x.impressions || 0),
  }));
  res.status(200).json({
    success: true,
    data: {
      range: { from: from.toISOString(), to: to.toISOString() },
      daily,
    },
  });
});

exports.refreshDailyAnalytics = asyncHandler(async (req, res) => {
  const websiteParam = req.body.website || req.query.website;
  const websiteId = websiteParam ? await resolveWebsiteIdForAds(websiteParam) : null;
  if (websiteParam && !websiteId) {
    return res.status(400).json({ success: false, message: 'Invalid website (id or site key)' });
  }
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = parseDate(req.body.from || req.query.from, defaultFrom);
  const to = parseDate(req.body.to || req.query.to, now);
  const campaignRaw = req.body.campaign || req.query.campaign;
  const campaignId = campaignRaw && mongoose.Types.ObjectId.isValid(campaignRaw) ? campaignRaw : null;
  const affected = await refreshDailyRollups({ from, to, websiteId, campaignId });
  res.status(200).json({
    success: true,
    data: {
      range: { from: from.toISOString(), to: to.toISOString() },
      affectedRows: affected,
    },
  });
});
