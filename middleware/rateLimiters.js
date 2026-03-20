const rateLimit = require('express-rate-limit');

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimit.ipKeyGenerator,
  message: { error: 'Too many requests, please try again later.' },
});

// Stricter limiter for voting (prevents spam)
const voteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimit.ipKeyGenerator,
  message: { error: 'Too many votes from this IP, please slow down.' },
});

module.exports = { writeLimiter, voteLimiter };

