const { randomUUID } = require('crypto');
const geminiService = require('./gemini.service');
const { buildRecommendationPrompt, PROMPT_VERSION } = require('../prompts/recommendation.prompt');
const { validateAiRecommendation } = require('../validators/aiResponse.validator');
const recommendationRepository = require('../repositories/recommendation.repository');

/**
 * Recommendation Service
 * Handles business logic for generating and persisting career recommendations via Gemini AI.
 */
const generateRecommendation = async (userInput) => {
  const requestId = randomUUID();

  // 1. Build System & User Prompt
  const promptText = buildRecommendationPrompt(userInput);

  // 2. Call Gemini Service
  const geminiResponse = await geminiService.sendPrompt(promptText);

  // 3. Extract JSON payload from raw response
  const rawJson = geminiService.extractJson(geminiResponse.text);

  // 4. Validate, sanitize, deduplicate, and clamp AI response
  const validatedRecommendation = validateAiRecommendation(rawJson);

  // 5. Persist request & AI response into MongoDB via Repository
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
      model: geminiResponse.model,
      processingTime: geminiResponse.responseTime,
      promptVersion: PROMPT_VERSION,
      finishReason: geminiResponse.finishReason || null,
      usageMetadata: geminiResponse.usageMetadata || null,
      source: 'web'
    }
  });

  // 6. Return standard API response structure containing requestId and recommendation
  return {
    requestId,
    recommendation: validatedRecommendation
  };
};

module.exports = {
  generateRecommendation
};
