# Production Deployment Guide: CareerPilot AI Backend

This guide outlines instructions for deploying the **CareerPilot AI Backend API** across local containers, Docker environments, Render, and Railway.

---

## 📋 Pre-Deployment Checklist

Ensure the following environment variables are provisioned in your hosting environment:

| Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `PORT` | Yes | `5000` | HTTP listening port |
| `NODE_ENV` | Yes | `production` | Runtime mode (`production`) |
| `MONGODB_URI` | Yes | N/A | MongoDB Atlas connection string |
| `AI_PROVIDER` | Yes | `gemini` | Active AI provider (`gemini` or `openrouter`) |
| `OPENROUTER_API_KEY` | Conditional | N/A | OpenRouter API Key (required when `AI_PROVIDER=openrouter`) |
| `OPENROUTER_MODEL` | No | `openai/gpt-oss-20b:free` | Configured OpenRouter model candidate |
| `GEMINI_API_KEY` | Conditional | N/A | Valid Google Gemini AI API key (required when `AI_PROVIDER=gemini`) |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Configured Gemini model candidate |
| `CORS_ORIGIN` | Yes | `*` | Allowed client domain(s) |
| `REQUEST_TIMEOUT` | No | `15000` | AI request timeout in ms |
| `BODY_LIMIT` | No | `10kb` | Maximum JSON request size |
| `RATE_LIMIT_WINDOW_MS` | No | `900000` | Rate limit window (15 mins) |
| `RATE_LIMIT_MAX_REQUESTS` | No | `100` | Request limit per IP per window |

---

## 🐳 Option 1: Docker Container Deployment

### 1. Build Production Container
```bash
docker build -t careerpilot-ai-backend:v1.0.0 .
```

### 2. Run Container with Docker Compose
Use the provided `docker-compose.yml` to launch MongoDB and the Backend service in tandem:
```bash
docker-compose up -d --build
```

### 3. Verify Container Health
```bash
docker inspect --format='{{json .State.Health}}' careerpilot-backend
```

---

## 🚀 Option 2: Deploying to Render

> [!IMPORTANT]
> Since this repository contains both a frontend (Vite/TanStack) root `package.json` and a backend Express service in `backend/`, you MUST set the **Root Directory** setting in Render to `backend`.

1. **Create Web Service**:
   - Connect your GitHub repository to Render.
   - Choose **Node** runtime.
2. **Configure Service Settings**:
   - **Root Directory**: `backend` *(CRITICAL: Required because root package.json is for frontend)*
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
3. **Environment Variables**:
   - Add `NODE_ENV=production`
   - Add `MONGODB_URI=mongodb+srv://...`
   - Add `GEMINI_API_KEY=...`
   - Add `CORS_ORIGIN=https://your-frontend.onrender.com`
4. **Health Check Path**:
   - Set Health Check Path to `/health`

---

## 🚂 Option 3: Deploying to Railway

1. **Create Railway Project**:
   - Select **Deploy from GitHub repo**.
   - Set **Root Directory** / **Service Directory** to `backend`.
2. **Add MongoDB Database**:
   - Add a MongoDB plugin/service in Railway and copy the private connection string.
3. **Configure Environment Variables**:
   - In Variables tab, set `MONGODB_URI`, `GEMINI_API_KEY`, `CORS_ORIGIN`.
4. **Deploy**:
   - Railway automatically detects `backend/package.json` and runs `npm start`.
5. **Set Custom Domain**:
   - Generate domain or attach custom CNAME.

---

## 🩺 Monitoring & Diagnostics Endpoints

- **Liveness Check**: `GET /health`
  - Returns `200 OK` when process is running.
- **Readiness Check**: `GET /ready`
  - Returns `200 OK` when MongoDB is connected and Gemini API key is valid.
  - Returns `503 Service Unavailable` if MongoDB disconnects.

---

## 🔧 Common Troubleshooting & Deployment Gotchas

1. **Render Build Fails ("npm ERR! missing script: start")**:
   - Root cause: Render defaulted to repository root where `package.json` belongs to Vite frontend.
   - Fix: In Render Dashboard, set **Root Directory** to `backend`.

2. **503 AI_SERVICE_ERROR / Gemini Key Invalid**:
   - Ensure `GEMINI_API_KEY` has no quotes or extra spaces.
   - Check if Gemini API access is enabled for your Google Cloud region.

3. **500 DATABASE_ERROR / MONGODB Connection Timeout**:
   - If using MongoDB Atlas, ensure IP Access List includes `0.0.0.0/0` (Allow access from anywhere).

4. **403 CORS_ERROR**:
   - Ensure `CORS_ORIGIN` matches your frontend domain exactly including protocol (`https://`).
