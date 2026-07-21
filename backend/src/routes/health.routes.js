const express = require('express');
const { getHealth, getReady } = require('../controllers/health.controller');

const router = express.Router();

router.get('/', getHealth);
router.get('/ready', getReady);

module.exports = router;
