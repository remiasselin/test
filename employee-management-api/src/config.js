'use strict';

const path = require('path');
require('dotenv').config();

function splitList(value) {
  return (value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,

  apiKeys: splitList(process.env.API_KEYS),

  db: {
    path: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'employees.db'),
  },

  ldap: {
    // 'live'   : les operations sont envoyees au controleur de domaine.
    // 'dry-run': les operations sont simulees et journalisees (aucune
    //            connexion reseau), utile en developpement ou en test.
    mode: process.env.LDAP_MODE === 'live' ? 'live' : 'dry-run',
    url: process.env.LDAP_URL,
    bindDn: process.env.LDAP_BIND_DN,
    bindPassword: process.env.LDAP_BIND_PASSWORD,
    baseDn: process.env.LDAP_BASE_DN,
    usersOu: process.env.LDAP_USERS_OU,
    disabledOu: process.env.LDAP_DISABLED_OU,
    domain: process.env.LDAP_DOMAIN,
    tlsRejectUnauthorized: process.env.LDAP_TLS_REJECT_UNAUTHORIZED !== 'false',
  },
};

module.exports = config;
