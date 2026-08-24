'use strict';

const bcrypt = require('bcryptjs');
const db = require('./db');

function hash(pwd) {
  return bcrypt.hashSync(pwd, 10);
}

const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;

if (userCount === 0) {
  console.log('Seed: creation des utilisateurs de demonstration...');

  const insertUser = db.prepare(
    `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`
  );

  const users = [
    ['Julie Bergeron', 'admin@terrebonne.qc.ca', hash('Admin2026!'), 'admin'],
    ['Marc-Andre Tremblay', 'mtremblay@terrebonne.qc.ca', hash('Gestion2026!'), 'gestionnaire'],
    ['Sophie Lavoie', 'slavoie@terrebonne.qc.ca', hash('Gestion2026!'), 'gestionnaire'],
    ['Philippe Roy', 'proy@terrebonne.qc.ca', hash('Lecture2026!'), 'lecteur'],
  ];

  const userIds = {};
  for (const [name, email, password_hash, role] of users) {
    const info = insertUser.run(name, email, password_hash, role);
    userIds[email] = info.lastInsertRowid;
  }

  console.log('Seed: creation des entreprises de demonstration...');

  const insertEntreprise = db.prepare(`
    INSERT INTO entreprises (nom, secteur, adresse, telephone, courriel, site_web, nb_employes, statut, notes, created_by)
    VALUES (@nom, @secteur, @adresse, @telephone, @courriel, @site_web, @nb_employes, @statut, @notes, @created_by)
  `);

  const entreprises = [
    { nom: 'Fabrication Metallique Terrebonne inc.', secteur: 'Manufacturier', adresse: '1250 boul. des Seigneurs, Terrebonne', telephone: '450-471-1000', courriel: 'info@fmterrebonne.ca', site_web: 'https://fmterrebonne.ca', nb_employes: 85, statut: 'actif', notes: 'Entreprise etablie depuis 1998, exportatrice.', created_by: userIds['mtremblay@terrebonne.qc.ca'] },
    { nom: 'Technologies Lachenaie', secteur: 'Technologique', adresse: '500 rue de l\'Innovation, Lachenaie', telephone: '450-471-2000', courriel: 'contact@technolachenaie.com', site_web: 'https://technolachenaie.com', nb_employes: 32, statut: 'actif', notes: 'Startup en croissance, developpement logiciel.', created_by: userIds['mtremblay@terrebonne.qc.ca'] },
    { nom: 'Ferme Agro-Terrebonne', secteur: 'Agricole', adresse: '3400 montee Masson, Terrebonne', telephone: '450-471-3000', courriel: 'ferme@agroterrebonne.qc.ca', site_web: '', nb_employes: 14, statut: 'actif', notes: 'Production maraichere, vente directe.', created_by: userIds['slavoie@terrebonne.qc.ca'] },
    { nom: 'Boulangerie Artisanale du Vieux-Terrebonne', secteur: 'Commercial', adresse: '867 rue Sainte-Marie, Terrebonne', telephone: '450-471-4000', courriel: 'info@boulangerievt.ca', site_web: '', nb_employes: 8, statut: 'actif', notes: 'Commerce du secteur patrimonial, forte affluence touristique.', created_by: userIds['slavoie@terrebonne.qc.ca'] },
    { nom: 'Groupe Immobilier des Moulins', secteur: 'Immobilier', adresse: '2100 chemin Saint-Charles, Terrebonne', telephone: '450-471-5000', courriel: 'projets@gimoulins.ca', site_web: 'https://gimoulins.ca', nb_employes: 21, statut: 'actif', notes: 'Developpeur de plusieurs projets commerciaux dans la ville.', created_by: userIds['mtremblay@terrebonne.qc.ca'] },
    { nom: 'Solutions Logistiques Terrebonne', secteur: 'Services', adresse: '4500 boul. Moody, Terrebonne', telephone: '450-471-6000', courriel: 'info@slterrebonne.ca', site_web: '', nb_employes: 47, statut: 'actif', notes: 'Centre de distribution regional.', created_by: userIds['slavoie@terrebonne.qc.ca'] },
    { nom: 'Auberge des Moulins', secteur: 'Tourisme', adresse: '950 rue Saint-Louis, Terrebonne', telephone: '450-471-7000', courriel: 'reservation@aubergedesmoulins.ca', site_web: 'https://aubergedesmoulins.ca', nb_employes: 19, statut: 'actif', notes: 'Hebergement touristique, ile des Moulins.', created_by: userIds['mtremblay@terrebonne.qc.ca'] },
    { nom: 'Usinage Precision des Moulins', secteur: 'Manufacturier', adresse: '1800 rue Guillemette, Terrebonne', telephone: '450-471-8000', courriel: 'ventes@upmoulins.ca', site_web: '', nb_employes: 26, statut: 'prospect', notes: 'Projet de relocalisation depuis Repentigny, en discussion.', created_by: userIds['slavoie@terrebonne.qc.ca'] },
    { nom: 'Cafe-Bistro La Place Publique', secteur: 'Commercial', adresse: '300 rue Saint-Pierre, Terrebonne', telephone: '450-471-9000', courriel: 'bonjour@laplacepublique.ca', site_web: '', nb_employes: 11, statut: 'actif', notes: '', created_by: userIds['slavoie@terrebonne.qc.ca'] },
    { nom: 'Nova Biotech Terrebonne', secteur: 'Technologique', adresse: '6200 boul. de la Pinière, Terrebonne', telephone: '450-471-1100', courriel: 'info@novabiotech.ca', site_web: 'https://novabiotech.ca', nb_employes: 15, statut: 'prospect', notes: 'Projet d\'implantation d\'un laboratoire de recherche.', created_by: userIds['mtremblay@terrebonne.qc.ca'] },
    { nom: 'Transport Rive-Nord', secteur: 'Services', adresse: '7100 rue Angora, Terrebonne', telephone: '450-471-1200', courriel: 'admin@transportrn.ca', site_web: '', nb_employes: 58, statut: 'actif', notes: '', created_by: userIds['mtremblay@terrebonne.qc.ca'] },
    { nom: 'Serres Horticoles des Moulins', secteur: 'Agricole', adresse: '2900 montee Masson, Terrebonne', telephone: '450-471-1300', courriel: 'info@serresmoulins.ca', site_web: '', nb_employes: 22, statut: 'inactif', notes: 'Fermeture temporaire, reprise prevue en 2027.', created_by: userIds['slavoie@terrebonne.qc.ca'] },
  ];

  const entrepriseIds = [];
  for (const e of entreprises) {
    const info = insertEntreprise.run(e);
    entrepriseIds.push(info.lastInsertRowid);
  }

  console.log('Seed: creation des dossiers de developpement economique...');

  const insertDossier = db.prepare(`
    INSERT INTO dossiers (numero, titre, type, entreprise_id, responsable_id, statut, priorite,
      montant_demande, montant_accorde, date_ouverture, date_echeance, description, created_by)
    VALUES (@numero, @titre, @type, @entreprise_id, @responsable_id, @statut, @priorite,
      @montant_demande, @montant_accorde, @date_ouverture, @date_echeance, @description, @created_by)
  `);

  const types = ['Aide financiere', 'Accompagnement', 'Permis et certificats', 'Implantation', 'Expansion', 'Relocalisation'];
  const statuts = ['nouveau', 'en_analyse', 'en_cours', 'approuve', 'refuse', 'complete'];
  const priorites = ['basse', 'normale', 'haute', 'urgente'];
  const responsables = [userIds['mtremblay@terrebonne.qc.ca'], userIds['slavoie@terrebonne.qc.ca']];

  const titres = [
    'Programme d\'aide a la modernisation industrielle',
    'Subvention pour l\'embauche locale',
    'Accompagnement au demarrage d\'entreprise',
    'Demande de permis d\'affichage commercial',
    'Projet d\'expansion des installations',
    'Relocalisation vers le parc industriel',
    'Aide financiere - efficacite energetique',
    'Accompagnement en exportation',
    'Certificat de conformite environnementale',
    'Programme Renovation commerces locaux',
    'Aide au developpement numerique',
    'Implantation - nouveau site de production',
    'Soutien a la releve entrepreneuriale',
    'Subvention amenagement paysager commercial',
    'Programme d\'attraction d\'investissements',
    'Accompagnement stratégique post-pandemie',
    'Demande de credit de taxes foncieres',
    'Aide a la formation de la main-d\'oeuvre',
    'Certificat d\'usage conditionnel',
    'Projet d\'agrandissement d\'entrepot',
  ];

  let seq = 1;
  const year = new Date().getFullYear();
  const dossierIds = [];

  for (let i = 0; i < titres.length; i++) {
    const statut = statuts[i % statuts.length];
    const montant_demande = Math.round((5000 + Math.random() * 95000) / 500) * 500;
    const montant_accorde = (statut === 'approuve' || statut === 'complete')
      ? Math.round(montant_demande * (0.6 + Math.random() * 0.4) / 500) * 500
      : (statut === 'refuse' ? 0 : 0);

    const openMonthsAgo = Math.floor(Math.random() * 11);
    const openDate = new Date();
    openDate.setMonth(openDate.getMonth() - openMonthsAgo);
    const dueDate = new Date(openDate);
    dueDate.setMonth(dueDate.getMonth() + 3 + Math.floor(Math.random() * 6));

    const numero = `DE-${year}-${String(seq).padStart(4, '0')}`;
    seq += 1;

    const info = insertDossier.run({
      numero,
      titre: titres[i],
      type: types[i % types.length],
      entreprise_id: entrepriseIds[i % entrepriseIds.length],
      responsable_id: responsables[i % responsables.length],
      statut,
      priorite: priorites[i % priorites.length],
      montant_demande,
      montant_accorde,
      date_ouverture: openDate.toISOString().slice(0, 10),
      date_echeance: dueDate.toISOString().slice(0, 10),
      description: `Dossier de type "${types[i % types.length]}" pour le suivi et la gestion du developpement economique local.`,
      created_by: responsables[i % responsables.length],
    });
    dossierIds.push(info.lastInsertRowid);
  }

  console.log('Seed: ajout de notes de suivi...');
  const insertSuivi = db.prepare(
    `INSERT INTO suivis (dossier_id, user_id, note, created_at) VALUES (?, ?, ?, ?)`
  );

  const notesTemplates = [
    'Dossier ouvert et documents recus.',
    'Appel effectue avec le representant de l\'entreprise.',
    'Analyse en cours par le comite de developpement.',
    'Visite sur place effectuee, rapport a suivre.',
    'Documents complementaires demandes.',
    'Decision transmise a l\'entreprise.',
  ];

  for (const dossierId of dossierIds) {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let j = 0; j < n; j++) {
      const note = notesTemplates[Math.floor(Math.random() * notesTemplates.length)];
      const user = responsables[Math.floor(Math.random() * responsables.length)];
      insertSuivi.run(dossierId, user, note, new Date().toISOString());
    }
  }

  console.log('Seed terminee avec succes.');
  console.log('');
  console.log('Comptes de demonstration:');
  console.log('  Administrateur : admin@terrebonne.qc.ca / Admin2026!');
  console.log('  Gestionnaire   : mtremblay@terrebonne.qc.ca / Gestion2026!');
  console.log('  Gestionnaire   : slavoie@terrebonne.qc.ca / Gestion2026!');
  console.log('  Lecteur        : proy@terrebonne.qc.ca / Lecture2026!');
} else {
  console.log('Seed: des donnees existent deja, aucune action effectuee.');
}
