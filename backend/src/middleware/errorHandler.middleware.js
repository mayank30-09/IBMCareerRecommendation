const env = require('../config/env');
const httpStatus = require('../constants/httpStatus');
const errorCodes = require('../constants/errorCodes');
const logger = require('../config/logger');

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let errorCode = err.code || errorCodes.SERVER_ERROR;
  let message = err.message || 'Internal Server Error';

  // Handle Express body-parser entity.too.large (413) payload size error
  if (err.type === 'entity.too.large' || err.status === 413) {
    statusCode = httpStatus.PAYLOAD_TOO_LARGE;
    errorCode = errorCodes.PAYLOAD_TOO_LARGE;
    message = 'Request payload too large';
  }

  // Handle CORS errors
  if (err.code === errorCodes.CORS_ERROR) {
    statusCode = httpStatus.FORBIDDEN;
  }

  // Handle AI Quota Exceeded / Rate Limit errors cleanly
  if (
    errorCode !== errorCodes.RATE_LIMIT_EXCEEDED &&
    (message.includes('[GoogleGenerativeAI Error]') ||
      message.includes('Quota exceeded') ||
      message.includes('resource_exhausted') ||
      errorCode === 'AI_QUOTA_EXCEEDED')
  ) {
    statusCode = httpStatus.TOO_MANY_REQUESTS || 429;
    errorCode = errorCodes.AI_SERVICE_ERROR || 'AI_SERVICE_ERROR';
    message = 'The AI service is temporarily unavailable because the current API quota has been reached. Please try again later.';
  }

  const requestId = req.id || req.requestId;

  // Log error using Pino
  if (statusCode >= 500) {
    logger.error({ requestId, err }, message);
  } else {
    logger.warn({ requestId, code: errorCode, statusCode }, message);
  }

  res.status(statusCode).json({
    success: false,
    message,
    error: {
      code: errorCode,
      details: err.details || (env.NODE_ENV === 'development' ? err.stack : undefined)
    }
  });
};

module.exports = errorHandler;
