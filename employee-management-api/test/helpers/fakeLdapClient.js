'use strict';

const { EventEmitter } = require('events');

/**
 * Fabrique un faux client ldapjs pilotable pour les tests unitaires du
 * service LDAP, sans dependre d'un veritable controleur de domaine.
 *
 * `state.samAccountNames` et `state.dns` simulent le contenu de l'annuaire
 * pour les recherches d'unicite ; `calls` conserve un historique de toutes
 * les operations effectuees pour permettre des assertions.
 */
function createFakeLdapClientFactory(state = {}) {
  const samAccountNames = new Set(state.samAccountNames || []);
  const dns = new Set(state.dns || []);
  const calls = { bind: [], add: [], modify: [], modifyDN: [], search: [], unbind: 0 };

  const clientFactory = () => ({
    on: () => {},
    bind: (dn, password, cb) => {
      calls.bind.push({ dn, password });
      if (state.bindError) return cb(state.bindError);
      cb(null);
    },
    search: (base, opts, cb) => {
      calls.search.push({ base, filter: opts.filter });
      const res = new EventEmitter();
      cb(null, res);
      process.nextTick(() => {
        const filter = opts.filter;
        const samMatch = /\(sAMAccountName=([^)]+)\)/.exec(filter);
        const dnMatch = /\(distinguishedName=([^)]+)\)/.exec(filter);

        if (samMatch && samAccountNames.has(samMatch[1])) {
          res.emit('searchEntry', { object: { sAMAccountName: samMatch[1] } });
        } else if (dnMatch && dns.has(dnMatch[1])) {
          res.emit('searchEntry', { object: { dn: dnMatch[1] } });
        }
        res.emit('end');
      });
    },
    add: (dn, entry, cb) => {
      calls.add.push({ dn, entry });
      if (state.addError) return cb(state.addError);
      cb(null);
    },
    modify: (dn, changes, cb) => {
      calls.modify.push({ dn, changes });
      if (state.modifyError) return cb(state.modifyError);
      cb(null);
    },
    modifyDN: (dn, newDn, cb) => {
      calls.modifyDN.push({ dn, newDn });
      if (state.modifyDNError) return cb(state.modifyDNError);
      cb(null);
    },
    unbind: (cb) => {
      calls.unbind += 1;
      cb();
    },
  });

  return { clientFactory, calls };
}

module.exports = { createFakeLdapClientFactory };
