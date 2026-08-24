# Développement économique — Ville de Terrebonne

Application web interne pour la gestion du service du développement économique :
suivi des dossiers (aides financières, permis, accompagnements, implantations...),
répertoire des entreprises, gestion multi-utilisateur avec rôles, et rapports de
gestion avec indicateurs et export CSV.

## Fonctionnalités

- **Authentification multi-utilisateur** par session, avec 3 rôles :
  - **Administrateur** : accès complet, gestion des comptes utilisateurs.
  - **Gestionnaire** : création/modification des dossiers et entreprises, ajout de
    notes de suivi.
  - **Lecteur** : consultation seule (dossiers, entreprises, rapports).
- **Module de gestion** :
  - Dossiers de développement économique (numérotés automatiquement, ex. `DE-2026-0001`)
    avec type, statut, priorité, montants demandé/accordé, échéances et suivi
    (journal de notes horodaté).
  - Répertoire d'entreprises (secteur d'activité, statut, coordonnées, nombre
    d'employés, dossiers liés).
- **Rapports de gestion** :
  - Tableau de bord avec indicateurs clés (dossiers actifs, montants accordés,
    taux d'approbation, dossiers en retard, entreprises suivies).
  - Graphiques (répartition par statut, évolution mensuelle, montants par type,
    entreprises/dossiers par secteur).
  - Filtrage par période et export CSV (dossiers, entreprises).
- Interface moderne, responsive, en français.

## Démarrage

```bash
npm install
npm start
```

Le serveur démarre sur `http://localhost:3000` (configurable via `PORT`). Au
premier démarrage, la base de données SQLite est créée automatiquement dans
`data/` et pré-remplie avec des données de démonstration.

### Comptes de démonstration

| Rôle           | Courriel                       | Mot de passe   |
|----------------|---------------------------------|----------------|
| Administrateur | admin@terrebonne.qc.ca          | Admin2026!     |
| Gestionnaire   | mtremblay@terrebonne.qc.ca      | Gestion2026!   |
| Gestionnaire   | slavoie@terrebonne.qc.ca        | Gestion2026!   |
| Lecteur        | proy@terrebonne.qc.ca           | Lecture2026!   |

## Configuration

Copiez `.env.example` vers `.env` et ajustez au besoin :

```
PORT=3000
SESSION_SECRET=change-this-to-a-long-random-string-in-production
NODE_ENV=production
```

**Important** : `SESSION_SECRET` doit être remplacé par une valeur aléatoire et
secrète avant tout déploiement réel.

## Architecture technique

- **Backend** : Node.js / Express, base de données SQLite (`better-sqlite3`),
  sessions via `express-session`, mots de passe hachés avec `bcryptjs`,
  en-têtes de sécurité via `helmet`, limitation de débit sur la connexion.
- **Frontend** : application monopage en JavaScript natif (modules ES), sans
  framework ni étape de compilation. Graphiques via Chart.js (fourni localement
  dans `public/js/vendor/`, aucune dépendance externe au chargement).
- **Structure** :
  ```
  src/
    server.js          Point d'entrée Express
    db.js               Schéma SQLite
    seed.js              Données de démonstration
    middleware/auth.js   Authentification / autorisation par rôle
    routes/               Routes API (auth, dossiers, entreprises, users, reports)
  public/
    index.html
    css/style.css
    js/                  Logique frontend (routeur, vues, appels API)
  ```

## Scripts

- `npm start` — démarre le serveur.
- `npm run dev` — démarre le serveur avec rechargement automatique (`node --watch`).
- `npm run seed` — réinitialise/ajoute les données de démonstration (n'a d'effet
  que si la base est vide).
