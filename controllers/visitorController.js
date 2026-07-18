const Visitor = require('../models/Visitor');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  getClientIP,
  hashIP,
  isBot,
  parseUserAgent,
  getCountryFromRequest,
  referrerLabel,
} = require('../utils/visitorTracking');

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - Number(days || 30));
  return d;
}

exports.trackPageView = asyncHandler(async (req, res) => {
  const siteKey = req.siteKey || 'default';
  const userAgent = req.headers['user-agent'] || '';
  if (isBot(userAgent) && process.env.TRACK_BOTS !== 'true') {
    return res.json({ success: true, skipped: true, reason: 'bot' });
  }

  const ip = getClientIP(req);
  const { device, browser, os } = parseUserAgent(userAgent);
  const referrer = req.headers.referer || req.headers.referrer || req.body?.referrer || '';
  const path = String(req.body?.path || req.path || '').trim();
  const pageType = String(req.body?.pageType || '').trim();
  const category = String(req.body?.category || '').trim().toLowerCase();
  const tmdbId = Number.isFinite(Number(req.body?.tmdbId)) ? Number(req.body.tmdbId) : null;
  const sessionId = String(req.body?.sessionId || req.cookies?.sessionId || '').trim();
  const language = String(req.body?.language || req.query?.language || 'en-us').toLowerCase();

  await Visitor.create({
    siteKey,
    ipHash: hashIP(ip),
    country: getCountryFromRequest(req) || '',
    referrer: String(referrer || '').slice(0, 500),
    path: path.slice(0, 500),
    pageType,
    category,
    tmdbId,
    sessionId,
    device,
    browser,
    os,
    language,
    userAgent: String(userAgent).slice(0, 500),
    isBot: isBot(userAgent),
    visitedAt: new Date(),
  });

  return res.status(201).json({ success: true });
});

exports.getOverview = asyncHandler(async (req, res) => {
  const siteKey = req.siteKey || 'default';
  const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30));
  const since = daysAgo(days);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const match = { siteKey, isBot: false, visitedAt: { $gte: since } };

  const [totals, viewsByDay, topCountries, topReferrers, totals24h] = await Promise.all([
    Visitor.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          pageViews: { $sum: 1 },
          uniqueSessions: { $addToSet: '$sessionId' },
          uniqueIps: { $addToSet: '$ipHash' },
        },
      },
      {
        $project: {
          pageViews: 1,
          uniqueVisitors: { $size: '$uniqueIps' },
          uniqueSessions: { $size: '$uniqueSessions' },
        },
      },
    ]),
    Visitor.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$visitedAt' } },
          views: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { date: '$_id', views: 1, _id: 0 } },
    ]),
    Visitor.aggregate([
      { $match: match },
      { $group: { _id: '$country', visitors: { $addToSet: '$ipHash' } } },
      { $project: { country: '$_id', visitors: { $size: '$visitors' }, _id: 0 } },
      { $sort: { visitors: -1 } },
      { $limit: 10 },
    ]),
    Visitor.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$referrer',
          views: { $sum: 1 },
          uniqueVisitors: { $addToSet: '$ipHash' },
        },
      },
      { $sort: { views: -1 } },
      { $limit: 10 },
    ]),
    Visitor.aggregate([
      { $match: { siteKey, isBot: false, visitedAt: { $gte: since24h } } },
      {
        $group: {
          _id: null,
          pageViews24h: { $sum: 1 },
          uniqueIps: { $addToSet: '$ipHash' },
        },
      },
      { $project: { pageViews24h: 1, visitors24h: { $size: '$uniqueIps' } } },
    ]),
  ]);

  const t = totals[0] || { pageViews: 0, uniqueVisitors: 0, uniqueSessions: 0 };
  const t24 = totals24h[0] || { pageViews24h: 0, visitors24h: 0 };

  return res.json({
    success: true,
    days,
    totals: {
      pageViews: t.pageViews || 0,
      uniqueVisitors: t.uniqueVisitors || 0,
      uniqueSessions: t.uniqueSessions || 0,
      pageViews24h: t24.pageViews24h || 0,
      visitors24h: t24.visitors24h || 0,
      visitors: t.uniqueVisitors || 0,
    },
    viewsByDay,
    topCountries,
    topReferrers: topReferrers.map((row) => ({
      source: referrerLabel(row._id),
      views: row.views,
      uniqueVisitors: row.uniqueVisitors?.length || 0,
    })),
  });
});

exports.listAggregated = asyncHandler(async (req, res) => {
  const siteKey = req.siteKey || 'default';
  const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const skip = (page - 1) * limit;
  const since = daysAgo(days);
  const q = String(req.query.q || '').trim().toLowerCase();
  const country = String(req.query.country || '').trim().toUpperCase();
  const device = String(req.query.device || '').trim().toLowerCase();
  const referrer = String(req.query.referrer || '').trim();

  const match = { siteKey, isBot: false, visitedAt: { $gte: since } };
  if (country) match.country = country;
  if (device) match.device = device;

  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: {
          ipHash: '$ipHash',
          country: '$country',
          device: '$device',
          sessionId: '$sessionId',
        },
        visitCount: { $sum: 1 },
        lastVisitedAt: { $max: '$visitedAt' },
        lastPath: { $last: '$path' },
        lastReferrer: { $last: '$referrer' },
        browser: { $last: '$browser' },
        os: { $last: '$os' },
        pageViewsInSession: { $sum: 1 },
      },
    },
    {
      $project: {
        countryCode: '$_id.country',
        deviceType: '$_id.device',
        visitCount: 1,
        lastVisitedAt: 1,
        lastPath: 1,
        lastReferrer: 1,
        browser: 1,
        os: 1,
        pageViewsInSession: 1,
        referrerLabel: '$lastReferrer',
      },
    },
  ];

  if (referrer) {
    pipeline.push({ $match: { referrerLabel: { $regex: referrer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } });
  }

  if (q) {
    pipeline.push({
      $match: {
        $or: [
          { countryCode: { $regex: q, $options: 'i' } },
          { lastPath: { $regex: q, $options: 'i' } },
          { lastReferrer: { $regex: q, $options: 'i' } },
          { browser: { $regex: q, $options: 'i' } },
        ],
      },
    });
  }

  pipeline.push({ $sort: { lastVisitedAt: -1 } });
  pipeline.push({
    $facet: {
      items: [{ $skip: skip }, { $limit: limit }],
      total: [{ $count: 'count' }],
    },
  });

  const [result] = await Visitor.aggregate(pipeline);
  const total = result?.total?.[0]?.count || 0;
  const visitors = (result?.items || []).map((row) => ({
    ...row,
    referrerLabel: referrerLabel(row.lastReferrer),
  }));

  return res.json({
    success: true,
    visitors,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});
