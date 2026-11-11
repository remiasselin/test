import {
  state, api, html, field, money, fmtDate, fmtDateShort, fmtDateTime, schedule, ageOn, catLabel, forms, live, actions,
  toast, go, statusBadge, payBadge, regBadge, attrs, ApiError,
} from './core.js';

const seasonOptions = (seasons, withAll = false) => [...(withAll ? [['', 'Toutes les sessions']] : []), ...seasons.map((s) => [s.id, s.name])];
const dollars = (cents) => (cents == null ? '' : (cents / 100).toFixed(2));

export const adminTabs = (current) => html`<nav class="row no-print admin-tabs" aria-label="Administration">
  ${[['#/admin', 'Tableau de bord'], ['#/admin/activites', 'Activités'], ['#/admin/sessions', 'Sessions'], ['#/admin/usagers', 'Usagers']]
    .map(([h, l]) => html`<a class="btn ${h === current ? '' : 'secondary'} small" href="${h}">${l}</a>`)}</nav>`;

/* ================= Tableau de bord ================= */
let dashSeason = '';
live.dash = (d) => { dashSeason = d.season_id; go('#/admin'); };

export async function viewAdminDash() {
  const seasons = await api('GET', '/api/seasons');
  const dash = await api('GET', '/api/admin/dashboard' + (dashSeason ? `?season_id=${dashSeason}` : ''));
  const t = dash.registrations; const m = dash.money;
  const tile = (n, l) => html`<div class="card stat"><div class="num">${n}</div><div class="lbl">${l}</div></div>`;
  const max = Math.max(1, ...dash.by_category.map((c) => c.confirmed));
  return html`
    <div class="page-head"><div><h1>Tableau de bord</h1><p class="muted">Vue d’ensemble des inscriptions.</p></div>
      <form data-form="dash" data-live class="no-print">${field('Session', 'season_id', { type: 'select', value: dash.season_id, options: seasonOptions(seasons) })}</form></div>
    ${adminTabs('#/admin')}
    <div class="grid cols-4 mt">
      ${tile(t.confirmed, 'Inscriptions confirmées')}${tile(t.waitlist, 'En liste d’attente')}
      ${tile(money(m.net), 'Revenus nets perçus')}${tile(money(m.outstanding), 'Montants à percevoir')}
      ${tile(dash.counts.published_activities, 'Activités publiées')}${tile(dash.counts.citizens, 'Comptes citoyens')}
      ${tile(dash.counts.members, 'Participants')}${tile(money(m.refunded), 'Remboursements')}
    </div>
    <div class="two-col mt">
      <section class="card"><h2>Taux de remplissage</h2>
        ${dash.activities.length ? html`<div class="table-wrap"><table><thead><tr><th>Activité</th><th>Inscrits</th><th></th><th>Attente</th></tr></thead><tbody>
          ${dash.activities.map((a) => html`<tr><td><a href="#/admin/activites/${a.id}/participants">${a.title}</a></td><td class="no-wrap">${a.confirmed} / ${a.capacity}</td>
            <td class="minw"><progress max="${a.capacity}" value="${a.confirmed}" aria-label="Remplissage de ${a.title}"></progress></td><td>${a.waitlist || '—'}</td></tr>`)}
        </tbody></table></div>` : html`<p class="muted">Aucune activité publiée pour cette session.</p>`}
      </section>
      <section class="card"><h2>Inscriptions par catégorie</h2>
        ${dash.by_category.length ? dash.by_category.map((c) => html`<div class="mb"><div class="row spread"><span>${catLabel(c.category)}</span><strong>${c.confirmed}</strong></div><progress max="${max}" value="${c.confirmed}" aria-label="${catLabel(c.category)}"></progress></div>`) : html`<p class="muted">Aucune donnée.</p>`}
      </section>
    </div>`;
}

/* ================= Activités ================= */
const aFilters = { season_id: '', status: '', q: '' };
live.afilters = (d) => { Object.assign(aFilters, d); go('#/admin/activites'); };

const statusLabel = { draft: html`<span class="badge grey">Brouillon</span>`, published: html`<span class="badge ok">Publiée</span>`, cancelled: html`<span class="badge bad">Annulée</span>` };

export async function viewAdminActivities() {
  const seasons = await api('GET', '/api/seasons');
  const p = new URLSearchParams(Object.entries(aFilters).filter(([, v]) => v));
  const list = await api('GET', '/api/admin/activities?' + p);
  return html`
    <div class="page-head"><div><h1>Activités</h1></div><a class="btn" href="#/admin/activites/nouvelle">+ Nouvelle activité</a></div>
    ${adminTabs('#/admin/activites')}
    <form class="card filters mt" data-form="afilters" data-live>
      ${field('Session', 'season_id', { type: 'select', value: aFilters.season_id, options: seasonOptions(seasons, true) })}
      ${field('Statut', 'status', { type: 'select', value: aFilters.status, options: [['', 'Tous'], ['draft', 'Brouillon'], ['published', 'Publiée'], ['cancelled', 'Annulée']] })}
      ${field('Recherche', 'q', { type: 'search', value: aFilters.q })}
    </form>
    <div class="card mt"><div class="table-wrap"><table>
      <thead><tr><th>Activité</th><th>Horaire</th><th>Session</th><th>Inscrits</th><th>Attente</th><th>Statut</th><th></th></tr></thead>
      <tbody>${list.length ? list.map((a) => html`<tr>
        <td><strong>${a.title}</strong><div class="muted small">${catLabel(a.category)} · ${a.location}</div></td>
        <td class="no-wrap">${schedule(a)}</td><td class="small">${a.season_name}</td>
        <td class="no-wrap">${a.confirmed_count} / ${a.capacity}</td><td>${a.waitlist_count || '—'}</td><td>${statusLabel[a.status]}</td>
        <td class="right no-wrap"><a class="btn secondary small" href="#/admin/activites/${a.id}/participants">Participants</a>
          <a class="btn secondary small" href="#/admin/activites/${a.id}">Modifier</a></td></tr>`) : html`<tr><td colspan="7" class="empty">Aucune activité.</td></tr>`}</tbody>
    </table></div></div>`;
}

export async function viewAdminActivityForm(id) {
  const seasons = await api('GET', '/api/seasons');
  const a = id ? await api('GET', `/api/admin/activities/${id}`) : null;
  const locked = a && a.status === 'cancelled';
  const v = (k, d = '') => (a ? a[k] ?? '' : d);
  return html`
    <p class="no-print"><a href="#/admin/activites">← Activités</a></p>
    <div class="page-head"><h1>${a ? 'Modifier l’activité' : 'Nouvelle activité'}</h1>${a ? statusLabel[a.status] : ''}</div>
    ${locked ? html`<div class="alert error">Cette activité est annulée : elle n’est plus modifiable.</div>` : ''}
    <form class="card" data-form="activity" novalidate>
      <input type="hidden" name="id" value="${a?.id || ''}">
      <fieldset ${attrs({ disabled: locked })}><legend>Description</legend>
        ${field('Titre', 'title', { required: true, value: v('title'), at: { maxlength: 120 } })}
        ${field('Description', 'description', { type: 'textarea', value: v('description'), at: { maxlength: 2000 } })}
        <div class="form-grid">
          ${field('Catégorie', 'category', { type: 'select', required: true, value: v('category', 'sport'), options: Object.entries(state.meta.categories) })}
          ${field('Lieu', 'location', { required: true, value: v('location') })}
          ${field('Animateur', 'instructor', { value: v('instructor') })}
          ${field('Session', 'season_id', { type: 'select', required: true, value: v('season_id'), options: seasonOptions(seasons) })}
        </div></fieldset>
      <fieldset ${attrs({ disabled: locked })}><legend>Horaire</legend><div class="form-grid">
        ${field('Jour', 'weekday', { type: 'select', required: true, value: v('weekday', 1), options: Object.entries(state.meta.weekdays) })}
        ${field('Début', 'start_time', { type: 'time', required: true, value: v('start_time', '18:00') })}
        ${field('Fin', 'end_time', { type: 'time', required: true, value: v('end_time', '19:00') })}
        ${field('Première séance', 'start_date', { type: 'date', required: true, value: v('start_date') })}
        ${field('Dernière séance', 'end_date', { type: 'date', required: true, value: v('end_date') })}</div></fieldset>
      <fieldset ${attrs({ disabled: locked })}><legend>Admissibilité, capacité et tarifs</legend><div class="form-grid">
        ${field('Âge minimum', 'age_min', { type: 'number', value: v('age_min'), at: { min: 0, max: 120 } })}
        ${field('Âge maximum', 'age_max', { type: 'number', value: v('age_max'), at: { min: 0, max: 120 } })}
        ${field('Capacité', 'capacity', { type: 'number', required: true, value: v('capacity', 15), at: { min: 1, max: 1000 } })}
        ${field('Tarif résident ($)', 'price_resident', { type: 'number', required: true, value: a ? dollars(a.price_resident) : '', at: { min: 0, step: '0.01' } })}
        ${field('Tarif non-résident ($)', 'price_nonresident', { type: 'number', required: true, value: a ? dollars(a.price_nonresident) : '', at: { min: 0, step: '0.01' } })}
        ${field('Publication', 'status', { type: 'select', value: a && a.status !== 'cancelled' ? a.status : 'draft', options: [['draft', 'Brouillon (non visible)'], ['published', 'Publiée']] })}</div></fieldset>
      <div class="form-error"></div>
      <div class="row">
        ${locked ? '' : html`<button class="btn" type="submit">Enregistrer</button>`}
        ${a && !locked ? html`<button type="button" class="btn danger" data-act="cancel-activity" data-id="${a.id}" data-count="${a.confirmed_count + a.waitlist_count}">Annuler l’activité</button>` : ''}
        ${a && state.user.role === 'admin' ? html`<button type="button" class="btn danger" data-act="delete-activity" data-id="${a.id}">Supprimer</button>` : ''}
      </div>
    </form>`;
}

const intOrNull = (s) => (s === '' || s == null ? null : Number(s));
const toCents = (s) => (s === '' ? null : Math.round(Number(s) * 100));
forms.activity = async (d) => {
  const body = {
    season_id: intOrNull(d.season_id), title: d.title, description: d.description, category: d.category, location: d.location,
    instructor: d.instructor, age_min: intOrNull(d.age_min), age_max: intOrNull(d.age_max), capacity: intOrNull(d.capacity),
    price_resident: toCents(d.price_resident), price_nonresident: toCents(d.price_nonresident), weekday: intOrNull(d.weekday),
    start_time: d.start_time, end_time: d.end_time, start_date: d.start_date, end_date: d.end_date, status: d.status,
  };
  if (d.id) await api('PUT', `/api/admin/activities/${d.id}`, body); else await api('POST', '/api/admin/activities', body);
  toast('Activité enregistrée.', 'ok'); go('#/admin/activites');
};
actions['cancel-activity'] = async (el) => {
  const n = Number(el.dataset.count);
  if (!window.confirm(`Annuler cette activité ?${n ? ` ${n} inscription(s) seront annulées et remboursées automatiquement, et les familles seront avisées.` : ''} Cette action est irréversible.`)) return;
  await api('POST', `/api/admin/activities/${el.dataset.id}/cancel`, {});
  toast('Activité annulée.', 'ok'); go('#/admin/activites');
};
actions['delete-activity'] = async (el) => {
  if (!window.confirm('Supprimer définitivement cette activité ?')) return;
  await api('DELETE', `/api/admin/activities/${el.dataset.id}`);
  toast('Activité supprimée.'); go('#/admin/activites');
};

/* ================= Participants d'une activité ================= */
let rosterSearch = '';
export async function viewAdminRoster(id) {
  const { activity: a, registrations: regs } = await api('GET', `/api/admin/activities/${id}/roster`);
  const confirmed = regs.filter((r) => r.status === 'confirmed');
  const wait = regs.filter((r) => r.status === 'waitlist');
  const row = (r) => html`<tr>
    <td>${statusBadge(r.status)}</td>
    <td><strong>${r.first_name} ${r.last_name}</strong><div class="muted small">${ageOn(r.birth_date, state.meta.today)} ans${r.resident ? '' : ' · non-résident'}</div>
      ${r.health_notes ? html`<div class="small">⚠ ${r.health_notes}</div>` : ''}</td>
    <td>${r.parent_first_name} ${r.parent_last_name}<div class="small muted">${r.phone || ''} ${r.email}</div></td>
    <td>${r.status === 'confirmed' ? payBadge(r.payment_status) : ''}<div class="small muted">${money(r.price_cents)}</div></td>
    <td class="right no-print no-wrap">
      ${r.status === 'waitlist' ? html`<button class="btn small" data-act="promote" data-id="${r.id}">Confirmer</button>` : ''}
      ${r.status === 'confirmed' && r.payment_status === 'unpaid' ? html`<button class="btn success small" data-act="mark-paid" data-id="${r.id}">Payé au comptoir</button>` : ''}
      <button class="btn danger small" data-act="admin-cancel" data-id="${r.id}">Annuler</button></td></tr>`;
  const table = (list, title) => html`<h2>${title} (${list.length})</h2>${list.length ? html`<div class="table-wrap"><table>
    <thead><tr><th>Statut</th><th>Participant</th><th>Responsable</th><th>Paiement</th><th class="no-print"></th></tr></thead><tbody>${list.map(row)}</tbody></table></div>` : html`<p class="muted">Aucun.</p>`}`;
  return html`
    <p class="no-print"><a href="#/admin/activites">← Activités</a></p>
    <div class="page-head"><div><h1>${a.title}</h1><p class="muted">${schedule(a)} · ${a.location} · du ${fmtDateShort(a.start_date)} au ${fmtDateShort(a.end_date)} · ${a.confirmed_count}/${a.capacity} inscrits</p></div>
      <div class="row no-print"><a class="btn secondary" href="/api/admin/activities/${a.id}/roster?format=csv" download>Exporter (CSV)</a>
        <button class="btn secondary" type="button" data-act="print">Imprimer</button></div></div>
    <section class="card">${table(confirmed, 'Inscrits')}</section>
    ${wait.length ? html`<section class="card">${table(wait, 'Liste d’attente')}</section>` : ''}
    ${a.status === 'published' ? html`<section class="card no-print"><h2>Inscrire un participant (comptoir)</h2>
      <p class="small muted">Le personnel peut inscrire en dehors de la période d’inscription. Les règles d’âge, de capacité et d’horaire s’appliquent.</p>
      <form data-form="roster-search" data-live data-activity="${a.id}">${field('Rechercher un participant (nom ou courriel)', 'q', { type: 'search', value: rosterSearch })}</form>
      <div id="roster-results" data-activity="${a.id}"></div></section>` : ''}`;
}
live['roster-search'] = async (d, form) => {
  rosterSearch = d.q;
  const box = document.getElementById('roster-results');
  if (d.q.length < 2) { box.innerHTML = ''; return; }
  try {
    const found = await api('GET', '/api/admin/members?q=' + encodeURIComponent(d.q));
    box.innerHTML = found.length ? html`<ul class="notes">${found.map((m) => html`<li class="row spread"><span>${m.first_name} ${m.last_name} <span class="muted small">(${ageOn(m.birth_date, state.meta.today)} ans) — ${m.email}</span></span>
      <button class="btn small" data-act="admin-register" data-member="${m.id}" data-activity="${form.dataset.activity}">Inscrire</button></li>`)}</ul>`.s : html`<p class="muted">Aucun résultat.</p>`.s;
  } catch (e) { box.textContent = e.message; }
};
actions['admin-register'] = async (el) => {
  await api('POST', '/api/admin/registrations', { activity_id: Number(el.dataset.activity), member_id: Number(el.dataset.member) });
  toast('Participant inscrit.', 'ok'); go(location.hash);
};
actions.promote = async (el) => { await api('POST', `/api/admin/registrations/${el.dataset.id}/promote`, {}); toast('Inscription confirmée.', 'ok'); go(location.hash); };
actions['mark-paid'] = async (el) => { await api('POST', `/api/admin/registrations/${el.dataset.id}/pay`, { method: 'comptoir' }); toast('Paiement enregistré.', 'ok'); go(location.hash); };
actions['admin-cancel'] = async (el) => {
  if (!window.confirm('Annuler cette inscription ? Si elle est payée, elle sera remboursée selon la politique en vigueur.')) return;
  const r = await api('DELETE', `/api/admin/registrations/${el.dataset.id}`);
  toast(r.promoted?.length ? 'Inscription annulée — une personne en attente a été confirmée.' : 'Inscription annulée.', 'ok'); go(location.hash);
};
actions.print = () => window.print();

/* ================= Sessions ================= */
export async function viewAdminSeasons() {
  const seasons = await api('GET', '/api/seasons');
  const sf = (s) => html`<form data-form="season" novalidate><input type="hidden" name="id" value="${s?.id || ''}">
    ${field('Nom', 'name', { required: true, value: s?.name })}
    <div class="form-grid">
      ${field('Début de session', 'start_date', { type: 'date', required: true, value: s?.start_date })}
      ${field('Fin de session', 'end_date', { type: 'date', required: true, value: s?.end_date })}
      ${field('Ouverture des inscriptions', 'registration_open', { type: 'date', required: true, value: s?.registration_open })}
      ${field('Fermeture des inscriptions', 'registration_close', { type: 'date', required: true, value: s?.registration_close })}</div>
    <div class="form-error"></div><button class="btn" type="submit">${s ? 'Enregistrer' : 'Créer la session'}</button></form>`;
  return html`<div class="page-head"><h1>Sessions</h1></div>${adminTabs('#/admin/sessions')}
    <div class="stack mt">
    ${seasons.map((s) => html`<details class="card"><summary><strong>${s.name}</strong> <span class="muted small">· ${fmtDateShort(s.start_date)} → ${fmtDateShort(s.end_date)} · inscriptions ${fmtDateShort(s.registration_open)} → ${fmtDateShort(s.registration_close)}</span></summary><div class="mt">${sf(s)}</div></details>`)}
    <details class="card"><summary><strong>+ Nouvelle session</strong></summary><div class="mt">${sf(null)}</div></details></div>`;
}
forms.season = async (d) => {
  const { id, ...body } = d;
  if (id) await api('PUT', `/api/admin/seasons/${id}`, body); else await api('POST', '/api/admin/seasons', body);
  toast('Session enregistrée.', 'ok'); go('#/admin/sessions');
};

/* ================= Usagers ================= */
let userQuery = '';
live.usearch = (d) => { userQuery = d.q; loadUsers(); };
async function loadUsers() {
  const box = document.getElementById('users-table');
  if (!box) return;
  const users = await api('GET', '/api/admin/users?q=' + encodeURIComponent(userQuery));
  const admin = state.user.role === 'admin';
  box.innerHTML = html`<div class="table-wrap"><table><thead><tr><th>Nom</th><th>Courriel</th><th>Ville</th><th>Inscriptions</th><th>Résident</th><th>Rôle</th><th></th></tr></thead><tbody>
    ${users.map((u) => html`<tr><td>${u.first_name} ${u.last_name}</td><td class="small">${u.email}</td><td>${u.city || ''}</td><td>${u.registrations}</td>
      <td><input type="checkbox" name="resident" form="uf-${u.id}" ${attrs({ checked: !!u.resident })} aria-label="Résident : ${u.first_name} ${u.last_name}"></td>
      <td><select name="role" form="uf-${u.id}" ${attrs({ disabled: !admin || u.id === state.user.id })} aria-label="Rôle : ${u.first_name} ${u.last_name}">
        ${[['citizen', 'Citoyen'], ['staff', 'Personnel'], ['admin', 'Administrateur']].map(([v, l]) => html`<option value="${v}" ${attrs({ selected: u.role === v })}>${l}</option>`)}</select></td>
      <td><button class="btn small secondary" type="submit" form="uf-${u.id}">Enregistrer</button></td></tr>`)}
    </tbody></table></div>${users.map((u) => html`<form id="uf-${u.id}" data-form="user-admin" data-id="${u.id}" data-role="${u.role}"></form>`)}`.s;
}
export function viewAdminUsers() {
  return {
    html: html`<div class="page-head"><h1>Usagers</h1></div>${adminTabs('#/admin/usagers')}
      <div class="card mt"><form data-form="usearch" data-live>${field('Rechercher (nom ou courriel)', 'q', { type: 'search', value: userQuery })}</form>
      <p class="small muted">Le tarif résident est déterminé par la ville déclarée. Le personnel peut le corriger après vérification d’une preuve de résidence.</p>
      <div id="users-table"></div></div>`,
    after: loadUsers,
  };
}
forms['user-admin'] = async (d, form) => {
  const role = d.role ?? form.dataset.role;
  await api('PUT', `/api/admin/users/${form.dataset.id}`, { resident: !!d.resident, role });
  toast('Usager mis à jour.', 'ok'); await loadUsers();
};
