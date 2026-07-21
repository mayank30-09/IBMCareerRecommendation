require('dotenv').config();

const env = {
  PORT: process.env.PORT || '5000',
  NODE_ENV: process.env.NODE_ENV || 'development',
  CORS_ORIGIN: process.env.CORS_ORIGIN || process.env.CLIENT_URL || '*',
  CLIENT_URL: process.env.CLIENT_URL || process.env.CORS_ORIGIN || '*',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/careerpilot',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  REQUEST_TIMEOUT: process.env.REQUEST_TIMEOUT || '15000',
  BODY_LIMIT: process.env.BODY_LIMIT || '10kb',
  RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS || '900000', // 15 mins
  RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS || '100'
};

/**
 * Validates environment variables during system initialization.
 * Throws a fatal Error if required environment variables are missing or invalid.
 */
function validateEnv(customEnv = null, options = { strict: true }) {
  const targetEnv = customEnv || env;
  const errors = [];

  const port = parseInt(targetEnv.PORT, 10);
  if (isNaN(port) || port <= 0 || port > 65535) {
    errors.push(`Invalid PORT: '${targetEnv.PORT}'. PORT must be a valid integer between 1 and 65535.`);
  }

  const validEnvs = ['development', 'production', 'test'];
  if (!validEnvs.includes(targetEnv.NODE_ENV)) {
    errors.push(`Invalid NODE_ENV: '${targetEnv.NODE_ENV}'. Must be one of: ${validEnvs.join(', ')}.`);
  }

  const timeout = parseInt(targetEnv.REQUEST_TIMEOUT, 10);
  if (isNaN(timeout) || timeout <= 0) {
    errors.push(`Invalid REQUEST_TIMEOUT: '${targetEnv.REQUEST_TIMEOUT}'. Must be a positive integer in milliseconds.`);
  }

  const windowMs = parseInt(targetEnv.RATE_LIMIT_WINDOW_MS, 10);
  if (isNaN(windowMs) || windowMs <= 0) {
    errors.push(`Invalid RATE_LIMIT_WINDOW_MS: '${targetEnv.RATE_LIMIT_WINDOW_MS}'. Must be a positive integer.`);
  }

  const maxReq = parseInt(targetEnv.RATE_LIMIT_MAX_REQUESTS, 10);
  if (isNaN(maxReq) || maxReq <= 0) {
    errors.push(`Invalid RATE_LIMIT_MAX_REQUESTS: '${targetEnv.RATE_LIMIT_MAX_REQUESTS}'. Must be a positive integer.`);
  }

  if (options.strict && targetEnv.NODE_ENV !== 'test') {
    if (!targetEnv.MONGODB_URI || typeof targetEnv.MONGODB_URI !== 'string' || targetEnv.MONGODB_URI.trim() === '') {
      errors.push('Missing MONGODB_URI. A valid MongoDB connection string is required.');
    }
    if (!targetEnv.GEMINI_API_KEY || typeof targetEnv.GEMINI_API_KEY !== 'string' || targetEnv.GEMINI_API_KEY.trim() === '') {
      errors.push('Missing GEMINI_API_KEY. A valid Gemini API key is required.');
    }
  }

  if (errors.length > 0) {
    const err = new Error(`Environment Validation Failed:\n- ${errors.join('\n- ')}`);
    err.code = 'ENV_VALIDATION_ERROR';
    err.details = errors;
    throw err;
  }
}

module.exports = {
  ...env,
  validateEnv
};
