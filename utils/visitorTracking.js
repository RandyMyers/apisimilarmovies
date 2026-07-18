const crypto = require('crypto');

function getClientIP(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const firstIP = String(forwardedFor).split(',')[0].trim();
    if (firstIP && firstIP !== '::1' && firstIP !== '127.0.0.1') return firstIP;
  }
  const realIP = req.headers['x-real-ip'];
  if (realIP && realIP !== '::1' && realIP !== '127.0.0.1') return String(realIP).trim();
  if (req.ip && req.ip !== '::1' && req.ip !== '127.0.0.1' && req.ip !== '::ffff:127.0.0.1') {
    return String(req.ip).replace('::ffff:', '');
  }
  const remoteAddress = req.connection?.remoteAddress || req.socket?.remoteAddress;
  if (remoteAddress && remoteAddress !== '::1' && remoteAddress !== '127.0.0.1') {
    return String(remoteAddress).replace('::ffff:', '');
  }
  return 'unknown';
}

function hashIP(ip) {
  return crypto.createHash('sha256').update(String(ip || 'unknown')).digest('hex').slice(0, 32);
}

function isBot(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return false;
  return /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|preview|headless|lighthouse/i.test(ua);
}

function parseUserAgent(userAgent) {
  if (!userAgent) return { device: 'unknown', browser: 'unknown', os: 'unknown' };
  const ua = String(userAgent).toLowerCase();
  let device = 'desktop';
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) device = 'mobile';
  else if (/tablet|ipad|playbook|silk/i.test(ua)) device = 'tablet';

  let browser = 'unknown';
  if (ua.includes('chrome') && !ua.includes('edg')) browser = 'chrome';
  else if (ua.includes('firefox')) browser = 'firefox';
  else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'safari';
  else if (ua.includes('edg')) browser = 'edge';

  let os = 'unknown';
  if (ua.includes('windows')) os = 'windows';
  else if (ua.includes('mac os') || ua.includes('macintosh')) os = 'macos';
  else if (ua.includes('android')) os = 'android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'ios';
  else if (ua.includes('linux')) os = 'linux';

  return { device, browser, os };
}

function getCountryFromRequest(req) {
  const cf = req.headers['cf-ipcountry'];
  if (cf && String(cf).length === 2) return String(cf).toUpperCase();
  const vercel = req.headers['x-vercel-ip-country'];
  if (vercel && String(vercel).length === 2) return String(vercel).toUpperCase();
  return '';
}

function referrerLabel(referrer) {
  const raw = String(referrer || '').trim();
  if (!raw) return 'Direct';
  try {
    const host = new URL(raw).hostname.replace(/^www\./, '');
    if (/google\./i.test(host)) return 'Google';
    if (/bing\./i.test(host)) return 'Bing';
    if (/facebook\./i.test(host) || host === 't.co') return 'Social';
    return host;
  } catch {
    return raw.slice(0, 80);
  }
}

module.exports = {
  getClientIP,
  hashIP,
  isBot,
  parseUserAgent,
  getCountryFromRequest,
  referrerLabel,
};
