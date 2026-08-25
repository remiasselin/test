'use strict';

const express = require('express');
const {
  validateOnboardingPayload,
  validateUpdatePayload,
  validateDeparturePayload,
} = require('../validation/employeeSchema');

function asyncHandler(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

function syncResponseBody({ employee, ldap, syncError }) {
  const body = { employee, sync: syncError ? { status: 'failed', error: syncError } : { status: 'ok' } };
  if (ldap) {
    body.ldap = {
      dn: ldap.dn,
      samAccountName: ldap.samAccountName,
      userPrincipalName: ldap.userPrincipalName,
      simulated: !!ldap.simulated,
    };
    // Le mot de passe temporaire n'est renvoye qu'une seule fois, a la creation.
    if (ldap.temporaryPassword) body.ldap.temporaryPassword = ldap.temporaryPassword;
  }
  return body;
}

/**
 * Cree le routeur REST recevant les evenements du systeme RH :
 * arrivees, mises a jour, departs, et consultation des employes.
 */
function createEmployeesRouter(employeeService) {
  const router = express.Router();

  // Arrivee d'un employe : cree l'enregistrement et provisionne le compte AD.
  router.post('/', asyncHandler(async (req, res) => {
    const payload = validateOnboardingPayload(req.body);
    const result = await employeeService.onboardEmployee(payload);
    res.status(201).json(syncResponseBody(result));
  }));

  router.get('/', asyncHandler(async (req, res) => {
    const { status } = req.query;
    res.json({ employees: employeeService.listEmployees(status) });
  }));

  router.get('/:employeeId', asyncHandler(async (req, res) => {
    res.json({ employee: employeeService.getEmployee(req.params.employeeId) });
  }));

  router.get('/:employeeId/sync-logs', asyncHandler(async (req, res) => {
    res.json({ syncLogs: employeeService.getSyncLogs(req.params.employeeId) });
  }));

  // Mise a jour RH (changement de poste, service, courriel, etc.).
  router.patch('/:employeeId', asyncHandler(async (req, res) => {
    const fields = validateUpdatePayload(req.body);
    const result = await employeeService.updateEmployee(req.params.employeeId, fields);
    res.json(syncResponseBody(result));
  }));

  // Depart d'un employe : desactive le compte AD.
  router.post('/:employeeId/depart', asyncHandler(async (req, res) => {
    const payload = validateDeparturePayload(req.body);
    const result = await employeeService.departEmployee(req.params.employeeId, payload);
    res.json(syncResponseBody(result));
  }));

  // Reessaie la synchronisation AD apres un echec (ex. controleur de domaine indisponible).
  router.post('/:employeeId/resync', asyncHandler(async (req, res) => {
    const result = await employeeService.resyncEmployee(req.params.employeeId);
    res.json(syncResponseBody(result));
  }));

  return router;
}

module.exports = { createEmployeesRouter };
