import { hashPassword } from './auth.js';
import { addDays, todayStr, isResidentCity } from './services.js';
import { tx } from './db.js';

export const DEMO_PASSWORD = 'Demo-Loisirs-2026';

export function createUser(db, { email, password, role = 'citizen', first_name, last_name, birth_date, phone = null, address = null, city = 'Terrebonne', postal_code = null }) {
  const info = db.prepare(
    `INSERT INTO users(email, password_hash, role, first_name, last_name, phone, address, city, postal_code, resident)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(email.toLowerCase(), hashPassword(password), role, first_name, last_name, phone, address, city, postal_code, isResidentCity(city) ? 1 : 0);
  const id = Number(info.lastInsertRowid);
  if (birth_date) {
    db.prepare('INSERT INTO members(user_id, first_name, last_name, birth_date, is_self) VALUES (?,?,?,?,1)').run(id, first_name, last_name, birth_date);
  }
  return id;
}

/** Jeu de données de démonstration, dates calculées à partir d'aujourd'hui. */
export function seedDemo(ctx) {
  const { db } = ctx;
  const today = todayStr(ctx);
  return tx(db, () => {
    createUser(db, { email: 'admin@loisirs.demo', password: DEMO_PASSWORD, role: 'admin', first_name: 'Alexandre', last_name: 'Tremblay', birth_date: '1980-04-12' });
    createUser(db, { email: 'agent@loisirs.demo', password: DEMO_PASSWORD, role: 'staff', first_name: 'Sophie', last_name: 'Gagnon', birth_date: '1990-09-30' });
    const parent = createUser(db, {
      email: 'parent@loisirs.demo', password: DEMO_PASSWORD, first_name: 'Marie', last_name: 'Lavoie', birth_date: '1985-06-18',
      phone: '450 555-0142', address: '123, rue Exemple', postal_code: 'J6W 1A1',
    });
    db.prepare('INSERT INTO members(user_id, first_name, last_name, birth_date, health_notes) VALUES (?,?,?,?,?)').run(parent, 'Léa', 'Lavoie', '2016-03-02', 'Allergie aux arachides');
    db.prepare('INSERT INTO members(user_id, first_name, last_name, birth_date) VALUES (?,?,?,?)').run(parent, 'Noah', 'Lavoie', '2019-11-20');
    createUser(db, { email: 'visiteur@loisirs.demo', password: DEMO_PASSWORD, first_name: 'Paul', last_name: 'Bergeron', birth_date: '1975-01-05', city: 'Mascouche', phone: '450 555-0199' });

    const season = (name, start, end, open, close) =>
      Number(db.prepare('INSERT INTO seasons(name,start_date,end_date,registration_open,registration_close) VALUES (?,?,?,?,?)')
        .run(name, start, end, open, close).lastInsertRowid);
    const current = season('Session en cours — inscriptions ouvertes', addDays(today, 21), addDays(today, 21 + 77), addDays(today, -10), addDays(today, 18));
    const next = season('Prochaine session — inscriptions à venir', addDays(today, 120), addDays(today, 120 + 77), addDays(today, 60), addDays(today, 110));
    season('Session terminée', addDays(today, -120), addDays(today, -40), addDays(today, -150), addDays(today, -125));

    const act = (s, a) => db.prepare(
      `INSERT INTO activities(season_id,title,description,category,location,instructor,age_min,age_max,capacity,price_resident,price_nonresident,weekday,start_time,end_time,start_date,end_date,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'published')`,
    ).run(s, a.title, a.description, a.category, a.location, a.instructor ?? null, a.age_min ?? null, a.age_max ?? null, a.capacity,
      a.price, Math.round(a.price * 1.5), a.weekday, a.start, a.end, s === current ? addDays(today, 21) : addDays(today, 120), s === current ? addDays(today, 21 + 77) : addDays(today, 120 + 77));

    const list = [
      { title: 'Natation — Jeunes nageurs (niveau 1)', description: 'Initiation à l’eau : flottaison, respiration et premières propulsions en petits groupes.', category: 'aquatique', location: 'Centre aquatique', instructor: 'Camille Roy', age_min: 5, age_max: 8, capacity: 12, price: 7500, weekday: 6, start: '09:00', end: '09:45' },
      { title: 'Natation — Jeunes nageurs (niveau 2)', description: 'Perfectionnement du crawl et du dos crawlé.', category: 'aquatique', location: 'Centre aquatique', instructor: 'Camille Roy', age_min: 7, age_max: 10, capacity: 12, price: 7500, weekday: 6, start: '09:30', end: '10:15' },
      { title: 'Aquaforme 50 ans et plus', description: 'Entraînement cardio doux en piscine, sans impact sur les articulations.', category: 'aquatique', location: 'Centre aquatique', instructor: 'Louise Pelletier', age_min: 50, capacity: 20, price: 6500, weekday: 2, start: '10:00', end: '11:00' },
      { title: 'Hockey mineur — Initiation', description: 'Patinage, maniement du bâton et mini-matchs. Équipement obligatoire.', category: 'sport', location: 'Aréna municipal', instructor: 'Marc-André Dion', age_min: 6, age_max: 9, capacity: 16, price: 12000, weekday: 7, start: '08:30', end: '09:30' },
      { title: 'Soccer intérieur récréatif', description: 'Parties amicales en gymnase, tous niveaux.', category: 'sport', location: 'Complexe sportif', age_min: 13, capacity: 24, price: 4500, weekday: 4, start: '19:00', end: '20:30' },
      { title: 'Pickleball — Débutant', description: 'Apprenez les règles et les techniques de base de ce sport en pleine croissance.', category: 'sport', location: 'Complexe sportif', instructor: 'Yves Charbonneau', age_min: 16, capacity: 16, price: 5500, weekday: 3, start: '18:30', end: '20:00' },
      { title: 'Yoga doux', description: 'Respiration, étirements et relaxation. Apportez votre tapis.', category: 'bienetre', location: 'Centre communautaire', instructor: 'Isabelle Morin', age_min: 16, capacity: 18, price: 6000, weekday: 1, start: '18:30', end: '19:30' },
      { title: 'Danse créative', description: 'Mouvement, rythme et expression pour les tout-petits.', category: 'arts', location: 'Centre communautaire', instructor: 'Valérie Cyr', age_min: 4, age_max: 6, capacity: 12, price: 6000, weekday: 6, start: '10:00', end: '10:45' },
      { title: 'Arts plastiques — Peinture acrylique', description: 'Techniques de base et projets guidés. Matériel inclus.', category: 'arts', location: 'Maison de la culture', instructor: 'Hélène Fortin', age_min: 12, capacity: 14, price: 9500, weekday: 5, start: '13:00', end: '15:00' },
      { title: 'Cuisine santé pour ados', description: 'Préparer des repas simples, équilibrés et savoureux.', category: 'jeunesse', location: 'Centre communautaire', instructor: 'Chef Dominic Lépine', age_min: 12, age_max: 17, capacity: 10, price: 8500, weekday: 3, start: '17:00', end: '18:30' },
      { title: 'Marche nordique', description: 'Sorties encadrées dans les parcs de la ville. Bâtons fournis.', category: 'plein_air', location: 'Parc de la Coulée', instructor: 'Jean-François Bédard', age_min: 18, capacity: 15, price: 4000, weekday: 4, start: '09:30', end: '10:30' },
      { title: 'Club de robotique junior', description: 'Construction et programmation de robots LEGO.', category: 'jeunesse', location: 'Bibliothèque', instructor: 'Karim Haddad', age_min: 8, age_max: 12, capacity: 8, price: 9000, weekday: 2, start: '16:30', end: '18:00' },
    ];
    for (const a of list) act(current, a);
    act(next, { title: 'Natation — Jeunes nageurs (niveau 1)', description: 'Initiation à l’eau en petits groupes.', category: 'aquatique', location: 'Centre aquatique', instructor: 'Camille Roy', age_min: 5, age_max: 8, capacity: 12, price: 7500, weekday: 6, start: '09:00', end: '09:45' });
    return { parent };
  });
}

export function countUsers(db) { return db.prepare('SELECT COUNT(*) AS n FROM users').get().n; }
