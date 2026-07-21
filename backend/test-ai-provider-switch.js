require('dotenv').config();
const assert = require('assert');
const { getAiService, generateRecommendation } = require('./src/services/recommendation.service');
const geminiService = require('./src/services/gemini.service');
const openRouterService = require('./src/services/openrouter.service');

// Mock recommendation repository to prevent DB calls during test execution
const recommendationRepository = require('./src/repositories/recommendation.repository');
recommendationRepository.createRecommendation = async () => ({ _id: 'mock-id' });

async function runProviderSwitchTests() {
  console.log('==================================================');
  console.log('    RUNNING AI PROVIDER SWITCH TEST SUITE        ');
  console.log('==================================================\n');

  // Test 1: AI_PROVIDER=gemini
  console.log('[TEST 1] AI_PROVIDER=gemini selection verification...');
  process.env.AI_PROVIDER = 'gemini';
  const selectedGemini = getAiService();
  assert.strictEqual(selectedGemini, geminiService, 'Expected geminiService to be selected when AI_PROVIDER=gemini');
  console.log(' -> PASS: GeminiService correctly resolved.\n');

  // Test 2: AI_PROVIDER=openrouter
  console.log('[TEST 2] AI_PROVIDER=openrouter selection verification...');
  process.env.AI_PROVIDER = 'openrouter';
  const selectedOpenRouter = getAiService();
  assert.strictEqual(selectedOpenRouter, openRouterService, 'Expected openRouterService to be selected when AI_PROVIDER=openrouter');
  console.log(' -> PASS: OpenRouterService correctly resolved.\n');

  // Test 3A: RecommendationService execution with Gemini provider (mocked AI response)
  console.log('[TEST 3A] RecommendationService execution via Gemini provider...');
  process.env.AI_PROVIDER = 'gemini';
  const origGeminiSendPrompt = geminiService.sendPrompt;
  geminiService.sendPrompt = async () => ({
    text: JSON.stringify({
      career: 'DevOps Architect',
      confidence: 90,
      reason: 'Automation skills',
      recommendedSkills: ['Terraform', 'Kubernetes'],
      learningPath: ['Step 1: Docker', 'Step 2: Terraform'],
      nextStep: 'Build a CI/CD pipeline'
    }),
    model: 'gemini-2.5-flash',
    responseTime: 150
  });

  const geminiResult = await generateRecommendation({ skills: ['Linux'], interests: ['Cloud'], education: 'B.S.' });
  assert.strictEqual(geminiResult.recommendation.career, 'DevOps Architect');
  geminiService.sendPrompt = origGeminiSendPrompt;
  console.log(' -> PASS: RecommendationService executed successfully with Gemini provider.\n');

  // Test 3B: RecommendationService execution with OpenRouter provider (mocked AI response)
  console.log('[TEST 3B] RecommendationService execution via OpenRouter provider...');
  process.env.AI_PROVIDER = 'openrouter';
  const origOpenRouterSendPrompt = openRouterService.sendPrompt;
  openRouterService.sendPrompt = async () => ({
    text: JSON.stringify({
      career: 'AI Solutions Engineer',
      confidence: 95,
      reason: 'Machine learning interest',
      recommendedSkills: ['Python', 'PyTorch'],
      learningPath: ['Step 1: Python Basics', 'Step 2: Deep Learning'],
      nextStep: 'Build an ML model'
    }),
    model: 'openai/gpt-oss-20b:free',
    responseTime: 220
  });

  const openRouterResult = await generateRecommendation({ skills: ['Python'], interests: ['AI'], education: 'B.S.' });
  assert.strictEqual(openRouterResult.recommendation.career, 'AI Solutions Engineer');
  openRouterService.sendPrompt = origOpenRouterSendPrompt;
  console.log(' -> PASS: RecommendationService executed successfully with OpenRouter provider.\n');

  // Reset to default
  process.env.AI_PROVIDER = 'gemini';

  console.log('==================================================');
  console.log(' SUMMARY: ALL AI PROVIDER SWITCH TESTS PASSED    ');
  console.log('==================================================');
}

runProviderSwitchTests().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
