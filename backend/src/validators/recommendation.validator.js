const { body, validationResult } = require('express-validator');
const httpStatus = require('../constants/httpStatus');
const errorCodes = require('../constants/errorCodes');
const messages = require('../constants/messages');

/**
 * Validation rules for POST /api/v1/recommendations
 */
const recommendationValidationRules = [
  body('skills')
    .exists().withMessage('skills is required')
    .isArray({ min: 1 }).withMessage('skills must be an array with at least 1 item'),
  body('skills.*')
    .isString().withMessage('Each skill must be a string')
    .trim()
    .notEmpty().withMessage('Skill items cannot be empty'),

  body('interests')
    .exists().withMessage('interests is required')
    .isArray({ min: 1 }).withMessage('interests must be an array with at least 1 item'),
  body('interests.*')
    .isString().withMessage('Each interest must be a string')
    .trim()
    .notEmpty().withMessage('Interest items cannot be empty'),

  body('education')
    .exists().withMessage('education is required')
    .isString().withMessage('education must be a string')
    .trim()
    .notEmpty().withMessage('education cannot be empty')
    .isLength({ max: 500 }).withMessage('education cannot exceed 500 characters'),

  body('experience')
    .optional()
    .isString().withMessage('experience must be a string')
    .trim()
    .isLength({ max: 1000 }).withMessage('experience cannot exceed 1000 characters'),

  body('careerGoals')
    .optional()
    .isString().withMessage('careerGoals must be a string')
    .trim()
    .isLength({ max: 1000 }).withMessage('careerGoals cannot exceed 1000 characters')
];

/**
 * Middleware to check validation results and pass errors to centralized error handler.
 */
const handleValidationResult = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map(err => ({
      field: err.path || err.param,
      message: err.msg
    }));

    const error = new Error(messages.VALIDATION_ERROR || 'Validation failed');
    error.statusCode = httpStatus.BAD_REQUEST;
    error.code = errorCodes.VALIDATION_ERROR;
    error.details = errorDetails;

    return next(error);
  }
  next();
};

const validateRecommendationInput = [
  ...recommendationValidationRules,
  handleValidationResult
];

module.exports = {
  validateRecommendationInput
};
