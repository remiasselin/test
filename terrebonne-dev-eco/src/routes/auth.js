'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role, active: !!u.active };
}

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Courriel et mot de passe requis.' });
  }

  const user = db
    .prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE')
    .get(email.trim());

  if (!user || !user.active) {
    return res.status(401).json({ error: 'Identifiants invalides.' });
  }

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Identifiants invalides.' });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Erreur de session.' });
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.name = user.name;
    res.json({ user: publicUser(user) });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('terrebonne.sid');
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.active) {
    return res.status(401).json({ error: 'Session invalide.' });
  }
  res.json({ user: publicUser(user) });
});

module.exports = router;
