'use strict';

const crypto = require('crypto');

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Authentifie le systeme RH via une cle d'API transmise dans l'en-tete
 * `X-API-Key`. Les cles valides sont definies par la variable
 * d'environnement API_KEYS (liste separee par des virgules).
 */
function apiKeyAuth(apiKeys) {
  return (req, res, next) => {
    if (apiKeys.length === 0) {
      return res.status(500).json({ error: "Aucune cle d'API n'est configuree sur le serveur (API_KEYS)." });
    }

    const provided = req.get('X-API-Key');
    if (!provided) {
      return res.status(401).json({ error: "En-tete X-API-Key manquant." });
    }

    const isValid = apiKeys.some((key) => timingSafeEqual(key, provided));
    if (!isValid) {
      return res.status(401).json({ error: "Cle d'API invalide." });
    }

    next();
  };
}

module.exports = { apiKeyAuth };
