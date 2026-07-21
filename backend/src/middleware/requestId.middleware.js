const { randomUUID } = require('crypto');

/**
 * Middleware to ensure every incoming HTTP request has a unique requestId.
 * Reuses client-provided 'X-Request-ID' or generates a UUID.
 */
const requestIdMiddleware = (req, res, next) => {
  const existingId = req.headers['x-request-id'];
  const requestId = existingId && typeof existingId === 'string' && existingId.trim() !== ''
    ? existingId.trim()
    : randomUUID();

  req.id = requestId;
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  next();
};

module.exports = requestIdMiddleware;
