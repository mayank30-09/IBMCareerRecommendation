const { getHealthStatus, getReadinessStatus } = require('../services/health.service');
const httpStatus = require('../constants/httpStatus');

/**
 * @desc    Check system health
 * @route   GET /health, GET /api/v1/health
 * @access  Public
 */
const getHealth = (req, res) => {
  const healthData = getHealthStatus(req);
  res.status(httpStatus.OK).json({
    success: true,
    data: healthData
  });
};

/**
 * @desc    Check system readiness (MongoDB & Gemini API)
 * @route   GET /ready, GET /api/v1/health/ready
 * @access  Public
 */
const getReady = async (req, res) => {
  const readiness = await getReadinessStatus();
  const statusCode = readiness.isReady ? httpStatus.OK : httpStatus.SERVICE_UNAVAILABLE;

  res.status(statusCode).json({
    success: readiness.isReady,
    data: readiness
  });
};

module.exports = {
  getHealth,
  getReady
};
