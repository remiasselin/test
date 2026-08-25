'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS employees (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id         TEXT UNIQUE NOT NULL,
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  email               TEXT NOT NULL,
  department          TEXT,
  title               TEXT,
  manager_employee_id TEXT,
  office_location     TEXT,
  hire_date           TEXT,
  termination_date    TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  ldap_dn             TEXT,
  sam_account_name    TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id  TEXT NOT NULL,
  action       TEXT NOT NULL,
  status       TEXT NOT NULL,
  message      TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_employee_id ON sync_logs(employee_id);
`;

/**
 * Cree une instance de base de donnees independante. Utilise ':memory:'
 * pour les tests afin de ne jamais toucher au fichier sur disque.
 */
function createDb(dbPath) {
  const resolvedPath = dbPath || config.db.path;

  if (resolvedPath !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

module.exports = { createDb };
