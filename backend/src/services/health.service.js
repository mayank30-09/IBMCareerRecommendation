const mongoose = require('mongoose');
const geminiService = require('./gemini.service');

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

  // 2. Verify Gemini API setup internally without making external network calls
  let isGeminiReady = false;
  try {
    // Validate that API key and required config variables exist and are populated
    geminiService.validateConfig();
    // Verify Gemini service is instantiated/initializable
    const client = geminiService.getClient();
    isGeminiReady = !!client;
  } catch (err) {
    isGeminiReady = false;
  }

  const isReady = isDbConnected && isGeminiReady;

  return {
    isReady,
    status: isReady ? 'ready' : 'unready',
    checks: {
      database: isDbConnected ? 'up' : 'down',
      gemini: isGeminiReady ? 'up' : 'down'
    },
    timestamp: new Date().toISOString()
  };
};

module.exports = {
  getHealthStatus,
  getReadinessStatus
};
