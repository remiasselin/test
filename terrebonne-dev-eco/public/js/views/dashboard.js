'use strict';

import { api } from '../api.js';
import { STATUT_LABELS, badge, formatMoney, formatDate } from '../constants.js';

let statusChart = null;
let monthChart = null;

export async function renderDashboard(content, state) {
  const [summary, byStatus, byType, byMonth, dossiersResp] = await Promise.all([
    api.get('/api/reports/summary'),
    api.get('/api/reports/by-status'),
    api.get('/api/reports/by-type'),
    api.get('/api/reports/by-month'),
    api.get('/api/dossiers'),
  ]);

  const recentDossiers = dossiersResp.dossiers.slice(0, 6);

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Bonjour, ${escapeFirstName(state.user.name)}</h1>
        <p>Vue d'ensemble des activités du service du développement économique.</p>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Dossiers actifs</div>
        <div class="kpi-value">${summary.dossiers_actifs || 0}</div>
        <div class="kpi-sub">sur ${summary.total_dossiers || 0} dossiers au total</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Montant accordé</div>
        <div class="kpi-value">${formatMoney(summary.montant_total_accorde)}</div>
        <div class="kpi-sub">demandé : ${formatMoney(summary.montant_total_demande)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Taux d'approbation</div>
        <div class="kpi-value">${summary.taux_approbation !== null ? summary.taux_approbation + '%' : '—'}</div>
        <div class="kpi-sub">${summary.dossiers_approuves || 0} approuvés / ${summary.dossiers_refuses || 0} refusés</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Entreprises suivies</div>
        <div class="kpi-value">${summary.nb_entreprises || 0}</div>
        <div class="kpi-sub">${summary.nb_entreprises_actives || 0} actives</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Dossiers en retard</div>
        <div class="kpi-value">${summary.dossiers_en_retard || 0}</div>
        <div class="kpi-sub">échéance dépassée</div>
      </div>
    </div>

    <div class="charts-grid">
      <div class="card chart-card">
        <h3>Répartition par statut</h3>
        <p class="chart-sub">Nombre de dossiers selon leur état actuel</p>
        <div class="chart-wrap"><canvas id="dashStatusChart"></canvas></div>
      </div>
      <div class="card chart-card">
        <h3>Évolution des dossiers ouverts</h3>
        <p class="chart-sub">12 derniers mois</p>
        <div class="chart-wrap"><canvas id="dashMonthChart"></canvas></div>
      </div>
    </div>

    <div class="card card-pad">
      <h3 class="section-title">Dossiers récents</h3>
      ${recentDossiers.length ? `
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Numéro</th><th>Titre</th><th>Entreprise</th><th>Type</th><th>Statut</th><th>Ouverture</th></tr></thead>
            <tbody>
              ${recentDossiers.map((d) => `
                <tr>
                  <td class="cell-strong">${d.numero}</td>
                  <td>${escapeHtml(d.titre)}</td>
                  <td class="cell-muted">${escapeHtml(d.entreprise_nom || '—')}</td>
                  <td class="cell-muted">${escapeHtml(d.type)}</td>
                  <td>${badge(d.statut, STATUT_LABELS)}</td>
                  <td class="cell-muted">${formatDate(d.date_ouverture)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div class="empty-state"><div class="empty-icon">▤</div><p>Aucun dossier pour le moment.</p></div>'}
    </div>
  `;

  drawCharts(byStatus.data, byMonth.data);
}

function drawCharts(byStatus, byMonth) {
  if (statusChart) { statusChart.destroy(); statusChart = null; }
  if (monthChart) { monthChart.destroy(); monthChart = null; }

  const statusCtx = document.getElementById('dashStatusChart');
  const palette = ['#2563eb', '#d69e2e', '#0e9c98', '#16a34a', '#dc2626', '#64748b', '#94a3b8'];

  statusChart = new Chart(statusCtx, {
    type: 'doughnut',
    data: {
      labels: byStatus.map((r) => STATUT_LABELS[r.statut] || r.statut),
      datasets: [{
        data: byStatus.map((r) => r.total),
        backgroundColor: byStatus.map((_, i) => palette[i % palette.length]),
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
    },
  });

  const monthCtx = document.getElementById('dashMonthChart');
  monthChart = new Chart(monthCtx, {
    type: 'line',
    data: {
      labels: byMonth.map((r) => r.mois),
      datasets: [{
        label: 'Dossiers ouverts',
        data: byMonth.map((r) => r.total),
        borderColor: '#0e9c98',
        backgroundColor: 'rgba(14,156,152,0.12)',
        tension: 0.35,
        fill: true,
        pointRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function escapeFirstName(name) {
  return escapeHtml((name || '').split(' ')[0] || '');
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
