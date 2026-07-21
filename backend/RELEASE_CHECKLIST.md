# Release Checklist: CareerPilot AI Backend

Use this pre-flight release checklist before deploying new versions of the CareerPilot AI Backend to staging or production environments.

---

## ⚙️ 1. Environment & Configuration
- [ ] `.env` file exists and is excluded from source control (`.gitignore`).
- [ ] `PORT` is explicitly configured.
- [ ] `NODE_ENV` is set to `production`.
- [ ] `MONGODB_URI` connects to a production-grade MongoDB instance or MongoDB Atlas cluster.
- [ ] `GEMINI_API_KEY` is validated and active on Google AI Studio.
- [ ] `CORS_ORIGIN` is configured to allowed client domain(s) without wildcards in production.
- [ ] Startup environment validation (`validateEnv()`) passes cleanly on boot.

---

## 🔒 2. Security & Compliance
- [ ] Security HTTP headers (`helmet`) configured (Express signature `X-Powered-By` hidden).
- [ ] API CORS policy verified: Unapproved origins receive `403 FORBIDDEN`.
- [ ] Rate limiters active on `/api` endpoints (rejecting requests over threshold with `429 TOO_MANY_REQUESTS`).
- [ ] Request body size limit (`BODY_LIMIT=10kb`) configured, rejecting payloads over threshold with `413 PAYLOAD_TOO_LARGE`.
- [ ] Pino logger redacting sensitive authorization keys and API tokens.

---

## 🗄️ 3. Database Persistence
- [ ] MongoDB connection string SSL/TLS options verified.
- [ ] Database indexes created (`requestId` indexed).
- [ ] Mongoose connection error handling and auto-reconnect listeners verified.

---

## 📊 4. Logging & Monitoring
- [ ] Pino JSON structured logger writing to stdout/stderr.
- [ ] `requestId` propagated through all request logs and response headers (`X-Request-ID`).
- [ ] Liveness endpoint (`GET /health`) returning `200 OK`.
- [ ] Readiness endpoint (`GET /ready`) returning `200 OK` (verifying MongoDB + Gemini setup internally).

---

## 🧪 5. Automated Quality & Test Verification
- [ ] Phase 6 Hardening Test Suite (`node test-phase6.js`) passes `15/15` tests.
- [ ] API Quality Test Suite (`node test-api-suite.js`) passes `22/22` tests.
- [ ] Zero unhandled promise rejections or uncaught exceptions during test suite runs.

---

## 🚢 6. Deployment & Containerization
- [ ] Multi-stage `Dockerfile` builds cleanly without warnings.
- [ ] Docker container healthcheck (`HEALTHCHECK`) passes against `/health`.
- [ ] Signal handlers (`SIGINT`, `SIGTERM`) tested for graceful shutdown.

---

## 🔄 7. Rollback & Maintenance Plan
- [ ] Database migration rollback strategy verified (schema additions backwards-compatible).
- [ ] Previous container image tag tagged and archived in registry for instant rollback.
