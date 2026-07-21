const httpStatus = require('../constants/httpStatus');
const errorCodes = require('../constants/errorCodes');

/**
 * Validates, clamps, sanitizes, and deduplicates raw AI recommendation responses.
 * @param {Object} data - Parsed JSON object from Gemini
 * @returns {Object} Validated and sanitized recommendation data
 */
const validateAiRecommendation = (data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    const error = new Error('AI response is not a valid JSON object');
    error.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    error.code = errorCodes.AI_PARSING_ERROR;
    throw error;
  }

  const { career, confidence, reason, recommendedSkills, learningPath, nextStep } = data;
  const errors = [];

  if (!career || typeof career !== 'string' || career.trim() === '') {
    errors.push('career must be a non-empty string');
  }

  if (typeof confidence !== 'number' || isNaN(confidence)) {
    errors.push('confidence must be a valid number');
  }

  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    errors.push('reason must be a non-empty string');
  }

  if (!Array.isArray(recommendedSkills) || recommendedSkills.length === 0) {
    errors.push('recommendedSkills must be a non-empty array');
  }

  if (!Array.isArray(learningPath) || learningPath.length === 0) {
    errors.push('learningPath must be a non-empty array');
  }

  if (!nextStep || typeof nextStep !== 'string' || nextStep.trim() === '') {
    errors.push('nextStep must be a non-empty string');
  }

  if (errors.length > 0) {
    const error = new Error(`AI Response Validation Failed: ${errors.join('; ')}`);
    error.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    error.code = errorCodes.AI_PARSING_ERROR;
    error.details = errors;
    throw error;
  }

  // 1. Clamp confidence safely between 0 and 100
  const clampedConfidence = Math.min(100, Math.max(0, Math.round(confidence)));

  // 2. Sanitize and deduplicate arrays
  const sanitizedSkills = [...new Set(recommendedSkills.map((s) => String(s).trim()).filter(Boolean))];
  const sanitizedPath = [...new Set(learningPath.map((p) => String(p).trim()).filter(Boolean))];

  if (sanitizedSkills.length === 0) {
    const error = new Error('AI Response Validation Failed: recommendedSkills contained no valid strings after sanitization');
    error.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    error.code = errorCodes.AI_PARSING_ERROR;
    throw error;
  }

  if (sanitizedPath.length === 0) {
    const error = new Error('AI Response Validation Failed: learningPath contained no valid strings after sanitization');
    error.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    error.code = errorCodes.AI_PARSING_ERROR;
    throw error;
  }

  return {
    career: career.trim(),
    confidence: clampedConfidence,
    reason: reason.trim(),
    recommendedSkills: sanitizedSkills,
    learningPath: sanitizedPath,
    nextStep: nextStep.trim()
  };
};

module.exports = {
  validateAiRecommendation
};
