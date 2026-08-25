'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDb } = require('../src/db');
const { createEmployeeService } = require('../src/services/employeeService');
const { ConflictError, NotFoundError } = require('../src/errors');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

function makeFakeLdapService(overrides = {}) {
  return {
    isDryRun: false,
    findByEmployeeId: async () => null,
    provisionUser: async (employee) => ({
      dn: `CN=${employee.firstName} ${employee.lastName},OU=Employes,DC=example,DC=local`,
      samAccountName: 'user1',
      userPrincipalName: 'user1@example.local',
      temporaryPassword: 'TempPass123!',
      simulated: false,
    }),
    updateUser: async (employee, dn) => ({ dn, simulated: false }),
    disableUser: async (employee, dn) => ({ dn: `${dn.split(',')[0]},OU=Comptes Desactives,DC=example,DC=local`, simulated: false }),
    ...overrides,
  };
}

function setup(ldapOverrides) {
  const db = createDb(':memory:');
  const ldapService = makeFakeLdapService(ldapOverrides);
  const employeeService = createEmployeeService({ db, ldapService, logger: noopLogger });
  return { db, ldapService, employeeService };
}

const samplePayload = {
  employeeId: 'E1',
  firstName: 'Marie',
  lastName: 'Dupont',
  email: 'marie.dupont@example.local',
  department: 'Ventes',
  title: 'Chargee de compte',
  managerEmployeeId: null,
  officeLocation: 'Montreal',
  hireDate: '2026-09-01',
};

test('onboardEmployee cree l\'employe et provisionne le compte AD', async () => {
  const { employeeService } = setup();
  const { employee, ldap, syncError } = await employeeService.onboardEmployee(samplePayload);

  assert.equal(employee.employeeId, 'E1');
  assert.equal(employee.status, 'active');
  assert.equal(employee.ldap.samAccountName, 'user1');
  assert.equal(syncError, null);
  assert.equal(ldap.temporaryPassword, 'TempPass123!');
});

test('onboardEmployee rejette un employeeId deja existant', async () => {
  const { employeeService } = setup();
  await employeeService.onboardEmployee(samplePayload);
  await assert.rejects(() => employeeService.onboardEmployee(samplePayload), ConflictError);
});

test('onboardEmployee persiste l\'employe meme si la synchronisation AD echoue', async () => {
  const { employeeService } = setup({ provisionUser: async () => { throw new Error('Controleur de domaine injoignable'); } });
  const { employee, syncError } = await employeeService.onboardEmployee(samplePayload);

  assert.equal(employee.status, 'sync_failed');
  assert.match(syncError, /injoignable/);

  const fetched = employeeService.getEmployee('E1');
  assert.equal(fetched.status, 'sync_failed');
});

test('resyncEmployee rejoue la synchronisation apres un echec initial', async () => {
  let shouldFail = true;
  const { employeeService } = setup({
    provisionUser: async (employee) => {
      if (shouldFail) throw new Error('panne temporaire');
      return { dn: `CN=${employee.firstName} ${employee.lastName},OU=Employes,DC=example,DC=local`, samAccountName: 'user1', simulated: false };
    },
  });

  const first = await employeeService.onboardEmployee(samplePayload);
  assert.equal(first.employee.status, 'sync_failed');

  shouldFail = false;
  const second = await employeeService.resyncEmployee('E1');
  assert.equal(second.employee.status, 'active');
  assert.equal(second.employee.ldap.samAccountName, 'user1');

  const logs = employeeService.getSyncLogs('E1');
  assert.equal(logs.length, 2);
  assert.equal(logs[0].status, 'success'); // le plus recent en premier
  assert.equal(logs[1].status, 'failed');
});

test('updateEmployee met a jour les champs et pousse les changements vers AD', async () => {
  const { employeeService } = setup();
  await employeeService.onboardEmployee(samplePayload);

  const { employee } = await employeeService.updateEmployee('E1', { department: 'Marketing', title: 'Directrice Marketing' });
  assert.equal(employee.department, 'Marketing');
  assert.equal(employee.title, 'Directrice Marketing');
  assert.equal(employee.status, 'active');
});

test('updateEmployee refuse de modifier un employe parti', async () => {
  const { employeeService } = setup();
  await employeeService.onboardEmployee(samplePayload);
  await employeeService.departEmployee('E1', { departureDate: '2026-08-25' });

  await assert.rejects(() => employeeService.updateEmployee('E1', { department: 'Marketing' }), ConflictError);
});

test('departEmployee desactive le compte AD et marque l\'employe comme parti', async () => {
  const { employeeService } = setup();
  await employeeService.onboardEmployee(samplePayload);

  const { employee } = await employeeService.departEmployee('E1', { departureDate: '2026-08-25', reason: 'demission' });
  assert.equal(employee.status, 'terminated');
  assert.equal(employee.terminationDate, '2026-08-25');
  assert.match(employee.ldap.dn, /Comptes Desactives/);
});

test('departEmployee marque terminated_sync_failed si la desactivation AD echoue', async () => {
  const { employeeService } = setup({ disableUser: async () => { throw new Error('DC hors ligne'); } });
  await employeeService.onboardEmployee(samplePayload);

  const { employee, syncError } = await employeeService.departEmployee('E1', { departureDate: '2026-08-25' });
  assert.equal(employee.status, 'terminated_sync_failed');
  assert.match(syncError, /DC hors ligne/);
});

test('departEmployee refuse un depart en double', async () => {
  const { employeeService } = setup();
  await employeeService.onboardEmployee(samplePayload);
  await employeeService.departEmployee('E1', { departureDate: '2026-08-25' });

  await assert.rejects(() => employeeService.departEmployee('E1', { departureDate: '2026-08-26' }), ConflictError);
});

test('getEmployee leve NotFoundError pour un identifiant inconnu', () => {
  const { employeeService } = setup();
  assert.throws(() => employeeService.getEmployee('INCONNU'), NotFoundError);
});

test('listEmployees filtre par statut', async () => {
  const { employeeService } = setup();
  await employeeService.onboardEmployee(samplePayload);
  await employeeService.onboardEmployee({ ...samplePayload, employeeId: 'E2', email: 'e2@example.local' });
  await employeeService.departEmployee('E2', { departureDate: '2026-08-25' });

  const active = employeeService.listEmployees('active');
  const terminated = employeeService.listEmployees('terminated');
  assert.equal(active.length, 1);
  assert.equal(terminated.length, 1);
  assert.equal(active[0].employeeId, 'E1');
});
