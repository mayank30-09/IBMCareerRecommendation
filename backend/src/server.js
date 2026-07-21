const mongoose = require('mongoose');
const { PORT, NODE_ENV, validateEnv } = require('./config/env');
const logger = require('./config/logger');
const connectDB = require('./config/db');
const app = require('./app');

// 1. Validate environment variables before startup
try {
  validateEnv({ strict: NODE_ENV !== 'test' });
  logger.info({ mode: NODE_ENV }, 'Environment configuration validated successfully.');
} catch (envErr) {
  logger.fatal({ err: envErr }, 'Fatal: Invalid environment configuration.');
  if (require.main === module) {
    process.exit(1);
  }
}

const port = PORT || 5000;
let server;

// 2. Start HTTP Server and DB Connection (only when executed directly as main script)
if (require.main === module) {
  connectDB()
    .then(() => {
      server = app.listen(port, () => {
        let geminiStatus = 'not configured';
        try {
          const geminiService = require('./services/gemini.service');
          geminiService.validateConfig();
          geminiStatus = 'configured';
        } catch (err) {
          geminiStatus = 'not configured';
        }

        // Print clean, deployment-friendly verification banner
        console.log('\n=================================');
        console.log('Server running');
        console.log(`Environment: ${NODE_ENV}`);
        console.log(`Port: ${port}`);
        console.log('MongoDB: connected');
        console.log(`Gemini: ${geminiStatus}`);
        console.log('Version: 1.0.0');
        console.log('=================================\n');

        logger.info({ port, mode: NODE_ENV, gemini: geminiStatus }, `Server running in ${NODE_ENV} mode on port ${port}`);
      });
    })
    .catch((err) => {
      logger.fatal({ err }, 'Database connection failed');
      process.exit(1);
    });
}

// 3. Graceful Shutdown Handler
let isShuttingDown = false;
async function gracefulShutdown(signal, exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, `Received ${signal}. Starting graceful shutdown...`);

  if (server && typeof server.close === 'function') {
    server.close(() => {
      logger.info('HTTP server closed.');
    });
  }

  try {
    if (mongoose.connection && mongoose.connection.readyState !== 0) {
      await mongoose.connection.close(false);
      logger.info('MongoDB connection closed.');
    }
  } catch (dbErr) {
    logger.error({ err: dbErr }, 'Error closing MongoDB connection.');
  }

  logger.info('Graceful shutdown complete.');
  if (require.main === module) {
    process.exit(exitCode);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM', 0));
process.on('SIGINT', () => gracefulShutdown('SIGINT', 0));

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught Exception detected!');
  gracefulShutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled Promise Rejection detected!');
  gracefulShutdown('unhandledRejection', 1);
});

module.exports = {
  app,
  gracefulShutdown
};
