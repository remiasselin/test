'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function dateFilter(req) {
  const { from, to } = req.query;
  const clauses = [];
  const params = {};
  if (from) { clauses.push('date_ouverture >= @from'); params.from = from; }
  if (to) { clauses.push('date_ouverture <= @to'); params.to = to; }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

router.get('/summary', requireAuth, (req, res) => {
  const { where, params } = dateFilter(req);

  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total_dossiers,
      SUM(CASE WHEN statut IN ('nouveau','en_analyse','en_cours') THEN 1 ELSE 0 END) AS dossiers_actifs,
      SUM(CASE WHEN statut IN ('approuve','complete') THEN 1 ELSE 0 END) AS dossiers_approuves,
      SUM(CASE WHEN statut = 'refuse' THEN 1 ELSE 0 END) AS dossiers_refuses,
      SUM(CASE WHEN statut NOT IN ('complete','refuse','annule') AND date_echeance IS NOT NULL AND date_echeance < date('now') THEN 1 ELSE 0 END) AS dossiers_en_retard,
      COALESCE(SUM(montant_demande), 0) AS montant_total_demande,
      COALESCE(SUM(montant_accorde), 0) AS montant_total_accorde
    FROM dossiers ${where}
  `).get(params);

  const nbEntreprises = db.prepare('SELECT COUNT(*) AS n FROM entreprises').get().n;
  const nbEntreprisesActives = db.prepare(`SELECT COUNT(*) AS n FROM entreprises WHERE statut = 'actif'`).get().n;

  const decisions = (totals.dossiers_approuves || 0) + (totals.dossiers_refuses || 0);
  const tauxApprobation = decisions > 0 ? Math.round((totals.dossiers_approuves / decisions) * 1000) / 10 : null;

  res.json({
    ...totals,
    taux_approbation: tauxApprobation,
    nb_entreprises: nbEntreprises,
    nb_entreprises_actives: nbEntreprisesActives,
  });
});

router.get('/by-status', requireAuth, (req, res) => {
  const { where, params } = dateFilter(req);
  const rows = db.prepare(`
    SELECT statut, COUNT(*) AS total, COALESCE(SUM(montant_accorde), 0) AS montant_accorde
    FROM dossiers ${where} GROUP BY statut
  `).all(params);
  res.json({ data: rows });
});

router.get('/by-type', requireAuth, (req, res) => {
  const { where, params } = dateFilter(req);
  const rows = db.prepare(`
    SELECT type, COUNT(*) AS total, COALESCE(SUM(montant_demande), 0) AS montant_demande,
      COALESCE(SUM(montant_accorde), 0) AS montant_accorde
    FROM dossiers ${where} GROUP BY type ORDER BY total DESC
  `).all(params);
  res.json({ data: rows });
});

router.get('/by-secteur', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT e.secteur AS secteur, COUNT(DISTINCT e.id) AS nb_entreprises,
      COUNT(d.id) AS nb_dossiers, COALESCE(SUM(d.montant_accorde), 0) AS montant_accorde
    FROM entreprises e
    LEFT JOIN dossiers d ON d.entreprise_id = e.id
    GROUP BY e.secteur ORDER BY nb_entreprises DESC
  `).all();
  res.json({ data: rows });
});

router.get('/by-month', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT strftime('%Y-%m', date_ouverture) AS mois, COUNT(*) AS total,
      COALESCE(SUM(montant_accorde), 0) AS montant_accorde
    FROM dossiers
    WHERE date_ouverture >= date('now', '-11 months', 'start of month')
    GROUP BY mois ORDER BY mois ASC
  `).all();
  res.json({ data: rows });
});

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows, columns) {
  const header = columns.map((c) => csvEscape(c.label)).join(',');
  const lines = rows.map((r) => columns.map((c) => csvEscape(r[c.key])).join(','));
  return [header, ...lines].join('\r\n');
}

router.get('/export.csv', requireAuth, (req, res) => {
  const type = req.query.type === 'entreprises' ? 'entreprises' : 'dossiers';

  let csv;
  let filename;

  if (type === 'entreprises') {
    const rows = db.prepare('SELECT * FROM entreprises ORDER BY nom COLLATE NOCASE ASC').all();
    csv = toCsv(rows, [
      { key: 'id', label: 'ID' },
      { key: 'nom', label: 'Nom' },
      { key: 'secteur', label: 'Secteur' },
      { key: 'statut', label: 'Statut' },
      { key: 'adresse', label: 'Adresse' },
      { key: 'telephone', label: 'Telephone' },
      { key: 'courriel', label: 'Courriel' },
      { key: 'nb_employes', label: 'Nb employes' },
      { key: 'created_at', label: 'Cree le' },
    ]);
    filename = 'entreprises.csv';
  } else {
    const rows = db.prepare(`
      SELECT d.*, e.nom AS entreprise_nom, u.name AS responsable_nom
      FROM dossiers d
      LEFT JOIN entreprises e ON e.id = d.entreprise_id
      LEFT JOIN users u ON u.id = d.responsable_id
      ORDER BY d.date_ouverture DESC
    `).all();
    csv = toCsv(rows, [
      { key: 'numero', label: 'Numero' },
      { key: 'titre', label: 'Titre' },
      { key: 'type', label: 'Type' },
      { key: 'statut', label: 'Statut' },
      { key: 'priorite', label: 'Priorite' },
      { key: 'entreprise_nom', label: 'Entreprise' },
      { key: 'responsable_nom', label: 'Responsable' },
      { key: 'montant_demande', label: 'Montant demande' },
      { key: 'montant_accorde', label: 'Montant accorde' },
      { key: 'date_ouverture', label: 'Date ouverture' },
      { key: 'date_echeance', label: 'Date echeance' },
    ]);
    filename = 'dossiers.csv';
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + csv);
});

module.exports = router;
