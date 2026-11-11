import {
  state, hooks, forms, live, actions, api, html, esc, toast, formData, clearErrors, showErrors, refreshMe, isStaff, go, ApiError,
} from './core.js';
import {
  viewCatalogue, viewActivity, viewLogin, viewSignup, viewMyRegs, viewAccount, viewNotifications,
} from './views-public.js';
import {
  viewAdminDash, viewAdminActivities, viewAdminActivityForm, viewAdminRoster, viewAdminSeasons, viewAdminUsers,
} from './views-admin.js';

const $app = document.getElementById('app');
const $nav = document.getElementById('main-nav');

/* [motif, vue, accès]  accès : null = public, 'user' = connecté, 'staff' = personnel */
const routes = [
  [/^\/?$/, viewCatalogue, null],
  [/^\/activite\/(\d+)$/, viewActivity, null],
  [/^\/connexion$/, viewLogin, null],
  [/^\/creer-compte$/, viewSignup, null],
  [/^\/mes-inscriptions$/, viewMyRegs, 'user'],
  [/^\/compte$/, viewAccount, 'user'],
  [/^\/notifications$/, viewNotifications, 'user'],
  [/^\/admin$/, viewAdminDash, 'staff'],
  [/^\/admin\/activites$/, viewAdminActivities, 'staff'],
  [/^\/admin\/activites\/nouvelle$/, () => viewAdminActivityForm(null), 'staff'],
  [/^\/admin\/activites\/(\d+)$/, viewAdminActivityForm, 'staff'],
  [/^\/admin\/activites\/(\d+)\/participants$/, viewAdminRoster, 'staff'],
  [/^\/admin\/sessions$/, viewAdminSeasons, 'staff'],
  [/^\/admin\/usagers$/, viewAdminUsers, 'staff'],
];

function renderNav() {
  const path = location.hash.replace(/^#/, '') || '/';
  const link = (href, label, extra = '') => {
    const target = href.slice(1);
    const current = target === '/' ? path === '/' : path === target || path.startsWith(target + '/');
    return html`<a href="${href}" ${current ? 'aria-current="page"' : ''}>${label}${extra}</a>`;
  };
  const u = state.user;
  $nav.innerHTML = html`
    ${link('#/', 'Activités')}
    ${u ? link('#/mes-inscriptions', 'Mes inscriptions') : ''}
    ${isStaff() ? link('#/admin', 'Administration') : ''}
    ${u ? link('#/notifications', 'Notifications', state.unread ? html`<span class="pill" aria-label="${state.unread} non lues">${state.unread}</span>` : '') : ''}
    ${u ? link('#/compte', `${u.first_name}`) : ''}
    ${u ? html`<button type="button" data-act="logout">Se déconnecter</button>` : html`${link('#/connexion', 'Connexion')}${link('#/creer-compte', 'Créer un compte')}`}`.s;
}
hooks.refreshHeader = renderNav;

let renderToken = 0;
async function render() {
  const token = ++renderToken;
  $nav.classList.remove('open');
  document.querySelector('.menu-toggle')?.setAttribute('aria-expanded', 'false');
  const path = location.hash.replace(/^#/, '') || '/';
  const match = routes.map(([re, view, access]) => [path.match(re), view, access]).find(([m]) => m);
  if (!match) { $app.innerHTML = html`<div class="card empty"><h1>Page introuvable</h1><p><a href="#/">Retour à l’accueil</a></p></div>`.s; renderNav(); return; }
  const [m, view, access] = match;
  if (access && !state.user) { state.next = location.hash; location.replace('#/connexion'); toast('Veuillez vous connecter pour continuer.'); return; }
  if (access === 'staff' && !isStaff()) { $app.innerHTML = html`<div class="alert error">Accès réservé au personnel du Service des loisirs.</div>`.s; renderNav(); return; }
  renderNav();
  try {
    const out = await view(...m.slice(1));
    if (token !== renderToken) return; // navigation plus récente
    $app.innerHTML = (out.html || out).s;
    document.title = (($app.querySelector('h1')?.textContent) || 'Inscriptions') + ' – Loisirs Terrebonne';
    $app.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    if (out.after) await out.after();
    renderNav();
  } catch (err) {
    if (token !== renderToken) return;
    if (err instanceof ApiError && err.status === 401) return;
    $app.innerHTML = html`<div class="alert error" role="alert">${err.message || 'Erreur inattendue.'}</div>
      <p><a href="#/">Retour à l’accueil</a></p>`.s;
  }
}

/* ---------- Délégation d'événements ---------- */
document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const handler = forms[form.dataset.form];
  if (!handler) return;
  clearErrors(form);
  const buttons = [...form.querySelectorAll('button[type="submit"]')].concat([...document.querySelectorAll(`button[form="${form.id}"]`)]);
  buttons.forEach((b) => { b.disabled = true; });
  try { await handler(formData(form), form); }
  catch (err) { showErrors(form, err); }
  finally { buttons.forEach((b) => { if (b.isConnected) b.disabled = false; }); }
});

const timers = new Map();
document.addEventListener('input', (e) => {
  const form = e.target.closest('form[data-live]');
  if (!form || !live[form.dataset.form]) return;
  const name = form.dataset.form;
  clearTimeout(timers.get(name));
  const delay = e.target.type === 'search' || e.target.type === 'number' || e.target.type === 'text' ? 250 : 0;
  timers.set(name, setTimeout(() => Promise.resolve(live[name](formData(form), form)).catch((err) => toast(err.message, 'error')), delay));
});

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const name = el.dataset.act;
  if (name === 'toggle-menu') {
    const open = $nav.classList.toggle('open');
    el.setAttribute('aria-expanded', String(open));
    return;
  }
  const handler = actions[name];
  if (!handler) return;
  if (el.tagName === 'A') { /* laisse la navigation se faire */ }
  else e.preventDefault();
  try { await handler(el, e); } catch (err) { toast(err.message || 'Erreur', 'error'); }
});

window.addEventListener('hashchange', render);

/* ---------- Démarrage ---------- */
(async function init() {
  try {
    state.meta = await api('GET', '/api/meta');
    await refreshMe();
  } catch (err) {
    $app.innerHTML = html`<div class="alert error">${err.message}</div>`.s;
    return;
  }
  await render();
})();
