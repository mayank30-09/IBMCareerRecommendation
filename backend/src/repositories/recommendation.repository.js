const Recommendation = require('../models/recommendation.model');

/**
 * Creates a new recommendation document in MongoDB.
 * @param {Object} data - Contains requestId, userInput, recommendation, and metadata
 * @returns {Promise<Object>} The saved database document
 */
const createRecommendation = async (data) => {
  return await Recommendation.create(data);
};

/**
 * Finds a recommendation document by its MongoDB ObjectId.
 * @param {string} id - The document ID
 * @returns {Promise<Object|null>} The recommendation document or null
 */
const findRecommendationById = async (id) => {
  return await Recommendation.findById(id);
};

/**
 * Finds a recommendation document by its unique requestId.
 * @param {string} requestId - The unique UUID request ID
 * @returns {Promise<Object|null>} The recommendation document or null
 */
const findRecommendationByRequestId = async (requestId) => {
  return await Recommendation.findOne({ requestId });
};

module.exports = {
  createRecommendation,
  findRecommendationById,
  findRecommendationByRequestId
};
