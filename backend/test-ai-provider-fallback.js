require('dotenv').config();
const assert = require('assert');
const openRouterService = require('./src/services/openrouter.service');
const groqService = require('./src/services/groq.service');
const geminiService = require('./src/services/gemini.service');
const { generateRecommendation } = require('./src/services/recommendation.service');
const errorCodes = require('./src/constants/errorCodes');

// Mock repository to inspect saved document metadata
let savedDocument = null;
const recommendationRepository = require('./src/repositories/recommendation.repository');
recommendationRepository.createRecommendation = async (doc) => {
  savedDocument = doc;
  return { _id: 'mock-id', ...doc };
};

const sampleInput = {
  skills: ['JavaScript', 'Node.js'],
  interests: ['Cloud Architecture'],
  education: 'B.S. Computer Science'
};

const validAiPayload = {
  career: 'Cloud Solutions Architect',
  confidence: 92,
  reason: 'Strong JavaScript & Node.js backend background.',
  recommendedSkills: ['AWS', 'Docker', 'Kubernetes'],
  learningPath: ['Step 1: AWS Certification', 'Step 2: Kubernetes'],
  nextStep: 'Build a containerized microservice'
};

async function runFallbackTests() {
  console.log('==================================================');
  console.log('  RUNNING AUTOMATIC AI PROVIDER FALLBACK TESTS    ');
  console.log('==================================================\n');

  const origOpenRouterSendPrompt = openRouterService.sendPrompt;
  const origGroqSendPrompt = groqService.sendPrompt;
  const origGeminiSendPrompt = geminiService.sendPrompt;

  try {
    // ---------------------------------------------------------
    // TEST 1: OpenRouter Primary Success (AI_PROVIDER=auto)
    // ---------------------------------------------------------
    console.log('[TEST 1] AI_PROVIDER=auto -> OpenRouter Primary Success...');
    process.env.AI_PROVIDER = 'auto';

    openRouterService.sendPrompt = async () => ({
      text: JSON.stringify(validAiPayload),
      model: 'openai/gpt-oss-20b:free',
      responseTime: 180,
      finishReason: 'stop',
      usageMetadata: { total_tokens: 150 }
    });

    groqService.sendPrompt = async () => {
      throw new Error('Groq should NOT be called when OpenRouter succeeds!');
    };

    geminiService.sendPrompt = async () => {
      throw new Error('Gemini should NOT be called when OpenRouter succeeds!');
    };

    const result1 = await generateRecommendation(sampleInput);
    assert.strictEqual(result1.recommendation.career, 'Cloud Solutions Architect');
    assert.strictEqual(savedDocument.metadata.provider, 'openrouter', 'Expected provider metadata to be openrouter');
    console.log(' -> PASS: Successfully executed via primary OpenRouter provider.\n');

    // ---------------------------------------------------------
    // TEST 2: OpenRouter 429 -> Gemini Fallback Success (AI_PROVIDER=auto when Groq unconfigured/429)
    // ---------------------------------------------------------
    console.log('[TEST 2] AI_PROVIDER=auto -> OpenRouter 429 triggers Gemini Fallback (with Groq skipped)...');
    process.env.AI_PROVIDER = 'auto';

    openRouterService.sendPrompt = async () => {
      const quotaErr = new Error('The AI service is temporarily unavailable because the current API quota has been reached.');
      quotaErr.statusCode = 429;
      quotaErr.code = errorCodes.AI_SERVICE_ERROR;
      throw quotaErr;
    };

    groqService.sendPrompt = async () => {
      const groqErr = new Error('Groq API Key Unconfigured');
      groqErr.statusCode = 500;
      groqErr.code = errorCodes.AI_CONFIG_ERROR;
      throw groqErr;
    };

    let geminiCalled = false;
    geminiService.sendPrompt = async () => {
      geminiCalled = true;
      return {
        text: JSON.stringify({ ...validAiPayload, career: 'DevOps Specialist (Gemini Fallback)' }),
        model: 'gemini-2.5-flash',
        responseTime: 210,
        finishReason: 'STOP',
        usageMetadata: { total_tokens: 120 }
      };
    };

    const result2 = await generateRecommendation(sampleInput);
    assert(geminiCalled, 'Gemini fallback provider must be invoked');
    assert.strictEqual(result2.recommendation.career, 'DevOps Specialist (Gemini Fallback)');
    assert.strictEqual(savedDocument.metadata.provider, 'gemini', 'Expected saved metadata provider to be gemini');
    console.log(' -> PASS: OpenRouter 429 correctly triggered Gemini fallback.\n');

    // ---------------------------------------------------------
    // TEST 3: All Primary, Secondary, and Tertiary Providers Fail (AI_PROVIDER=auto)
    // ---------------------------------------------------------
    console.log('[TEST 3] AI_PROVIDER=auto -> OpenRouter, Groq, and Gemini All Fail...');
    process.env.AI_PROVIDER = 'auto';

    openRouterService.sendPrompt = async () => {
      const quotaErr = new Error('OpenRouter Rate limit exceeded');
      quotaErr.statusCode = 429;
      quotaErr.code = errorCodes.AI_SERVICE_ERROR;
      throw quotaErr;
    };

    groqService.sendPrompt = async () => {
      const groqQuotaErr = new Error('Groq Quota exceeded');
      groqQuotaErr.statusCode = 429;
      groqQuotaErr.code = errorCodes.AI_SERVICE_ERROR;
      throw groqQuotaErr;
    };

    geminiService.sendPrompt = async () => {
      const geminiQuotaErr = new Error('Gemini Quota exceeded');
      geminiQuotaErr.statusCode = 429;
      geminiQuotaErr.code = errorCodes.AI_SERVICE_ERROR;
      throw geminiQuotaErr;
    };

    await assert.rejects(
      async () => {
        await generateRecommendation(sampleInput);
      },
      (err) => {
        assert(err.statusCode === 429 || err.code === errorCodes.AI_SERVICE_ERROR);
        return true;
      },
      'Expected generateRecommendation to throw clean error when all providers fail'
    );
    console.log(' -> PASS: Handled failure gracefully when all providers fail.\n');

    console.log('==================================================');
    console.log(' SUMMARY: ALL AI FALLBACK TESTS PASSED SUCCESSFULLY ');
    console.log('==================================================');
  } finally {
    // Restore mocks
    openRouterService.sendPrompt = origOpenRouterSendPrompt;
    groqService.sendPrompt = origGroqSendPrompt;
    geminiService.sendPrompt = origGeminiSendPrompt;
    process.env.AI_PROVIDER = 'gemini';
  }
}

runFallbackTests().catch((err) => {
  console.error('Fallback Test Failed:', err);
  process.exit(1);
});
