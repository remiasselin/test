'use strict';

const config = require('./config');
const logger = require('./logger');
const { createApp } = require('./app');

const { app, ldapService } = createApp();

app.listen(config.port, () => {
  logger.info(`API de gestion des arrivees/departs demarree sur le port ${config.port}`);
  logger.info(`Mode LDAP : ${ldapService.isDryRun ? 'dry-run (simulation)' : 'live'}`);
});
