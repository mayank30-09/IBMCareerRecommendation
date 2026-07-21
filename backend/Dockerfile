# Multi-stage Production Dockerfile for CareerPilot AI Backend

# --- Stage 1: Dependencies & Build ---
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files for caching npm dependencies
COPY package*.json ./

# Install production dependencies cleanly
RUN npm ci --only=production

# --- Stage 2: Production Runtime ---
FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy installed production node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Copy application source code
COPY src/ ./src/

# Expose default port
EXPOSE 5000

# Built-in Docker Healthcheck against /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/health || exit 1

# Run server entrypoint
CMD ["node", "src/server.js"]
