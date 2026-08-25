'use strict';

const { NotFoundError, ConflictError } = require('../errors');
const defaultLogger = require('../logger');

function mapEmployeeRow(row) {
  if (!row) return null;
  return {
    employeeId: row.employee_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    department: row.department,
    title: row.title,
    managerEmployeeId: row.manager_employee_id,
    officeLocation: row.office_location,
    hireDate: row.hire_date,
    terminationDate: row.termination_date,
    status: row.status,
    ldap: {
      dn: row.ldap_dn,
      samAccountName: row.sam_account_name,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSyncLogRow(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    action: row.action,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
  };
}

function createRepository(db) {
  const stmts = {
    getByEmployeeId: db.prepare('SELECT * FROM employees WHERE employee_id = ?'),
    insert: db.prepare(`
      INSERT INTO employees
        (employee_id, first_name, last_name, email, department, title,
         manager_employee_id, office_location, hire_date, status)
      VALUES
        (@employeeId, @firstName, @lastName, @email, @department, @title,
         @managerEmployeeId, @officeLocation, @hireDate, @status)
    `),
    updateFields: db.prepare(`
      UPDATE employees SET
        first_name = COALESCE(@firstName, first_name),
        last_name = COALESCE(@lastName, last_name),
        email = COALESCE(@email, email),
        department = COALESCE(@department, department),
        title = COALESCE(@title, title),
        manager_employee_id = COALESCE(@managerEmployeeId, manager_employee_id),
        office_location = COALESCE(@officeLocation, office_location),
        updated_at = datetime('now')
      WHERE employee_id = @employeeId
    `),
    updateLdapInfo: db.prepare(`
      UPDATE employees SET ldap_dn = @dn, sam_account_name = @samAccountName,
        status = @status, updated_at = datetime('now')
      WHERE employee_id = @employeeId
    `),
    updateLdapDn: db.prepare(`
      UPDATE employees SET ldap_dn = @dn, updated_at = datetime('now') WHERE employee_id = @employeeId
    `),
    updateStatus: db.prepare(`
      UPDATE employees SET status = @status, updated_at = datetime('now') WHERE employee_id = @employeeId
    `),
    setTermination: db.prepare(`
      UPDATE employees SET termination_date = @departureDate, updated_at = datetime('now')
      WHERE employee_id = @employeeId
    `),
    listAll: db.prepare('SELECT * FROM employees ORDER BY created_at DESC, id DESC'),
    listByStatus: db.prepare('SELECT * FROM employees WHERE status = ? ORDER BY created_at DESC, id DESC'),
    insertSyncLog: db.prepare(`
      INSERT INTO sync_logs (employee_id, action, status, message)
      VALUES (@employeeId, @action, @status, @message)
    `),
    listSyncLogs: db.prepare('SELECT * FROM sync_logs WHERE employee_id = ? ORDER BY created_at DESC, id DESC'),
  };

  return {
    getByEmployeeId: (employeeId) => stmts.getByEmployeeId.get(employeeId),
    insert: (employee) => stmts.insert.run(employee),
    updateFields: (employeeId, fields) => stmts.updateFields.run({
      employeeId,
      firstName: fields.firstName ?? null,
      lastName: fields.lastName ?? null,
      email: fields.email ?? null,
      department: fields.department ?? null,
      title: fields.title ?? null,
      managerEmployeeId: fields.managerEmployeeId ?? null,
      officeLocation: fields.officeLocation ?? null,
    }),
    updateLdapInfo: (employeeId, { dn, samAccountName, status }) =>
      stmts.updateLdapInfo.run({ employeeId, dn, samAccountName, status }),
    updateLdapDn: (employeeId, dn) => stmts.updateLdapDn.run({ employeeId, dn }),
    updateStatus: (employeeId, status) => stmts.updateStatus.run({ employeeId, status }),
    setTermination: (employeeId, departureDate) => stmts.setTermination.run({ employeeId, departureDate }),
    list: (status) => (status ? stmts.listByStatus.all(status) : stmts.listAll.all()),
    insertSyncLog: (entry) => stmts.insertSyncLog.run({ message: null, ...entry }),
    listSyncLogs: (employeeId) => stmts.listSyncLogs.all(employeeId),
  };
}

/**
 * Service metier : orchestre la persistance locale (source de verite pour le
 * systeme RH) et la synchronisation vers Active Directory.
 *
 * Principe important : une panne de l'annuaire LDAP ne doit jamais faire
 * perdre une donnee RH. Toute ecriture est d'abord persistee en base, puis la
 * synchronisation AD est tentee ; en cas d'echec, l'employe est marque
 * '..._sync_failed' et l'operation reste rejouable via resyncEmployee().
 */
function createEmployeeService({ db, ldapService, logger = defaultLogger }) {
  const repo = createRepository(db);

  async function runSync(action, employeeId, task, onSuccess) {
    try {
      const result = await task();
      onSuccess(result);
      repo.insertSyncLog({
        employeeId,
        action,
        status: 'success',
        message: result.simulated ? 'Simulation (dry-run)' : `dn=${result.dn}`,
      });
      return { result, error: null };
    } catch (err) {
      logger.error(`Echec de synchronisation LDAP (${action}) pour ${employeeId}`, err);
      repo.insertSyncLog({ employeeId, action, status: 'failed', message: err.message });
      return { result: null, error: err };
    }
  }

  async function onboardEmployee(payload) {
    if (repo.getByEmployeeId(payload.employeeId)) {
      throw new ConflictError(`Un employe avec l'identifiant "${payload.employeeId}" existe deja.`);
    }

    repo.insert({ ...payload, status: 'pending' });

    const { result, error } = await runSync('create', payload.employeeId, () => ldapService.provisionUser(payload), (r) => {
      repo.updateLdapInfo(payload.employeeId, { dn: r.dn, samAccountName: r.samAccountName, status: 'active' });
    });

    if (error) repo.updateStatus(payload.employeeId, 'sync_failed');

    return {
      employee: mapEmployeeRow(repo.getByEmployeeId(payload.employeeId)),
      ldap: result,
      syncError: error ? error.message : null,
    };
  }

  async function updateEmployee(employeeId, fields) {
    const existing = repo.getByEmployeeId(employeeId);
    if (!existing) throw new NotFoundError(`Aucun employe avec l'identifiant "${employeeId}".`);
    if (existing.status === 'terminated' || existing.status === 'terminated_sync_failed') {
      throw new ConflictError("Impossible de modifier un employe ayant quitte l'organisation.");
    }

    repo.updateFields(employeeId, fields);
    const merged = { ...mapEmployeeRow(repo.getByEmployeeId(employeeId)), ...fields, employeeId };

    const task = existing.ldap_dn
      ? () => ldapService.updateUser(merged, existing.ldap_dn)
      : () => ldapService.provisionUser(merged);

    const { result, error } = await runSync('update', employeeId, task, (r) => {
      repo.updateLdapInfo(employeeId, {
        dn: r.dn,
        samAccountName: r.samAccountName || existing.sam_account_name,
        status: 'active',
      });
    });

    if (error) repo.updateStatus(employeeId, 'sync_failed');

    return {
      employee: mapEmployeeRow(repo.getByEmployeeId(employeeId)),
      ldap: result,
      syncError: error ? error.message : null,
    };
  }

  async function departEmployee(employeeId, { departureDate, reason }) {
    const existing = repo.getByEmployeeId(employeeId);
    if (!existing) throw new NotFoundError(`Aucun employe avec l'identifiant "${employeeId}".`);
    if (existing.status === 'terminated' || existing.status === 'terminated_sync_failed') {
      throw new ConflictError(`L'employe "${employeeId}" a deja ete marque comme parti.`);
    }

    repo.setTermination(employeeId, departureDate);

    if (!existing.ldap_dn) {
      repo.insertSyncLog({ employeeId, action: 'disable', status: 'skipped', message: 'Aucun compte AD associe a desactiver.' });
      repo.updateStatus(employeeId, 'terminated');
      return { employee: mapEmployeeRow(repo.getByEmployeeId(employeeId)), ldap: null, syncError: null };
    }

    const { result, error } = await runSync(
      'disable',
      employeeId,
      () => ldapService.disableUser({ ...existing, employeeId, reason }, existing.ldap_dn, departureDate),
      (r) => repo.updateLdapDn(employeeId, r.dn),
    );

    repo.updateStatus(employeeId, error ? 'terminated_sync_failed' : 'terminated');

    return {
      employee: mapEmployeeRow(repo.getByEmployeeId(employeeId)),
      ldap: result,
      syncError: error ? error.message : null,
    };
  }

  /**
   * Rejoue la synchronisation AD pour un employe dont le dernier essai a
   * echoue (panne temporaire du controleur de domaine, par exemple).
   */
  async function resyncEmployee(employeeId) {
    const existing = repo.getByEmployeeId(employeeId);
    if (!existing) throw new NotFoundError(`Aucun employe avec l'identifiant "${employeeId}".`);

    const employee = mapEmployeeRow(existing);

    if (existing.status === 'terminated' || existing.status === 'terminated_sync_failed') {
      if (!existing.ldap_dn) {
        return { employee, ldap: null, syncError: null };
      }
      const { result, error } = await runSync(
        'disable',
        employeeId,
        () => ldapService.disableUser(employee, existing.ldap_dn, existing.termination_date),
        (r) => repo.updateLdapDn(employeeId, r.dn),
      );
      repo.updateStatus(employeeId, error ? 'terminated_sync_failed' : 'terminated');
      return { employee: mapEmployeeRow(repo.getByEmployeeId(employeeId)), ldap: result, syncError: error ? error.message : null };
    }

    const task = existing.ldap_dn
      ? () => ldapService.updateUser(employee, existing.ldap_dn)
      : () => ldapService.provisionUser(employee);

    const { result, error } = await runSync(existing.ldap_dn ? 'update' : 'create', employeeId, task, (r) => {
      repo.updateLdapInfo(employeeId, { dn: r.dn, samAccountName: r.samAccountName || existing.sam_account_name, status: 'active' });
    });

    if (error) repo.updateStatus(employeeId, 'sync_failed');

    return {
      employee: mapEmployeeRow(repo.getByEmployeeId(employeeId)),
      ldap: result,
      syncError: error ? error.message : null,
    };
  }

  function getEmployee(employeeId) {
    const row = repo.getByEmployeeId(employeeId);
    if (!row) throw new NotFoundError(`Aucun employe avec l'identifiant "${employeeId}".`);
    return mapEmployeeRow(row);
  }

  function listEmployees(status) {
    return repo.list(status).map(mapEmployeeRow);
  }

  function getSyncLogs(employeeId) {
    if (!repo.getByEmployeeId(employeeId)) throw new NotFoundError(`Aucun employe avec l'identifiant "${employeeId}".`);
    return repo.listSyncLogs(employeeId).map(mapSyncLogRow);
  }

  return {
    onboardEmployee,
    updateEmployee,
    departEmployee,
    resyncEmployee,
    getEmployee,
    listEmployees,
    getSyncLogs,
  };
}

module.exports = { createEmployeeService, mapEmployeeRow };
