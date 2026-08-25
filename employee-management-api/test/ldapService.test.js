'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createLdapService } = require('../src/services/ldapService');
const { createFakeLdapClientFactory } = require('./helpers/fakeLdapClient');

const baseConfig = {
  mode: 'live',
  url: 'ldaps://dc.example.local:636',
  bindDn: 'CN=svc,DC=example,DC=local',
  bindPassword: 'secret',
  baseDn: 'DC=example,DC=local',
  usersOu: 'OU=Employes,DC=example,DC=local',
  disabledOu: 'OU=Comptes Desactives,DC=example,DC=local',
  domain: 'example.local',
  tlsRejectUnauthorized: true,
};

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

test('provisionUser cree le compte AD desactive puis definit le mot de passe et active le compte', async () => {
  const { clientFactory, calls } = createFakeLdapClientFactory();
  const service = createLdapService({ config: baseConfig, clientFactory, logger: noopLogger });

  const employee = {
    employeeId: 'E100',
    firstName: 'Marie',
    lastName: 'Dupont',
    email: 'marie.dupont@example.local',
    department: 'Ventes',
    title: 'Chargee de compte',
    officeLocation: 'Montreal',
  };

  const result = await service.provisionUser(employee);

  assert.equal(result.dn, 'CN=Marie Dupont,OU=Employes,DC=example,DC=local');
  assert.equal(result.samAccountName, 'mdupont');
  assert.equal(result.userPrincipalName, 'mdupont@example.local');
  assert.equal(typeof result.temporaryPassword, 'string');
  assert.ok(result.temporaryPassword.length >= 14);
  assert.equal(result.simulated, false);

  assert.equal(calls.add.length, 1);
  assert.equal(calls.add[0].entry.userAccountControl, '514');
  assert.equal(calls.add[0].entry.employeeID, 'E100');

  assert.equal(calls.modify.length, 2);
  const [pwdChange] = calls.modify[0].changes;
  assert.equal(pwdChange.operation, 'replace');
  assert.equal(pwdChange.modification.type, 'unicodePwd');
  assert.ok(Buffer.isBuffer(pwdChange.modification.buffers[0]));

  const enableChanges = calls.modify[1].changes;
  assert.ok(enableChanges.some((c) => c.modification.type === 'userAccountControl' && c.modification.values[0] === '512'));

  assert.equal(calls.unbind, 1);
});

test('provisionUser ajoute un suffixe numerique si le sAMAccountName est deja pris', async () => {
  const { clientFactory, calls } = createFakeLdapClientFactory({ samAccountNames: ['mdupont'] });
  const service = createLdapService({ config: baseConfig, clientFactory, logger: noopLogger });

  const result = await service.provisionUser({
    employeeId: 'E101',
    firstName: 'Marie',
    lastName: 'Dupont',
    email: 'marie.dupont2@example.local',
  });

  assert.equal(result.samAccountName, 'mdupont1');
  assert.ok(calls.search.some((s) => s.filter.includes('mdupont')));
});

test('updateUser n\'envoie que les attributs fournis', async () => {
  const { clientFactory, calls } = createFakeLdapClientFactory();
  const service = createLdapService({ config: baseConfig, clientFactory, logger: noopLogger });

  const dn = 'CN=Marie Dupont,OU=Employes,DC=example,DC=local';
  await service.updateUser({ employeeId: 'E100', department: 'Marketing' }, dn);

  assert.equal(calls.modify.length, 1);
  assert.equal(calls.modify[0].changes.length, 1);
  assert.equal(calls.modify[0].changes[0].modification.type, 'department');
  assert.equal(calls.modify[0].changes[0].modification.values[0], 'Marketing');
});

test('disableUser desactive le compte et le deplace vers l\'UO de quarantaine', async () => {
  const { clientFactory, calls } = createFakeLdapClientFactory();
  const service = createLdapService({ config: baseConfig, clientFactory, logger: noopLogger });

  const dn = 'CN=Marie Dupont,OU=Employes,DC=example,DC=local';
  const result = await service.disableUser({ employeeId: 'E100' }, dn, '2026-08-25');

  assert.equal(result.dn, 'CN=Marie Dupont,OU=Comptes Desactives,DC=example,DC=local');
  assert.equal(calls.modify[0].changes[0].modification.values[0], '514');
  assert.equal(calls.modifyDN.length, 1);
  assert.equal(calls.modifyDN[0].newDn, result.dn);
});

test('mode dry-run ne se connecte jamais au serveur LDAP', async () => {
  const { clientFactory, calls } = createFakeLdapClientFactory();
  const service = createLdapService({ config: { ...baseConfig, mode: 'dry-run' }, clientFactory, logger: noopLogger });

  const result = await service.provisionUser({ employeeId: 'E200', firstName: 'Jean', lastName: 'Roy', email: 'jean.roy@example.local' });

  assert.equal(result.simulated, true);
  assert.equal(result.temporaryPassword, null);
  assert.equal(calls.bind.length, 0);
});

test('les operations echouent proprement si le serveur LDAP retourne une erreur', async () => {
  const { clientFactory } = createFakeLdapClientFactory({ addError: new Error('DSA is busy') });
  const service = createLdapService({ config: baseConfig, clientFactory, logger: noopLogger });

  await assert.rejects(
    () => service.provisionUser({ employeeId: 'E300', firstName: 'Ana', lastName: 'Silva', email: 'ana.silva@example.local' }),
    /DSA is busy/,
  );
});
