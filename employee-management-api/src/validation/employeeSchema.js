'use strict';

const { ValidationError } = require('../errors');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Valide le payload envoye par le systeme RH lors d'une arrivee (creation).
 * Leve une ValidationError listant tous les champs en erreur.
 */
function validateOnboardingPayload(body) {
  const errors = {};
  const b = body || {};

  if (!isNonEmptyString(b.employeeId)) errors.employeeId = "L'identifiant employe (employeeId) est requis.";
  if (!isNonEmptyString(b.firstName)) errors.firstName = 'Le prenom est requis.';
  if (!isNonEmptyString(b.lastName)) errors.lastName = 'Le nom est requis.';

  if (!isNonEmptyString(b.email)) {
    errors.email = "L'adresse courriel est requise.";
  } else if (!EMAIL_RE.test(b.email.trim())) {
    errors.email = 'Adresse courriel invalide.';
  }

  if (!isNonEmptyString(b.hireDate)) {
    errors.hireDate = "La date d'arrivee (hireDate) est requise.";
  } else if (!DATE_RE.test(b.hireDate.trim())) {
    errors.hireDate = 'La date d\'arrivee doit etre au format AAAA-MM-JJ.';
  }

  if (b.managerEmployeeId !== undefined && b.managerEmployeeId !== null && !isNonEmptyString(String(b.managerEmployeeId))) {
    errors.managerEmployeeId = "L'identifiant du gestionnaire est invalide.";
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Donnees d\'arrivee invalides.', errors);
  }

  return {
    employeeId: b.employeeId.trim(),
    firstName: b.firstName.trim(),
    lastName: b.lastName.trim(),
    email: b.email.trim(),
    department: isNonEmptyString(b.department) ? b.department.trim() : null,
    title: isNonEmptyString(b.title) ? b.title.trim() : null,
    managerEmployeeId: isNonEmptyString(b.managerEmployeeId) ? String(b.managerEmployeeId).trim() : null,
    officeLocation: isNonEmptyString(b.officeLocation) ? b.officeLocation.trim() : null,
    hireDate: b.hireDate.trim(),
  };
}

/**
 * Valide le payload d'une mise a jour partielle (changement de poste,
 * service, courriel, etc.). Tous les champs sont optionnels mais au moins
 * un doit etre present.
 */
function validateUpdatePayload(body) {
  const errors = {};
  const b = body || {};
  const allowed = ['firstName', 'lastName', 'email', 'department', 'title', 'managerEmployeeId', 'officeLocation'];
  const update = {};

  if (!allowed.some((key) => b[key] !== undefined)) {
    throw new ValidationError('Au moins un champ doit etre fourni pour la mise a jour.', {
      allowedFields: allowed,
    });
  }

  for (const key of allowed) {
    if (b[key] === undefined) continue;
    if (!isNonEmptyString(String(b[key]))) {
      errors[key] = 'Valeur invalide.';
      continue;
    }
    update[key] = String(b[key]).trim();
  }

  if (update.email && !EMAIL_RE.test(update.email)) {
    errors.email = 'Adresse courriel invalide.';
    delete update.email;
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Donnees de mise a jour invalides.', errors);
  }

  return update;
}

/**
 * Valide le payload transmis lors du depart d'un employe.
 */
function validateDeparturePayload(body) {
  const errors = {};
  const b = body || {};

  if (!isNonEmptyString(b.departureDate)) {
    errors.departureDate = 'La date de depart (departureDate) est requise.';
  } else if (!DATE_RE.test(b.departureDate.trim())) {
    errors.departureDate = 'La date de depart doit etre au format AAAA-MM-JJ.';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Donnees de depart invalides.', errors);
  }

  return {
    departureDate: b.departureDate.trim(),
    reason: isNonEmptyString(b.reason) ? b.reason.trim() : null,
  };
}

module.exports = { validateOnboardingPayload, validateUpdatePayload, validateDeparturePayload };
