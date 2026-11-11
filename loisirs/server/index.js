import { openDb } from './db.js';
import { createApp } from './app.js';
import { seedDemo, countUsers, DEMO_PASSWORD } from './seed.js';
import { DB_PATH, PORT } from './config.js';

const db = openDb(DB_PATH);
const secure = process.env.COOKIE_SECURE === '1';
const { server, ctx } = createApp({ db, secureCookies: secure });

if (countUsers(db) === 0) {
  if (process.env.NODE_ENV === 'production') {
    console.warn('Base vide : créez un administrateur avec « npm run create-admin -- courriel motdepasse ».');
  } else {
    seedDemo(ctx);
    console.log(`Base vide : données de démonstration créées.\n  admin@loisirs.demo / agent@loisirs.demo / parent@loisirs.demo — mot de passe : ${DEMO_PASSWORD}`);
  }
}

server.listen(PORT, () => console.log(`Loisirs Terrebonne — http://localhost:${PORT}`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => { db.close(); process.exit(0); }));
