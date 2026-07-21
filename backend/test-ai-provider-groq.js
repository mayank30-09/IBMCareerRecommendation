require('dotenv').config();
const assert = require('assert');
const openRouterService = require('./src/services/openrouter.service');
const groqService = require('./src/services/groq.service');
const geminiService = require('./src/services/gemini.service');
const { getAiService, generateRecommendation } = require('./src/services/recommendation.service');
const errorCodes = require('./src/constants/errorCodes');

// Mock recommendation repository to inspect saved document schema without requiring live MongoDB connection
let savedDocument = null;
const recommendationRepository = require('./src/repositories/recommendation.repository');
recommendationRepository.createRecommendation = async (doc) => {
  savedDocument = doc;
  return { _id: 'mock-id', ...doc };
};

const sampleInput = {
  skills: ['Python', 'FastAPI'],
  interests: ['Machine Learning'],
  education: 'B.S. Software Engineering'
};

const validAiPayload = {
  career: 'ML Platform Engineer',
  confidence: 96,
  reason: 'Python and FastAPI background fits ML model deployment.',
  recommendedSkills: ['PyTorch', 'ONNX', 'Docker'],
  learningPath: ['Step 1: Model Optimization', 'Step 2: Deployment Pipelines'],
  nextStep: 'Deploy an inference microservice'
};

async function runGroqProviderTests() {
  console.log('==================================================');
  console.log('   RUNNING GROQ AI PROVIDER & AUTO FALLBACK TESTS ');
  console.log('==================================================\n');

  const origOpenRouterSendPrompt = openRouterService.sendPrompt;
  const origGroqSendPrompt = groqService.sendPrompt;
  const origGeminiSendPrompt = geminiService.sendPrompt;

  try {
    // ---------------------------------------------------------
    // TEST 1: Explicit AI_PROVIDER=groq selection & metadata
    // ---------------------------------------------------------
    console.log('[TEST 1] AI_PROVIDER=groq resolution & metadata persistence...');
    process.env.AI_PROVIDER = 'groq';
    assert.strictEqual(getAiService(), groqService, 'Expected getAiService() to return groqService when AI_PROVIDER=groq');

    groqService.sendPrompt = async () => ({
      text: JSON.stringify(validAiPayload),
      model: 'llama-3.3-70b-versatile',
      responseTime: 140,
      finishReason: 'stop',
      usageMetadata: { prompt_tokens: 110, completion_tokens: 90, total_tokens: 200 }
    });

    const result1 = await generateRecommendation(sampleInput);
    assert.strictEqual(result1.recommendation.career, 'ML Platform Engineer');
    assert.strictEqual(savedDocument.metadata.provider, 'groq', 'Expected saved document metadata provider to be groq');
    assert.strictEqual(savedDocument.metadata.model, 'llama-3.3-70b-versatile');
    console.log(' -> PASS: Explicit AI_PROVIDER=groq resolved and persisted metadata correctly.\n');

    // ---------------------------------------------------------
    // TEST 2: AI_PROVIDER=auto -> OpenRouter 429 -> Groq Success
    // ---------------------------------------------------------
    console.log('[TEST 2] AI_PROVIDER=auto -> OpenRouter 429 triggers Groq Fallback...');
    process.env.AI_PROVIDER = 'auto';

    openRouterService.sendPrompt = async () => {
      const err = new Error('OpenRouter Rate limit exceeded: free-models-per-day');
      err.statusCode = 429;
      err.code = errorCodes.AI_SERVICE_ERROR;
      throw err;
    };

    let groqCalled = false;
    groqService.sendPrompt = async () => {
      groqCalled = true;
      return {
        text: JSON.stringify({ ...validAiPayload, career: 'Groq ML Engineer' }),
        model: 'llama-3.3-70b-versatile',
        responseTime: 160,
        finishReason: 'stop',
        usageMetadata: { total_tokens: 190 }
      };
    };

    geminiService.sendPrompt = async () => {
      throw new Error('Gemini should NOT be called when Groq fallback succeeds!');
    };

    const result2 = await generateRecommendation(sampleInput);
    assert(groqCalled, 'Groq fallback provider must be invoked');
    assert.strictEqual(result2.recommendation.career, 'Groq ML Engineer');
    assert.strictEqual(savedDocument.metadata.provider, 'groq', 'Expected saved metadata provider to be groq');
    console.log(' -> PASS: OpenRouter 429 successfully fell back to Groq.\n');

    // ---------------------------------------------------------
    // TEST 3: AI_PROVIDER=auto -> OpenRouter 429 -> Groq 429 -> Gemini Success
    // ---------------------------------------------------------
    console.log('[TEST 3] AI_PROVIDER=auto -> OpenRouter 429 -> Groq 429 triggers Gemini Fallback...');
    process.env.AI_PROVIDER = 'auto';

    openRouterService.sendPrompt = async () => {
      const err = new Error('OpenRouter 429');
      err.statusCode = 429;
      err.code = errorCodes.AI_SERVICE_ERROR;
      throw err;
    };

    groqService.sendPrompt = async () => {
      const err = new Error('Groq 429 Quota Exceeded');
      err.statusCode = 429;
      err.code = errorCodes.AI_SERVICE_ERROR;
      throw err;
    };

    let geminiCalled = false;
    geminiService.sendPrompt = async () => {
      geminiCalled = true;
      return {
        text: JSON.stringify({ ...validAiPayload, career: 'Gemini Tertiary Fallback' }),
        model: 'gemini-2.5-flash',
        responseTime: 230,
        finishReason: 'STOP',
        usageMetadata: { total_tokens: 170 }
      };
    };

    const result3 = await generateRecommendation(sampleInput);
    assert(geminiCalled, 'Gemini tertiary provider must be invoked when OpenRouter and Groq fail');
    assert.strictEqual(result3.recommendation.career, 'Gemini Tertiary Fallback');
    assert.strictEqual(savedDocument.metadata.provider, 'gemini', 'Expected saved metadata provider to be gemini');
    console.log(' -> PASS: OpenRouter 429 -> Groq 429 successfully fell back to Gemini.\n');

    // ---------------------------------------------------------
    // TEST 4: AI_PROVIDER=auto -> OpenRouter 429 -> Groq 429 -> Gemini 429 (All Fail)
    // ---------------------------------------------------------
    console.log('[TEST 4] AI_PROVIDER=auto -> All 3 Providers Fail...');
    process.env.AI_PROVIDER = 'auto';

    openRouterService.sendPrompt = async () => {
      const err = new Error('OpenRouter 429');
      err.statusCode = 429;
      err.code = errorCodes.AI_SERVICE_ERROR;
      throw err;
    };

    groqService.sendPrompt = async () => {
      const err = new Error('Groq 429');
      err.statusCode = 429;
      err.code = errorCodes.AI_SERVICE_ERROR;
      throw err;
    };

    geminiService.sendPrompt = async () => {
      const err = new Error('Gemini 429');
      err.statusCode = 429;
      err.code = errorCodes.AI_SERVICE_ERROR;
      throw err;
    };

    await assert.rejects(
      async () => {
        await generateRecommendation(sampleInput);
      },
      (err) => {
        assert(err.statusCode === 429 || err.code === errorCodes.AI_SERVICE_ERROR);
        return true;
      },
      'Expected generateRecommendation to throw clean error when all 3 providers fail'
    );
    console.log(' -> PASS: Handled failure gracefully when all 3 providers fail.\n');

    console.log('==================================================');
    console.log(' SUMMARY: ALL GROQ & AUTO FALLBACK TESTS PASSED  ');
    console.log('==================================================');
  } finally {
    // Restore mocks
    openRouterService.sendPrompt = origOpenRouterSendPrompt;
    groqService.sendPrompt = origGroqSendPrompt;
    geminiService.sendPrompt = origGeminiSendPrompt;
    process.env.AI_PROVIDER = 'gemini';
  }
}

runGroqProviderTests().catch((err) => {
  console.error('Groq Test Failed:', err);
  process.exit(1);
});
