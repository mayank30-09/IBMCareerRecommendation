const httpStatus = require('../constants/httpStatus');
const errorCodes = require('../constants/errorCodes');
const messages = require('../constants/messages');

const notFoundHandler = (req, res, next) => {
  res.status(httpStatus.NOT_FOUND).json({
    success: false,
    message: messages.NOT_FOUND,
    error: {
      code: errorCodes.NOT_FOUND,
      details: `The requested URL ${req.originalUrl} was not found on this server.`
    }
  });
};

module.exports = notFoundHandler;
