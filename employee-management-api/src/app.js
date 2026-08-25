'use strict';

const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');

const defaultConfig = require('./config');
const defaultLogger = require('./logger');
const { createDb } = require('./db');
const { createLdapService } = require('./services/ldapService');
const { createEmployeeService } = require('./services/employeeService');
const { createEmployeesRouter } = require('./routes/employees');
const { createHealthRouter } = require('./routes/health');
const { apiKeyAuth } = require('./middleware/apiKeyAuth');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

/**
 * Construit l'application Express. Les dependances (base de donnees,
 * service LDAP) peuvent etre injectees pour les tests ; sinon elles sont
 * construites a partir de la configuration par defaut.
 */
function createApp(overrides = {}) {
  const config = overrides.config || defaultConfig;
  const logger = overrides.logger || defaultLogger;
  const db = overrides.db || createDb(config.db.path);
  const ldapService = overrides.ldapService || createLdapService({ config: config.ldap, logger });
  const employeeService = overrides.employeeService || createEmployeeService({ db, ldapService, logger });

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('combined', {
    stream: { write: (line) => logger.info(line.trim()) },
    skip: () => config.env === 'test',
  }));

  app.use('/health', createHealthRouter({ db, ldapService }));
  app.use('/api/v1/employees', apiKeyAuth(config.apiKeys), createEmployeesRouter(employeeService));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return { app, db, ldapService, employeeService };
}

module.exports = { createApp };
