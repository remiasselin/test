'use strict';

/* ============================================================
   Codification du plan d'urbanisme – Ville de Terrebonne
   Prototype front-end (sans serveur). Les données sont
   persistées dans le navigateur (localStorage) et peuvent être
   exportées/importées en JSON pour être partagées ou pour
   remplacer les exemples par le contenu réel du règlement.
   ============================================================ */

const STORAGE_KEY = 'terrebonne-urbanisme-data-v1';
const ADMIN_DEMO_PASSWORD = 'urbanisme2026';

const CATEGORIES = [
  { id: 'residentiel', nom: 'Résidentielle', couleur: '#2f6fed' },
  { id: 'commercial', nom: 'Commerciale', couleur: '#e07b2c' },
  { id: 'industriel', nom: 'Industrielle', couleur: '#6b6b6b' },
  { id: 'agricole', nom: 'Agricole', couleur: '#4c9a4c' },
  { id: 'publique', nom: 'Publique et institutionnelle', couleur: '#8a4fd1' },
  { id: 'recreation', nom: 'Récréative et conservation', couleur: '#1f9d8a' },
];

// Données d'exemple (gabarit) — à remplacer par le contenu réel
// du nouveau plan d'urbanisme via Administration → Import / Export.
const SEED_DATA = {
  meta: {
    reglementNumero: '1500 (exemple de démonstration)',
    dateMiseAJour: '2026-09-01',
  },
  zones: [
    {
      id: 'h1', code: 'H-1', categorie: 'residentiel',
      nom: 'Habitation unifamiliale isolée',
      description: "Secteurs à dominance résidentielle de faible densité, composés principalement de maisons unifamiliales isolées.",
      usagesPermis: ['Habitation unifamiliale isolée', 'Usage domestique (garderie en milieu familial, bureau à domicile)'],
      usagesComplementaires: ['Piscine résidentielle', 'Abri d\'auto', 'Remise'],
      usagesProhibes: ['Habitation multifamiliale', 'Commerce', 'Industrie'],
      normes: {
        margeAvantMin: 6, margeLateraleMin: 2, margeArriereMin: 6,
        hauteurMax: 10.5, etagesMax: 2, tauxImplantationMax: 35,
        densiteMax: '1 logement / terrain', superficieTerrainMin: 450,
        largeurTerrainMin: 15, stationnementMin: '2 cases / logement',
      },
      articlesLies: ['4.2.1', '4.2.2', '4.5.1'],
      updatedAt: '2026-08-01',
    },
    {
      id: 'h2', code: 'H-2', categorie: 'residentiel',
      nom: 'Habitation bifamiliale et trifamiliale',
      description: "Secteurs résidentiels de densité moyenne permettant jusqu'à trois logements par bâtiment.",
      usagesPermis: ['Habitation bifamiliale', 'Habitation trifamiliale'],
      usagesComplementaires: ['Piscine résidentielle', 'Remise'],
      usagesProhibes: ['Habitation unifamiliale isolée uniquement (zone dédiée à la densification)', 'Industrie'],
      normes: {
        margeAvantMin: 5, margeLateraleMin: 2, margeArriereMin: 6,
        hauteurMax: 12, etagesMax: 3, tauxImplantationMax: 40,
        densiteMax: '3 logements / terrain', superficieTerrainMin: 550,
        largeurTerrainMin: 16, stationnementMin: '1,5 case / logement',
      },
      articlesLies: ['4.2.1', '4.2.2'],
      updatedAt: '2026-08-01',
    },
    {
      id: 'h3', code: 'H-3', categorie: 'residentiel',
      nom: 'Habitation multifamiliale',
      description: "Secteurs de plus forte densité résidentielle, généralement à proximité des axes de transport et des services.",
      usagesPermis: ['Habitation multifamiliale (4 logements et plus)', 'Résidence pour aînés'],
      usagesComplementaires: ['Salle communautaire', 'Stationnement souterrain'],
      usagesProhibes: ['Industrie', 'Commerce lourd'],
      normes: {
        margeAvantMin: 4, margeLateraleMin: 3, margeArriereMin: 7,
        hauteurMax: 18, etagesMax: 5, tauxImplantationMax: 45,
        densiteMax: '75 logements / hectare', superficieTerrainMin: 1000,
        largeurTerrainMin: 20, stationnementMin: '1,25 case / logement',
      },
      articlesLies: ['4.2.1', '4.2.3'],
      updatedAt: '2026-08-01',
    },
    {
      id: 'c1', code: 'C-1', categorie: 'commercial',
      nom: 'Commerce de proximité',
      description: "Petit commerce de desserte locale, compatible avec le voisinage résidentiel.",
      usagesPermis: ['Dépanneur', 'Salon de coiffure', 'Restaurant sans service au volant', 'Clinique professionnelle'],
      usagesComplementaires: ['Terrasse extérieure', 'Logement au 2e étage'],
      usagesProhibes: ['Industrie', 'Entreposage extérieur', 'Commerce avec service au volant'],
      normes: {
        margeAvantMin: 3, margeLateraleMin: 0, margeArriereMin: 6,
        hauteurMax: 11, etagesMax: 2, tauxImplantationMax: 60,
        densiteMax: 'N/A', superficieTerrainMin: 300,
        largeurTerrainMin: 12, stationnementMin: '1 case / 30 m² de plancher',
      },
      articlesLies: ['4.3.1', '4.5.2'],
      updatedAt: '2026-08-01',
    },
    {
      id: 'c2', code: 'C-2', categorie: 'commercial',
      nom: 'Commerce artériel et de service',
      description: "Commerce de plus grande envergure localisé le long des artères principales.",
      usagesPermis: ['Commerce de détail', 'Restaurant avec service au volant', 'Concessionnaire automobile', 'Hôtel'],
      usagesComplementaires: ['Enseigne sur poteau', 'Aire de chargement'],
      usagesProhibes: ['Habitation (sauf logement du gardien)', 'Industrie lourde'],
      normes: {
        margeAvantMin: 7, margeLateraleMin: 3, margeArriereMin: 7,
        hauteurMax: 14, etagesMax: 3, tauxImplantationMax: 50,
        densiteMax: 'N/A', superficieTerrainMin: 900,
        largeurTerrainMin: 25, stationnementMin: '1 case / 25 m² de plancher',
      },
      articlesLies: ['4.3.1', '4.3.2'],
      updatedAt: '2026-08-01',
    },
    {
      id: 'i1', code: 'I-1', categorie: 'industriel',
      nom: 'Industrie légère',
      description: "Activités de fabrication, transformation ou entreposage à faibles nuisances.",
      usagesPermis: ['Atelier de fabrication', 'Entrepôt', 'Centre de distribution'],
      usagesComplementaires: ['Bureau administratif accessoire', 'Aire d\'entreposage extérieur clôturée'],
      usagesProhibes: ['Habitation', 'Commerce de détail', 'Industrie lourde et polluante'],
      normes: {
        margeAvantMin: 9, margeLateraleMin: 4.5, margeArriereMin: 9,
        hauteurMax: 15, etagesMax: 2, tauxImplantationMax: 60,
        densiteMax: 'N/A', superficieTerrainMin: 1500,
        largeurTerrainMin: 30, stationnementMin: '1 case / 100 m² de plancher',
      },
      articlesLies: ['4.4.1'],
      updatedAt: '2026-08-01',
    },
    {
      id: 'a1', code: 'A-1', categorie: 'agricole',
      nom: 'Agricole',
      description: "Territoire agricole désigné, principalement dédié aux activités agricoles conformément à la loi sur la protection du territoire agricole.",
      usagesPermis: ['Culture', 'Élevage', 'Résidence de l\'exploitant agricole'],
      usagesComplementaires: ['Kiosque de vente à la ferme', 'Agrotourisme'],
      usagesProhibes: ['Habitation non liée à l\'exploitation agricole', 'Industrie', 'Commerce de détail non agricole'],
      normes: {
        margeAvantMin: 15, margeLateraleMin: 10, margeArriereMin: 15,
        hauteurMax: 12, etagesMax: 2, tauxImplantationMax: 15,
        densiteMax: '1 résidence / exploitation', superficieTerrainMin: 40000,
        largeurTerrainMin: 100, stationnementMin: 'Selon usage',
      },
      articlesLies: ['4.6.1'],
      updatedAt: '2026-08-01',
    },
    {
      id: 'p1', code: 'P-1', categorie: 'publique',
      nom: 'Publique et institutionnelle',
      description: "Équipements collectifs : écoles, bâtiments municipaux, lieux de culte, installations de santé.",
      usagesPermis: ['École', 'Bâtiment municipal', 'Lieu de culte', 'Centre communautaire'],
      usagesComplementaires: ['Terrain de jeu', 'Stationnement public'],
      usagesProhibes: ['Industrie', 'Commerce de détail'],
      normes: {
        margeAvantMin: 6, margeLateraleMin: 3, margeArriereMin: 6,
        hauteurMax: 16, etagesMax: 4, tauxImplantationMax: 50,
        densiteMax: 'N/A', superficieTerrainMin: 1000,
        largeurTerrainMin: 20, stationnementMin: 'Selon usage',
      },
      articlesLies: ['4.7.1'],
      updatedAt: '2026-08-01',
    },
    {
      id: 'rec1', code: 'REC-1', categorie: 'recreation',
      nom: 'Récréative et conservation',
      description: "Parcs, espaces verts, milieux naturels et corridors récréatifs protégés.",
      usagesPermis: ['Parc public', 'Sentier récréatif', 'Conservation du milieu naturel'],
      usagesComplementaires: ['Chalet de service', 'Aire de pique-nique'],
      usagesProhibes: ['Habitation', 'Commerce', 'Industrie'],
      normes: {
        margeAvantMin: 8, margeLateraleMin: 5, margeArriereMin: 8,
        hauteurMax: 8, etagesMax: 1, tauxImplantationMax: 10,
        densiteMax: 'N/A', superficieTerrainMin: 'N/A',
        largeurTerrainMin: 'N/A', stationnementMin: 'Selon usage',
      },
      articlesLies: ['4.8.1'],
      updatedAt: '2026-08-01',
    },
  ],
  articles: [
    { id: '4.2.1', chapitre: 'Chapitre 4 – Dispositions relatives au zonage', titre: 'Marges de recul applicables aux zones résidentielles', texte: "Dans toutes les zones de la famille « H », les marges avant, latérales et arrière minimales sont celles prescrites à la grille des spécifications de la zone applicable. Un empiètement de 0,6 m est toléré pour les avant-toits, corniches et perrons non fermés." },
    { id: '4.2.2', chapitre: 'Chapitre 4 – Dispositions relatives au zonage', titre: 'Hauteur des bâtiments résidentiels', texte: "La hauteur d'un bâtiment principal est mesurée à partir du niveau moyen du sol adjacent jusqu'au point le plus élevé de la toiture, à l'exclusion des cheminées et antennes." },
    { id: '4.2.3', chapitre: 'Chapitre 4 – Dispositions relatives au zonage', titre: 'Densité en zone multifamiliale', texte: "La densité maximale autorisée dans les zones « H-3 » est exprimée en nombre de logements par hectare de terrain brut, incluant les voies de circulation internes au projet." },
    { id: '4.3.1', chapitre: 'Chapitre 4 – Dispositions relatives au zonage', titre: 'Affichage commercial', texte: "Toute enseigne commerciale doit être conforme au règlement sur l'affichage en vigueur et ne peut excéder la superficie maximale prescrite pour la zone." },
    { id: '4.3.2', chapitre: 'Chapitre 4 – Dispositions relatives au zonage', titre: 'Aires de chargement', texte: "Une aire de chargement doit être aménagée à l'arrière ou sur le côté du bâtiment et ne doit pas être visible depuis la voie publique." },
    { id: '4.4.1', chapitre: 'Chapitre 4 – Dispositions relatives au zonage', titre: 'Entreposage extérieur en zone industrielle', texte: "L'entreposage extérieur est autorisé uniquement s'il est entièrement clôturé et écranté par un aménagement paysager conforme aux dispositions du chapitre 6." },
    { id: '4.5.1', chapitre: 'Chapitre 4 – Dispositions relatives au zonage', titre: 'Usages domestiques', texte: "Un usage domestique (bureau à domicile, garderie en milieu familial) est autorisé en zone résidentielle à condition de demeurer accessoire à l'usage résidentiel principal." },
    { id: '4.5.2', chapitre: 'Chapitre 4 – Dispositions relatives au zonage', titre: 'Terrasses extérieures', texte: "Une terrasse extérieure commerciale est autorisée en cour avant à condition de respecter un dégagement minimal de 1,5 m par rapport à l'emprise de rue." },
    { id: '4.6.1', chapitre: 'Chapitre 4 – Dispositions relatives au zonage', titre: 'Résidence de l\'exploitant agricole', texte: "Une seule résidence unifamiliale liée et nécessaire à l'exploitation agricole est autorisée par exploitation, conformément aux dispositions de la loi sur la protection du territoire agricole." },
    { id: '4.7.1', chapitre: 'Chapitre 4 – Dispositions relatives au zonage', titre: 'Implantation des équipements publics', texte: "L'implantation d'un équipement public ou institutionnel doit faire l'objet d'une intégration architecturale et paysagère avec le milieu environnant." },
    { id: '4.8.1', chapitre: 'Chapitre 4 – Dispositions relatives au zonage', titre: 'Protection des milieux naturels', texte: "Toute intervention en zone « REC » à l'intérieur d'une bande de protection riveraine doit être conforme à la politique de protection des rives, du littoral et des plaines inondables." },
  ],
  adresses: [
    { id: 1, adresse: '123, rue Saint-Pierre', lot: '1 234 567', zoneId: 'h1' },
    { id: 2, adresse: '456, boulevard des Seigneurs', lot: '2 345 678', zoneId: 'c2' },
    { id: 3, adresse: '789, montée Masson', lot: '3 456 789', zoneId: 'a1' },
    { id: 4, adresse: '1200, rue des Pins', lot: '4 567 890', zoneId: 'h3' },
    { id: 5, adresse: '55, rue de l\'Industrie', lot: '5 678 901', zoneId: 'i1' },
    { id: 6, adresse: '10, rue de l\'École', lot: '6 789 012', zoneId: 'p1' },
  ],
};

const NORME_LABELS = {
  margeAvantMin: 'Marge avant min. (m)',
  margeLateraleMin: 'Marge latérale min. (m)',
  margeArriereMin: 'Marge arrière min. (m)',
  hauteurMax: 'Hauteur max. (m)',
  etagesMax: 'Nombre d\'étages max.',
  tauxImplantationMax: 'Taux d\'implantation max. (%)',
  densiteMax: 'Densité max.',
  superficieTerrainMin: 'Superficie de terrain min. (m²)',
  largeurTerrainMin: 'Largeur de terrain min. (m)',
  stationnementMin: 'Stationnement min.',
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Impossible de lire les données locales, retour aux données d\'exemple.', e);
  }
  return clone(SEED_DATA);
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function slugify(str) {
  return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function categoryById(id) {
  return CATEGORIES.find((c) => c.id === id);
}

function zoneById(id) {
  return state.data.zones.find((z) => z.id === id);
}

function articleById(id) {
  return state.data.articles.find((a) => a.id === id);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function linesToArray(text) {
  return text.split('\n').map((s) => s.trim()).filter(Boolean);
}

const state = {
  data: loadData(),
  isAdmin: false,
  activeCategory: null,
  searchQuery: '',
};

/* ------------------------- Navigation ------------------------- */

function initNav() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
      document.getElementById(`view-${btn.dataset.view}`).classList.add('active');
    });
  });

  document.querySelectorAll('.tab-btn:not(.logout)').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

/* ------------------------- Modal helper ------------------------- */

function openModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  document.getElementById('modalContent').innerHTML = '';
}

document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') closeModal();
});

/* ------------------------- Vue publique ------------------------- */

function renderCategoryFilters() {
  const el = document.getElementById('categoryFilters');
  const chips = [`<button type="button" class="chip ${state.activeCategory === null ? 'active' : ''}" data-cat="">Toutes les zones</button>`]
    .concat(CATEGORIES.map((c) => `<button type="button" class="chip ${state.activeCategory === c.id ? 'active' : ''}" data-cat="${c.id}" style="--chip-color:${c.couleur}">${escapeHtml(c.nom)}</button>`));
  el.innerHTML = chips.join('');
  el.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.activeCategory = chip.dataset.cat || null;
      renderCategoryFilters();
      renderZoneGrid();
    });
  });
}

function matchingZonesForQuery(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const addressMatch = state.data.adresses.find((a) =>
    a.adresse.toLowerCase().includes(q) || a.lot.toLowerCase().includes(q));
  if (addressMatch) return { zoneIds: [addressMatch.zoneId], addressMatch };
  const zoneIds = state.data.zones
    .filter((z) => z.code.toLowerCase().includes(q) || z.nom.toLowerCase().includes(q))
    .map((z) => z.id);
  return { zoneIds, addressMatch: null };
}

function renderZoneGrid() {
  const grid = document.getElementById('zoneGrid');
  const info = document.getElementById('publicResultInfo');
  let zones = state.data.zones;

  if (state.activeCategory) {
    zones = zones.filter((z) => z.categorie === state.activeCategory);
  }

  let addressNote = '';
  const searchResult = matchingZonesForQuery(state.searchQuery);
  if (searchResult) {
    zones = zones.filter((z) => searchResult.zoneIds.includes(z.id));
    if (searchResult.addressMatch) {
      const z = zoneById(searchResult.addressMatch.zoneId);
      addressNote = `« ${escapeHtml(searchResult.addressMatch.adresse)} » (lot ${escapeHtml(searchResult.addressMatch.lot)}) se trouve dans la zone ${z ? escapeHtml(z.code) : '?'}.`;
    }
  }

  info.textContent = addressNote || (zones.length ? `${zones.length} zone(s) affichée(s).` : 'Aucune zone ne correspond à la recherche.');

  grid.innerHTML = zones.map((z) => {
    const cat = categoryById(z.categorie);
    return `
      <article class="zone-card" data-zone="${z.id}">
        <div class="zone-card-bar" style="background:${cat ? cat.couleur : '#999'}"></div>
        <div class="zone-card-body">
          <div class="zone-card-head">
            <span class="zone-code">${escapeHtml(z.code)}</span>
            <span class="zone-cat" style="color:${cat ? cat.couleur : '#999'}">${cat ? escapeHtml(cat.nom) : ''}</span>
          </div>
          <h3>${escapeHtml(z.nom)}</h3>
          <p class="zone-desc">${escapeHtml(z.description)}</p>
          <button type="button" class="btn btn-secondary btn-sm view-zone-btn" data-zone="${z.id}">Voir le détail</button>
        </div>
      </article>`;
  }).join('') || '<p class="empty-state">Aucune zone à afficher.</p>';

  grid.querySelectorAll('.view-zone-btn').forEach((btn) => {
    btn.addEventListener('click', () => showZoneDetail(btn.dataset.zone));
  });
}

function normesTableHtml(normes) {
  return `<table class="normes-table">
    <tbody>
      ${Object.keys(NORME_LABELS).map((key) => `<tr><th>${NORME_LABELS[key]}</th><td>${escapeHtml(normes[key])}</td></tr>`).join('')}
    </tbody>
  </table>`;
}

function showZoneDetail(zoneId) {
  const z = zoneById(zoneId);
  if (!z) return;
  const cat = categoryById(z.categorie);
  const articles = (z.articlesLies || []).map(articleById).filter(Boolean);

  openModal(`
    <button type="button" class="modal-close" aria-label="Fermer">&times;</button>
    <div class="zone-detail">
      <div class="zone-card-head">
        <span class="zone-code">${escapeHtml(z.code)}</span>
        <span class="zone-cat" style="color:${cat ? cat.couleur : '#999'}">${cat ? escapeHtml(cat.nom) : ''}</span>
      </div>
      <h2>${escapeHtml(z.nom)}</h2>
      <p>${escapeHtml(z.description)}</p>

      <h3>Usages permis</h3>
      <ul>${z.usagesPermis.map((u) => `<li>${escapeHtml(u)}</li>`).join('') || '<li class="muted">Aucun</li>'}</ul>

      <h3>Usages complémentaires</h3>
      <ul>${z.usagesComplementaires.map((u) => `<li>${escapeHtml(u)}</li>`).join('') || '<li class="muted">Aucun</li>'}</ul>

      <h3>Usages prohibés</h3>
      <ul>${z.usagesProhibes.map((u) => `<li>${escapeHtml(u)}</li>`).join('') || '<li class="muted">Aucun</li>'}</ul>

      <h3>Grille des normes</h3>
      ${normesTableHtml(z.normes)}

      ${articles.length ? `<h3>Articles réglementaires liés</h3>
      <div class="linked-articles">
        ${articles.map((a) => `<div class="article-card"><strong>Art. ${escapeHtml(a.id)}</strong> — ${escapeHtml(a.titre)}<p>${escapeHtml(a.texte)}</p></div>`).join('')}
      </div>` : ''}

      <p class="meta-note">Dernière modification : ${escapeHtml(z.updatedAt)}</p>
    </div>
  `);
  document.querySelector('.modal-close').addEventListener('click', closeModal);
}

/* ------------------------- Administration : gate ------------------------- */

function initAdminGate() {
  const loginBtn = document.getElementById('adminLoginBtn');
  const passwordInput = document.getElementById('adminPassword');
  const errorEl = document.getElementById('adminLoginError');

  function tryLogin() {
    if (passwordInput.value === ADMIN_DEMO_PASSWORD) {
      state.isAdmin = true;
      document.getElementById('adminGate').classList.add('hidden');
      document.getElementById('adminPanel').classList.remove('hidden');
      errorEl.textContent = '';
      renderAdmin();
    } else {
      errorEl.textContent = 'Mot de passe incorrect (démonstration).';
    }
  }

  loginBtn.addEventListener('click', tryLogin);
  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tryLogin();
  });

  document.getElementById('adminLogoutBtn').addEventListener('click', () => {
    state.isAdmin = false;
    passwordInput.value = '';
    document.getElementById('adminGate').classList.remove('hidden');
    document.getElementById('adminPanel').classList.add('hidden');
  });
}

/* ------------------------- Administration : zones ------------------------- */

function renderZonesTable() {
  const tbody = document.getElementById('zonesTableBody');
  tbody.innerHTML = state.data.zones.map((z) => {
    const cat = categoryById(z.categorie);
    return `<tr>
      <td>${escapeHtml(z.code)}</td>
      <td>${escapeHtml(z.nom)}</td>
      <td><span class="cat-dot" style="background:${cat ? cat.couleur : '#999'}"></span>${cat ? escapeHtml(cat.nom) : ''}</td>
      <td>${escapeHtml(z.updatedAt)}</td>
      <td class="actions-cell">
        <button type="button" class="btn btn-sm btn-secondary edit-zone-btn" data-id="${z.id}">Modifier</button>
        <button type="button" class="btn btn-sm btn-danger delete-zone-btn" data-id="${z.id}">Supprimer</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="empty-state">Aucune zone.</td></tr>';

  tbody.querySelectorAll('.edit-zone-btn').forEach((b) => b.addEventListener('click', () => openZoneForm(zoneById(b.dataset.id))));
  tbody.querySelectorAll('.delete-zone-btn').forEach((b) => b.addEventListener('click', () => deleteZone(b.dataset.id)));
}

function deleteZone(id) {
  const z = zoneById(id);
  if (!z) return;
  if (!confirm(`Supprimer la zone ${z.code} — ${z.nom} ? Cette action est irréversible.`)) return;
  state.data.zones = state.data.zones.filter((zone) => zone.id !== id);
  saveData();
  renderZonesTable();
  renderZoneGrid();
}

function openZoneForm(zone) {
  const isNew = !zone;
  const z = zone ? clone(zone) : {
    id: '', code: '', categorie: CATEGORIES[0].id, nom: '', description: '',
    usagesPermis: [], usagesComplementaires: [], usagesProhibes: [],
    normes: { margeAvantMin: '', margeLateraleMin: '', margeArriereMin: '', hauteurMax: '', etagesMax: '', tauxImplantationMax: '', densiteMax: '', superficieTerrainMin: '', largeurTerrainMin: '', stationnementMin: '' },
    articlesLies: [], updatedAt: todayISO(),
  };

  openModal(`
    <button type="button" class="modal-close" aria-label="Fermer">&times;</button>
    <h2>${isNew ? 'Nouvelle zone' : `Modifier la zone ${escapeHtml(z.code)}`}</h2>
    <form id="zoneForm" class="stacked-form">
      <div class="form-row">
        <div class="form-group">
          <label for="zCode">Code de zone <span class="required">*</span></label>
          <input id="zCode" required value="${escapeHtml(z.code)}" placeholder="ex. H-1" />
        </div>
        <div class="form-group">
          <label for="zCategorie">Catégorie <span class="required">*</span></label>
          <select id="zCategorie">
            ${CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === z.categorie ? 'selected' : ''}>${escapeHtml(c.nom)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group full-width">
        <label for="zNom">Nom de la zone <span class="required">*</span></label>
        <input id="zNom" required value="${escapeHtml(z.nom)}" />
      </div>
      <div class="form-group full-width">
        <label for="zDescription">Description</label>
        <textarea id="zDescription" rows="2">${escapeHtml(z.description)}</textarea>
      </div>

      <div class="form-row">
        <div class="form-group full-width">
          <label for="zUsagesPermis">Usages permis (un par ligne)</label>
          <textarea id="zUsagesPermis" rows="3">${escapeHtml(z.usagesPermis.join('\n'))}</textarea>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group full-width">
          <label for="zUsagesComplementaires">Usages complémentaires (un par ligne)</label>
          <textarea id="zUsagesComplementaires" rows="2">${escapeHtml(z.usagesComplementaires.join('\n'))}</textarea>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group full-width">
          <label for="zUsagesProhibes">Usages prohibés (un par ligne)</label>
          <textarea id="zUsagesProhibes" rows="2">${escapeHtml(z.usagesProhibes.join('\n'))}</textarea>
        </div>
      </div>

      <h3>Grille des normes</h3>
      <div class="form-row normes-grid">
        ${Object.keys(NORME_LABELS).map((key) => `
          <div class="form-group">
            <label for="n_${key}">${NORME_LABELS[key]}</label>
            <input id="n_${key}" value="${escapeHtml(z.normes[key])}" />
          </div>`).join('')}
      </div>

      <div class="form-group full-width">
        <label for="zArticles">Articles réglementaires liés (numéros séparés par des virgules)</label>
        <input id="zArticles" value="${escapeHtml((z.articlesLies || []).join(', '))}" placeholder="ex. 4.2.1, 4.2.2" />
      </div>

      <span class="error-msg" id="zoneFormError"></span>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="zoneFormCancel">Annuler</button>
        <button type="submit" class="btn btn-primary">${isNew ? 'Créer la zone' : 'Enregistrer'}</button>
      </div>
    </form>
  `);

  document.querySelector('.modal-close').addEventListener('click', closeModal);
  document.getElementById('zoneFormCancel').addEventListener('click', closeModal);
  document.getElementById('zoneForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = document.getElementById('zCode').value.trim();
    const nom = document.getElementById('zNom').value.trim();
    if (!code || !nom) {
      document.getElementById('zoneFormError').textContent = 'Le code et le nom de la zone sont obligatoires.';
      return;
    }
    const id = isNew ? (slugify(code) || `zone-${Date.now()}`) : z.id;
    if (isNew && zoneById(id)) {
      document.getElementById('zoneFormError').textContent = 'Une zone avec un code équivalent existe déjà.';
      return;
    }
    const normes = {};
    Object.keys(NORME_LABELS).forEach((key) => {
      normes[key] = document.getElementById(`n_${key}`).value.trim();
    });
    const updated = {
      id, code, nom,
      categorie: document.getElementById('zCategorie').value,
      description: document.getElementById('zDescription').value.trim(),
      usagesPermis: linesToArray(document.getElementById('zUsagesPermis').value),
      usagesComplementaires: linesToArray(document.getElementById('zUsagesComplementaires').value),
      usagesProhibes: linesToArray(document.getElementById('zUsagesProhibes').value),
      normes,
      articlesLies: document.getElementById('zArticles').value.split(',').map((s) => s.trim()).filter(Boolean),
      updatedAt: todayISO(),
    };
    if (isNew) {
      state.data.zones.push(updated);
    } else {
      const idx = state.data.zones.findIndex((zone) => zone.id === z.id);
      state.data.zones[idx] = updated;
    }
    saveData();
    closeModal();
    renderZonesTable();
    renderZoneGrid();
  });
}

/* ------------------------- Administration : adresses ------------------------- */

function renderAdressesTable() {
  const tbody = document.getElementById('adressesTableBody');
  tbody.innerHTML = state.data.adresses.map((a) => {
    const z = zoneById(a.zoneId);
    return `<tr>
      <td>${escapeHtml(a.adresse)}</td>
      <td>${escapeHtml(a.lot)}</td>
      <td>${z ? escapeHtml(z.code) : '<span class="muted">Zone introuvable</span>'}</td>
      <td class="actions-cell">
        <button type="button" class="btn btn-sm btn-secondary edit-adresse-btn" data-id="${a.id}">Modifier</button>
        <button type="button" class="btn btn-sm btn-danger delete-adresse-btn" data-id="${a.id}">Supprimer</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" class="empty-state">Aucune entrée.</td></tr>';

  tbody.querySelectorAll('.edit-adresse-btn').forEach((b) => b.addEventListener('click', () => openAdresseForm(state.data.adresses.find((a) => String(a.id) === b.dataset.id))));
  tbody.querySelectorAll('.delete-adresse-btn').forEach((b) => b.addEventListener('click', () => deleteAdresse(b.dataset.id)));
}

function deleteAdresse(id) {
  if (!confirm('Supprimer cette entrée adresse/lot ?')) return;
  state.data.adresses = state.data.adresses.filter((a) => String(a.id) !== String(id));
  saveData();
  renderAdressesTable();
}

function openAdresseForm(adresse) {
  const isNew = !adresse;
  const a = adresse ? clone(adresse) : { id: Date.now(), adresse: '', lot: '', zoneId: state.data.zones[0] ? state.data.zones[0].id : '' };

  openModal(`
    <button type="button" class="modal-close" aria-label="Fermer">&times;</button>
    <h2>${isNew ? 'Nouvelle adresse / lot' : 'Modifier l\'entrée'}</h2>
    <form id="adresseForm" class="stacked-form">
      <div class="form-group full-width">
        <label for="aAdresse">Adresse <span class="required">*</span></label>
        <input id="aAdresse" required value="${escapeHtml(a.adresse)}" placeholder="ex. 123, rue Saint-Pierre" />
      </div>
      <div class="form-group full-width">
        <label for="aLot">Numéro de lot <span class="required">*</span></label>
        <input id="aLot" required value="${escapeHtml(a.lot)}" placeholder="ex. 1 234 567" />
      </div>
      <div class="form-group full-width">
        <label for="aZone">Zone <span class="required">*</span></label>
        <select id="aZone">
          ${state.data.zones.map((z) => `<option value="${z.id}" ${z.id === a.zoneId ? 'selected' : ''}>${escapeHtml(z.code)} — ${escapeHtml(z.nom)}</option>`).join('')}
        </select>
      </div>
      <span class="error-msg" id="adresseFormError"></span>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="adresseFormCancel">Annuler</button>
        <button type="submit" class="btn btn-primary">${isNew ? 'Créer' : 'Enregistrer'}</button>
      </div>
    </form>
  `);

  document.querySelector('.modal-close').addEventListener('click', closeModal);
  document.getElementById('adresseFormCancel').addEventListener('click', closeModal);
  document.getElementById('adresseForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const adresseVal = document.getElementById('aAdresse').value.trim();
    const lotVal = document.getElementById('aLot').value.trim();
    if (!adresseVal || !lotVal) {
      document.getElementById('adresseFormError').textContent = 'L\'adresse et le numéro de lot sont obligatoires.';
      return;
    }
    const updated = { id: a.id, adresse: adresseVal, lot: lotVal, zoneId: document.getElementById('aZone').value };
    if (isNew) {
      state.data.adresses.push(updated);
    } else {
      const idx = state.data.adresses.findIndex((x) => x.id === a.id);
      state.data.adresses[idx] = updated;
    }
    saveData();
    closeModal();
    renderAdressesTable();
  });
}

/* ------------------------- Administration : articles ------------------------- */

function renderArticlesList() {
  const el = document.getElementById('articlesList');
  el.innerHTML = state.data.articles.map((a) => `
    <div class="article-card admin-article">
      <div class="article-card-head">
        <strong>Art. ${escapeHtml(a.id)}</strong>
        <div class="actions-cell">
          <button type="button" class="btn btn-sm btn-secondary edit-article-btn" data-id="${a.id}">Modifier</button>
          <button type="button" class="btn btn-sm btn-danger delete-article-btn" data-id="${a.id}">Supprimer</button>
        </div>
      </div>
      <p class="chapitre">${escapeHtml(a.chapitre)}</p>
      <h4>${escapeHtml(a.titre)}</h4>
      <p>${escapeHtml(a.texte)}</p>
    </div>
  `).join('') || '<p class="empty-state">Aucun article.</p>';

  el.querySelectorAll('.edit-article-btn').forEach((b) => b.addEventListener('click', () => openArticleForm(articleById(b.dataset.id))));
  el.querySelectorAll('.delete-article-btn').forEach((b) => b.addEventListener('click', () => deleteArticle(b.dataset.id)));
}

function deleteArticle(id) {
  if (!confirm(`Supprimer l'article ${id} ?`)) return;
  state.data.articles = state.data.articles.filter((a) => a.id !== id);
  state.data.zones.forEach((z) => {
    z.articlesLies = (z.articlesLies || []).filter((aid) => aid !== id);
  });
  saveData();
  renderArticlesList();
}

function openArticleForm(article) {
  const isNew = !article;
  const a = article ? clone(article) : { id: '', chapitre: 'Chapitre 4 – Dispositions relatives au zonage', titre: '', texte: '' };

  openModal(`
    <button type="button" class="modal-close" aria-label="Fermer">&times;</button>
    <h2>${isNew ? 'Nouvel article' : `Modifier l'article ${escapeHtml(a.id)}`}</h2>
    <form id="articleForm" class="stacked-form">
      <div class="form-row">
        <div class="form-group">
          <label for="artId">Numéro d'article <span class="required">*</span></label>
          <input id="artId" required value="${escapeHtml(a.id)}" placeholder="ex. 4.9.1" ${isNew ? '' : 'readonly'} />
        </div>
        <div class="form-group">
          <label for="artChapitre">Chapitre</label>
          <input id="artChapitre" value="${escapeHtml(a.chapitre)}" />
        </div>
      </div>
      <div class="form-group full-width">
        <label for="artTitre">Titre <span class="required">*</span></label>
        <input id="artTitre" required value="${escapeHtml(a.titre)}" />
      </div>
      <div class="form-group full-width">
        <label for="artTexte">Texte de l'article <span class="required">*</span></label>
        <textarea id="artTexte" rows="5" required>${escapeHtml(a.texte)}</textarea>
      </div>
      <span class="error-msg" id="articleFormError"></span>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="articleFormCancel">Annuler</button>
        <button type="submit" class="btn btn-primary">${isNew ? 'Créer' : 'Enregistrer'}</button>
      </div>
    </form>
  `);

  document.querySelector('.modal-close').addEventListener('click', closeModal);
  document.getElementById('articleFormCancel').addEventListener('click', closeModal);
  document.getElementById('articleForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('artId').value.trim();
    const titre = document.getElementById('artTitre').value.trim();
    const texte = document.getElementById('artTexte').value.trim();
    if (!id || !titre || !texte) {
      document.getElementById('articleFormError').textContent = 'Le numéro, le titre et le texte sont obligatoires.';
      return;
    }
    if (isNew && articleById(id)) {
      document.getElementById('articleFormError').textContent = 'Un article avec ce numéro existe déjà.';
      return;
    }
    const updated = { id, chapitre: document.getElementById('artChapitre').value.trim(), titre, texte };
    if (isNew) {
      state.data.articles.push(updated);
    } else {
      const idx = state.data.articles.findIndex((x) => x.id === a.id);
      state.data.articles[idx] = updated;
    }
    saveData();
    closeModal();
    renderArticlesList();
  });
}

/* ------------------------- Administration : import / export ------------------------- */

function initIO() {
  const exportBtn = document.getElementById('exportBtn');
  exportBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    exportBtn.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });

  document.getElementById('importInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const msgEl = document.getElementById('ioMessage');
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.zones)) {
          throw new Error('Le fichier doit contenir au minimum un tableau "zones".');
        }
        if (!confirm('Remplacer toutes les données actuelles par le contenu de ce fichier ?')) return;
        state.data = {
          meta: parsed.meta || { reglementNumero: 'Importé', dateMiseAJour: todayISO() },
          zones: parsed.zones || [],
          articles: parsed.articles || [],
          adresses: parsed.adresses || [],
        };
        saveData();
        renderAll();
        msgEl.style.color = 'var(--success)';
        msgEl.textContent = 'Importation réussie.';
      } catch (err) {
        msgEl.style.color = 'var(--danger)';
        msgEl.textContent = `Erreur d'importation : ${err.message}`;
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('resetDataBtn').addEventListener('click', () => {
    if (!confirm('Réinitialiser toutes les données aux exemples de démonstration ? Les modifications seront perdues.')) return;
    state.data = clone(SEED_DATA);
    saveData();
    renderAll();
  });

  document.getElementById('schemaExample').textContent = JSON.stringify({
    meta: { reglementNumero: '...', dateMiseAJour: 'AAAA-MM-JJ' },
    zones: [{ id: 'h1', code: 'H-1', categorie: 'residentiel', nom: '...', description: '...', usagesPermis: [], usagesComplementaires: [], usagesProhibes: [], normes: { margeAvantMin: 0 }, articlesLies: ['4.2.1'], updatedAt: 'AAAA-MM-JJ' }],
    articles: [{ id: '4.2.1', chapitre: '...', titre: '...', texte: '...' }],
    adresses: [{ id: 1, adresse: '...', lot: '...', zoneId: 'h1' }],
  }, null, 2);
}

/* ------------------------- Recherche publique ------------------------- */

function initPublicSearch() {
  document.getElementById('publicSearch').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderZoneGrid();
  });
}

/* ------------------------- Render / init ------------------------- */

function renderAdmin() {
  renderZonesTable();
  renderAdressesTable();
  renderArticlesList();
}

function renderAll() {
  document.getElementById('reglementNumero').textContent = state.data.meta.reglementNumero;
  renderCategoryFilters();
  renderZoneGrid();
  if (state.isAdmin) renderAdmin();
}

document.getElementById('addZoneBtn').addEventListener('click', () => openZoneForm(null));
document.getElementById('addAdresseBtn').addEventListener('click', () => openAdresseForm(null));
document.getElementById('addArticleBtn').addEventListener('click', () => openArticleForm(null));

initNav();
initAdminGate();
initIO();
initPublicSearch();
renderAll();
