'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const ROLES = ['admin', 'gestionnaire', 'lecteur'];

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, active: !!u.active, created_at: u.created_at };
}

// Liste allegee, accessible a tout utilisateur authentifie, utilisee pour
// assigner un responsable a un dossier sans exposer la gestion des comptes.
router.get('/basic', requireAuth, (req, res) => {
  const rows = db.prepare(
    `SELECT id, name, role FROM users WHERE active = 1 AND role IN ('admin','gestionnaire') ORDER BY name COLLATE NOCASE ASC`
  ).all();
  res.json({ users: rows });
});

router.use(requireRole('admin'));

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY name COLLATE NOCASE ASC').all();
  res.json({ users: rows.map(publicUser) });
});

router.post('/', (req, res) => {
  const { name, email, password, role } = req.body || {};
  const errors = [];

  if (!name || !String(name).trim()) errors.push('Le nom est requis.');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Courriel invalide.');
  if (!password || String(password).length < 8) errors.push('Le mot de passe doit contenir au moins 8 caracteres.');
  if (!ROLES.includes(role)) errors.push('Role invalide.');

  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  const dup = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email.trim());
  if (dup) return res.status(409).json({ error: 'Un utilisateur avec ce courriel existe deja.' });

  const info = db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
  ).run(name.trim(), email.trim(), bcrypt.hashSync(password, 10), role);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ user: publicUser(user) });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  const { name, email, role, active, password } = req.body || {};
  const errors = [];

  const data = {
    name: name !== undefined ? String(name).trim() : existing.name,
    email: email !== undefined ? String(email).trim() : existing.email,
    role: role !== undefined ? role : existing.role,
    active: active !== undefined ? (active ? 1 : 0) : existing.active,
  };

  if (!data.name) errors.push('Le nom est requis.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push('Courriel invalide.');
  if (!ROLES.includes(data.role)) errors.push('Role invalide.');

  if (data.role !== 'admin' || data.active === 0) {
    const adminCount = db.prepare(
      `SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id != ?`
    ).get(req.params.id).n;
    if (adminCount === 0 && existing.role === 'admin' && existing.active === 1) {
      errors.push('Impossible de retirer le dernier administrateur actif.');
    }
  }

  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  let passwordHash = existing.password_hash;
  if (password) {
    if (String(password).length < 8) return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caracteres.' });
    passwordHash = bcrypt.hashSync(password, 10);
  }

  db.prepare('UPDATE users SET name=?, email=?, role=?, active=?, password_hash=? WHERE id=?')
    .run(data.name, data.email, data.role, data.active, passwordHash, req.params.id);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  res.json({ user: publicUser(user) });
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  if (Number(req.params.id) === req.session.userId) {
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
  }

  if (existing.role === 'admin') {
    const adminCount = db.prepare(
      `SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id != ?`
    ).get(req.params.id).n;
    if (adminCount === 0) {
      return res.status(400).json({ error: 'Impossible de supprimer le dernier administrateur.' });
    }
  }

  db.prepare('UPDATE dossiers SET responsable_id = NULL WHERE responsable_id = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
