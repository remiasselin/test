'use strict';

import { api } from '../api.js';
import { toast, openModal, confirmDialog } from '../ui.js';
import { ROLE_LABELS, badge, formatDate, escapeHtml } from '../constants.js';

export async function renderUtilisateurs(content, state) {
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Utilisateurs</h1>
        <p>Gestion des comptes et des accès à l'application (réservé aux administrateurs).</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="newUserBtn">+ Nouvel utilisateur</button>
      </div>
    </div>
    <div id="userTableHost"></div>
  `;

  document.getElementById('newUserBtn').addEventListener('click', () => openUserForm(null, state, () => loadTable(content, state)));
  await loadTable(content, state);
}

async function loadTable(content, state) {
  const host = document.getElementById('userTableHost');
  host.innerHTML = '<div class="loading-block"><div class="spinner"></div></div>';

  const { users } = await api.get('/api/users');

  host.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Nom</th><th>Courriel</th><th>Rôle</th><th>Statut</th><th>Créé le</th><th></th></tr></thead>
        <tbody>
          ${users.map((u) => `
            <tr data-id="${u.id}">
              <td class="cell-strong">${escapeHtml(u.name)}</td>
              <td class="cell-muted">${escapeHtml(u.email)}</td>
              <td><span class="badge badge-${u.role}"><span class="badge-dot"></span>${escapeHtml(ROLE_LABELS[u.role] || u.role)}</span></td>
              <td>${u.active ? '<span class="badge badge-actif"><span class="badge-dot"></span>Actif</span>' : '<span class="badge badge-inactif"><span class="badge-dot"></span>Désactivé</span>'}</td>
              <td class="cell-muted">${formatDate(u.created_at)}</td>
              <td>
                <div class="row-actions">
                  <button class="btn btn-secondary btn-sm" data-action="edit">Modifier</button>
                  ${u.id !== state.user.id ? '<button class="btn btn-danger btn-sm" data-action="delete">Suppr.</button>' : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  host.querySelectorAll('tbody tr').forEach((tr) => {
    const id = tr.dataset.id;
    const user = users.find((u) => String(u.id) === id);
    tr.querySelector('[data-action="edit"]').addEventListener('click', () => openUserForm(user, state, () => loadTable(content, state)));
    const delBtn = tr.querySelector('[data-action="delete"]');
    if (delBtn) delBtn.addEventListener('click', () => deleteUser(user, content, state));
  });
}

async function deleteUser(user, content, state) {
  const ok = await confirmDialog(`Supprimer le compte de <strong>${escapeHtml(user.name)}</strong> ? Cette action est irréversible.`);
  if (!ok) return;
  try {
    await api.del(`/api/users/${user.id}`);
    toast('Utilisateur supprimé.', 'success');
    loadTable(content, state);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function openUserForm(user, state, onSaved) {
  const isEdit = !!user;
  const isSelf = isEdit && user.id === state.user.id;

  const bodyHtml = `
    <form id="userForm" class="form-grid">
      <div class="field full">
        <label for="uName">Nom complet *</label>
        <input type="text" id="uName" value="${escapeHtml(user?.name || '')}" required />
      </div>
      <div class="field full">
        <label for="uEmail">Courriel *</label>
        <input type="email" id="uEmail" value="${escapeHtml(user?.email || '')}" required />
      </div>
      <div class="field">
        <label for="uRole">Rôle *</label>
        <select id="uRole" ${isSelf ? 'disabled' : ''}>
          ${Object.entries(ROLE_LABELS).map(([v, l]) => `<option value="${v}" ${(user?.role || 'lecteur') === v ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="uActive">Statut</label>
        <select id="uActive" ${isSelf ? 'disabled' : ''}>
          <option value="1" ${!user || user.active ? 'selected' : ''}>Actif</option>
          <option value="0" ${user && !user.active ? 'selected' : ''}>Désactivé</option>
        </select>
      </div>
      <div class="field full">
        <label for="uPassword">${isEdit ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe *'}</label>
        <input type="password" id="uPassword" ${isEdit ? '' : 'required'} minlength="8" placeholder="8 caractères minimum" />
      </div>
      ${isSelf ? '<p class="hint" style="grid-column:1/-1;">Vous ne pouvez pas modifier votre propre rôle ou statut.</p>' : ''}
    </form>
  `;

  const { close } = openModal({
    title: isEdit ? `Modifier ${user.name}` : 'Nouvel utilisateur',
    size: 'lg',
    bodyHtml,
    onMount: (el) => {
      const modalBody = el.querySelector('.modal-body');
      const footer = document.createElement('div');
      footer.className = 'modal-footer';
      footer.innerHTML = `
        <button class="btn btn-secondary" id="cancelBtn">Annuler</button>
        <button class="btn btn-primary" id="saveBtn">${isEdit ? 'Enregistrer' : 'Créer le compte'}</button>
      `;
      modalBody.after(footer);

      el.querySelector('#cancelBtn').addEventListener('click', () => close());
      el.querySelector('#saveBtn').addEventListener('click', async () => {
        const password = el.querySelector('#uPassword').value;
        const payload = {
          name: el.querySelector('#uName').value.trim(),
          email: el.querySelector('#uEmail').value.trim(),
          role: el.querySelector('#uRole').value,
          active: el.querySelector('#uActive').value === '1',
        };
        if (password) payload.password = password;

        const saveBtn = el.querySelector('#saveBtn');
        saveBtn.disabled = true;
        try {
          if (isEdit) {
            await api.put(`/api/users/${user.id}`, payload);
            toast('Utilisateur mis à jour.', 'success');
          } else {
            await api.post('/api/users', payload);
            toast('Utilisateur créé.', 'success');
          }
          close();
          onSaved();
        } catch (err) {
          saveBtn.disabled = false;
          toast(err.message, 'error');
        }
      });
    },
  });
}
