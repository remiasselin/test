'use strict';

const express = require('express');

function createHealthRouter({ db, ldapService }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    let dbOk = true;
    try {
      db.prepare('SELECT 1').get();
    } catch {
      dbOk = false;
    }

    res.json({
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk ? 'ok' : 'error',
      ldapMode: ldapService.isDryRun ? 'dry-run' : 'live',
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}

module.exports = { createHealthRouter };
