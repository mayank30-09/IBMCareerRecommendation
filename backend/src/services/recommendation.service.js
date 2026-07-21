const { randomUUID } = require('crypto');
const env = require('../config/env');
const geminiService = require('./gemini.service');
const openRouterService = require('./openrouter.service');
const groqService = require('./groq.service');
const { buildRecommendationPrompt, PROMPT_VERSION } = require('../prompts/recommendation.prompt');
const { validateAiRecommendation } = require('../validators/aiResponse.validator');
const recommendationRepository = require('../repositories/recommendation.repository');
const logger = require('../config/logger');

/**
 * Returns the active AI provider service based on the AI_PROVIDER environment variable.
 * @returns {Object} Active AI service instance (geminiService, openRouterService, or groqService)
 */
const getAiService = () => {
  const provider = (process.env.AI_PROVIDER || env.AI_PROVIDER || 'gemini').toLowerCase().trim();
  if (provider === 'openrouter') {
    return openRouterService;
  }
  if (provider === 'groq') {
    return groqService;
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
 * Executes AI prompt generation with dynamic provider resolution and multi-provider auto-fallback logic:
 * Sequence: OpenRouter -> Groq -> Gemini
 */
const executeWithFallback = async (promptText, providerName, requestId) => {
  if (providerName === 'auto') {
    // 1. Primary Attempt: OpenRouter
    try {
      logger.info({ requestId, provider: 'openrouter', mode: 'auto' }, 'Attempting primary AI provider: openrouter');
      const response = await openRouterService.sendPrompt(promptText);
      const rawJson = openRouterService.extractJson(response.text);
      return { response, rawJson, providerUsed: 'openrouter' };
    } catch (openRouterErr) {
      if (isProviderQuotaOrUnavailableError(openRouterErr) || openRouterErr.code === 'AI_CONFIG_ERROR') {
        logger.warn(
          {
            requestId,
            primaryProvider: 'openrouter',
            fallbackProvider: 'groq',
            reason: openRouterErr.message
          },
          'Primary provider openrouter hit quota/config error. Triggering fallback to groq provider.'
        );

        // 2. Secondary Attempt: Groq
        try {
          logger.info({ requestId, provider: 'groq', mode: 'auto' }, 'Attempting secondary AI provider: groq');
          const response = await groqService.sendPrompt(promptText);
          const rawJson = groqService.extractJson(response.text);
          return { response, rawJson, providerUsed: 'groq' };
        } catch (groqErr) {
          if (isProviderQuotaOrUnavailableError(groqErr) || groqErr.code === 'AI_CONFIG_ERROR') {
            logger.warn(
              {
                requestId,
                secondaryProvider: 'groq',
                fallbackProvider: 'gemini',
                reason: groqErr.message
              },
              'Secondary provider groq hit quota/config error. Triggering tertiary fallback to gemini provider.'
            );

            // 3. Tertiary Attempt: Gemini
            try {
              logger.info({ requestId, provider: 'gemini', mode: 'auto' }, 'Attempting tertiary AI provider: gemini');
              const response = await geminiService.sendPrompt(promptText);
              const rawJson = geminiService.extractJson(response.text);
              return { response, rawJson, providerUsed: 'gemini' };
            } catch (geminiErr) {
              logger.error(
                {
                  requestId,
                  openRouterError: openRouterErr.message,
                  groqError: groqErr.message,
                  geminiError: geminiErr.message
                },
                'All AI providers (OpenRouter, Groq, Gemini) failed in auto fallback mode.'
              );
              throw geminiErr;
            }
          } else {
            throw groqErr;
          }
        }
      } else {
        throw openRouterErr;
      }
    }
  }

  // Explicit provider choice (gemini, openrouter, or groq)
  let aiService = geminiService;
  if (providerName === 'openrouter') {
    aiService = openRouterService;
  } else if (providerName === 'groq') {
    aiService = groqService;
  }

  const response = await aiService.sendPrompt(promptText);
  const rawJson = aiService.extractJson(response.text);
  return { response, rawJson, providerUsed: aiService.provider };
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
