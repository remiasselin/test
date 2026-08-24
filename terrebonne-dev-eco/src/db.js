'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'terrebonne-dev-eco.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'gestionnaire', 'lecteur')),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entreprises (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nom          TEXT NOT NULL,
  secteur      TEXT NOT NULL,
  adresse      TEXT,
  telephone    TEXT,
  courriel     TEXT,
  site_web     TEXT,
  nb_employes  INTEGER,
  statut       TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'prospect', 'inactif')),
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS dossiers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  numero          TEXT NOT NULL UNIQUE,
  titre           TEXT NOT NULL,
  type            TEXT NOT NULL,
  entreprise_id   INTEGER REFERENCES entreprises(id) ON DELETE SET NULL,
  responsable_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  statut          TEXT NOT NULL DEFAULT 'nouveau'
                  CHECK (statut IN ('nouveau','en_analyse','en_cours','approuve','refuse','complete','annule')),
  priorite        TEXT NOT NULL DEFAULT 'normale' CHECK (priorite IN ('basse','normale','haute','urgente')),
  montant_demande REAL DEFAULT 0,
  montant_accorde REAL DEFAULT 0,
  date_ouverture  TEXT NOT NULL DEFAULT (date('now')),
  date_echeance   TEXT,
  description     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS suivis (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  dossier_id  INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dossiers_statut ON dossiers(statut);
CREATE INDEX IF NOT EXISTS idx_dossiers_type ON dossiers(type);
CREATE INDEX IF NOT EXISTS idx_dossiers_entreprise ON dossiers(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_suivis_dossier ON suivis(dossier_id);
`);

module.exports = db;
