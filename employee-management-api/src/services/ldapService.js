'use strict';

const crypto = require('crypto');
const ldap = require('ldapjs');
const defaultConfig = require('../config');
const defaultLogger = require('../logger');

const SAM_MAX_LENGTH = 20; // limite historique du schema Active Directory

/* ── Utilitaires ─────────────────────────────────────────────────────── */

// Echappement des valeurs injectees dans un filtre LDAP (RFC 4515).
function escapeFilterValue(value) {
  return String(value).replace(/[\\*()\0]/g, (c) => `\\${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

// Echappement des valeurs injectees dans un RDN / DN.
function escapeDnValue(value) {
  return String(value).replace(/[,+"\\<>;=\r\n#]/g, '\\$&').trim();
}

function removeDiacritics(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function slugify(value) {
  return removeDiacritics(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildBaseSamAccountName(employee) {
  const first = slugify(employee.firstName).charAt(0);
  const last = slugify(employee.lastName);
  const base = `${first}${last}`.slice(0, SAM_MAX_LENGTH) || 'user';
  return base;
}

function buildCommonName(employee) {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

// Genere un mot de passe temporaire respectant la politique de complexite AD
// (minuscule, majuscule, chiffre, caractere special, >= 14 caracteres).
function generateTemporaryPassword() {
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const special = '!@#$%^&*-_+=';
  const all = lower + upper + digits + special;

  const pick = (set) => set[crypto.randomInt(set.length)];
  const chars = [pick(lower), pick(upper), pick(digits), pick(special)];
  while (chars.length < 16) chars.push(pick(all));

  // Melange (Fisher-Yates) pour eviter un motif previsible en debut de mot de passe.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

// AD exige le mot de passe encode en UTF-16LE et entoure de guillemets pour
// l'attribut unicodePwd, et cette operation necessite une connexion LDAPS.
function encodeAdPassword(password) {
  return Buffer.from(`"${password}"`, 'utf16le');
}

function compact(entry) {
  const result = {};
  for (const [key, value] of Object.entries(entry)) {
    if (value !== undefined && value !== null && value !== '') result[key] = value;
  }
  return result;
}

function replaceChange(type, values) {
  return new ldap.Change({
    operation: 'replace',
    modification: { type, values: Array.isArray(values) ? values : [values] },
  });
}

function entryToObject(entry) {
  if (entry.pojo) {
    const obj = { dn: entry.pojo.objectName };
    for (const attr of entry.pojo.attributes) {
      obj[attr.type] = attr.values.length === 1 ? attr.values[0] : attr.values;
    }
    return obj;
  }
  // Compat avec les versions plus anciennes de ldapjs.
  return entry.object;
}

/**
 * Cree un service LDAP/Active Directory.
 *
 * @param {object} [options]
 * @param {object} [options.config]        configuration LDAP (defaut: config.ldap)
 * @param {function} [options.clientFactory] fabrique de client ldapjs, injectable pour les tests
 * @param {object} [options.logger]        logger (defaut: logger applicatif)
 */
function createLdapService(options = {}) {
  const cfg = options.config || defaultConfig.ldap;
  const logger = options.logger || defaultLogger;
  const clientFactory = options.clientFactory || ((opts) => ldap.createClient(opts));

  const isDryRun = cfg.mode !== 'live';

  function connect() {
    return new Promise((resolve, reject) => {
      const client = clientFactory({
        url: cfg.url,
        tlsOptions: { rejectUnauthorized: cfg.tlsRejectUnauthorized },
      });
      client.on('error', (err) => logger.error('Erreur de connexion au serveur LDAP', err));
      client.bind(cfg.bindDn, cfg.bindPassword, (err) => {
        if (err) return reject(err);
        resolve(client);
      });
    });
  }

  function unbindSafe(client) {
    return new Promise((resolve) => {
      if (!client) return resolve();
      client.unbind(() => resolve());
    });
  }

  function search(client, base, filter, attributes = []) {
    return new Promise((resolve, reject) => {
      client.search(base, { filter, scope: 'sub', attributes }, (err, res) => {
        if (err) return reject(err);
        const results = [];
        res.on('searchEntry', (entry) => results.push(entryToObject(entry)));
        res.on('error', (searchErr) => reject(searchErr));
        res.on('end', () => resolve(results));
      });
    });
  }

  function add(client, dn, entry) {
    return new Promise((resolve, reject) => {
      client.add(dn, compact(entry), (err) => (err ? reject(err) : resolve()));
    });
  }

  function modify(client, dn, changes) {
    return new Promise((resolve, reject) => {
      client.modify(dn, changes, (err) => (err ? reject(err) : resolve()));
    });
  }

  function move(client, dn, newDn) {
    return new Promise((resolve, reject) => {
      client.modifyDN(dn, newDn, (err) => (err ? reject(err) : resolve()));
    });
  }

  async function generateUniqueSamAccountName(client, baseSam) {
    let candidate = baseSam;
    for (let suffix = 0; suffix < 50; suffix += 1) {
      const results = await search(
        client,
        cfg.baseDn,
        `(sAMAccountName=${escapeFilterValue(candidate)})`,
        ['sAMAccountName'],
      );
      if (results.length === 0) return candidate;
      const suffixStr = String(suffix + 1);
      candidate = `${baseSam.slice(0, SAM_MAX_LENGTH - suffixStr.length)}${suffixStr}`;
    }
    throw new Error(`Impossible de generer un sAMAccountName unique a partir de "${baseSam}"`);
  }

  async function generateUniqueDn(client, cn, employeeId) {
    const candidates = [cn, `${cn} (${employeeId})`];
    for (const candidate of candidates) {
      const dn = `CN=${escapeDnValue(candidate)},${cfg.usersOu}`;
      const results = await search(client, cfg.usersOu, `(distinguishedName=${escapeFilterValue(dn)})`, ['dn']);
      if (results.length === 0) return dn;
    }
    // Dernier recours : suffixe aleatoire, en pratique jamais atteint.
    const dn = `CN=${escapeDnValue(cn)} (${crypto.randomUUID().slice(0, 8)}),${cfg.usersOu}`;
    return dn;
  }

  /**
   * Recherche un compte AD existant a partir de l'identifiant RH (attribut
   * standard employeeID), afin de reconcilier l'etat local avec l'annuaire.
   */
  async function findByEmployeeId(employeeId) {
    if (isDryRun) {
      logger.info(`[dry-run] Recherche AD ignoree pour l'employe ${employeeId}`);
      return null;
    }
    const client = await connect();
    try {
      const results = await search(
        client,
        cfg.baseDn,
        `(employeeID=${escapeFilterValue(employeeId)})`,
        ['dn', 'sAMAccountName', 'userAccountControl', 'distinguishedName'],
      );
      return results[0] || null;
    } finally {
      await unbindSafe(client);
    }
  }

  /**
   * Cree le compte AD d'un nouvel employe (arrivee). Suit l'ordre requis par
   * Active Directory : creation du compte desactive, definition du mot de
   * passe (necessite LDAPS), puis activation avec obligation de changer le
   * mot de passe a la premiere connexion.
   */
  async function provisionUser(employee) {
    const cn = buildCommonName(employee);
    const baseSam = buildBaseSamAccountName(employee);

    if (isDryRun) {
      const dn = `CN=${escapeDnValue(cn)},${cfg.usersOu}`;
      logger.info(`[dry-run] Creation du compte AD simulee pour ${employee.employeeId} -> ${dn}`);
      return {
        dn,
        samAccountName: baseSam,
        userPrincipalName: `${baseSam}@${cfg.domain}`,
        temporaryPassword: null,
        simulated: true,
      };
    }

    const client = await connect();
    try {
      const samAccountName = await generateUniqueSamAccountName(client, baseSam);
      const dn = await generateUniqueDn(client, cn, employee.employeeId);
      const userPrincipalName = `${samAccountName}@${cfg.domain}`;
      const temporaryPassword = generateTemporaryPassword();

      await add(client, dn, {
        objectClass: ['top', 'person', 'organizationalPerson', 'user'],
        cn,
        sn: employee.lastName,
        givenName: employee.firstName,
        displayName: cn,
        sAMAccountName: samAccountName,
        userPrincipalName,
        mail: employee.email,
        employeeID: employee.employeeId,
        department: employee.department,
        title: employee.title,
        physicalDeliveryOfficeName: employee.officeLocation,
        userAccountControl: '514', // compte cree desactive
      });

      await modify(client, dn, [replaceChange('unicodePwd', encodeAdPassword(temporaryPassword))]);

      await modify(client, dn, [
        replaceChange('pwdLastSet', '0'), // force le changement au 1er logon
        replaceChange('userAccountControl', '512'), // compte normal, active
      ]);

      logger.info(`Compte AD cree pour l'employe ${employee.employeeId}`, { dn, samAccountName });
      return { dn, samAccountName, userPrincipalName, temporaryPassword, simulated: false };
    } finally {
      await unbindSafe(client);
    }
  }

  /**
   * Met a jour les attributs d'un compte AD existant suite a un changement
   * transmis par le systeme RH (poste, service, courriel, etc.).
   */
  async function updateUser(employee, dn) {
    if (isDryRun) {
      logger.info(`[dry-run] Mise a jour AD simulee pour ${employee.employeeId} -> ${dn}`);
      return { dn, simulated: true };
    }

    const client = await connect();
    try {
      const changes = [];
      if (employee.email) changes.push(replaceChange('mail', employee.email));
      if (employee.department) changes.push(replaceChange('department', employee.department));
      if (employee.title) changes.push(replaceChange('title', employee.title));
      if (employee.officeLocation) changes.push(replaceChange('physicalDeliveryOfficeName', employee.officeLocation));
      if (employee.firstName) changes.push(replaceChange('givenName', employee.firstName));
      if (employee.lastName) changes.push(replaceChange('sn', employee.lastName));
      if (employee.firstName || employee.lastName) {
        changes.push(replaceChange('displayName', buildCommonName(employee)));
      }

      if (changes.length === 0) return { dn, simulated: false, noop: true };

      await modify(client, dn, changes);
      logger.info(`Compte AD mis a jour pour l'employe ${employee.employeeId}`, { dn });
      return { dn, simulated: false };
    } finally {
      await unbindSafe(client);
    }
  }

  /**
   * Desactive le compte AD d'un employe qui quitte l'organisation et le
   * deplace vers l'UO de quarantaine si celle-ci est configuree.
   */
  async function disableUser(employee, dn, departureDate) {
    if (isDryRun) {
      logger.info(`[dry-run] Desactivation AD simulee pour ${employee.employeeId} -> ${dn}`);
      return { dn, simulated: true };
    }

    const client = await connect();
    try {
      await modify(client, dn, [
        replaceChange('userAccountControl', '514'), // compte desactive
        replaceChange('description', `Depart le ${departureDate}`),
      ]);

      let targetDn = dn;
      if (cfg.disabledOu) {
        const rdn = dn.split(',')[0];
        targetDn = `${rdn},${cfg.disabledOu}`;
        await move(client, dn, targetDn);
      }

      logger.info(`Compte AD desactive pour l'employe ${employee.employeeId}`, { dn: targetDn });
      return { dn: targetDn, simulated: false };
    } finally {
      await unbindSafe(client);
    }
  }

  return {
    isDryRun,
    findByEmployeeId,
    provisionUser,
    updateUser,
    disableUser,
    // Exposes pour les tests unitaires.
    _internal: { buildBaseSamAccountName, buildCommonName, generateTemporaryPassword, escapeFilterValue, escapeDnValue },
  };
}

module.exports = { createLdapService };
