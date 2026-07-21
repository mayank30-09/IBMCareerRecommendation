const { randomUUID } = require('crypto');
const env = require('../config/env');
const geminiService = require('./gemini.service');
const openRouterService = require('./openrouter.service');
const { buildRecommendationPrompt, PROMPT_VERSION } = require('../prompts/recommendation.prompt');
const { validateAiRecommendation } = require('../validators/aiResponse.validator');
const recommendationRepository = require('../repositories/recommendation.repository');
const logger = require('../config/logger');

/**
 * Returns the active AI provider service based on the AI_PROVIDER environment variable.
 * @returns {Object} Active AI service instance (geminiService or openRouterService)
 */
const getAiService = () => {
  const provider = (process.env.AI_PROVIDER || env.AI_PROVIDER || 'gemini').toLowerCase().trim();
  if (provider === 'openrouter') {
    return openRouterService;
  }
  return geminiService;
};

/**
 * Recommendation Service
 * Handles business logic for generating and persisting career recommendations via active AI Provider.
 */
const generateRecommendation = async (userInput) => {
  const requestId = randomUUID();

  // 1. Build System & User Prompt
  const promptText = buildRecommendationPrompt(userInput);

  // 2. Resolve Active AI Provider Service
  const aiService = getAiService();
  const providerName = (process.env.AI_PROVIDER || env.AI_PROVIDER || 'gemini').toLowerCase().trim();

  // 3. Execute Prompt Call
  const aiResponse = await aiService.sendPrompt(promptText);

  // 4. Extract JSON payload from raw response
  const rawJson = aiService.extractJson(aiResponse.text);

  // 5. Validate, sanitize, deduplicate, and clamp AI response
  const validatedRecommendation = validateAiRecommendation(rawJson);

  // Structured Logging
  logger.info(
    {
      requestId,
      provider: providerName,
      model: aiResponse.model,
      processingTime: aiResponse.responseTime,
      status: 'success'
    },
    `Career recommendation generated successfully using ${providerName} AI provider`
  );

  // 6. Persist request & AI response into MongoDB via Repository
  await recommendationRepository.createRecommendation({
    requestId,
    userInput: {
      skills: userInput.skills,
      interests: userInput.interests,
      education: userInput.education,
      experience: userInput.experience || '',
      careerGoals: userInput.careerGoals || ''
    },
    recommendation: validatedRecommendation,
    metadata: {
      provider: providerName,
      model: aiResponse.model,
      processingTime: aiResponse.responseTime,
      promptVersion: PROMPT_VERSION,
      finishReason: aiResponse.finishReason || null,
      usageMetadata: aiResponse.usageMetadata || null,
      source: 'web'
    }
  });

  // 7. Return standard API response structure containing requestId and recommendation
  return {
    requestId,
    recommendation: validatedRecommendation
  };
};

module.exports = {
  getAiService,
  generateRecommendation
};
