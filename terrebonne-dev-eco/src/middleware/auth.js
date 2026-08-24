'use strict';

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentification requise.' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Authentification requise.' });
    }
    if (!roles.includes(req.session.role)) {
      return res.status(403).json({ error: 'Acces refuse : privileges insuffisants.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
