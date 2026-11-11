import {
  state, api, html, raw, field, money, fmtDate, fmtDateShort, fmtDateTime, schedule, ageRange, ageOn, addDays, catLabel, userPrice,
  forms, live, actions, toast, go, refreshMe, regBadge, statusBadge, payBadge, formData, dayName, attrs,
} from './core.js';

/* ================= Catalogue ================= */
const filters = { season_id: '', category: '', q: '', age: '', weekday: '', available: false };

function activityCard(a) {
  return html`<article class="card activity-card">
    <div class="row"><span class="badge">${catLabel(a.category)}</span> ${regBadge(a)}</div>
    <h3><a href="#/activite/${a.id}">${a.title}</a></h3>
    <div class="meta">${schedule(a)} · ${a.location}</div>
    <div class="meta">${ageRange(a)} · du ${fmtDateShort(a.start_date)} au ${fmtDateShort(a.end_date)}</div>
    <div class="foot">
      <span class="price">${money(a.price_resident)} <span class="muted small">résident</span><br>
        <span class="muted small">${money(a.price_nonresident)} non-résident</span></span>
      <a class="btn secondary small" href="#/activite/${a.id}">Détails</a>
    </div>
  </article>`;
}

async function loadResults() {
  const box = document.getElementById('results');
  if (!box) return;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v === true ? '1' : v);
  try {
    const list = await api('GET', '/api/activities?' + p);
    box.innerHTML = list.length
      ? html`<p class="muted" aria-live="polite">${list.length} activité${list.length > 1 ? 's' : ''}</p><div class="grid cols-3">${list.map(activityCard)}</div>`.s
      : html`<div class="card empty">Aucune activité ne correspond à votre recherche.</div>`.s;
  } catch (e) { box.innerHTML = html`<div class="alert error">${e.message}</div>`.s; }
}

live.filters = (d) => { Object.assign(filters, d); loadResults(); };
forms.filters = (d) => { Object.assign(filters, d); return loadResults(); };

export async function viewCatalogue() {
  const seasons = await api('GET', '/api/seasons');
  if (!filters.season_id || !seasons.some((s) => String(s.id) === filters.season_id)) {
    const today = state.meta.today;
    const pick = seasons.find((s) => s.registration_open <= today && today <= s.registration_close)
      || seasons.find((s) => s.end_date >= today) || seasons[0];
    filters.season_id = pick ? String(pick.id) : '';
  }
  const cats = [['', 'Toutes les catégories'], ...Object.entries(state.meta.categories)];
  const days = [['', 'Tous les jours'], ...Object.entries(state.meta.weekdays)];
  return {
    html: html`
      <div class="page-head"><div><h1>Activités et cours</h1><p class="muted">Trouvez une activité pour toute la famille et inscrivez-vous en ligne.</p></div></div>
      <form class="card filters no-print" data-form="filters" data-live role="search" aria-label="Filtrer les activités">
        ${field('Session', 'season_id', { type: 'select', value: filters.season_id, options: seasons.map((s) => [s.id, s.name]) })}
        ${field('Catégorie', 'category', { type: 'select', value: filters.category, options: cats })}
        ${field('Jour', 'weekday', { type: 'select', value: filters.weekday, options: days })}
        ${field('Recherche', 'q', { type: 'search', value: filters.q, at: { placeholder: 'Nom, lieu, animateur…', maxlength: 60 } })}
        ${field('Âge du participant', 'age', { type: 'number', value: filters.age, at: { min: 0, max: 120 } })}
        <label class="check field"><input type="checkbox" name="available" ${attrs({ checked: filters.available })}> <span>Places disponibles seulement</span></label>
      </form>
      <div id="results" class="stack mt"></div>`,
    after: loadResults,
  };
}

/* ================= Détail d'une activité ================= */
export async function viewActivity(id) {
  const a = await api('GET', `/api/activities/${id}`);
  let members = []; let regs = [];
  if (state.user) [members, regs] = await Promise.all([api('GET', '/api/members'), api('GET', '/api/registrations')]);
  const price = userPrice(a);

  const eligibility = (m) => {
    const age = ageOn(m.birth_date, a.start_date);
    if (regs.some((r) => r.activity_id === a.id && r.member_id === m.id && r.status !== 'cancelled')) return 'Déjà inscrit';
    if (a.age_min != null && age < a.age_min) return `trop jeune (${age} ans)`;
    if (a.age_max != null && age > a.age_max) return `trop âgé (${age} ans)`;
    return '';
  };

  let panel;
  if (a.status === 'cancelled') panel = html`<div class="alert error">Cette activité a été annulée.</div>`;
  else if (a.registration_state === 'ended') panel = html`<div class="alert">Cette activité est terminée.</div>`;
  else if (a.registration_state === 'not_yet') panel = html`<div class="alert warn">Les inscriptions débutent le <strong>${fmtDate(a.registration_open)}</strong>.</div>`;
  else if (a.registration_state === 'closed') panel = html`<div class="alert">La période d’inscription s’est terminée le ${fmtDate(a.registration_close)}.</div>`;
  else if (!state.user) panel = html`<div class="alert info">Pour vous inscrire, <a href="#/connexion" data-act="remember-next">connectez-vous</a> ou <a href="#/creer-compte" data-act="remember-next">créez un compte</a>.</div>`;
  else {
    const opts = members.map((m) => [m, eligibility(m)]);
    const firstOk = (opts.find(([, why]) => !why) || [])[0];
    const any = !!firstOk;
    panel = html`<form data-form="register" novalidate>
      <input type="hidden" name="activity_id" value="${a.id}">
      ${a.full ? html`<div class="alert warn">Cette activité est complète. Vous pouvez vous inscrire en <strong>liste d’attente</strong> : vous serez avisé si une place se libère.</div>` : ''}
      <label class="field mt-sm"><span class="lbl">Participant</span>
        <select name="member_id" required>${opts.map(([m, why]) => html`<option value="${m.id}" ${attrs({ disabled: !!why, selected: !why && m === firstOk })}>${m.first_name} ${m.last_name} (${ageOn(m.birth_date, a.start_date)} ans)${why ? ` — ${why}` : ''}</option>`)}</select>
        <span class="err" data-err="member_id"></span></label>
      <p class="small muted">Tarif applicable : <strong>${money(price)}</strong> (${state.user.resident ? 'résident' : 'non-résident'}). Paiement à effectuer après l’inscription.</p>
      <div class="form-error"></div>
      <button class="btn" type="submit" ${attrs({ disabled: !any })}>${a.full ? 'Me mettre en liste d’attente' : 'M’inscrire'}</button>
      ${any ? '' : html`<p class="small muted">Aucun participant admissible. <a href="#/compte">Ajouter un participant</a></p>`}
    </form>`;
  }

  return html`
    <p><a href="#/">← Retour aux activités</a></p>
    <div class="two-col">
      <section class="card">
        <div class="row"><span class="badge">${catLabel(a.category)}</span> ${regBadge(a)}</div>
        <h1 class="mt-sm">${a.title}</h1>
        <p>${a.description || ''}</p>
        <dl class="facts">
          <dt>Horaire</dt><dd>${schedule(a)}</dd>
          <dt>Dates</dt><dd>Du ${fmtDate(a.start_date)} au ${fmtDate(a.end_date)}</dd>
          <dt>Lieu</dt><dd>${a.location}</dd>
          <dt>Âge</dt><dd>${ageRange(a)} <span class="muted small">(au début de l’activité)</span></dd>
          ${a.instructor ? html`<dt>Animateur</dt><dd>${a.instructor}</dd>` : ''}
          <dt>Places</dt><dd>${a.capacity} au total · ${a.spots_left} restante${a.spots_left > 1 ? 's' : ''}${a.waitlist_count ? ` · ${a.waitlist_count} en attente` : ''}</dd>
          <dt>Tarif</dt><dd>${money(a.price_resident)} résident · ${money(a.price_nonresident)} non-résident</dd>
          <dt>Inscriptions</dt><dd>Du ${fmtDate(a.registration_open)} au ${fmtDate(a.registration_close)}</dd>
        </dl>
        <p class="small muted">Annulation avec remboursement complet jusqu’à ${state.meta.refund_days} jours avant le début de l’activité.</p>
      </section>
      <aside class="card"><h2>Inscription</h2>${panel}</aside>
    </div>`;
}

actions['remember-next'] = () => { state.next = location.hash; };

forms.register = async (d) => {
  const reg = await api('POST', '/api/registrations', { activity_id: Number(d.activity_id), member_id: Number(d.member_id) });
  await refreshMe();
  toast(reg.status === 'confirmed' ? 'Inscription confirmée. Il reste à effectuer le paiement.' : 'Vous êtes en liste d’attente.', 'ok');
  go('#/mes-inscriptions');
};

/* ================= Authentification ================= */
export function viewLogin() {
  return html`<div class="card narrow centered">
    <h1>Connexion</h1>
    <form data-form="login" novalidate>
      ${field('Courriel', 'email', { type: 'email', required: true, at: { autocomplete: 'username' } })}
      ${field('Mot de passe', 'password', { type: 'password', required: true, at: { autocomplete: 'current-password' } })}
      <div class="form-error"></div>
      <button class="btn" type="submit">Se connecter</button>
    </form>
    <p class="small">Pas encore de compte ? <a href="#/creer-compte">Créer un compte</a></p>
  </div>`;
}
forms.login = async (d) => {
  await api('POST', '/api/auth/login', d);
  await refreshMe();
  const next = state.next; state.next = null;
  go(next || (state.user.role === 'citizen' ? '#/' : '#/admin'));
};
actions.logout = async () => {
  await api('POST', '/api/auth/logout');
  state.user = null; state.unread = 0; await refreshMe();
  toast('Vous êtes déconnecté.'); go('#/');
};

export function viewSignup() {
  return html`<div class="card medium centered">
    <h1>Créer un compte famille</h1>
    <p class="muted">Le titulaire du compte peut ensuite ajouter les membres de sa famille et les inscrire aux activités.</p>
    <form data-form="signup" novalidate>
      <div class="form-grid">
        ${field('Prénom', 'first_name', { required: true, at: { autocomplete: 'given-name', maxlength: 60 } })}
        ${field('Nom', 'last_name', { required: true, at: { autocomplete: 'family-name', maxlength: 60 } })}
        ${field('Date de naissance', 'birth_date', { type: 'date', required: true, at: { autocomplete: 'bday' } })}
        ${field('Téléphone', 'phone', { type: 'tel', required: true, at: { autocomplete: 'tel', placeholder: '450 555-0123' } })}
        ${field('Adresse', 'address', { at: { autocomplete: 'street-address' } })}
        ${field('Ville', 'city', { required: true, value: 'Terrebonne', at: { autocomplete: 'address-level2' }, help: 'Le tarif résident s’applique aux résidents de Terrebonne.' })}
        ${field('Code postal', 'postal_code', { required: true, at: { autocomplete: 'postal-code', placeholder: 'J6W 1A1' } })}
        ${field('Courriel', 'email', { type: 'email', required: true, at: { autocomplete: 'email' } })}
        ${field('Mot de passe', 'password', { type: 'password', required: true, at: { autocomplete: 'new-password', minlength: 10 }, help: 'Au moins 10 caractères.' })}
      </div>
      <div class="form-error"></div>
      <button class="btn" type="submit">Créer mon compte</button>
    </form>
  </div>`;
}
forms.signup = async (d) => {
  await api('POST', '/api/auth/register', d);
  await refreshMe();
  toast('Bienvenue ! Votre compte est créé.', 'ok');
  const next = state.next; state.next = null;
  go(next || '#/');
};

/* ================= Mes inscriptions ================= */
const refundable = (r) => state.meta.today <= addDays(r.start_date, -state.meta.refund_days);

export async function viewMyRegs() {
  const [regs, pays] = await Promise.all([api('GET', '/api/registrations'), api('GET', '/api/payments')]);
  const active = regs.filter((r) => r.status !== 'cancelled');
  const payable = regs.filter((r) => r.status === 'confirmed' && r.payment_status === 'unpaid');
  const past = regs.filter((r) => r.status === 'cancelled');
  const row = (r) => html`<tr class="${r.status === 'cancelled' ? 'cancelled' : ''}">
    <td>${r.status === 'confirmed' && r.payment_status === 'unpaid' ? html`<input type="checkbox" name="ids" value="${r.id}" data-cents="${r.price_cents}" checked aria-label="Payer ${r.title} pour ${r.member_first_name}">` : ''}</td>
    <td><a href="#/activite/${r.activity_id}">${r.title}</a><div class="muted small">${schedule(r)} · ${r.location}</div></td>
    <td>${r.member_first_name} ${r.member_last_name}</td>
    <td class="no-wrap">${fmtDateShort(r.start_date)}</td>
    <td>${statusBadge(r.status)}${r.status === 'waitlist' ? html` <span class="small muted">rang ${r.waitlist_rank}</span>` : ''}</td>
    <td class="right no-wrap">${money(r.price_cents)}<div>${r.status === 'cancelled' && r.payment_status !== 'refunded' ? '' : payBadge(r.payment_status)}</div></td>
    <td class="right">${r.status !== 'cancelled' ? html`<button type="button" class="btn danger small" data-act="cancel-reg" data-id="${r.id}" data-paid="${r.payment_status === 'paid' ? 1 : 0}" data-refundable="${refundable(r) ? 1 : 0}" data-status="${r.status}">Annuler</button>` : ''}</td>
  </tr>`;
  const total = payable.reduce((s, r) => s + r.price_cents, 0);
  return html`
    <div class="page-head"><div><h1>Mes inscriptions</h1><p class="muted">Gérez et payez les inscriptions de votre famille.</p></div><a class="btn secondary" href="#/">Trouver une activité</a></div>
    ${!active.length ? html`<div class="card empty">Aucune inscription pour le moment. <a href="#/">Parcourir les activités</a></div>` : html`
    <form class="card" data-form="pay" data-live>
      <div class="table-wrap"><table>
        <thead><tr><th><span class="sr-only"></span></th><th>Activité</th><th>Participant</th><th>Début</th><th>Statut</th><th class="right">Montant</th><th></th></tr></thead>
        <tbody>${active.map(row)}</tbody></table></div>
      <div class="form-error"></div>
      ${payable.length ? html`<div class="row spread mt">
        <strong>Total sélectionné : <span id="pay-total">${money(total)}</span></strong>
        <button class="btn success" type="submit">Payer maintenant</button></div>
        <p class="small muted">Paiement simulé : aucune carte n’est demandée dans cette version de démonstration.</p>` : ''}
    </form>`}
    ${past.length ? html`<details class="card"><summary>Inscriptions annulées (${past.length})</summary><div class="table-wrap"><table><tbody>${past.map(row)}</tbody></table></div></details>` : ''}
    <section class="card"><h2>Reçus</h2>
      ${pays.length ? html`<div class="table-wrap"><table><thead><tr><th>Référence</th><th>Date</th><th>Détail</th><th class="right">Total</th></tr></thead><tbody>
        ${pays.map((p) => html`<tr><td class="no-wrap">${p.reference}</td><td>${fmtDateTime(p.created_at)}</td>
          <td>${p.items.map((i) => html`<div>${i.title} — ${i.first_name} ${i.last_name}</div>`)}</td><td class="right">${money(p.total_cents)}</td></tr>`)}
      </tbody></table></div>` : html`<p class="muted">Aucun paiement.</p>`}
    </section>`;
}

live.pay = (_d, form) => {
  const cents = [...form.querySelectorAll('input[name="ids"]:checked')].reduce((s, c) => s + Number(c.dataset.cents), 0);
  const el = form.querySelector('#pay-total');
  if (el) el.textContent = money(cents);
};
forms.pay = async (_d, form) => {
  const ids = [...form.querySelectorAll('input[name="ids"]:checked')].map((c) => Number(c.value));
  if (!ids.length) throw Object.assign(new Error('Sélectionnez au moins une inscription à payer.'), { fields: {} });
  const p = await api('POST', '/api/payments', { registration_ids: ids });
  toast(`Paiement reçu — reçu ${p.reference}`, 'ok');
  go('#/mes-inscriptions');
};
actions['cancel-reg'] = async (el) => {
  const paid = el.dataset.paid === '1'; const waitlist = el.dataset.status === 'waitlist';
  let msg = 'Annuler cette inscription ?';
  if (paid) msg += el.dataset.refundable === '1' ? ' Vous serez remboursé intégralement.' : ` Le délai de remboursement (${state.meta.refund_days} jours avant le début) est dépassé : aucun remboursement.`;
  if (waitlist) msg = 'Quitter la liste d’attente ?';
  if (!window.confirm(msg)) return;
  const r = await api('DELETE', `/api/registrations/${el.dataset.id}`);
  toast(r.refund_cents ? `Inscription annulée. Remboursement : ${money(r.refund_cents)}` : 'Inscription annulée.', 'ok');
  go('#/mes-inscriptions');
};

/* ================= Compte et famille ================= */
export async function viewAccount() {
  const members = await api('GET', '/api/members');
  const u = state.user;
  const memberForm = (m) => html`<form data-form="member" novalidate>
    <input type="hidden" name="id" value="${m?.id || ''}">
    <div class="form-grid">
      ${field('Prénom', 'first_name', { required: true, value: m?.first_name })}
      ${field('Nom', 'last_name', { required: true, value: m?.last_name })}
      ${field('Date de naissance', 'birth_date', { type: 'date', required: true, value: m?.birth_date })}
    </div>
    ${field('Notes de santé (allergies, conditions)', 'health_notes', { type: 'textarea', value: m?.health_notes, at: { maxlength: 500 }, help: 'Visible par l’animateur seulement.' })}
    <div class="form-error"></div>
    <div class="row"><button class="btn" type="submit">${m ? 'Enregistrer' : 'Ajouter le participant'}</button>
      ${m && !m.is_self ? html`<button class="btn danger" type="button" data-act="delete-member" data-id="${m.id}">Supprimer</button>` : ''}</div>
  </form>`;
  return html`
    <div class="page-head"><h1>Mon compte</h1></div>
    <div class="two-col">
      <div>
        <section class="card"><h2>Coordonnées</h2>
          <p class="small muted">Courriel : ${u.email} · Tarif <strong>${u.resident ? 'résident' : 'non-résident'}</strong></p>
          <form data-form="profile" novalidate>
            <div class="form-grid">
              ${field('Prénom', 'first_name', { required: true, value: u.first_name })}
              ${field('Nom', 'last_name', { required: true, value: u.last_name })}
              ${field('Téléphone', 'phone', { type: 'tel', required: true, value: u.phone })}
              ${field('Adresse', 'address', { value: u.address })}
              ${field('Ville', 'city', { required: true, value: u.city })}
              ${field('Code postal', 'postal_code', { required: true, value: u.postal_code })}
            </div>
            <div class="form-error"></div>
            <button class="btn" type="submit">Enregistrer</button>
          </form>
        </section>
        <section class="card"><h2>Changer le mot de passe</h2>
          <form data-form="password" novalidate>
            <div class="form-grid">
              ${field('Mot de passe actuel', 'current', { type: 'password', required: true, at: { autocomplete: 'current-password' } })}
              ${field('Nouveau mot de passe', 'password', { type: 'password', required: true, at: { autocomplete: 'new-password', minlength: 10 } })}
            </div>
            <div class="form-error"></div>
            <button class="btn secondary" type="submit">Modifier</button>
          </form>
        </section>
      </div>
      <section class="card"><h2>Ma famille</h2>
        <p class="small muted">Les participants que vous pouvez inscrire aux activités.</p>
        ${members.map((m) => html`<details class="card compact"><summary><strong>${m.first_name} ${m.last_name}</strong> <span class="muted small">· ${ageOn(m.birth_date, state.meta.today)} ans${m.is_self ? ' · titulaire' : ''}</span></summary><div class="mt-sm">${memberForm(m)}</div></details>`)}
        <details class="card compact"><summary><strong>+ Ajouter un participant</strong></summary><div class="mt-sm">${memberForm(null)}</div></details>
      </section>
    </div>`;
}
forms.profile = async (d) => { await api('PUT', '/api/me', d); await refreshMe(); toast('Coordonnées enregistrées.', 'ok'); go('#/compte'); };
forms.password = async (d) => {
  await api('PUT', '/api/me/password', d);
  state.user = null; await refreshMe();
  toast('Mot de passe modifié. Reconnectez-vous.', 'ok'); go('#/connexion');
};
forms.member = async (d) => {
  const body = { first_name: d.first_name, last_name: d.last_name, birth_date: d.birth_date, health_notes: d.health_notes };
  if (d.id) await api('PUT', `/api/members/${d.id}`, body); else await api('POST', '/api/members', body);
  toast('Participant enregistré.', 'ok'); go('#/compte');
};
actions['delete-member'] = async (el) => {
  if (!window.confirm('Supprimer ce participant ?')) return;
  await api('DELETE', `/api/members/${el.dataset.id}`);
  toast('Participant supprimé.'); go('#/compte');
};

/* ================= Notifications ================= */
export async function viewNotifications() {
  const list = await api('GET', '/api/notifications');
  const unread = new Set(list.filter((n) => !n.read).map((n) => n.id));
  if (unread.size) { await api('POST', '/api/notifications/read', {}); state.unread = 0; }
  return html`<div class="page-head"><h1>Notifications</h1></div>
    <div class="card">${list.length ? html`<ul class="notes">${list.map((n) => html`<li class="${unread.has(n.id) ? 'unread' : ''}">${n.message}<div class="muted small">${fmtDateTime(n.created_at)}</div></li>`)}</ul>` : html`<p class="empty">Aucune notification.</p>`}</div>`;
}
