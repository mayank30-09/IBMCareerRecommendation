const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const pinoHttp = require('pino-http');
const { CORS_ORIGIN, BODY_LIMIT } = require('./config/env');
const logger = require('./config/logger');
const httpStatus = require('./constants/httpStatus');
const errorCodes = require('./constants/errorCodes');

const requestIdMiddleware = require('./middleware/requestId.middleware');
const rateLimiter = require('./middleware/rateLimit.middleware');
const notFoundHandler = require('./middleware/notFound.middleware');
const errorHandler = require('./middleware/errorHandler.middleware');

const healthRoutes = require('./routes/health.routes');
const recommendationRoutes = require('./routes/recommendation.routes');
const { getHealth, getReady } = require('./controllers/health.controller');

const app = express();

// Disable Express signature
app.disable('x-powered-by');

// 1. Request ID Generation / Propagation
app.use(requestIdMiddleware);

// 2. Structured HTTP Request Logging (Pino)
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.id || req.requestId,
    customProps: (req) => ({
      requestId: req.id || req.requestId
    }),
    customLogLevel: (req, res, err) => {
      if (res.statusCode >= 500 || err) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    }
  })
);

// 3. Security Headers (Helmet) - Disable Content Security Policy (CSP) for API-only backend
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

// 4. Response Compression (gzip)
app.use(compression({ threshold: 0 }));

// 5. Configurable CORS
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || CORS_ORIGIN === '*' || CORS_ORIGIN.split(',').map((s) => s.trim()).includes(origin)) {
      callback(null, true);
    } else {
      const err = new Error('CORS policy blocked access for this origin');
      err.statusCode = httpStatus.FORBIDDEN;
      err.code = errorCodes.CORS_ERROR;
      callback(err);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
};
app.use(cors(corsOptions));

// 6. Rate Limiting
app.use(rateLimiter);

// 7. Request Body Parsing & Size Limits
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ limit: BODY_LIMIT, extended: true }));

// 8. Top-level Health & Readiness Endpoints
app.get('/health', getHealth);
app.get('/ready', getReady);

// 9. API v1 Routes
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/recommendations', recommendationRoutes);

// 10. 404 & Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
