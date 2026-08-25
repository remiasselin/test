'use strict';

const { AppError } = require('../errors');
const defaultLogger = require('../logger');

function errorHandler(logger = defaultLogger) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (err instanceof AppError) {
      const body = { error: err.message };
      if (err.details) body.details = err.details;
      return res.status(err.statusCode).json(body);
    }

    logger.error('Erreur non geree', err);
    return res.status(500).json({ error: 'Erreur interne du serveur.' });
  };
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route inconnue : ${req.method} ${req.originalUrl}` });
}

module.exports = { errorHandler, notFoundHandler };
