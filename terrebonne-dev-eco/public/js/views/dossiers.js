'use strict';

import { api } from '../api.js';
import { toast, openModal, confirmDialog } from '../ui.js';
import { STATUT_LABELS, PRIORITE_LABELS, badge, formatMoney, formatDate, formatDateTime, escapeHtml } from '../constants.js';

let meta = null;
let entreprisesList = [];
let usersList = [];
let filters = { statut: '', type: '', priorite: '', q: '' };

export async function renderDossiers(content, state) {
  const canEdit = state.user.role === 'admin' || state.user.role === 'gestionnaire';
  const canDelete = state.user.role === 'admin';

  if (!meta) {
    const [m, e, u] = await Promise.all([
      api.get('/api/dossiers/meta'),
      api.get('/api/entreprises'),
      api.get('/api/users/basic'),
    ]);
    meta = m;
    entreprisesList = e.entreprises;
    usersList = u.users;
  }

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Dossiers</h1>
        <p>Suivi des demandes d'aide, permis, accompagnements et projets d'entreprises.</p>
      </div>
      <div class="page-actions">
        ${canEdit ? '<button class="btn btn-primary" id="newDossierBtn">+ Nouveau dossier</button>' : ''}
      </div>
    </div>

    <div class="toolbar">
      <input type="search" id="fQ" class="search-input" placeholder="Rechercher un dossier, une entreprise…" value="${escapeHtml(filters.q)}" />
      <select id="fStatut"><option value="">Tous les statuts</option>${optionsFor(STATUT_LABELS, filters.statut)}</select>
      <select id="fType"><option value="">Tous les types</option>${meta.types.map((t) => `<option value="${escapeHtml(t)}" ${filters.type === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select>
      <select id="fPriorite"><option value="">Toutes priorités</option>${optionsFor(PRIORITE_LABELS, filters.priorite)}</select>
    </div>

    <div id="dossierTableHost"></div>
  `;

  document.getElementById('fQ').addEventListener('input', debounce((e) => { filters.q = e.target.value; loadTable(content, state); }, 300));
  document.getElementById('fStatut').addEventListener('change', (e) => { filters.statut = e.target.value; loadTable(content, state); });
  document.getElementById('fType').addEventListener('change', (e) => { filters.type = e.target.value; loadTable(content, state); });
  document.getElementById('fPriorite').addEventListener('change', (e) => { filters.priorite = e.target.value; loadTable(content, state); });

  if (canEdit) {
    document.getElementById('newDossierBtn').addEventListener('click', () => openDossierForm(null, state, () => loadTable(content, state)));
  }

  await loadTable(content, state);
}

async function loadTable(content, state) {
  const host = document.getElementById('dossierTableHost');
  host.innerHTML = '<div class="loading-block"><div class="spinner"></div></div>';

  const { dossiers } = await api.get('/api/dossiers', filters);
  const canEdit = state.user.role === 'admin' || state.user.role === 'gestionnaire';
  const canDelete = state.user.role === 'admin';

  if (!dossiers.length) {
    host.innerHTML = '<div class="empty-state"><div class="empty-icon">▤</div><p>Aucun dossier ne correspond aux critères.</p></div>';
    return;
  }

  host.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Numéro</th><th>Titre</th><th>Entreprise</th><th>Type</th><th>Statut</th>
            <th>Priorité</th><th>Montant accordé</th><th>Échéance</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${dossiers.map((d) => `
            <tr data-id="${d.id}">
              <td class="cell-strong">${d.numero}</td>
              <td>${escapeHtml(d.titre)}</td>
              <td class="cell-muted">${escapeHtml(d.entreprise_nom || '—')}</td>
              <td class="cell-muted">${escapeHtml(d.type)}</td>
              <td>${badge(d.statut, STATUT_LABELS)}</td>
              <td>${badge(d.priorite, PRIORITE_LABELS)}</td>
              <td>${formatMoney(d.montant_accorde)}</td>
              <td class="cell-muted">${formatDate(d.date_echeance)}</td>
              <td>
                <div class="row-actions">
                  <button class="btn btn-ghost btn-sm" data-action="view">Détails</button>
                  ${canEdit ? '<button class="btn btn-secondary btn-sm" data-action="edit">Modifier</button>' : ''}
                  ${canDelete ? '<button class="btn btn-danger btn-sm" data-action="delete">Suppr.</button>' : ''}
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
    const dossier = dossiers.find((d) => String(d.id) === id);
    tr.querySelector('[data-action="view"]').addEventListener('click', () => openDossierDetail(dossier.id, state, () => loadTable(content, state)));
    const editBtn = tr.querySelector('[data-action="edit"]');
    if (editBtn) editBtn.addEventListener('click', () => openDossierForm(dossier, state, () => loadTable(content, state)));
    const delBtn = tr.querySelector('[data-action="delete"]');
    if (delBtn) delBtn.addEventListener('click', () => deleteDossier(dossier, content, state));
  });
}

async function deleteDossier(dossier, content, state) {
  const ok = await confirmDialog(`Supprimer définitivement le dossier <strong>${escapeHtml(dossier.numero)}</strong> — ${escapeHtml(dossier.titre)} ?`);
  if (!ok) return;
  try {
    await api.del(`/api/dossiers/${dossier.id}`);
    toast('Dossier supprimé.', 'success');
    loadTable(content, state);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function optionsFor(labels, selected) {
  return Object.entries(labels).map(([value, label]) =>
    `<option value="${value}" ${selected === value ? 'selected' : ''}>${escapeHtml(label)}</option>`
  ).join('');
}

function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

function openDossierForm(dossier, state, onSaved) {
  const isEdit = !!dossier;
  const entrepriseOptions = entreprisesList.map((e) =>
    `<option value="${e.id}" ${dossier && dossier.entreprise_id === e.id ? 'selected' : ''}>${escapeHtml(e.nom)}</option>`
  ).join('');
  const responsableOptions = usersList.map((u) =>
    `<option value="${u.id}" ${dossier && dossier.responsable_id === u.id ? 'selected' : ''}>${escapeHtml(u.name)}</option>`
  ).join('');

  const bodyHtml = `
    <form id="dossierForm" class="form-grid">
      <div class="field full">
        <label for="dTitre">Titre du dossier *</label>
        <input type="text" id="dTitre" value="${escapeHtml(dossier?.titre || '')}" required />
      </div>
      <div class="field">
        <label for="dType">Type *</label>
        <select id="dType" required>
          ${meta.types.map((t) => `<option value="${escapeHtml(t)}" ${dossier?.type === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="dStatut">Statut *</label>
        <select id="dStatut" required>${optionsFor(STATUT_LABELS, dossier?.statut || 'nouveau')}</select>
      </div>
      <div class="field">
        <label for="dPriorite">Priorité</label>
        <select id="dPriorite">${optionsFor(PRIORITE_LABELS, dossier?.priorite || 'normale')}</select>
      </div>
      <div class="field">
        <label for="dEntreprise">Entreprise</label>
        <select id="dEntreprise"><option value="">— Aucune —</option>${entrepriseOptions}</select>
      </div>
      <div class="field">
        <label for="dResponsable">Responsable</label>
        <select id="dResponsable"><option value="">— Non assigné —</option>${responsableOptions}</select>
      </div>
      <div class="field">
        <label for="dMontantDemande">Montant demandé ($)</label>
        <input type="number" id="dMontantDemande" min="0" step="100" value="${dossier?.montant_demande ?? 0}" />
      </div>
      <div class="field">
        <label for="dMontantAccorde">Montant accordé ($)</label>
        <input type="number" id="dMontantAccorde" min="0" step="100" value="${dossier?.montant_accorde ?? 0}" />
      </div>
      <div class="field">
        <label for="dDateOuverture">Date d'ouverture</label>
        <input type="date" id="dDateOuverture" value="${dossier?.date_ouverture || new Date().toISOString().slice(0, 10)}" />
      </div>
      <div class="field">
        <label for="dDateEcheance">Date d'échéance</label>
        <input type="date" id="dDateEcheance" value="${dossier?.date_echeance || ''}" />
      </div>
      <div class="field full">
        <label for="dDescription">Description</label>
        <textarea id="dDescription">${escapeHtml(dossier?.description || '')}</textarea>
      </div>
    </form>
  `;

  const { overlay, close } = openModal({
    title: isEdit ? `Modifier le dossier ${dossier.numero}` : 'Nouveau dossier',
    size: 'lg',
    bodyHtml,
    onMount: (el) => {
      const modalBody = el.querySelector('.modal-body');
      const footer = document.createElement('div');
      footer.className = 'modal-footer';
      footer.innerHTML = `
        <button class="btn btn-secondary" id="cancelBtn">Annuler</button>
        <button class="btn btn-primary" id="saveBtn">${isEdit ? 'Enregistrer' : 'Créer le dossier'}</button>
      `;
      modalBody.after(footer);

      el.querySelector('#cancelBtn').addEventListener('click', () => close());
      el.querySelector('#saveBtn').addEventListener('click', async () => {
        const payload = {
          titre: el.querySelector('#dTitre').value.trim(),
          type: el.querySelector('#dType').value,
          statut: el.querySelector('#dStatut').value,
          priorite: el.querySelector('#dPriorite').value,
          entreprise_id: el.querySelector('#dEntreprise').value || null,
          responsable_id: el.querySelector('#dResponsable').value || null,
          montant_demande: el.querySelector('#dMontantDemande').value || 0,
          montant_accorde: el.querySelector('#dMontantAccorde').value || 0,
          date_ouverture: el.querySelector('#dDateOuverture').value,
          date_echeance: el.querySelector('#dDateEcheance').value || null,
          description: el.querySelector('#dDescription').value.trim(),
        };

        const saveBtn = el.querySelector('#saveBtn');
        saveBtn.disabled = true;
        try {
          if (isEdit) {
            await api.put(`/api/dossiers/${dossier.id}`, payload);
            toast('Dossier mis à jour.', 'success');
          } else {
            await api.post('/api/dossiers', payload);
            toast('Dossier créé.', 'success');
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

async function openDossierDetail(id, state, onChange) {
  const canEdit = state.user.role === 'admin' || state.user.role === 'gestionnaire';
  const { dossier, suivis } = await api.get(`/api/dossiers/${id}`);

  const bodyHtml = `
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Numéro</div><div class="detail-value">${dossier.numero}</div></div>
      <div class="detail-item"><div class="detail-label">Statut</div><div class="detail-value">${badge(dossier.statut, STATUT_LABELS)}</div></div>
      <div class="detail-item"><div class="detail-label">Priorité</div><div class="detail-value">${badge(dossier.priorite, PRIORITE_LABELS)}</div></div>
      <div class="detail-item"><div class="detail-label">Type</div><div class="detail-value">${escapeHtml(dossier.type)}</div></div>
      <div class="detail-item"><div class="detail-label">Entreprise</div><div class="detail-value">${escapeHtml(dossier.entreprise_nom || '—')}</div></div>
      <div class="detail-item"><div class="detail-label">Responsable</div><div class="detail-value">${escapeHtml(dossier.responsable_nom || '—')}</div></div>
      <div class="detail-item"><div class="detail-label">Montant demandé</div><div class="detail-value">${formatMoney(dossier.montant_demande)}</div></div>
      <div class="detail-item"><div class="detail-label">Montant accordé</div><div class="detail-value">${formatMoney(dossier.montant_accorde)}</div></div>
      <div class="detail-item"><div class="detail-label">Ouverture</div><div class="detail-value">${formatDate(dossier.date_ouverture)}</div></div>
      <div class="detail-item"><div class="detail-label">Échéance</div><div class="detail-value">${formatDate(dossier.date_echeance)}</div></div>
    </div>
    ${dossier.description ? `<p style="color:var(--text-muted);font-size:0.88rem;margin-bottom:6px;">${escapeHtml(dossier.description)}</p>` : ''}

    <h3 class="section-title" style="margin-top:20px;">Suivi du dossier</h3>
    <div class="suivi-list" id="suiviList">
      ${suivis.length ? suivis.map((s) => `
        <div class="suivi-item">
          <div class="suivi-meta"><span>${escapeHtml(s.user_name || 'Utilisateur supprimé')}</span><span>${formatDateTime(s.created_at)}</span></div>
          <div class="suivi-note">${escapeHtml(s.note)}</div>
        </div>
      `).join('') : '<p style="color:var(--text-faint);font-size:0.85rem;">Aucune note de suivi pour ce dossier.</p>'}
    </div>
    ${canEdit ? `
      <div class="suivi-form">
        <textarea id="newSuiviNote" placeholder="Ajouter une note de suivi…"></textarea>
        <button class="btn btn-primary" id="addSuiviBtn">Ajouter</button>
      </div>
    ` : ''}
  `;

  const { overlay } = openModal({
    title: escapeHtml(dossier.titre),
    size: 'lg',
    bodyHtml,
    onMount: (el) => {
      const addBtn = el.querySelector('#addSuiviBtn');
      if (addBtn) {
        addBtn.addEventListener('click', async () => {
          const textarea = el.querySelector('#newSuiviNote');
          const note = textarea.value.trim();
          if (!note) return;
          addBtn.disabled = true;
          try {
            const { suivis: updated } = await api.post(`/api/dossiers/${id}/suivis`, { note });
            const list = el.querySelector('#suiviList');
            list.innerHTML = updated.map((s) => `
              <div class="suivi-item">
                <div class="suivi-meta"><span>${escapeHtml(s.user_name || 'Utilisateur supprimé')}</span><span>${formatDateTime(s.created_at)}</span></div>
                <div class="suivi-note">${escapeHtml(s.note)}</div>
              </div>
            `).join('');
            textarea.value = '';
            if (onChange) onChange();
          } catch (err) {
            toast(err.message, 'error');
          } finally {
            addBtn.disabled = false;
          }
        });
      }
    },
  });
}
