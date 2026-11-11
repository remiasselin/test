import { openDb } from './db.js';
import { seedDemo, createUser, countUsers, DEMO_PASSWORD } from './seed.js';
import { DB_PATH } from './config.js';
import { rules as R } from './validate.js';

const [cmd, ...args] = process.argv.slice(2);
const db = openDb(DB_PATH);
const ctx = { db, now: () => new Date() };

if (cmd === 'seed-demo') {
  if (countUsers(db) > 0) { console.error('La base contient déjà des données. Supprimez le fichier de base de données pour réinitialiser.'); process.exit(1); }
  seedDemo(ctx);
  console.log(`Données de démonstration créées. Comptes : admin@loisirs.demo, agent@loisirs.demo, parent@loisirs.demo (mot de passe : ${DEMO_PASSWORD})`);
} else if (cmd === 'create-admin') {
  const [email, password, first = 'Administrateur', last = 'Loisirs'] = args;
  try {
    createUser(db, { email: R.email()(email), password: R.password()(password), role: 'admin', first_name: first, last_name: last });
    console.log(`Administrateur ${email} créé.`);
  } catch (e) {
    console.error('Usage : npm run create-admin -- <courriel> <mot de passe (10+ caractères)> [prénom] [nom]\n', e.message);
    process.exit(1);
  }
} else {
  console.error('Commandes : seed-demo | create-admin <courriel> <mot de passe>');
  process.exit(1);
}
