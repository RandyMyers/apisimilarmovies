const OfferClick = require('../models/OfferClick');
const { asyncHandler } = require('../middleware/errorHandler');
const { getClientIP, hashIP } = require('../utils/visitorTracking');

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - Number(days || 30));
  return d;
}

exports.trackOfferClick = asyncHandler(async (req, res) => {
  const siteKey = req.siteKey || 'default';
  const ip = getClientIP(req);
  const {
    category,
    tmdbId,
    language,
    offerIndex,
    offerTitle,
    offerUrl,
    sessionId,
  } = req.body || {};

  if (!String(offerUrl || '').trim()) {
    return res.status(400).json({ error: 'offerUrl is required' });
  }

  await OfferClick.create({
    siteKey,
    category: String(category || '').trim().toLowerCase(),
    tmdbId: Number.isFinite(Number(tmdbId)) ? Number(tmdbId) : null,
    language: String(language || 'en-us').trim().toLowerCase(),
    offerIndex: Number.isFinite(Number(offerIndex)) ? Number(offerIndex) : 0,
    offerTitle: String(offerTitle || '').trim(),
    offerUrl: String(offerUrl || '').trim(),
    sessionId: String(sessionId || '').trim(),
    ipHash: hashIP(ip),
    referrer: String(req.headers.referer || req.headers.referrer || '').slice(0, 500),
  });

  return res.status(201).json({ success: true });
});

exports.getOverview = asyncHandler(async (req, res) => {
  const siteKey = req.siteKey || 'default';
  const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30));
  const since = daysAgo(days);
  const match = { siteKey, clickedAt: { $gte: since } };

  const [totals, topOffers] = await Promise.all([
    OfferClick.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalClicks: { $sum: 1 },
          uniqueClicks: { $addToSet: '$ipHash' },
        },
      },
      { $project: { totalClicks: 1, uniqueClicks: { $size: '$uniqueClicks' } } },
    ]),
    OfferClick.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            category: '$category',
            tmdbId: '$tmdbId',
            language: '$language',
            offerIndex: '$offerIndex',
            offerTitle: '$offerTitle',
            offerUrl: '$offerUrl',
          },
          totalClicks: { $sum: 1 },
          uniqueClicks: { $addToSet: '$ipHash' },
          lastClickAt: { $max: '$clickedAt' },
        },
      },
      { $sort: { totalClicks: -1 } },
      { $limit: 10 },
    ]),
  ]);

  const t = totals[0] || { totalClicks: 0, uniqueClicks: 0 };
  return res.json({
    success: true,
    totals: {
      totalClicks: t.totalClicks || 0,
      uniqueClicks: t.uniqueClicks || 0,
    },
    topOffers: topOffers.map((row) => ({
      category: row._id.category,
      tmdbId: row._id.tmdbId,
      language: row._id.language,
      offerTitle: row._id.offerTitle,
      offerUrl: row._id.offerUrl,
      totalClicks: row.totalClicks,
      uniqueClicks: row.uniqueClicks?.length || 0,
      lastClickAt: row.lastClickAt,
    })),
  });
});

exports.listClicks = asyncHandler(async (req, res) => {
  const siteKey = req.siteKey || 'default';
  const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;
  const since = daysAgo(days);
  const search = String(req.query.search || '').trim();
  const language = String(req.query.language || '').trim().toLowerCase();

  const match = { siteKey, clickedAt: { $gte: since } };
  if (language) match.language = language;

  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: {
          category: '$category',
          tmdbId: '$tmdbId',
          language: '$language',
          offerIndex: '$offerIndex',
          offerTitle: '$offerTitle',
          offerUrl: '$offerUrl',
        },
        totalClicks: { $sum: 1 },
        uniqueClicks: { $addToSet: '$ipHash' },
        lastClickAt: { $max: '$clickedAt' },
      },
    },
  ];

  if (search) {
    pipeline.push({
      $match: {
        $or: [
          { '_id.offerTitle': { $regex: search, $options: 'i' } },
          { '_id.offerUrl': { $regex: search, $options: 'i' } },
        ],
      },
    });
  }

  const sort = String(req.query.sort || 'totalClicks');
  const dir = String(req.query.dir || 'desc').toLowerCase() === 'asc' ? 1 : -1;
  const sortField =
    sort === 'lastClickAt' ? 'lastClickAt' : sort === 'uniqueClicks' ? 'uniqueClicks' : 'totalClicks';
  pipeline.push({ $sort: { [sortField]: dir } });
  pipeline.push({
    $facet: {
      items: [{ $skip: skip }, { $limit: limit }],
      total: [{ $count: 'count' }],
    },
  });

  const [result] = await OfferClick.aggregate(pipeline);
  const total = result?.total?.[0]?.count || 0;
  const data = (result?.items || []).map((row) => ({
    category: row._id.category,
    tmdbId: row._id.tmdbId,
    language: row._id.language,
    offerTitle: row._id.offerTitle,
    offerUrl: row._id.offerUrl,
    totalClicks: row.totalClicks,
    uniqueClicks: row.uniqueClicks?.length || 0,
    lastClickAt: row.lastClickAt,
  }));

  return res.json({ success: true, data, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});
