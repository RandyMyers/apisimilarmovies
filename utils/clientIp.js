function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim().slice(0, 45);
  return (req.socket?.remoteAddress || req.ip || '').slice(0, 45);
}

module.exports = { getClientIp };
