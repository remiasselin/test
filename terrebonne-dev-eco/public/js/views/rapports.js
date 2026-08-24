'use strict';

import { api } from '../api.js';
import { STATUT_LABELS, badge, formatMoney } from '../constants.js';

let filters = { from: '', to: '' };
let typeChart = null;
let secteurChart = null;

export async function renderRapports(content, state) {
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Rapports de gestion</h1>
        <p>Indicateurs de performance et export des données du service.</p>
      </div>
      <div class="page-actions">
        <a class="btn btn-secondary" href="/api/reports/export.csv?type=dossiers" download>Exporter les dossiers (CSV)</a>
        <a class="btn btn-secondary" href="/api/reports/export.csv?type=entreprises" download>Exporter les entreprises (CSV)</a>
      </div>
    </div>

    <div class="toolbar">
      <label style="font-size:0.82rem;color:var(--text-muted);">Période (date d'ouverture) :</label>
      <input type="date" id="rFrom" value="${filters.from}" />
      <span style="color:var(--text-faint);">à</span>
      <input type="date" id="rTo" value="${filters.to}" />
      <button class="btn btn-primary btn-sm" id="rApply">Appliquer</button>
      <button class="btn btn-ghost btn-sm" id="rReset">Réinitialiser</button>
    </div>

    <div id="reportsBody"></div>
  `;

  document.getElementById('rApply').addEventListener('click', () => {
    filters.from = document.getElementById('rFrom').value;
    filters.to = document.getElementById('rTo').value;
    loadReports(content);
  });
  document.getElementById('rReset').addEventListener('click', () => {
    filters = { from: '', to: '' };
    document.getElementById('rFrom').value = '';
    document.getElementById('rTo').value = '';
    loadReports(content);
  });

  await loadReports(content);
}

async function loadReports(content) {
  const body = document.getElementById('reportsBody');
  body.innerHTML = '<div class="loading-block"><div class="spinner"></div></div>';

  const [summary, byStatus, byType, bySecteur] = await Promise.all([
    api.get('/api/reports/summary', filters),
    api.get('/api/reports/by-status', filters),
    api.get('/api/reports/by-type', filters),
    api.get('/api/reports/by-secteur'),
  ]);

  const totalStatus = byStatus.data.reduce((sum, r) => sum + r.total, 0) || 1;

  body.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Dossiers (période)</div>
        <div class="kpi-value">${summary.total_dossiers || 0}</div>
        <div class="kpi-sub">${summary.dossiers_actifs || 0} actifs</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Montant demandé</div>
        <div class="kpi-value">${formatMoney(summary.montant_total_demande)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Montant accordé</div>
        <div class="kpi-value">${formatMoney(summary.montant_total_accorde)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Taux d'approbation</div>
        <div class="kpi-value">${summary.taux_approbation !== null ? summary.taux_approbation + '%' : '—'}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Dossiers en retard</div>
        <div class="kpi-value">${summary.dossiers_en_retard || 0}</div>
      </div>
    </div>

    <div class="charts-grid">
      <div class="card chart-card">
        <h3>Montants par type de dossier</h3>
        <p class="chart-sub">Demandé vs. accordé</p>
        <div class="chart-wrap"><canvas id="typeChart"></canvas></div>
      </div>
      <div class="card chart-card">
        <h3>Entreprises et dossiers par secteur</h3>
        <p class="chart-sub">Répartition sur l'ensemble des données</p>
        <div class="chart-wrap"><canvas id="secteurChart"></canvas></div>
      </div>
    </div>

    <div class="card card-pad">
      <h3 class="section-title">Répartition détaillée par statut</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Statut</th><th>Nombre</th><th>Part</th><th>Montant accordé</th></tr></thead>
          <tbody>
            ${byStatus.data.map((r) => `
              <tr>
                <td>${badge(r.statut, STATUT_LABELS)}</td>
                <td class="cell-strong">${r.total}</td>
                <td class="cell-muted">${Math.round((r.total / totalStatus) * 100)}%</td>
                <td class="cell-muted">${formatMoney(r.montant_accorde)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  drawTypeChart(byType.data);
  drawSecteurChart(bySecteur.data);
}

function drawTypeChart(data) {
  if (typeChart) { typeChart.destroy(); typeChart = null; }
  const ctx = document.getElementById('typeChart');
  typeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map((r) => r.type),
      datasets: [
        { label: 'Demandé', data: data.map((r) => r.montant_demande), backgroundColor: '#94a3b8', borderRadius: 4 },
        { label: 'Accordé', data: data.map((r) => r.montant_accorde), backgroundColor: '#0e9c98', borderRadius: 4 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
      scales: {
        x: { ticks: { font: { size: 10 } } },
        y: { beginAtZero: true, ticks: { callback: (v) => '$' + v.toLocaleString('fr-CA') } },
      },
    },
  });
}

function drawSecteurChart(data) {
  if (secteurChart) { secteurChart.destroy(); secteurChart = null; }
  const ctx = document.getElementById('secteurChart');
  secteurChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map((r) => r.secteur),
      datasets: [
        { label: 'Entreprises', data: data.map((r) => r.nb_entreprises), backgroundColor: '#1e4278', borderRadius: 4 },
        { label: 'Dossiers', data: data.map((r) => r.nb_dossiers), backgroundColor: '#d69e2e', borderRadius: 4 },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}
