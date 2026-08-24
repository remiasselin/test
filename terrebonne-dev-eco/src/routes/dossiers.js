'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const TYPES = ['Aide financiere', 'Accompagnement', 'Permis et certificats', 'Implantation', 'Expansion', 'Relocalisation'];
const STATUTS = ['nouveau', 'en_analyse', 'en_cours', 'approuve', 'refuse', 'complete', 'annule'];
const PRIORITES = ['basse', 'normale', 'haute', 'urgente'];

function nextNumero() {
  const year = new Date().getFullYear();
  const prefix = `DE-${year}-`;
  const row = db.prepare(
    `SELECT numero FROM dossiers WHERE numero LIKE ? ORDER BY id DESC LIMIT 1`
  ).get(`${prefix}%`);
  let seq = 1;
  if (row) {
    const parts = row.numero.split('-');
    seq = parseInt(parts[2], 10) + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

function validate(body, partial) {
  const errors = [];
  const data = {};

  if (!partial || body.titre !== undefined) {
    if (!body.titre || !String(body.titre).trim()) errors.push('Le titre est requis.');
    data.titre = (body.titre || '').trim();
  }
  if (!partial || body.type !== undefined) {
    if (!TYPES.includes(body.type)) errors.push('Type de dossier invalide.');
    data.type = body.type;
  }
  if (!partial || body.statut !== undefined) {
    const statut = body.statut || 'nouveau';
    if (!STATUTS.includes(statut)) errors.push('Statut invalide.');
    data.statut = statut;
  }
  if (!partial || body.priorite !== undefined) {
    const priorite = body.priorite || 'normale';
    if (!PRIORITES.includes(priorite)) errors.push('Priorite invalide.');
    data.priorite = priorite;
  }
  if (body.entreprise_id !== undefined) {
    data.entreprise_id = body.entreprise_id ? Number(body.entreprise_id) : null;
  }
  if (body.responsable_id !== undefined) {
    data.responsable_id = body.responsable_id ? Number(body.responsable_id) : null;
  }
  for (const field of ['montant_demande', 'montant_accorde']) {
    if (body[field] !== undefined) {
      const n = body[field] === '' || body[field] === null ? 0 : Number(body[field]);
      if (!Number.isFinite(n) || n < 0) errors.push(`Montant invalide (${field}).`);
      data[field] = n;
    }
  }
  if (body.date_ouverture !== undefined) data.date_ouverture = body.date_ouverture || null;
  if (body.date_echeance !== undefined) data.date_echeance = body.date_echeance || null;
  if (body.description !== undefined) data.description = (body.description || '').trim();

  return { errors, data };
}

router.get('/meta', requireAuth, (req, res) => {
  res.json({ types: TYPES, statuts: STATUTS, priorites: PRIORITES });
});

router.get('/', requireAuth, (req, res) => {
  const { statut, type, priorite, entreprise_id, responsable_id, q } = req.query;
  const clauses = [];
  const params = {};

  if (statut) { clauses.push('d.statut = @statut'); params.statut = statut; }
  if (type) { clauses.push('d.type = @type'); params.type = type; }
  if (priorite) { clauses.push('d.priorite = @priorite'); params.priorite = priorite; }
  if (entreprise_id) { clauses.push('d.entreprise_id = @entreprise_id'); params.entreprise_id = entreprise_id; }
  if (responsable_id) { clauses.push('d.responsable_id = @responsable_id'); params.responsable_id = responsable_id; }
  if (q) {
    clauses.push('(d.titre LIKE @q OR d.numero LIKE @q OR e.nom LIKE @q)');
    params.q = `%${q}%`;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT d.*, e.nom AS entreprise_nom, u.name AS responsable_nom
    FROM dossiers d
    LEFT JOIN entreprises e ON e.id = d.entreprise_id
    LEFT JOIN users u ON u.id = d.responsable_id
    ${where}
    ORDER BY d.date_ouverture DESC, d.id DESC
  `).all(params);

  res.json({ dossiers: rows });
});

router.get('/:id', requireAuth, (req, res) => {
  const dossier = db.prepare(`
    SELECT d.*, e.nom AS entreprise_nom, u.name AS responsable_nom
    FROM dossiers d
    LEFT JOIN entreprises e ON e.id = d.entreprise_id
    LEFT JOIN users u ON u.id = d.responsable_id
    WHERE d.id = ?
  `).get(req.params.id);
  if (!dossier) return res.status(404).json({ error: 'Dossier introuvable.' });

  const suivis = db.prepare(`
    SELECT s.*, u.name AS user_name
    FROM suivis s LEFT JOIN users u ON u.id = s.user_id
    WHERE s.dossier_id = ? ORDER BY s.created_at DESC
  `).all(req.params.id);

  res.json({ dossier, suivis });
});

router.post('/', requireRole('admin', 'gestionnaire'), (req, res) => {
  const { errors, data } = validate(req.body || {}, false);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  const numero = nextNumero();
  const info = db.prepare(`
    INSERT INTO dossiers (numero, titre, type, entreprise_id, responsable_id, statut, priorite,
      montant_demande, montant_accorde, date_ouverture, date_echeance, description, created_by)
    VALUES (@numero, @titre, @type, @entreprise_id, @responsable_id, @statut, @priorite,
      @montant_demande, @montant_accorde, @date_ouverture, @date_echeance, @description, @created_by)
  `).run({
    numero,
    titre: data.titre,
    type: data.type,
    entreprise_id: data.entreprise_id ?? null,
    responsable_id: data.responsable_id ?? null,
    statut: data.statut,
    priorite: data.priorite,
    montant_demande: data.montant_demande ?? 0,
    montant_accorde: data.montant_accorde ?? 0,
    date_ouverture: data.date_ouverture || new Date().toISOString().slice(0, 10),
    date_echeance: data.date_echeance ?? null,
    description: data.description ?? '',
    created_by: req.session.userId,
  });

  const dossier = db.prepare('SELECT * FROM dossiers WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ dossier });
});

router.put('/:id', requireRole('admin', 'gestionnaire'), (req, res) => {
  const existing = db.prepare('SELECT * FROM dossiers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Dossier introuvable.' });

  const { errors, data } = validate(req.body || {}, true);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  const merged = { ...existing, ...data };
  db.prepare(`
    UPDATE dossiers SET titre=@titre, type=@type, entreprise_id=@entreprise_id, responsable_id=@responsable_id,
      statut=@statut, priorite=@priorite, montant_demande=@montant_demande, montant_accorde=@montant_accorde,
      date_ouverture=@date_ouverture, date_echeance=@date_echeance, description=@description,
      updated_at=datetime('now')
    WHERE id=@id
  `).run({
    titre: merged.titre,
    type: merged.type,
    entreprise_id: merged.entreprise_id,
    responsable_id: merged.responsable_id,
    statut: merged.statut,
    priorite: merged.priorite,
    montant_demande: merged.montant_demande,
    montant_accorde: merged.montant_accorde,
    date_ouverture: merged.date_ouverture,
    date_echeance: merged.date_echeance,
    description: merged.description,
    id: req.params.id,
  });

  const dossier = db.prepare('SELECT * FROM dossiers WHERE id = ?').get(req.params.id);
  res.json({ dossier });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM dossiers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Dossier introuvable.' });
  db.prepare('DELETE FROM dossiers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/suivis', requireRole('admin', 'gestionnaire'), (req, res) => {
  const dossier = db.prepare('SELECT id FROM dossiers WHERE id = ?').get(req.params.id);
  if (!dossier) return res.status(404).json({ error: 'Dossier introuvable.' });

  const note = (req.body && req.body.note || '').trim();
  if (!note) return res.status(400).json({ error: 'La note est requise.' });

  db.prepare('INSERT INTO suivis (dossier_id, user_id, note) VALUES (?, ?, ?)')
    .run(req.params.id, req.session.userId, note);

  const suivis = db.prepare(`
    SELECT s.*, u.name AS user_name FROM suivis s LEFT JOIN users u ON u.id = s.user_id
    WHERE s.dossier_id = ? ORDER BY s.created_at DESC
  `).all(req.params.id);

  res.status(201).json({ suivis });
});

module.exports = router;
