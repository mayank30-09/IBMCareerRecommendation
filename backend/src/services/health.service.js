const mongoose = require('mongoose');
const recommendationService = require('./recommendation.service');

const getHealthStatus = (req) => {
  return {
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    requestId: req ? (req.id || req.requestId) : undefined
  };
};

const getReadinessStatus = async () => {
  // 1. Verify Database readiness (Mongoose connection state)
  const isDbConnected = process.env.MOCK_DB_CONNECTED !== undefined
    ? process.env.MOCK_DB_CONNECTED === 'true'
    : (mongoose.connection && mongoose.connection.readyState === 1);

  // 2. Verify active AI provider setup internally without making external network calls
  let isAiReady = false;
  try {
    const aiService = recommendationService.getAiService();
    aiService.validateConfig();
    isAiReady = true;
  } catch (err) {
    isAiReady = false;
  }

  const isReady = isDbConnected && isAiReady;

  return {
    isReady,
    status: isReady ? 'ready' : 'unready',
    checks: {
      database: isDbConnected ? 'up' : 'down',
      aiProvider: isAiReady ? 'up' : 'down',
      gemini: isAiReady ? 'up' : 'down'
    },
    timestamp: new Date().toISOString()
  };
};

module.exports = {
  getHealthStatus,
  getReadinessStatus
};
