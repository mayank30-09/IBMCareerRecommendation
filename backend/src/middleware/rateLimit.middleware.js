const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const httpStatus = require('../constants/httpStatus');
const errorCodes = require('../constants/errorCodes');
const messages = require('../constants/messages');

const windowMs = parseInt(env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000;
const max = parseInt(env.RATE_LIMIT_MAX_REQUESTS, 10) || 100;

const limiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // 1. Skip rate limiting for health check and readiness endpoints to ensure monitoring compatibility
    const url = req.originalUrl || req.url || '';
    if (url === '/health' || url === '/ready' || url.includes('/health') || url.includes('/ready')) {
      return true;
    }

    // 2. Skip rate limiting in test environment unless specifically opted-in
    if (req.headers['x-test-rate-limit'] === 'true') return false;
    return env.NODE_ENV === 'test' || process.env.SKIP_RATE_LIMIT === 'true';
  },
  handler: (req, res, next) => {
    const error = new Error(messages.RATE_LIMIT_ERROR || 'Too many requests, please try again later');
    error.statusCode = httpStatus.TOO_MANY_REQUESTS;
    error.code = errorCodes.RATE_LIMIT_EXCEEDED;
    next(error);
  }
});

module.exports = limiter;
