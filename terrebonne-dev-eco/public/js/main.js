'use strict';

import { api, ApiError } from './api.js';
import { toast } from './ui.js';
import { ROLE_LABELS } from './constants.js';

import { renderDashboard } from './views/dashboard.js';
import { renderDossiers } from './views/dossiers.js';
import { renderEntreprises } from './views/entreprises.js';
import { renderRapports } from './views/rapports.js';
import { renderUtilisateurs } from './views/utilisateurs.js';

export const state = {
  user: null,
};

const ROUTES = {
  'tableau-de-bord': { title: 'Tableau de bord', render: renderDashboard },
  'dossiers': { title: 'Dossiers', render: renderDossiers },
  'entreprises': { title: 'Entreprises', render: renderEntreprises },
  'rapports': { title: 'Rapports de gestion', render: renderRapports },
  'utilisateurs': { title: 'Utilisateurs', render: renderUtilisateurs, adminOnly: true },
};

const loginScreen = document.getElementById('loginScreen');
const appShell = document.getElementById('appShell');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const loginSubmit = document.getElementById('loginSubmit');
const content = document.getElementById('content');
const pageTitle = document.getElementById('pageTitle');
const sidebarNav = document.getElementById('sidebarNav');
const navUtilisateurs = document.getElementById('navUtilisateurs');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const userRole = document.getElementById('userRole');
const logoutBtn = document.getElementById('logoutBtn');
const mobileNavToggle = document.getElementById('mobileNavToggle');
const sidebar = document.querySelector('.sidebar');

document.getElementById('currentYear').textContent = new Date().getFullYear();

function showLogin() {
  loginScreen.classList.remove('hidden');
  appShell.classList.add('hidden');
}

function showApp() {
  loginScreen.classList.add('hidden');
  appShell.classList.remove('hidden');
}

function initials(name) {
  if (!name) return '--';
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

function applyUserToChrome() {
  userAvatar.textContent = initials(state.user.name);
  userName.textContent = state.user.name;
  userRole.textContent = ROLE_LABELS[state.user.role] || state.user.role;
  navUtilisateurs.classList.toggle('hidden', state.user.role !== 'admin');
}

async function checkSession() {
  try {
    const { user } = await api.get('/api/auth/me');
    state.user = user;
    applyUserToChrome();
    showApp();
    router();
  } catch {
    showLogin();
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  loginSubmit.disabled = true;
  loginSubmit.textContent = 'Connexion…';

  try {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const { user } = await api.post('/api/auth/login', { email, password });
    state.user = user;
    applyUserToChrome();
    showApp();
    window.location.hash = '#/tableau-de-bord';
    router();
    loginForm.reset();
  } catch (err) {
    loginError.textContent = err instanceof ApiError ? err.message : 'Connexion impossible.';
    loginError.classList.remove('hidden');
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = 'Se connecter';
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await api.post('/api/auth/logout');
  } catch {
    /* ignore */
  }
  state.user = null;
  window.location.hash = '';
  showLogin();
});

mobileNavToggle.addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

sidebarNav.addEventListener('click', (e) => {
  if (e.target.closest('a')) sidebar.classList.remove('open');
});

function currentRouteKey() {
  const hash = window.location.hash.replace(/^#\//, '');
  return hash || 'tableau-de-bord';
}

async function router() {
  if (!state.user) return;

  let key = currentRouteKey();
  let route = ROUTES[key];

  if (!route || (route.adminOnly && state.user.role !== 'admin')) {
    key = 'tableau-de-bord';
    route = ROUTES[key];
    window.location.hash = '#/tableau-de-bord';
  }

  pageTitle.textContent = route.title;
  sidebarNav.querySelectorAll('a').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === key);
  });

  content.innerHTML = '<div class="loading-block"><div class="spinner"></div></div>';

  try {
    await route.render(content, state);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      state.user = null;
      showLogin();
      return;
    }
    console.error(err);
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠</div><p>Une erreur est survenue lors du chargement de cette page.</p></div>`;
    toast('Erreur de chargement de la page.', 'error');
  }
}

window.addEventListener('hashchange', router);

checkSession();
