const express = require('express');
const { getRecommendation } = require('../controllers/recommendation.controller');
const { validateRecommendationInput } = require('../validators/recommendation.validator');

const router = express.Router();

router.post('/', validateRecommendationInput, getRecommendation);

module.exports = router;
