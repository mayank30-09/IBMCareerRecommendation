const { generateRecommendation } = require('../services/recommendation.service');
const httpStatus = require('../constants/httpStatus');
const messages = require('../constants/messages');

/**
 * @desc    Generate career recommendations
 * @route   POST /api/v1/recommendations
 * @access  Public
 */
const getRecommendation = async (req, res, next) => {
  try {
    const userInput = req.body;
    const recommendation = await generateRecommendation(userInput);

    res.status(httpStatus.OK).json({
      success: true,
      message: messages.RECOMMENDATION_SUCCESS || 'Recommendation request received successfully',
      data: recommendation
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getRecommendation
};
