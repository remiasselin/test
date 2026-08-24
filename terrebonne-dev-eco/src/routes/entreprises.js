'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const SECTEURS = ['Commercial', 'Industriel', 'Manufacturier', 'Agricole', 'Technologique', 'Services', 'Tourisme', 'Immobilier'];
const STATUTS = ['actif', 'prospect', 'inactif'];

function validate(body, partial) {
  const errors = [];
  const data = {};

  if (!partial || body.nom !== undefined) {
    if (!body.nom || typeof body.nom !== 'string' || !body.nom.trim()) errors.push('Le nom est requis.');
    data.nom = (body.nom || '').trim();
  }
  if (!partial || body.secteur !== undefined) {
    if (!SECTEURS.includes(body.secteur)) errors.push('Secteur invalide.');
    data.secteur = body.secteur;
  }
  if (!partial || body.statut !== undefined) {
    const statut = body.statut || 'actif';
    if (!STATUTS.includes(statut)) errors.push('Statut invalide.');
    data.statut = statut;
  }
  if (body.nb_employes !== undefined && body.nb_employes !== null && body.nb_employes !== '') {
    const n = Number(body.nb_employes);
    if (!Number.isFinite(n) || n < 0) errors.push('Nombre d\'employes invalide.');
    data.nb_employes = n;
  } else {
    data.nb_employes = null;
  }

  data.adresse = (body.adresse || '').trim();
  data.telephone = (body.telephone || '').trim();
  data.courriel = (body.courriel || '').trim();
  data.site_web = (body.site_web || '').trim();
  data.notes = (body.notes || '').trim();

  return { errors, data };
}

router.get('/meta', requireAuth, (req, res) => {
  res.json({ secteurs: SECTEURS, statuts: STATUTS });
});

router.get('/', requireAuth, (req, res) => {
  const { secteur, statut, q } = req.query;
  const clauses = [];
  const params = {};

  if (secteur) { clauses.push('secteur = @secteur'); params.secteur = secteur; }
  if (statut) { clauses.push('statut = @statut'); params.statut = statut; }
  if (q) {
    clauses.push('(nom LIKE @q OR courriel LIKE @q OR adresse LIKE @q)');
    params.q = `%${q}%`;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT e.*, (SELECT COUNT(*) FROM dossiers d WHERE d.entreprise_id = e.id) AS nb_dossiers
    FROM entreprises e ${where}
    ORDER BY e.nom COLLATE NOCASE ASC
  `).all(params);

  res.json({ entreprises: rows });
});

router.get('/:id', requireAuth, (req, res) => {
  const entreprise = db.prepare('SELECT * FROM entreprises WHERE id = ?').get(req.params.id);
  if (!entreprise) return res.status(404).json({ error: 'Entreprise introuvable.' });
  const dossiers = db.prepare('SELECT * FROM dossiers WHERE entreprise_id = ? ORDER BY date_ouverture DESC').all(req.params.id);
  res.json({ entreprise, dossiers });
});

router.post('/', requireRole('admin', 'gestionnaire'), (req, res) => {
  const { errors, data } = validate(req.body || {}, false);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  const info = db.prepare(`
    INSERT INTO entreprises (nom, secteur, adresse, telephone, courriel, site_web, nb_employes, statut, notes, created_by)
    VALUES (@nom, @secteur, @adresse, @telephone, @courriel, @site_web, @nb_employes, @statut, @notes, @created_by)
  `).run({ ...data, created_by: req.session.userId });

  const entreprise = db.prepare('SELECT * FROM entreprises WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ entreprise });
});

router.put('/:id', requireRole('admin', 'gestionnaire'), (req, res) => {
  const existing = db.prepare('SELECT * FROM entreprises WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Entreprise introuvable.' });

  const { errors, data } = validate(req.body || {}, true);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  const merged = { ...existing, ...data };
  db.prepare(`
    UPDATE entreprises SET nom=@nom, secteur=@secteur, adresse=@adresse, telephone=@telephone,
      courriel=@courriel, site_web=@site_web, nb_employes=@nb_employes, statut=@statut, notes=@notes,
      updated_at=datetime('now')
    WHERE id=@id
  `).run({ ...merged, id: req.params.id });

  const entreprise = db.prepare('SELECT * FROM entreprises WHERE id = ?').get(req.params.id);
  res.json({ entreprise });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM entreprises WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Entreprise introuvable.' });
  db.prepare('DELETE FROM entreprises WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
