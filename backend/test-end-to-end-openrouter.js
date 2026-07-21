require('dotenv').config();
const assert = require('assert');
const openRouterService = require('./src/services/openrouter.service');
const { generateRecommendation } = require('./src/services/recommendation.service');
const { validateAiRecommendation } = require('./src/validators/aiResponse.validator');

// Mock repository to inspect saved document schema without requiring live MongoDB connection
let savedDocument = null;
const recommendationRepository = require('./src/repositories/recommendation.repository');
recommendationRepository.createRecommendation = async (doc) => {
  savedDocument = doc;
  return { _id: 'mock-mongo-id', ...doc };
};

async function testEndToEndOpenRouter() {
  console.log('==================================================');
  console.log('  RUNNING OPENROUTER END-TO-END VERIFICATION    ');
  console.log('==================================================\n');

  // Ensure AI_PROVIDER is set to openrouter
  process.env.AI_PROVIDER = 'openrouter';

  const userInput = {
    skills: ['JavaScript', 'React', 'Node.js'],
    interests: ['Artificial Intelligence', 'Cloud Computing'],
    education: 'B.Tech Computer Science',
    experience: 'Intermediate',
    careerGoals: 'Become a Senior Full Stack AI Engineer'
  };

  console.log('[STEP 1] Mocking/Executing OpenRouter Prompt Call...');
  const origSendPrompt = openRouterService.sendPrompt;
  
  // Mock live OpenRouter response with valid schema to guarantee repeatable test execution
  openRouterService.sendPrompt = async (promptText) => ({
    text: JSON.stringify({
      career: 'AI Full Stack Engineer',
      confidence: 94,
      reason: 'Strong JavaScript/Node.js foundation combined with AI interest.',
      recommendedSkills: ['TypeScript', 'PyTorch', 'Docker'],
      learningPath: ['Step 1: Advanced TypeScript', 'Step 2: OpenAI / OpenRouter APIs', 'Step 3: Docker & Cloud Deployments'],
      nextStep: 'Build a production RAG application'
    }),
    model: 'openai/gpt-oss-20b:free',
    finishReason: 'stop',
    usageMetadata: { prompt_tokens: 120, completion_tokens: 85, total_tokens: 205 },
    responseTime: 350
  });

  console.log('[STEP 2] Calling RecommendationService.generateRecommendation()...');
  const result = await generateRecommendation(userInput);

  console.log('\n--- API RESPONSE PAYLOAD ---');
  console.log(JSON.stringify(result, null, 2));

  // 1. Verify HTTP / Service Output Structure
  assert(result.requestId, 'requestId must be present');
  assert(result.recommendation, 'recommendation object must be present');

  // 2. Verify AI Response Validation
  assert.strictEqual(result.recommendation.career, 'AI Full Stack Engineer');
  assert.strictEqual(result.recommendation.confidence, 94);
  assert.deepStrictEqual(result.recommendation.recommendedSkills, ['TypeScript', 'PyTorch', 'Docker']);

  // 3. Verify Saved Database Document Structure & Metadata
  console.log('\n--- STORED MONGODB DOCUMENT ---');
  console.log(JSON.stringify(savedDocument, null, 2));

  assert(savedDocument, 'Document must be persisted via repository');
  assert.strictEqual(savedDocument.requestId, result.requestId);
  assert.strictEqual(savedDocument.metadata.provider, 'openrouter');
  assert.strictEqual(savedDocument.metadata.model, 'openai/gpt-oss-20b:free');
  assert.strictEqual(typeof savedDocument.metadata.processingTime, 'number');
  assert.strictEqual(savedDocument.metadata.promptVersion, 'v1.0');
  assert.strictEqual(savedDocument.metadata.finishReason, 'stop');
  assert(savedDocument.metadata.usageMetadata, 'usageMetadata must be preserved');

  // Restore mock
  openRouterService.sendPrompt = origSendPrompt;

  console.log('\n==================================================');
  console.log(' SUMMARY: END-TO-END OPENROUTER PIPELINE VERIFIED ');
  console.log('==================================================');
}

testEndToEndOpenRouter().catch((err) => {
  console.error('End-to-End Test Failed:', err);
  process.exit(1);
});
