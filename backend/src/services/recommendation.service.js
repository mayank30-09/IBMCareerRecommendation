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
 * Helper to check if an error represents a quota / rate limit / temporary availability error from an AI provider.
 * @param {Error} err 
 * @returns {boolean}
 */
const isProviderQuotaOrUnavailableError = (err) => {
  if (!err) return false;
  const status = err.statusCode || err.status;
  const msg = err.message ? err.message.toLowerCase() : '';
  const code = err.code ? err.code.toString() : '';

  return (
    status === 429 ||
    status === 503 ||
    code === 'AI_QUOTA_EXCEEDED' ||
    code === 'AI_SERVICE_ERROR' ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('resource_exhausted') ||
    msg.includes('temporarily unavailable') ||
    msg.includes('too many requests')
  );
};

/**
 * Executes AI prompt generation with dynamic provider resolution and auto-fallback logic.
 */
const executeWithFallback = async (promptText, providerName, requestId) => {
  if (providerName === 'auto') {
    // 1. Try OpenRouter first as primary provider
    try {
      logger.info({ requestId, provider: 'openrouter', mode: 'auto' }, 'Attempting primary AI provider: openrouter');
      const response = await openRouterService.sendPrompt(promptText);
      const rawJson = openRouterService.extractJson(response.text);
      return { response, rawJson, providerUsed: 'openrouter' };
    } catch (openRouterErr) {
      if (isProviderQuotaOrUnavailableError(openRouterErr)) {
        logger.warn(
          {
            requestId,
            primaryProvider: 'openrouter',
            fallbackProvider: 'gemini',
            reason: openRouterErr.message
          },
          'Primary provider openrouter hit quota/rate limit error. Triggering automatic fallback to gemini provider.'
        );

        // 2. Automatically retry using Gemini fallback provider
        try {
          const response = await geminiService.sendPrompt(promptText);
          const rawJson = geminiService.extractJson(response.text);
          return { response, rawJson, providerUsed: 'gemini' };
        } catch (geminiErr) {
          logger.error(
            {
              requestId,
              primaryError: openRouterErr.message,
              fallbackError: geminiErr.message
            },
            'Both primary (openrouter) and fallback (gemini) AI providers failed in auto mode.'
          );
          throw geminiErr;
        }
      } else {
        // Non-quota error on OpenRouter, rethrow error
        throw openRouterErr;
      }
    }
  }

  // Explicit provider choice (gemini or openrouter)
  const aiService = providerName === 'openrouter' ? openRouterService : geminiService;
  const response = await aiService.sendPrompt(promptText);
  const rawJson = aiService.extractJson(response.text);
  return { response, rawJson, providerUsed: providerName === 'openrouter' ? 'openrouter' : 'gemini' };
};

/**
 * Recommendation Service
 * Handles business logic for generating and persisting career recommendations via active AI Provider.
 */
const generateRecommendation = async (userInput) => {
  const requestId = randomUUID();

  // 1. Build System & User Prompt
  const promptText = buildRecommendationPrompt(userInput);

  // 2. Resolve configured AI Provider setting
  const configuredProvider = (process.env.AI_PROVIDER || env.AI_PROVIDER || 'gemini').toLowerCase().trim();

  logger.info(
    {
      requestId,
      configuredProvider
    },
    `Initiating recommendation generation with AI_PROVIDER='${configuredProvider}'`
  );

  // 3. Execute Prompt Call with dynamic fallback support
  const { response: aiResponse, rawJson, providerUsed } = await executeWithFallback(promptText, configuredProvider, requestId);

  // 4. Validate, sanitize, deduplicate, and clamp AI response
  const validatedRecommendation = validateAiRecommendation(rawJson);

  // 5. Structured Logging of actual provider used
  logger.info(
    {
      requestId,
      configuredProvider,
      actualProvider: providerUsed,
      model: aiResponse.model,
      processingTime: aiResponse.responseTime,
      status: 'success'
    },
    `Career recommendation generated successfully using ${providerUsed} AI provider`
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
      provider: providerUsed,
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
  generateRecommendation,
  isProviderQuotaOrUnavailableError
};
