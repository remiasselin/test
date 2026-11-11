/* Noyau du client : état, API, gabarits HTML sécurisés, formulaires, utilitaires. */

export const state = { user: null, unread: 0, meta: null, next: null };
export const hooks = { refreshHeader: () => {} };
export const forms = {};   // soumissions : forms[nom](donnees, formulaire)
export const live = {};    // saisie en direct : live[nom](donnees, formulaire)
export const actions = {}; // clics : actions[nom](element, evenement)

/* ---------- Gabarits HTML : toute valeur interpolée est échappée ---------- */
export class Safe { constructor(s) { this.s = s; } }
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const raw = (s) => new Safe(s);
const part = (v) => (v instanceof Safe ? v.s : Array.isArray(v) ? v.map(part).join('') : v === false || v == null ? '' : esc(v));
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += part(v) + strings[i + 1]; });
  return new Safe(out);
}
export const attrs = (o) => raw(Object.entries(o)
  .filter(([, v]) => v !== false && v != null)
  .map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`)).join(' '));

/* ---------- API ---------- */
export class ApiError extends Error {
  constructor(status, message, fields) { super(message); this.status = status; this.fields = fields; }
}
export async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method, credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Connexion au serveur impossible. Vérifiez votre réseau et réessayez.');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && state.user && !url.startsWith('/api/auth/')) {
      state.user = null; state.unread = 0; hooks.refreshHeader();
      location.hash = '#/connexion';
    }
    throw new ApiError(res.status, data?.error || 'Une erreur est survenue.', data?.fields);
  }
  return data;
}

/* ---------- Mise en forme ---------- */
const nf = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' });
export const money = (cents) => nf.format((cents || 0) / 100);
export const fmtDate = (d) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');
export const fmtDateShort = (d) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
export const fmtDateTime = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' }) : '');
export const dayName = (n) => state.meta.weekdays[n];
export const catLabel = (c) => state.meta.categories[c] || c;
export const schedule = (a) => `${dayName(a.weekday)} ${a.start_time}–${a.end_time}`;
export function ageRange(a) {
  if (a.age_min != null && a.age_max != null) return `${a.age_min} à ${a.age_max} ans`;
  if (a.age_min != null) return `${a.age_min} ans et plus`;
  if (a.age_max != null) return `${a.age_max} ans et moins`;
  return 'Tous les âges';
}
export function ageOn(birth, ref) {
  const [by, bm, bd] = birth.split('-').map(Number);
  const [ry, rm, rd] = ref.split('-').map(Number);
  return ry - by - (rm < bm || (rm === bm && rd < bd) ? 1 : 0);
}
export function addDays(d, n) {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
export const userPrice = (a) => (state.user?.resident ? a.price_resident : a.price_nonresident);

/* ---------- Formulaires ---------- */
export function field(label, name, { type = 'text', value = '', required = false, options = null, at = {}, help = '' } = {}) {
  let control;
  if (type === 'select') {
    control = html`<select name="${name}" ${attrs({ required })}>${options.map(([v, l]) => html`<option value="${v}" ${attrs({ selected: String(v) === String(value ?? '') })}>${l}</option>`)}</select>`;
  } else if (type === 'textarea') {
    control = html`<textarea name="${name}" ${attrs({ required, ...at })}>${value ?? ''}</textarea>`;
  } else {
    control = html`<input type="${type}" name="${name}" value="${value ?? ''}" ${attrs({ required, ...at })}>`;
  }
  return html`<label class="field"><span class="lbl">${label}${required ? html` <span aria-hidden="true">*</span>` : ''}</span>${control}${help ? html`<span class="muted small">${help}</span>` : ''}<span class="err" data-err="${name}" role="alert"></span></label>`;
}

export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else if (el.type !== 'submit' && el.type !== 'button') out[el.name] = typeof el.value === 'string' ? el.value.trim() : el.value;
  }
  return out;
}

export function clearErrors(form) {
  form.querySelectorAll('.err').forEach((e) => { e.textContent = ''; e.closest('.field')?.classList.remove('invalid'); });
  const box = form.querySelector('.form-error');
  if (box) box.textContent = '';
}

export function showErrors(form, err) {
  clearErrors(form);
  let placed = false;
  for (const [name, msg] of Object.entries(err.fields || {})) {
    const span = form.querySelector(`.err[data-err="${name}"]`);
    if (span) { span.textContent = msg; span.closest('.field')?.classList.add('invalid'); placed = true; }
  }
  const box = form.querySelector('.form-error');
  if (box) {
    box.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'alert error';
    div.textContent = err.message || 'Erreur';
    box.append(div);
  } else if (!placed) toast(err.message, 'error');
  form.querySelector('.invalid input, .invalid select, .invalid textarea')?.focus();
}

export function toast(message, type = '') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  box.append(el);
  setTimeout(() => el.remove(), type === 'error' ? 7000 : 4500);
}

export const go = (hash) => { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; };

export async function refreshMe() {
  const me = await api('GET', '/api/me');
  state.user = me.user; state.unread = me.unread || 0;
  hooks.refreshHeader();
}

export const isStaff = () => state.user && state.user.role !== 'citizen';

/** Reconnaît l'état d'inscription pour l'affichage. */
export function regBadge(a) {
  if (a.status === 'cancelled') return html`<span class="badge bad">Annulée</span>`;
  switch (a.registration_state) {
    case 'ended': return html`<span class="badge grey">Terminée</span>`;
    case 'not_yet': return html`<span class="badge warn">Dès le ${fmtDateShort(a.registration_open)}</span>`;
    case 'closed': return html`<span class="badge grey">Inscriptions fermées</span>`;
    default: return a.full
      ? html`<span class="badge warn">Complet${a.waitlist_count ? ` · ${a.waitlist_count} en attente` : ''}</span>`
      : html`<span class="badge ok">${a.spots_left} place${a.spots_left > 1 ? 's' : ''}</span>`;
  }
}
export const statusBadge = (s) => ({
  confirmed: html`<span class="badge ok">Confirmée</span>`,
  waitlist: html`<span class="badge warn">Liste d’attente</span>`,
  cancelled: html`<span class="badge bad">Annulée</span>`,
}[s]);
export const payBadge = (s) => ({
  paid: html`<span class="badge ok">Payée</span>`,
  unpaid: html`<span class="badge warn">À payer</span>`,
  refunded: html`<span class="badge grey">Remboursée</span>`,
}[s]);
