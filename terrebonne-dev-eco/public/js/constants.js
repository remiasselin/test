'use strict';

export const STATUT_LABELS = {
  nouveau: 'Nouveau',
  en_analyse: 'En analyse',
  en_cours: 'En cours',
  approuve: 'Approuvé',
  refuse: 'Refusé',
  complete: 'Complété',
  annule: 'Annulé',
};

export const PRIORITE_LABELS = {
  basse: 'Basse',
  normale: 'Normale',
  haute: 'Haute',
  urgente: 'Urgente',
};

export const ENTREPRISE_STATUT_LABELS = {
  actif: 'Actif',
  prospect: 'Prospect',
  inactif: 'Inactif',
};

export const ROLE_LABELS = {
  admin: 'Administrateur',
  gestionnaire: 'Gestionnaire',
  lecteur: 'Lecteur',
};

export function badge(value, labels) {
  const label = labels[value] || value || '—';
  return `<span class="badge badge-${value}"><span class="badge-dot"></span>${escapeHtml(label)}</span>`;
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatMoney(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
