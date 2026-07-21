const assert = require('assert');

// Clear require cache to re-instantiate GeminiService with clean env settings
function getFreshGeminiService(envOverrides = {}) {
  delete require.cache[require.resolve('./src/config/env')];
  delete require.cache[require.resolve('./src/services/gemini.service')];

  process.env.GEMINI_API_KEY = envOverrides.GEMINI_API_KEY !== undefined ? envOverrides.GEMINI_API_KEY : 'test-key-123';
  process.env.GEMINI_MODEL = envOverrides.GEMINI_MODEL !== undefined ? envOverrides.GEMINI_MODEL : '';
  process.env.REQUEST_TIMEOUT = envOverrides.REQUEST_TIMEOUT !== undefined ? envOverrides.REQUEST_TIMEOUT : '15000';

  return require('./src/services/gemini.service');
}

async function runTests() {
  console.log('==================================================');
  console.log('   RUNNING PHASE 5A GEMINI SERVICE VERIFICATION   ');
  console.log('==================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`[PASS] ${total}. ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${total}. ${name}:`, err.message);
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`[PASS] ${total}. ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${total}. ${name}:`, err.message);
    }
  }

  // --- CONFIGURATION TESTS ---
  test('Configuration: Missing API Key throws AI_CONFIG_ERROR', () => {
    const gemini = getFreshGeminiService({ GEMINI_API_KEY: '' });
    assert.throws(
      () => gemini.validateConfig(),
      (err) => err.code === 'AI_CONFIG_ERROR' && err.message.includes('missing or invalid')
    );
  });

  test('Configuration: Valid API Key passes validation', () => {
    const gemini = getFreshGeminiService({ GEMINI_API_KEY: 'test-key-123' });
    assert.doesNotThrow(() => gemini.validateConfig());
  });

  test('Configuration: Invalid Timeout throws AI_CONFIG_ERROR', () => {
    const gemini = getFreshGeminiService({ GEMINI_API_KEY: 'test-key-123', REQUEST_TIMEOUT: '-100' });
    assert.throws(
      () => gemini.validateConfig(),
      (err) => err.code === 'AI_CONFIG_ERROR' && err.message.includes('positive integer')
    );
  });

  test('Configuration: No Configured Model defaults to auto-detection list', () => {
    const gemini = getFreshGeminiService({ GEMINI_API_KEY: 'test-key-123', GEMINI_MODEL: '' });
    assert.strictEqual(gemini.configuredModel, '');
    assert.strictEqual(gemini.activeModel, null);
  });

  test('Configuration: Valid Configured Model is set', () => {
    const gemini = getFreshGeminiService({ GEMINI_API_KEY: 'test-key-123', GEMINI_MODEL: 'gemini-2.5-flash' });
    assert.strictEqual(gemini.configuredModel, 'gemini-2.5-flash');
  });

  // --- JSON PARSING TESTS ---
  test('JSON Parsing: Plain JSON', () => {
    const gemini = getFreshGeminiService({ GEMINI_API_KEY: 'test-key-123' });
    const result = gemini.extractJson('{"career": "AI Engineer", "confidence": 95}');
    assert.strictEqual(result.career, 'AI Engineer');
    assert.strictEqual(result.confidence, 95);
  });

  test('JSON Parsing: Markdown Wrapped JSON', () => {
    const gemini = getFreshGeminiService({ GEMINI_API_KEY: 'test-key-123' });
    const raw = '```json\n{\n  "career": "Cloud Architect",\n  "confidence": 90\n}\n```';
    const result = gemini.extractJson(raw);
    assert.strictEqual(result.career, 'Cloud Architect');
    assert.strictEqual(result.confidence, 90);
  });

  test('JSON Parsing: JSON Surrounded by Explanatory Prose', () => {
    const gemini = getFreshGeminiService({ GEMINI_API_KEY: 'test-key-123' });
    const raw = 'Here is the requested career recommendation:\n{\n  "career": "Data Scientist"\n}\nHope this helps you!';
    const result = gemini.extractJson(raw);
    assert.strictEqual(result.career, 'Data Scientist');
  });

  test('JSON Parsing: Invalid JSON throws AI_PARSING_ERROR', () => {
    const gemini = getFreshGeminiService({ GEMINI_API_KEY: 'test-key-123' });
    assert.throws(
      () => gemini.extractJson('This is not a JSON object at all'),
      (err) => err.code === 'AI_PARSING_ERROR'
    );
  });

  // --- TRANSIENT ERROR RETRY FILTER TESTS ---
  test('Retry Filter: Permanent errors (400, 401, 403, 404, quota, safety) return false', () => {
    const gemini = getFreshGeminiService({ GEMINI_API_KEY: 'test-key-123' });
    assert.strictEqual(gemini.isTransientError({ status: 400 }), false);
    assert.strictEqual(gemini.isTransientError({ status: 401 }), false);
    assert.strictEqual(gemini.isTransientError({ status: 403 }), false);
    assert.strictEqual(gemini.isTransientError({ status: 404 }), false);
    assert.strictEqual(gemini.isTransientError({ message: 'Quota exceeded' }), false);
    assert.strictEqual(gemini.isTransientError({ message: 'Prompt blocked due to safety' }), false);
  });

  test('Retry Filter: Transient errors (429, 500, 503, econnreset, timeout) return true', () => {
    const gemini = getFreshGeminiService({ GEMINI_API_KEY: 'test-key-123' });
    assert.strictEqual(gemini.isTransientError({ status: 429 }), true);
    assert.strictEqual(gemini.isTransientError({ status: 500 }), true);
    assert.strictEqual(gemini.isTransientError({ status: 503 }), true);
    assert.strictEqual(gemini.isTransientError({ message: 'read ECONNRESET' }), true);
    assert.strictEqual(gemini.isTransientError({ message: 'Request timeout' }), true);
  });

  // --- MOCKED INTEGRATION & TELEMETRY TESTS ---
  await testAsync('Response & Model Caching: executeContentGeneration returns expected structure', async () => {
    const gemini = getFreshGeminiService({ GEMINI_API_KEY: 'test-key-123' });
    gemini.getClient = () => ({
      getGenerativeModel: () => ({
        generateContent: async () => ({
          response: Promise.resolve({
            text: () => 'OK',
            candidates: [{ finishReason: 'STOP' }],
            usageMetadata: { totalTokens: 10 }
          })
        })
      })
    });

    const res = await gemini.sendPrompt('Test prompt');
    assert.strictEqual(res.text, 'OK');
    assert.strictEqual(res.finishReason, 'STOP');
    assert.strictEqual(typeof res.responseTime, 'number');
    assert.strictEqual(res.model, 'gemini-2.5-flash');
    assert.strictEqual(gemini.activeModel, 'gemini-2.5-flash');
  });

  await testAsync('AI Service: testConnection returns online status when text is OK', async () => {
    const gemini = getFreshGeminiService({ GEMINI_API_KEY: 'test-key-123' });
    gemini.getClient = () => ({
      getGenerativeModel: () => ({
        generateContent: async () => ({
          response: Promise.resolve({
            text: () => 'OK',
            candidates: [{ finishReason: 'STOP' }]
          })
        })
      })
    });

    const conn = await gemini.testConnection();
    assert.strictEqual(conn.status, 'online');
    assert.strictEqual(conn.model, 'gemini-2.5-flash');
  });

  await testAsync('AI Service: testConnection throws AI_SERVICE_ERROR if text is not OK', async () => {
    const gemini = getFreshGeminiService({ GEMINI_API_KEY: 'test-key-123' });
    gemini.getClient = () => ({
      getGenerativeModel: () => ({
        generateContent: async () => ({
          response: Promise.resolve({
            text: () => 'Sure, here is your confirmation: OK',
            candidates: [{ finishReason: 'STOP' }]
          })
        })
      })
    });

    await assert.rejects(
      async () => await gemini.testConnection(),
      (err) => err.code === 'AI_SERVICE_ERROR' && err.message.includes('Expected "OK"')
    );
  });

  await testAsync('AI Service: Model Probing Fallback switches to available candidate if 404', async () => {
    const gemini = getFreshGeminiService({ GEMINI_API_KEY: 'test-key-123', GEMINI_MODEL: 'invalid-model' });
    
    gemini.getClient = () => ({
      getGenerativeModel: ({ model }) => ({
        generateContent: async () => {
          if (model === 'invalid-model') {
            const err = new Error('Model invalid-model not found');
            err.status = 404;
            throw err;
          }
          return {
            response: Promise.resolve({
              text: () => 'OK',
              candidates: [{ finishReason: 'STOP' }]
            })
          };
        }
      })
    });

    const res = await gemini.sendPrompt('test');
    assert.strictEqual(res.model, 'gemini-2.5-flash');
    assert.strictEqual(gemini.activeModel, 'gemini-2.5-flash');
  });

  await testAsync('AI Service: Timeout enforcement triggers AI_SERVICE_ERROR', async () => {
    const gemini = getFreshGeminiService({ GEMINI_API_KEY: 'test-key-123', REQUEST_TIMEOUT: '50' });
    gemini.getClient = () => ({
      getGenerativeModel: () => ({
        generateContent: () => new Promise((resolve) => setTimeout(resolve, 500))
      })
    });

    await assert.rejects(
      async () => await gemini.sendPrompt('test'),
      (err) => err.code === 'AI_SERVICE_ERROR' && err.message.includes('timed out after 50ms')
    );
  });

  console.log('\n==================================================');
  console.log(` SUMMARY: ${passed}/${total} TESTS PASSED SUCCESSFULLY `);
  console.log('==================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
