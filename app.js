'use strict';

/* ============================================================
   WorkSpace – Gestion des espaces de travail
   ============================================================ */

// ── Données : espaces de travail ────────────────────────────
const SPACES = [
  { id: 's1',  name: 'Bureau A101',       floor: 'RDC', type: 'Bureau individuel',   capacity: 1,  icon: '&#128188;', features: ['Écran externe', 'Wi-Fi', 'Prise USB'] },
  { id: 's2',  name: 'Bureau A102',       floor: 'RDC', type: 'Bureau individuel',   capacity: 1,  icon: '&#128188;', features: ['Wi-Fi', 'Fenêtre'] },
  { id: 's3',  name: 'Open Space B1',     floor: 'RDC', type: 'Espace open space',   capacity: 8,  icon: '&#128101;', features: ['Wi-Fi', 'Imprimante', 'Cafétéria proche'] },
  { id: 's4',  name: 'Salle Liberté',     floor: 'RDC', type: 'Salle de réunion',    capacity: 10, icon: '&#128202;', features: ['Vidéoprojecteur', 'Visio', 'Tableau blanc'] },
  { id: 's5',  name: 'Cabine Focus 1',    floor: '1',   type: 'Cabine téléphonique', capacity: 1,  icon: '&#128222;', features: ['Insonorisée', 'Wi-Fi'] },
  { id: 's6',  name: 'Cabine Focus 2',    floor: '1',   type: 'Cabine téléphonique', capacity: 1,  icon: '&#128222;', features: ['Insonorisée', 'Wi-Fi'] },
  { id: 's7',  name: 'Bureau C201',       floor: '1',   type: 'Bureau individuel',   capacity: 1,  icon: '&#128188;', features: ['Écran externe', 'Wi-Fi'] },
  { id: 's8',  name: 'Bureau C202',       floor: '1',   type: 'Bureau individuel',   capacity: 1,  icon: '&#128188;', features: ['Wi-Fi', 'Climatisation'] },
  { id: 's9',  name: 'Salle Innovation',  floor: '2',   type: 'Salle de réunion',    capacity: 6,  icon: '&#128202;', features: ['Écran interactif', 'Visio', 'Tableau blanc'] },
  { id: 's10', name: 'Salle Créativité',  floor: '2',   type: 'Salle de réunion',    capacity: 15, icon: '&#128202;', features: ['Vidéoprojecteur', 'Sono', 'Tableau blanc'] },
  { id: 's11', name: 'Open Space D2',     floor: '2',   type: 'Espace open space',   capacity: 12, icon: '&#128101;', features: ['Wi-Fi', 'Imprimante', 'Lounge'] },
  { id: 's12', name: 'Bureau E301',       floor: '3',   type: 'Bureau individuel',   capacity: 1,  icon: '&#128188;', features: ['Vue panoramique', 'Wi-Fi', 'Climatisation'] },
  { id: 's13', name: 'Bureau E302',       floor: '3',   type: 'Bureau individuel',   capacity: 1,  icon: '&#128188;', features: ['Wi-Fi', 'Écran externe'] },
  { id: 's14', name: 'Salle Direction',   floor: '3',   type: 'Salle de réunion',    capacity: 8,  icon: '&#128202;', features: ['Vidéoprojecteur', 'Visio HD', 'Climatisation'] },
];

// ── État de l'application ────────────────────────────────────
let reservations = loadReservations();
let pendingCancelId = null;
let currentView = 'grid';

// ── Formatage de date ─────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function isPast(dateStr) {
  return dateStr < todayStr();
}

// ── Persistance localStorage ─────────────────────────────────
function loadReservations() {
  try {
    return JSON.parse(localStorage.getItem('ws_reservations') || '[]');
  } catch {
    return [];
  }
}

function saveReservations() {
  localStorage.setItem('ws_reservations', JSON.stringify(reservations));
}

// ── Vérifier si un espace est occupé (pour une date+créneau) ─
function isOccupied(spaceId, date, slot, excludeId = null) {
  return reservations.some(r =>
    r.spaceId === spaceId &&
    r.date === date &&
    (r.slot === slot || r.slot === 'Journée complète (08h–17h)' || slot === 'Journée complète (08h–17h)') &&
    r.id !== excludeId
  );
}

// ── Calculer les stats pour la date filtrée ──────────────────
function computeStats(filterDate) {
  const date = filterDate || todayStr();
  const occupiedIds = new Set(
    reservations
      .filter(r => r.date === date)
      .map(r => r.spaceId)
  );
  const myCount = reservations.filter(r => !isPast(r.date)).length;

  document.getElementById('statTotal').textContent     = SPACES.length;
  document.getElementById('statAvailable').textContent = SPACES.length - occupiedIds.size;
  document.getElementById('statBooked').textContent    = occupiedIds.size;
  document.getElementById('statMine').textContent      = myCount;
}

// ── Rendre la grille des espaces ─────────────────────────────
function renderSpaces() {
  const grid      = document.getElementById('spacesGrid');
  const floor     = document.getElementById('filterFloor').value;
  const type      = document.getElementById('filterType').value;
  const dateVal   = document.getElementById('filterDate').value || todayStr();

  let filtered = SPACES.filter(s => {
    if (floor && s.floor !== floor) return false;
    if (type  && s.type  !== type)  return false;
    return true;
  });

  computeStats(dateVal);

  if (filtered.length === 0) {
    grid.innerHTML = '<p class="empty-state" style="grid-column:1/-1">Aucun espace ne correspond aux filtres sélectionnés.</p>';
    return;
  }

  grid.innerHTML = filtered.map(space => {
    const occupied  = isOccupied(space.id, dateVal, '');
    const statusCls = occupied ? 'status-occupied' : 'status-available';
    const badgeCls  = occupied ? 'badge-occupied'  : 'badge-available';
    const badgeTxt  = occupied ? 'Occupé'          : 'Disponible';
    const features  = space.features.map(f => `<span class="feature-tag">${f}</span>`).join('');
    const floorTxt  = space.floor === 'RDC' ? 'Rez-de-chaussée' : `${space.floor}er étage`;

    return `
      <div class="space-card ${statusCls}" data-id="${space.id}">
        <div class="space-card-header">
          <span class="space-icon">${space.icon}</span>
          <span class="space-badge ${badgeCls}">${badgeTxt}</span>
        </div>
        <div class="space-name">${space.name}</div>
        <div class="space-meta">
          <span>&#127970; ${floorTxt}</span>
          <span>&#128203; ${space.type}</span>
          <span>&#128101; Capacité : ${space.capacity} pers.</span>
        </div>
        <div class="space-features">${features}</div>
        <div class="space-card-footer">
          <button class="btn-book" data-space-id="${space.id}" ${occupied ? 'disabled' : ''}>
            ${occupied ? 'Non disponible' : 'Réserver'}
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Attacher les listeners sur les boutons
  grid.querySelectorAll('.btn-book:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => openBookingModal(btn.dataset.spaceId));
  });
}

// ── Rendre la liste des réservations ─────────────────────────
function renderReservations() {
  const list = document.getElementById('reservationsList');

  if (reservations.length === 0) {
    list.innerHTML = '<p class="empty-state">Aucune réservation pour le moment.</p>';
    return;
  }

  const sorted = [...reservations].sort((a, b) => a.date.localeCompare(b.date));

  list.innerHTML = sorted.map(r => {
    const space   = SPACES.find(s => s.id === r.spaceId);
    const past    = isPast(r.date);
    const pastCls = past ? 'past' : '';
    const floorTxt = space
      ? (space.floor === 'RDC' ? 'Rez-de-chaussée' : `${space.floor}er étage`)
      : '';

    return `
      <div class="reservation-card ${pastCls}" data-res-id="${r.id}">
        <div class="res-info">
          <div class="res-title">${space ? space.name : 'Espace inconnu'}</div>
          <div class="res-details">
            <span>&#128197; ${formatDate(r.date)}</span>
            <span>&#128336; ${r.slot}</span>
            ${space ? `<span>&#127970; ${floorTxt}</span>` : ''}
            <span>&#128101; ${r.userName}</span>
          </div>
          ${r.note ? `<div class="res-note">"${r.note}"</div>` : ''}
        </div>
        <div class="res-actions">
          ${!past ? `
            <button class="btn btn-ghost" data-action="edit" data-res-id="${r.id}">Modifier</button>
            <button class="btn btn-ghost-danger" data-action="cancel" data-res-id="${r.id}">Annuler</button>
          ` : '<span style="font-size:0.75rem;color:var(--text-light)">Passée</span>'}
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.resId));
  });

  list.querySelectorAll('[data-action="cancel"]').forEach(btn => {
    btn.addEventListener('click', () => openCancelModal(btn.dataset.resId));
  });
}

// ── Peupler le select des espaces (dans le modal) ────────────
function populateSpaceSelect(excludeOccupiedFor = null, excludeResId = null) {
  const sel   = document.getElementById('spaceSelect');
  const date  = document.getElementById('bookingDate').value;
  const slot  = document.getElementById('bookingSlot').value;

  sel.innerHTML = '<option value="">-- Sélectionner un espace --</option>';

  SPACES.forEach(space => {
    const busy = date && slot && isOccupied(space.id, date, slot, excludeResId);
    const opt  = document.createElement('option');
    opt.value      = space.id;
    opt.textContent = `${space.name} – ${space.type} (${space.floor === 'RDC' ? 'RDC' : space.floor + 'er'})${busy ? ' [Occupé]' : ''}`;
    opt.disabled   = busy;
    sel.appendChild(opt);
  });
}

// ── Ouvrir le modal pour une nouvelle réservation ────────────
function openBookingModal(preselectedSpaceId = null) {
  const editIdEl = document.getElementById('editId');
  editIdEl.value = '';

  document.getElementById('modalTitle').textContent     = 'Nouvelle réservation';
  document.getElementById('submitBookingBtn').textContent = 'Confirmer la réservation';

  const dateInput = document.getElementById('bookingDate');
  dateInput.min   = todayStr();
  dateInput.value = document.getElementById('filterDate').value || todayStr();

  document.getElementById('bookingSlot').value = '';
  document.getElementById('bookingNote').value = '';

  // Récupérer le nom depuis la dernière réservation si dispo
  const lastRes = reservations[reservations.length - 1];
  document.getElementById('userName').value = lastRes ? lastRes.userName : '';

  populateSpaceSelect();

  if (preselectedSpaceId) {
    document.getElementById('spaceSelect').value = preselectedSpaceId;
  }

  clearFormErrors();
  document.getElementById('bookingModal').classList.remove('hidden');
  document.getElementById('userName').focus();
}

// ── Ouvrir le modal en mode édition ──────────────────────────
function openEditModal(resId) {
  const res = reservations.find(r => r.id === resId);
  if (!res) return;

  document.getElementById('editId').value                = resId;
  document.getElementById('modalTitle').textContent      = 'Modifier la réservation';
  document.getElementById('submitBookingBtn').textContent = 'Enregistrer les modifications';

  document.getElementById('userName').value    = res.userName;
  document.getElementById('bookingDate').value = res.date;
  document.getElementById('bookingDate').min   = todayStr();
  document.getElementById('bookingSlot').value = res.slot;
  document.getElementById('bookingNote').value = res.note || '';

  populateSpaceSelect(null, resId);
  document.getElementById('spaceSelect').value = res.spaceId;

  clearFormErrors();
  document.getElementById('bookingModal').classList.remove('hidden');
}

// ── Ouvrir le modal de confirmation d'annulation ─────────────
function openCancelModal(resId) {
  const res   = reservations.find(r => r.id === resId);
  const space = SPACES.find(s => s.id === res?.spaceId);
  if (!res || !space) return;

  pendingCancelId = resId;
  document.getElementById('cancelInfo').textContent =
    `${space.name} – ${formatDate(res.date)} (${res.slot})`;
  document.getElementById('cancelModal').classList.remove('hidden');
}

// ── Fermer les modals ─────────────────────────────────────────
function closeBookingModal() {
  document.getElementById('bookingModal').classList.add('hidden');
}

function closeCancelModal() {
  document.getElementById('cancelModal').classList.add('hidden');
  pendingCancelId = null;
}

// ── Validation du formulaire de réservation ──────────────────
function clearFormErrors() {
  ['userName', 'bookingDate', 'bookingSlot', 'spaceSelect'].forEach(id => {
    const el = document.getElementById(id);
    const err = document.getElementById(`err-${id}`);
    if (el)  el.classList.remove('is-invalid');
    if (err) err.textContent = '';
  });
}

function validateBookingForm() {
  let valid = true;
  const fields = [
    { id: 'userName',    label: 'Le nom est obligatoire.' },
    { id: 'bookingDate', label: 'La date est obligatoire.' },
    { id: 'bookingSlot', label: 'Le créneau est obligatoire.' },
    { id: 'spaceSelect', label: "Veuillez sélectionner un espace." },
  ];

  fields.forEach(({ id, label }) => {
    const el  = document.getElementById(id);
    const err = document.getElementById(`err-${id}`);
    if (!el.value.trim()) {
      el.classList.add('is-invalid');
      if (err) err.textContent = label;
      valid = false;
    } else {
      el.classList.remove('is-invalid');
      if (err) err.textContent = '';
    }
  });

  // Vérifier conflit
  if (valid) {
    const spaceId = document.getElementById('spaceSelect').value;
    const date    = document.getElementById('bookingDate').value;
    const slot    = document.getElementById('bookingSlot').value;
    const editId  = document.getElementById('editId').value;

    if (isOccupied(spaceId, date, slot, editId || null)) {
      const err = document.getElementById('err-spaceSelect');
      const el  = document.getElementById('spaceSelect');
      el.classList.add('is-invalid');
      if (err) err.textContent = 'Cet espace est déjà réservé pour ce créneau.';
      valid = false;
    }
  }

  return valid;
}

// ── Toast notification ────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ── Générer un ID unique ──────────────────────────────────────
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Soumettre le formulaire ───────────────────────────────────
document.getElementById('bookingForm').addEventListener('submit', e => {
  e.preventDefault();
  if (!validateBookingForm()) return;

  const editId  = document.getElementById('editId').value;
  const spaceId = document.getElementById('spaceSelect').value;
  const date    = document.getElementById('bookingDate').value;
  const slot    = document.getElementById('bookingSlot').value;
  const name    = document.getElementById('userName').value.trim();
  const note    = document.getElementById('bookingNote').value.trim();
  const space   = SPACES.find(s => s.id === spaceId);

  if (editId) {
    // Modification
    const idx = reservations.findIndex(r => r.id === editId);
    if (idx !== -1) {
      reservations[idx] = { ...reservations[idx], spaceId, date, slot, userName: name, note };
      showToast(`Réservation modifiée : ${space?.name}`);
    }
  } else {
    // Nouvelle réservation
    reservations.push({ id: genId(), spaceId, date, slot, userName: name, note });
    showToast(`Réservation confirmée : ${space?.name}`);
  }

  saveReservations();
  closeBookingModal();
  renderSpaces();
  renderReservations();
});

// ── Confirmer l'annulation ────────────────────────────────────
document.getElementById('confirmCancelBtn').addEventListener('click', () => {
  if (!pendingCancelId) return;
  const res   = reservations.find(r => r.id === pendingCancelId);
  const space = SPACES.find(s => s.id === res?.spaceId);

  reservations = reservations.filter(r => r.id !== pendingCancelId);
  saveReservations();
  closeCancelModal();
  renderSpaces();
  renderReservations();
  showToast(`Réservation annulée : ${space?.name ?? ''}`, 'warning');
});

// ── Listeners UI ──────────────────────────────────────────────
document.getElementById('openBookingBtn').addEventListener('click', () => openBookingModal());
document.getElementById('closeModal').addEventListener('click', closeBookingModal);
document.getElementById('cancelModalBtn').addEventListener('click', closeBookingModal);
document.getElementById('closeCancelModal').addEventListener('click', closeCancelModal);
document.getElementById('keepReservationBtn').addEventListener('click', closeCancelModal);

// Fermer les modals en cliquant sur l'overlay
['bookingModal', 'cancelModal'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target.id === id) {
      id === 'bookingModal' ? closeBookingModal() : closeCancelModal();
    }
  });
});

// Filtres
['filterFloor', 'filterType', 'filterDate'].forEach(id => {
  document.getElementById(id).addEventListener('change', renderSpaces);
});

// Repeupler le select quand la date ou le créneau change dans le modal
['bookingDate', 'bookingSlot'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    const editId = document.getElementById('editId').value;
    populateSpaceSelect(null, editId || null);
  });
});

// Basculer vue grille / liste
document.getElementById('viewGrid').addEventListener('click', () => {
  currentView = 'grid';
  document.getElementById('spacesGrid').classList.remove('list-view');
  document.getElementById('viewGrid').classList.add('active');
  document.getElementById('viewList').classList.remove('active');
});

document.getElementById('viewList').addEventListener('click', () => {
  currentView = 'list';
  document.getElementById('spacesGrid').classList.add('list-view');
  document.getElementById('viewList').classList.add('active');
  document.getElementById('viewGrid').classList.remove('active');
});

// ── Init ──────────────────────────────────────────────────────
document.getElementById('filterDate').value = todayStr();
renderSpaces();
renderReservations();
