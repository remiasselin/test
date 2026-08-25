'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const { createDb } = require('../src/db');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const API_KEY = 'test-api-key';

function startServer() {
  const db = createDb(':memory:');
  const ldapService = {
    isDryRun: true,
    findByEmployeeId: async () => null,
    provisionUser: async (employee) => ({
      dn: `CN=${employee.firstName} ${employee.lastName},OU=Employes,DC=example,DC=local`,
      samAccountName: 'user1',
      userPrincipalName: 'user1@example.local',
      temporaryPassword: 'TempPass123!',
      simulated: true,
    }),
    updateUser: async (employee, dn) => ({ dn, simulated: true }),
    disableUser: async (employee, dn) => ({ dn: `${dn.split(',')[0]},OU=Comptes Desactives,DC=example,DC=local`, simulated: true }),
  };

  const config = { env: 'test', apiKeys: [API_KEY], db: { path: ':memory:' } };
  const { app } = createApp({ db, ldapService, logger: noopLogger, config });
  const server = app.listen(0);
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

test('API des employes', async (t) => {
  const { server, baseUrl } = startServer();
  t.after(() => server.close());

  const employeesUrl = `${baseUrl}/api/v1/employees`;
  const authHeaders = { 'X-API-Key': API_KEY };

  await t.test('refuse une requete sans cle d\'API', async () => {
    const { status, body } = await jsonFetch(employeesUrl);
    assert.equal(status, 401);
    assert.match(body.error, /X-API-Key/);
  });

  await t.test('refuse une cle d\'API invalide', async () => {
    const { status } = await jsonFetch(employeesUrl, { headers: { 'X-API-Key': 'mauvaise-cle' } });
    assert.equal(status, 401);
  });

  await t.test('rejette un payload d\'arrivee invalide', async () => {
    const { status, body } = await jsonFetch(employeesUrl, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ firstName: 'Marie' }),
    });
    assert.equal(status, 400);
    assert.ok(body.details.employeeId);
    assert.ok(body.details.lastName);
  });

  await t.test('cree un employe (arrivee) et provisionne le compte AD', async () => {
    const { status, body } = await jsonFetch(employeesUrl, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        employeeId: 'E1',
        firstName: 'Marie',
        lastName: 'Dupont',
        email: 'marie.dupont@example.local',
        department: 'Ventes',
        hireDate: '2026-09-01',
      }),
    });
    assert.equal(status, 201);
    assert.equal(body.employee.status, 'active');
    assert.equal(body.sync.status, 'ok');
    assert.equal(body.ldap.temporaryPassword, 'TempPass123!');
  });

  await t.test('refuse une seconde arrivee avec le meme employeeId', async () => {
    const { status } = await jsonFetch(employeesUrl, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        employeeId: 'E1',
        firstName: 'Marie',
        lastName: 'Dupont',
        email: 'marie.dupont@example.local',
        hireDate: '2026-09-01',
      }),
    });
    assert.equal(status, 409);
  });

  await t.test('recupere la liste et le detail des employes', async () => {
    const list = await jsonFetch(employeesUrl, { headers: authHeaders });
    assert.equal(list.status, 200);
    assert.equal(list.body.employees.length, 1);

    const detail = await jsonFetch(`${employeesUrl}/E1`, { headers: authHeaders });
    assert.equal(detail.status, 200);
    assert.equal(detail.body.employee.firstName, 'Marie');
  });

  await t.test('retourne 404 pour un employe inconnu', async () => {
    const { status } = await jsonFetch(`${employeesUrl}/INCONNU`, { headers: authHeaders });
    assert.equal(status, 404);
  });

  await t.test('met a jour un employe (PATCH)', async () => {
    const { status, body } = await jsonFetch(`${employeesUrl}/E1`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ department: 'Marketing' }),
    });
    assert.equal(status, 200);
    assert.equal(body.employee.department, 'Marketing');
  });

  await t.test('marque le depart d\'un employe', async () => {
    const { status, body } = await jsonFetch(`${employeesUrl}/E1/depart`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ departureDate: '2026-08-25', reason: 'demission' }),
    });
    assert.equal(status, 200);
    assert.equal(body.employee.status, 'terminated');
  });

  await t.test('consulte le journal de synchronisation', async () => {
    const { status, body } = await jsonFetch(`${employeesUrl}/E1/sync-logs`, { headers: authHeaders });
    assert.equal(status, 200);
    assert.ok(body.syncLogs.length >= 2);
  });
});
