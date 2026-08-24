'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const rateLimit = require('express-rate-limit');

require('./seed');

const authRoutes = require('./routes/auth');
const entrepriseRoutes = require('./routes/entreprises');
const dossierRoutes = require('./routes/dossiers');
const userRoutes = require('./routes/users');
const reportRoutes = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

app.use(session({
  name: 'terrebonne.sid',
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: 1000 * 60 * 60 * 8,
  },
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion. Reessayez plus tard.' },
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/entreprises', entrepriseRoutes);
app.use('/api/dossiers', dossierRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/*', (req, res) => {
  res.status(404).json({ error: 'Route API introuvable.' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur interne du serveur.' });
});

app.listen(PORT, () => {
  console.log(`Service du developpement economique - Terrebonne`);
  console.log(`Serveur demarre sur http://localhost:${PORT}`);
});
