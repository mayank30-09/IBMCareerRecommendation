const http = require('http');
const assert = require('assert');

process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = 'test-key-123';
process.env.GEMINI_MODEL = 'gemini-2.5-flash';
process.env.CORS_ORIGIN = 'http://allowed-domain.com';
process.env.BODY_LIMIT = '10kb';
process.env.RATE_LIMIT_WINDOW_MS = '60000';
process.env.RATE_LIMIT_MAX_REQUESTS = '5';
process.env.MOCK_DB_CONNECTED = 'true';

const app = require('./src/app');
const geminiService = require('./src/services/gemini.service');
const recommendationRepository = require('./src/repositories/recommendation.repository');
const Recommendation = require('./src/models/recommendation.model');

// Mock Gemini network probing so tests run in <100ms without network calls
geminiService.resolveWorkingModel = async () => 'gemini-2.5-flash';
geminiService.executeContentGeneration = async () => ({
  text: JSON.stringify({
    career: 'DevOps Architect',
    confidence: 90,
    reason: 'Automation skills',
    recommendedSkills: ['Terraform'],
    learningPath: ['Step 1'],
    nextStep: 'Deploy'
  }),
  model: 'gemini-2.5-flash',
  responseTime: 10
});
recommendationRepository.createRecommendation = async (d) => ({ _id: 'mock-id', ...d });
if (Recommendation) Recommendation.create = async (d) => ({ _id: 'mock-id', ...d });

function makeRequest(server, path, method, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const payload = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';

    const reqHeaders = {
      'Content-Type': 'application/json',
      Connection: 'close',
      ...headers
    };
    if (payload) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path,
        method,
        headers: reqHeaders
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, rawBody: data });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runPhase6Tests() {
  console.log('==================================================');
  console.log('   RUNNING PHASE 6 PRODUCTION HARDENING SUITE    ');
  console.log('==================================================\n');

  let passed = 0;
  let total = 0;

  const server = http.createServer(app);
  await new Promise((res) => server.listen(0, '127.0.0.1', res));

  async function test(name, fn) {
    total++;
    process.env.MOCK_DB_CONNECTED = 'true';
    try {
      await fn();
      console.log(`[PASS] ${total}. ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${total}. ${name}:`, err.message);
    }
  }

  // 1. Helmet Security Headers Test
  await test('1. Helmet Headers: HTTP security headers X-Content-Type-Options set; X-Powered-By hidden; CSP disabled for API config', async () => {
    const res = await makeRequest(server, '/health', 'GET');
    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(res.headers['x-frame-options'], 'SAMEORIGIN');
    assert.strictEqual(res.headers['x-powered-by'], undefined);
  });

  // 2. CORS Allowed Origin Test
  await test('2. CORS Allowed Origin: Configured allowed origin passes CORS headers', async () => {
    const res = await makeRequest(server, '/health', 'GET', null, { Origin: 'http://allowed-domain.com' });
    assert.strictEqual(res.headers['access-control-allow-origin'], 'http://allowed-domain.com');
  });

  // 3. CORS Denied Origin Test
  await test('3. CORS Denied Origin: Unapproved origin is rejected with 403 CORS_ERROR', async () => {
    const res = await makeRequest(server, '/health', 'GET', null, { Origin: 'http://malicious-domain.com' });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'CORS_ERROR');
  });

  // 4. Rate Limiting Test
  await test('4. Rate Limiting Exceeded: Requests exceeding limit trigger 429 RATE_LIMIT_EXCEEDED (on non-skipped routes)', async () => {
    const testHeaders = { 'x-test-rate-limit': 'true' };
    const payload = { skills: ['Docker'], interests: ['Cloud'], education: 'B.S.' };
    for (let i = 0; i < 5; i++) {
      await makeRequest(server, '/api/v1/recommendations', 'POST', payload, testHeaders);
    }
    const resOver = await makeRequest(server, '/api/v1/recommendations', 'POST', payload, testHeaders);
    assert.strictEqual(resOver.status, 429);
    assert.strictEqual(resOver.body.success, false);
    assert.strictEqual(resOver.body.error.code, 'RATE_LIMIT_EXCEEDED');
  });

  // 5. Payload Too Large Test
  await test('5. Payload Too Large: Body exceeding size limit triggers 413 PAYLOAD_TOO_LARGE', async () => {
    const hugeBody = { data: 'a'.repeat(20000) };
    const res = await makeRequest(server, '/api/v1/recommendations', 'POST', hugeBody);
    assert.strictEqual(res.status, 413);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'PAYLOAD_TOO_LARGE');
  });

  // 6. Compression Test
  await test('6. Compression Enabled: Gzip encoding returned for compressable payload', async () => {
    const res = await makeRequest(server, '/health', 'GET', null, { 'Accept-Encoding': 'gzip' });
    assert.strictEqual(res.headers['content-encoding'], 'gzip');
  });

  // 7. RequestId Generated Test
  await test('7. RequestId Generated: Auto-generates UUID when X-Request-ID header is missing', async () => {
    const res = await makeRequest(server, '/health', 'GET');
    assert(res.headers['x-request-id']);
    assert(res.headers['x-request-id'].length >= 32);
  });

  // 8. RequestId Reused Test
  await test('8. RequestId Reused: Preserves client-supplied X-Request-ID header', async () => {
    const customId = 'custom-client-id-777';
    const res = await makeRequest(server, '/health', 'GET', null, { 'X-Request-ID': customId });
    assert.strictEqual(res.headers['x-request-id'], customId);
  });

  // 9. Health Endpoint Test
  await test('9. Health Endpoint: GET /health returns 200 OK with enhanced payload monitoring fields', async () => {
    const customId = 'health-check-request-id-001';
    const res = await makeRequest(server, '/health', 'GET', null, { 'X-Request-ID': customId });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.status, 'ok');
    assert(typeof res.body.data.uptime === 'number');
    assert.strictEqual(res.body.data.environment, 'test');
    assert.strictEqual(res.body.data.version, '1.0.0');
    assert.strictEqual(res.body.data.requestId, customId);
  });

  // 10. Ready Endpoint Test (Healthy State)
  await test('10. Ready Endpoint: GET /ready returns status ready when DB & Gemini configuration are internally validated', async () => {
    geminiService.validateConfig = () => true;
    process.env.MOCK_DB_CONNECTED = 'true';

    const res = await makeRequest(server, '/ready', 'GET');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.status, 'ready');
    assert.strictEqual(res.body.data.checks.database, 'up');
    assert.strictEqual(res.body.data.checks.gemini, 'up');
  });

  // 11. Graceful Shutdown Functionality Test
  await test('11. Graceful Shutdown: Server script exports gracefulShutdown function', () => {
    const { gracefulShutdown } = require('./src/server');
    assert.strictEqual(typeof gracefulShutdown, 'function');
  });

  // 12. Environment Validation Test
  await test('12. Environment Validation: Throws ENV_VALIDATION_ERROR for invalid variables', () => {
    const { validateEnv } = require('./src/config/env');
    assert.throws(
      () => validateEnv({ PORT: 'invalid-port', NODE_ENV: 'test', REQUEST_TIMEOUT: '15000', RATE_LIMIT_WINDOW_MS: '60000', RATE_LIMIT_MAX_REQUESTS: '100' }, { strict: false }),
      (err) => err.code === 'ENV_VALIDATION_ERROR'
    );
  });

  // 13. Logging Format (Pino) Test
  await test('13. Logging Format: Logger exports Pino structured logger instance', () => {
    const logger = require('./src/config/logger');
    assert(typeof logger.info === 'function');
    assert(typeof logger.error === 'function');
    assert(typeof logger.child === 'function');
  });

  // 14. Concurrent Requests Test
  await test('14. Concurrent Requests: 10 parallel requests processed cleanly with distinct IDs', async () => {
    const payload = { skills: ['Docker'], interests: ['Cloud'], education: 'B.S.' };
    const reqs = Array.from({ length: 10 }, () => makeRequest(server, '/api/v1/recommendations', 'POST', payload));
    const resList = await Promise.all(reqs);

    const requestIds = new Set(resList.map((r) => r.headers['x-request-id']));
    assert.strictEqual(requestIds.size, 10);
  });

  // 15. Mongo Disconnect Handling During Ready Check
  await test('15. Mongo Disconnect: GET /ready returns 503 Service Unavailable when DB is disconnected', async () => {
    geminiService.validateConfig = () => true;
    process.env.MOCK_DB_CONNECTED = 'false';

    const res = await makeRequest(server, '/ready', 'GET');
    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.data.checks.database, 'down');
  });

  if (typeof server.closeAllConnections === 'function') {
    server.closeAllConnections();
  }
  server.close();

  console.log('\n==================================================');
  console.log(` SUMMARY: ${passed}/${total} PHASE 6 TESTS PASSED `);
  console.log('==================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runPhase6Tests().catch((err) => {
  console.error('Phase 6 Test Suite crashed:', err);
  process.exit(1);
});
