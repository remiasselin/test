# Inscriptions aux loisirs — Ville de Terrebonne

Application web complète de gestion des inscriptions aux activités d'un service des loisirs :
catalogue public, comptes famille, inscriptions avec liste d'attente, paiement (simulé),
et console d'administration pour le personnel.

**Aucune dépendance npm** : Node.js ≥ 22.13 (SQLite intégré via `node:sqlite`).

## Démarrage

```bash
cd loisirs
npm start            # http://localhost:3000
npm test             # 13 tests d'intégration de l'API
```

Au premier démarrage, une base de démonstration est créée (`data/loisirs.db`) avec trois comptes
(mot de passe : `Demo-Loisirs-2026`) :

| Compte                  | Rôle       |
|-------------------------|------------|
| `parent@loisirs.demo`   | Citoyen (famille avec 2 enfants, tarif résident) |
| `visiteur@loisirs.demo` | Citoyen non résident |
| `agent@loisirs.demo`    | Personnel |
| `admin@loisirs.demo`    | Administrateur |

Variables d'environnement : `PORT` (3000), `DB_PATH`, `COOKIE_SECURE=1` (derrière HTTPS), `NODE_ENV=production`
(désactive les données de démo ; créez alors un administrateur : `npm run create-admin -- courriel motdepasse`).

## Fonctionnalités

**Citoyens**
- Catalogue filtrable (session, catégorie, jour, âge, mot-clé, places disponibles) et fiche détaillée
- Compte famille : titulaire + participants (enfants, conjoint…), notes de santé
- Inscription avec contrôles automatiques : période d'inscription, âge au début de l'activité,
  doublon, **conflit d'horaire** du participant, capacité
- **Liste d'attente** automatique si l'activité est complète, avec promotion dans l'ordre d'arrivée
  dès qu'une place se libère (annulation, hausse de capacité) et notification
- Tarif résident / non-résident, paiement groupé, reçus, annulation avec remboursement
  (intégral jusqu'à 7 jours avant le début)
- Notifications dans l'application

**Personnel / administrateurs**
- Tableau de bord : inscriptions, revenus nets, montants à percevoir, taux de remplissage, répartition par catégorie
- Gestion des activités (brouillon → publiée → annulée), des sessions et de leurs périodes d'inscription
- Liste des participants par activité : export **CSV** (compatible Excel), impression, notes de santé
- Inscription au comptoir (hors période d'inscription), paiement au comptoir, confirmation manuelle depuis l'attente
- Annulation d'une activité : toutes les inscriptions sont annulées, remboursées et les familles avisées
- Gestion des usagers : validation du statut de résident, rôles (administrateur seulement)
- Journal d'audit des opérations sensibles (table `audit_log`)

## Architecture

```
loisirs/
  server/   constants · db (schéma SQLite, transactions) · auth · validate · services (règles métier) · app (API + statique) · seed · cli
  public/   index.html · styles.css · core.js · views-public.js · views-admin.js · app.js   (SPA sans build, routes #/…)
  test/     tests d'intégration (serveur réel, horloge injectée)
```

Les règles métier sont concentrées dans `server/services.js` et exécutées en transaction
(`BEGIN IMMEDIATE`) ; l'unicité d'une inscription active par participant est aussi garantie par un index SQL.

## Sécurité

- Mots de passe hachés avec scrypt ; sessions par jeton aléatoire (seul son hash est stocké), cookie `HttpOnly` + `SameSite=Lax`
- Limitation des tentatives de connexion ; réponse indistincte pour compte inconnu / mauvais mot de passe
- Corps JSON obligatoire sur les écritures, validation serveur de toutes les entrées, requêtes SQL paramétrées
- Contrôle d'accès par rôle côté serveur ; un citoyen ne voit et n'inscrit que sa propre famille
- CSP stricte (`default-src 'self'`, aucun script/style en ligne), gabarits HTML auto-échappés (XSS)
- Export CSV protégé contre l'injection de formules

## Limites connues avant une mise en production

- **Paiement simulé** : aucune passerelle réelle (à brancher dans `payRegistrations`).
- **Courriels non envoyés** : les notifications sont internes à l'application (point d'extension : `notify`).
- **Résidence** déduite de la ville déclarée ; le personnel valide ensuite la preuve de résidence (page Usagers).
- Pas de réinitialisation de mot de passe par courriel ni d'authentification multifacteur.
- Une seule instance Node (SQLite) ; HTTPS à assurer via un proxy inverse (`COOKIE_SECURE=1`).
- Interface en français seulement.
