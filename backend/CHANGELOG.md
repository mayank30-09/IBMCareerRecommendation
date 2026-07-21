# Changelog: CareerPilot AI Backend

All notable changes to the **CareerPilot AI Backend** project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v1.0.0] - 2026-07-21

### 🚀 Summary
Initial production release of the **CareerPilot AI Backend API**. Implements end-to-end AI career recommendation generation, Gemini API infrastructure, structured payload validation, database persistence, production hardening, and OpenAPI documentation.

### ✨ Added
- **Core AI Recommendation Engine**:
  - Implemented `POST /api/v1/recommendations` endpoint accepting user profile inputs (skills, interests, education, experience, career goals).
  - Integrated `@google/generative-ai` SDK (`gemini.service.js`) with model probing fallback (`gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.0-flash`, `gemini-1.5-flash`).
  - Added exponential backoff retry logic for transient HTTP status codes (429, 500, 502, 503, 504) and network timeouts.
- **Validation & AI Sanitization**:
  - Input validation middleware via `express-validator` preventing empty arrays, invalid types, or oversized strings.
  - Custom AI output validator (`aiResponse.validator.js`) cleaning code fences, stripping prose, deduplicating skills, and clamping confidence scores to `[0, 100]`.
- **Database Persistence**:
  - Mongoose document model (`recommendation.model.js`) storing requestId, inputs, structured AI output, and metadata (model, processing time, prompt version).
  - Repository layer (`recommendation.repository.js`) abstracting data access logic.
- **Production Hardening**:
  - Security headers via `helmet` (disabled CSP for API compatibility, disabled Express signature).
  - Configurable origin validation via `cors` module.
  - Rate limiting via `express-rate-limit` with bypass for system monitoring endpoints (`/health`, `/ready`).
  - Payload size limiter (`10kb`) rejecting oversized bodies with `413 PAYLOAD_TOO_LARGE`.
  - Gzip compression via `compression`.
  - Pino structured HTTP logging with automatic `requestId` injection across all log records.
- **System Health & Observability**:
  - `GET /health`: Liveness endpoint returning uptime, environment, app version, and requestId.
  - `GET /ready`: Readiness endpoint performing non-network internal checks for MongoDB and Gemini API key configuration.
  - Verification startup banner outputting system status on launch.
  - Graceful shutdown handlers for `SIGINT`, `SIGTERM`, `uncaughtException`, and `unhandledRejection`.
- **Documentation & Packaging**:
  - OpenAPI 3.0 (Swagger) specification (`docs/openapi.json`).
  - Postman API collection (`docs/postman_collection.json`).
  - Multi-stage production `Dockerfile`, `docker-compose.yml`, `.dockerignore`.
  - Deployment guide (`DEPLOYMENT.md`), Release checklist (`RELEASE_CHECKLIST.md`), and updated `README.md`.

### 🛡️ Security
- Redacted sensitive header keys (`authorization`, `cookie`, `x-api-key`, `GEMINI_API_KEY`) from Pino log streams.
- Enforced strict origin filtering on cross-origin HTTP requests.

### 🧪 Automated Testing
- Verified Phase 6 Hardening Test Suite (`test-phase6.js` - 15/15 PASS).
- Verified Pre-Phase 6 API & AI Quality Suite (`test-api-suite.js` - 22/22 PASS).

### 📌 Known Limitations
- Gemini model auto-resolution probes fallback candidates during cold boot; pre-configured models recommended for zero-latency startup.
