const pino = require('pino');
const env = require('./env');

const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'password',
      'apiKey',
      'GEMINI_API_KEY'
    ],
    censor: '[REDACTED]'
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

module.exports = logger;
