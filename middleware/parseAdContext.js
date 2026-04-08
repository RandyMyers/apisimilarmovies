/**
 * Optional X-Locale / X-Country-Code for ad targeting and event logging.
 */
function parseAdContext(req, res, next) {
  const rawLoc = (req.headers['x-locale'] || req.headers['X-Locale'] || '').trim();
  req.adLocale = rawLoc ? rawLoc.toLowerCase() : '';
  const ccRaw = (req.headers['x-country-code'] || req.headers['X-Country-Code'] || '').trim().toLowerCase();
  req.adCountryHeader = /^[a-z]{2}$/.test(ccRaw) ? ccRaw : '';
  next();
}

module.exports = { parseAdContext };
