'use strict';

import { api } from '../api.js';
import { toast, openModal, confirmDialog } from '../ui.js';
import { ENTREPRISE_STATUT_LABELS, STATUT_LABELS, badge, escapeHtml } from '../constants.js';

let meta = null;
let filters = { secteur: '', statut: '', q: '' };

export async function renderEntreprises(content, state) {
  const canEdit = state.user.role === 'admin' || state.user.role === 'gestionnaire';
  const canDelete = state.user.role === 'admin';

  if (!meta) meta = await api.get('/api/entreprises/meta');

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Entreprises</h1>
        <p>Répertoire des entreprises et prospects accompagnés par le service.</p>
      </div>
      <div class="page-actions">
        ${canEdit ? '<button class="btn btn-primary" id="newEntrepriseBtn">+ Nouvelle entreprise</button>' : ''}
      </div>
    </div>

    <div class="toolbar">
      <input type="search" id="fQ" class="search-input" placeholder="Rechercher une entreprise…" value="${escapeHtml(filters.q)}" />
      <select id="fSecteur"><option value="">Tous les secteurs</option>${meta.secteurs.map((s) => `<option value="${escapeHtml(s)}" ${filters.secteur === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}</select>
      <select id="fStatut"><option value="">Tous les statuts</option>${Object.entries(ENTREPRISE_STATUT_LABELS).map(([v, l]) => `<option value="${v}" ${filters.statut === v ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select>
    </div>

    <div id="entrepriseTableHost"></div>
  `;

  document.getElementById('fQ').addEventListener('input', debounce((e) => { filters.q = e.target.value; loadTable(content, state); }, 300));
  document.getElementById('fSecteur').addEventListener('change', (e) => { filters.secteur = e.target.value; loadTable(content, state); });
  document.getElementById('fStatut').addEventListener('change', (e) => { filters.statut = e.target.value; loadTable(content, state); });

  if (canEdit) {
    document.getElementById('newEntrepriseBtn').addEventListener('click', () => openEntrepriseForm(null, state, () => loadTable(content, state)));
  }

  await loadTable(content, state);
}

async function loadTable(content, state) {
  const host = document.getElementById('entrepriseTableHost');
  host.innerHTML = '<div class="loading-block"><div class="spinner"></div></div>';

  const { entreprises } = await api.get('/api/entreprises', filters);
  const canEdit = state.user.role === 'admin' || state.user.role === 'gestionnaire';
  const canDelete = state.user.role === 'admin';

  if (!entreprises.length) {
    host.innerHTML = '<div class="empty-state"><div class="empty-icon">▣</div><p>Aucune entreprise ne correspond aux critères.</p></div>';
    return;
  }

  host.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>Nom</th><th>Secteur</th><th>Statut</th><th>Employés</th><th>Dossiers</th><th>Contact</th><th></th></tr>
        </thead>
        <tbody>
          ${entreprises.map((e) => `
            <tr data-id="${e.id}">
              <td class="cell-strong">${escapeHtml(e.nom)}</td>
              <td class="cell-muted">${escapeHtml(e.secteur)}</td>
              <td>${badge(e.statut, ENTREPRISE_STATUT_LABELS)}</td>
              <td class="cell-muted">${e.nb_employes ?? '—'}</td>
              <td class="cell-muted">${e.nb_dossiers}</td>
              <td class="cell-muted">${escapeHtml(e.courriel || e.telephone || '—')}</td>
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
    const entreprise = entreprises.find((e) => String(e.id) === id);
    tr.querySelector('[data-action="view"]').addEventListener('click', () => openEntrepriseDetail(entreprise.id));
    const editBtn = tr.querySelector('[data-action="edit"]');
    if (editBtn) editBtn.addEventListener('click', () => openEntrepriseForm(entreprise, state, () => loadTable(content, state)));
    const delBtn = tr.querySelector('[data-action="delete"]');
    if (delBtn) delBtn.addEventListener('click', () => deleteEntreprise(entreprise, content, state));
  });
}

async function deleteEntreprise(entreprise, content, state) {
  const ok = await confirmDialog(`Supprimer l'entreprise <strong>${escapeHtml(entreprise.nom)}</strong> ? Les dossiers associés seront conservés mais dissociés.`);
  if (!ok) return;
  try {
    await api.del(`/api/entreprises/${entreprise.id}`);
    toast('Entreprise supprimée.', 'success');
    loadTable(content, state);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

function openEntrepriseForm(entreprise, state, onSaved) {
  const isEdit = !!entreprise;

  const bodyHtml = `
    <form id="entForm" class="form-grid">
      <div class="field full">
        <label for="eNom">Nom de l'entreprise *</label>
        <input type="text" id="eNom" value="${escapeHtml(entreprise?.nom || '')}" required />
      </div>
      <div class="field">
        <label for="eSecteur">Secteur d'activité *</label>
        <select id="eSecteur" required>
          ${meta.secteurs.map((s) => `<option value="${escapeHtml(s)}" ${entreprise?.secteur === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="eStatut">Statut</label>
        <select id="eStatut">${Object.entries(ENTREPRISE_STATUT_LABELS).map(([v, l]) => `<option value="${v}" ${(entreprise?.statut || 'actif') === v ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select>
      </div>
      <div class="field full">
        <label for="eAdresse">Adresse</label>
        <input type="text" id="eAdresse" value="${escapeHtml(entreprise?.adresse || '')}" />
      </div>
      <div class="field">
        <label for="eTelephone">Téléphone</label>
        <input type="tel" id="eTelephone" value="${escapeHtml(entreprise?.telephone || '')}" />
      </div>
      <div class="field">
        <label for="eCourriel">Courriel</label>
        <input type="email" id="eCourriel" value="${escapeHtml(entreprise?.courriel || '')}" />
      </div>
      <div class="field">
        <label for="eSiteWeb">Site web</label>
        <input type="url" id="eSiteWeb" value="${escapeHtml(entreprise?.site_web || '')}" placeholder="https://" />
      </div>
      <div class="field">
        <label for="eNbEmployes">Nombre d'employés</label>
        <input type="number" id="eNbEmployes" min="0" value="${entreprise?.nb_employes ?? ''}" />
      </div>
      <div class="field full">
        <label for="eNotes">Notes</label>
        <textarea id="eNotes">${escapeHtml(entreprise?.notes || '')}</textarea>
      </div>
    </form>
  `;

  const { close } = openModal({
    title: isEdit ? `Modifier ${entreprise.nom}` : 'Nouvelle entreprise',
    size: 'lg',
    bodyHtml,
    onMount: (el) => {
      const modalBody = el.querySelector('.modal-body');
      const footer = document.createElement('div');
      footer.className = 'modal-footer';
      footer.innerHTML = `
        <button class="btn btn-secondary" id="cancelBtn">Annuler</button>
        <button class="btn btn-primary" id="saveBtn">${isEdit ? 'Enregistrer' : 'Créer l\'entreprise'}</button>
      `;
      modalBody.after(footer);

      el.querySelector('#cancelBtn').addEventListener('click', () => close());
      el.querySelector('#saveBtn').addEventListener('click', async () => {
        const payload = {
          nom: el.querySelector('#eNom').value.trim(),
          secteur: el.querySelector('#eSecteur').value,
          statut: el.querySelector('#eStatut').value,
          adresse: el.querySelector('#eAdresse').value.trim(),
          telephone: el.querySelector('#eTelephone').value.trim(),
          courriel: el.querySelector('#eCourriel').value.trim(),
          site_web: el.querySelector('#eSiteWeb').value.trim(),
          nb_employes: el.querySelector('#eNbEmployes').value || null,
          notes: el.querySelector('#eNotes').value.trim(),
        };

        const saveBtn = el.querySelector('#saveBtn');
        saveBtn.disabled = true;
        try {
          if (isEdit) {
            await api.put(`/api/entreprises/${entreprise.id}`, payload);
            toast('Entreprise mise à jour.', 'success');
          } else {
            await api.post('/api/entreprises', payload);
            toast('Entreprise créée.', 'success');
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

async function openEntrepriseDetail(id) {
  const { entreprise, dossiers } = await api.get(`/api/entreprises/${id}`);

  const bodyHtml = `
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Secteur</div><div class="detail-value">${escapeHtml(entreprise.secteur)}</div></div>
      <div class="detail-item"><div class="detail-label">Statut</div><div class="detail-value">${badge(entreprise.statut, ENTREPRISE_STATUT_LABELS)}</div></div>
      <div class="detail-item"><div class="detail-label">Employés</div><div class="detail-value">${entreprise.nb_employes ?? '—'}</div></div>
      <div class="detail-item"><div class="detail-label">Téléphone</div><div class="detail-value">${escapeHtml(entreprise.telephone || '—')}</div></div>
      <div class="detail-item"><div class="detail-label">Courriel</div><div class="detail-value">${escapeHtml(entreprise.courriel || '—')}</div></div>
      <div class="detail-item"><div class="detail-label">Adresse</div><div class="detail-value">${escapeHtml(entreprise.adresse || '—')}</div></div>
    </div>
    ${entreprise.notes ? `<p style="color:var(--text-muted);font-size:0.88rem;">${escapeHtml(entreprise.notes)}</p>` : ''}

    <h3 class="section-title" style="margin-top:20px;">Dossiers associés (${dossiers.length})</h3>
    ${dossiers.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Numéro</th><th>Titre</th><th>Type</th><th>Statut</th></tr></thead>
          <tbody>
            ${dossiers.map((d) => `<tr><td class="cell-strong">${d.numero}</td><td>${escapeHtml(d.titre)}</td><td class="cell-muted">${escapeHtml(d.type)}</td><td>${badge(d.statut, STATUT_LABELS)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    ` : '<p style="color:var(--text-faint);font-size:0.85rem;">Aucun dossier associé pour le moment.</p>'}
  `;

  openModal({ title: escapeHtml(entreprise.nom), size: 'lg', bodyHtml });
}
