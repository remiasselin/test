# Employee Management API

API REST de gestion des arrivées et des départs des employés. Elle reçoit
les données du système RH (arrivée, mise à jour, départ) et synchronise
automatiquement les comptes correspondants dans Active Directory via LDAP.

## Fonctionnement général

```
Système RH ──POST/PATCH/DELETE──▶  API REST  ──persiste──▶  SQLite (source de vérité RH)
                                        │
                                        └──synchronise──▶  Active Directory (LDAP/LDAPS)
```

Principe important : **une panne de l'annuaire Active Directory ne doit
jamais faire perdre une donnée RH**. Chaque écriture est d'abord persistée
en base de données, puis la synchronisation vers Active Directory est
tentée. En cas d'échec (contrôleur de domaine injoignable, par exemple),
l'employé est marqué `sync_failed` (ou `terminated_sync_failed` pour un
départ), l'erreur est journalisée, et l'opération peut être rejouée via
l'endpoint `/resync` une fois l'incident résolu.

## Démarrage rapide

```bash
npm install
cp .env.example .env   # adapter les valeurs, notamment API_KEYS et LDAP_*
npm start               # démarre l'API sur le port 3000
npm test                # exécute la suite de tests (node:test)
```

Par défaut, `LDAP_MODE=dry-run` : l'API fonctionne normalement (base de
données, validations, API REST) mais **simule** les opérations LDAP au lieu
de contacter un contrôleur de domaine. C'est le mode recommandé pour le
développement local ou tant qu'aucun contrôleur de domaine n'est
accessible. Passer `LDAP_MODE=live` pour une synchronisation réelle.

## Authentification

Toutes les routes sous `/api/v1/employees` exigent un en-tête
`X-API-Key` correspondant à l'une des clés définies dans `API_KEYS`
(liste séparée par des virgules). Le système RH doit transmettre cette clé
à chaque appel.

## Endpoints REST

| Méthode | Route                                | Description |
|---------|---------------------------------------|--------------|
| GET     | `/health`                             | État de l'API, de la base et du mode LDAP (aucune authentification requise) |
| POST    | `/api/v1/employees`                   | Arrivée d'un employé : crée l'enregistrement et provisionne le compte AD |
| GET     | `/api/v1/employees`                   | Liste des employés (`?status=active\|sync_failed\|terminated\|terminated_sync_failed`) |
| GET     | `/api/v1/employees/:employeeId`       | Détail d'un employé |
| PATCH   | `/api/v1/employees/:employeeId`       | Mise à jour RH (poste, service, courriel, gestionnaire...) |
| POST    | `/api/v1/employees/:employeeId/depart`| Départ d'un employé : désactive le compte AD |
| POST    | `/api/v1/employees/:employeeId/resync`| Rejoue la synchronisation AD après un échec |
| GET     | `/api/v1/employees/:employeeId/sync-logs` | Historique des tentatives de synchronisation AD |

### Exemple — arrivée d'un employé

```bash
curl -X POST http://localhost:3000/api/v1/employees \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{
    "employeeId": "E12345",
    "firstName": "Marie",
    "lastName": "Dupont",
    "email": "marie.dupont@example.local",
    "department": "Ventes",
    "title": "Chargée de compte",
    "managerEmployeeId": "E00099",
    "officeLocation": "Montréal",
    "hireDate": "2026-09-01"
  }'
```

Réponse (201) :

```json
{
  "employee": { "employeeId": "E12345", "status": "active", "...": "..." },
  "sync": { "status": "ok" },
  "ldap": {
    "dn": "CN=Marie Dupont,OU=Employes,DC=example,DC=local",
    "samAccountName": "mdupont",
    "userPrincipalName": "mdupont@example.local",
    "temporaryPassword": "T9!qLp2xRw4mYb1c",
    "simulated": false
  }
}
```

Le mot de passe temporaire n'est retourné qu'une seule fois, à la création
du compte ; le changement de mot de passe est exigé à la première
connexion (`pwdLastSet=0`). Il appartient à l'appelant (système RH ou
processus d'accueil) de le transmettre de façon sécurisée au nouvel
employé — il n'est jamais journalisé ni stocké en base.

### Exemple — départ d'un employé

```bash
curl -X POST http://localhost:3000/api/v1/employees/E12345/depart \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{ "departureDate": "2026-08-25", "reason": "démission" }'
```

Le compte AD est désactivé (`userAccountControl`), une description
horodatée du départ est ajoutée, et le compte est déplacé vers l'UO de
quarantaine (`LDAP_DISABLED_OU`) si celle-ci est configurée.

## Intégration Active Directory

La synchronisation LDAP (`src/services/ldapService.js`) suit les
contraintes propres à Active Directory :

- **Connexion chiffrée (LDAPS)** : requise pour la définition du mot de
  passe (`unicodePwd`). `LDAP_URL` doit pointer vers le port 636.
- **Création en deux temps** : le compte est d'abord créé désactivé
  (`userAccountControl=514`), puis le mot de passe est défini, puis le
  compte est activé — c'est l'ordre imposé par AD.
- **Attribut `employeeID`** : utilisé comme clé de correspondance entre la
  fiche RH et le compte AD (attribut standard du schéma, aucune extension
  requise).
- **Unicité** : le `sAMAccountName` (dérivé de l'initiale du prénom + nom
  de famille) et le DN sont vérifiés par recherche avant création ; un
  suffixe numérique est ajouté en cas de collision.
- **Départ** : désactivation du compte + déplacement optionnel vers une UO
  de quarantaine (`LDAP_DISABLED_OU`).

Toutes les opérations réseau passent par un client injectable
(`clientFactory`), ce qui permet de tester la logique métier sans
contrôleur de domaine réel (voir `test/helpers/fakeLdapClient.js`).

## Modèle de données

**employees** : identité RH (`employeeId`, nom, courriel, poste, service,
gestionnaire...), statut de cycle de vie
(`pending` → `active` | `sync_failed` → `terminated` | `terminated_sync_failed`),
et informations AD (`ldap_dn`, `sam_account_name`).

**sync_logs** : historique horodaté de chaque tentative de synchronisation
(`create`, `update`, `disable`) avec son statut (`success`/`failed`/`skipped`)
et le message d'erreur le cas échéant — utile pour le diagnostic et l'audit.

## Configuration (`.env`)

Voir `.env.example` pour la liste complète des variables (port, clés
d'API, chemin de la base SQLite, paramètres LDAP). Ne jamais committer un
fichier `.env` contenant des secrets réels.

## Structure du projet

```
src/
  app.js                 assemblage de l'application Express (injectable pour les tests)
  server.js               point d'entrée HTTP
  config.js                lecture de la configuration (.env)
  db.js                     schéma et connexion SQLite
  logger.js                 journalisation minimale
  errors.js                  erreurs métier typées (Validation/NotFound/Conflict)
  middleware/
    apiKeyAuth.js            authentification par clé d'API
    errorHandler.js          gestion centralisée des erreurs
  routes/
    employees.js             routes REST arrivée/mise à jour/départ/resynchronisation
    health.js                 sonde de santé
  services/
    employeeService.js        orchestration persistance + synchronisation AD
    ldapService.js             opérations Active Directory (ldapjs)
  validation/
    employeeSchema.js          validation des payloads entrants
test/                          tests node:test (service LDAP, service métier, API HTTP)
```
