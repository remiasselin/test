import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, activityByTitle } from './helpers.js';

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

const signup = (over = {}) => ({
  email: 'nouveau@example.com', password: 'motdepasse-solide', first_name: 'Nina', last_name: 'Roy',
  birth_date: '1992-02-02', phone: '450 555-0100', city: 'Terrebonne', postal_code: 'j6w1a1', ...over,
});

test('catalogue public : filtres et places restantes', async () => {
  const c = app.client();
  const all = (await c.get('/api/activities')).data;
  assert.ok(all.length >= 12);
  assert.ok(all.every((a) => a.status === 'published'));
  const yoga = (await c.get('/api/activities?q=yoga')).data;
  assert.equal(yoga.length, 1);
  assert.equal(yoga[0].spots_left, yoga[0].capacity);
  assert.equal(yoga[0].registration_state, 'open');
  const age7 = (await c.get('/api/activities?age=7&season_id=1')).data;
  assert.ok(age7.some((a) => a.title.startsWith('Natation — Jeunes nageurs (niveau 2)')));
  assert.ok(!age7.some((a) => a.title.startsWith('Yoga')));
  const future = (await c.get('/api/activities?season_id=2')).data;
  assert.equal(future[0].registration_state, 'not_yet');
  // un caractère % n'est pas un joker
  assert.equal((await c.get('/api/activities?q=%25')).data.length, 0);
});

test('inscription de compte : validation, résidence, cookie HttpOnly', async () => {
  const c = app.client();
  const bad = await c.post('/api/auth/register', signup({ password: 'court', email: 'x' }));
  assert.equal(bad.status, 422);
  assert.ok(bad.data.fields.password && bad.data.fields.email);

  const ok = await c.post('/api/auth/register', signup());
  assert.equal(ok.status, 201);
  assert.equal(ok.data.user.resident, true);
  assert.equal(ok.data.user.postal_code, 'J6W 1A1');
  assert.match(ok.headers.get('set-cookie'), /HttpOnly/);
  assert.match(ok.headers.get('set-cookie'), /SameSite=Lax/);
  assert.equal(JSON.stringify(ok.data).includes('password'), false);

  const me = await c.get('/api/me');
  assert.equal(me.data.user.email, 'nouveau@example.com');
  const members = (await c.get('/api/members')).data;
  assert.equal(members.length, 1);
  assert.equal(members[0].is_self, 1);

  assert.equal((await app.client().post('/api/auth/register', signup())).status, 409);
  const nonRes = await app.client().post('/api/auth/register', signup({ email: 'autre@example.com', city: 'Laval' }));
  assert.equal(nonRes.data.user.resident, false);
});

test('connexion : mauvais mot de passe, limitation des tentatives, déconnexion', async () => {
  const c = app.client();
  assert.equal((await c.post('/api/auth/login', { email: 'parent@loisirs.demo', password: 'faux-faux-faux' })).status, 401);
  assert.equal((await c.post('/api/auth/login', { email: 'inconnu@loisirs.demo', password: 'faux-faux-faux' })).status, 401);
  const victim = app.client(); // adresse dédiée : ne pas verrouiller les comptes des autres tests
  for (let i = 0; i < 8; i++) await victim.post('/api/auth/login', { email: 'verrou@example.com', password: 'mauvais-mauvais' });
  assert.equal((await victim.post('/api/auth/login', { email: 'verrou@example.com', password: 'mauvais-mauvais' })).status, 429);
  await c.login('parent@loisirs.demo');
  assert.equal((await c.get('/api/me')).data.user.role, 'citizen');
  await c.post('/api/auth/logout');
  assert.equal((await c.get('/api/me')).data.user, null);
});

test('autorisations : anonymes et citoyens sont refusés sur les routes protégées', async () => {
  const anon = app.client();
  assert.equal((await anon.get('/api/members')).status, 401);
  assert.equal((await anon.get('/api/admin/dashboard')).status, 401);
  const citizen = app.client();
  await citizen.login('parent@loisirs.demo');
  assert.equal((await citizen.get('/api/admin/dashboard')).status, 403);
  assert.equal((await citizen.post('/api/admin/activities', {})).status, 403);
  const staff = app.client();
  await staff.login('agent@loisirs.demo');
  assert.equal((await staff.get('/api/admin/dashboard')).status, 200);
  assert.equal((await staff.del('/api/admin/activities/1')).status, 403); // suppression : admin seulement
  assert.equal((await staff.put('/api/admin/users/3', { resident: 1, role: 'admin' })).status, 403);
  // le corps non JSON est refusé
  const r = await citizen.raw('POST', '/api/registrations', undefined, { 'Content-Type': 'text/plain' });
  assert.ok([415, 422].includes(r.status));
});

test('inscription : prix résident, doublon, âge, isolation entre familles', async () => {
  const parent = app.client();
  await parent.login('parent@loisirs.demo');
  const members = (await parent.get('/api/members')).data;
  const lea = members.find((m) => m.first_name === 'Léa'); // 10 ans
  const noah = members.find((m) => m.first_name === 'Noah'); // 7 ans
  const niv2 = await activityByTitle(parent, 'Natation — Jeunes nageurs (niveau 2)', 1);

  const r1 = await parent.post('/api/registrations', { activity_id: niv2.id, member_id: lea.id });
  assert.equal(r1.status, 201);
  assert.equal(r1.data.status, 'confirmed');
  assert.equal(r1.data.price_cents, niv2.price_resident);

  assert.equal((await parent.post('/api/registrations', { activity_id: niv2.id, member_id: lea.id })).status, 409);
  // Noah (6 ans au début de la session... 2019-11-20 → 7 ans) : OK pour niveau 2 (7-10)
  const rNoah = await parent.post('/api/registrations', { activity_id: niv2.id, member_id: noah.id });
  assert.equal(rNoah.status, 201);
  // Yoga : 16 ans et plus → Léa refusée
  const yoga = await activityByTitle(parent, 'Yoga', 1);
  const tooYoung = await parent.post('/api/registrations', { activity_id: yoga.id, member_id: lea.id });
  assert.equal(tooYoung.status, 409);
  assert.match(tooYoung.data.error, /Âge minimum/);

  // un autre citoyen ne peut pas inscrire les enfants de quelqu'un d'autre
  const other = app.client();
  await other.login('visiteur@loisirs.demo');
  assert.equal((await other.post('/api/registrations', { activity_id: yoga.id, member_id: lea.id })).status, 404);
  // non-résident : tarif majoré
  const self = (await other.get('/api/members')).data[0];
  const rVisitor = await other.post('/api/registrations', { activity_id: yoga.id, member_id: self.id });
  assert.equal(rVisitor.data.price_cents, yoga.price_nonresident);
  assert.ok(yoga.price_nonresident > yoga.price_resident);
});

test('conflit d’horaire pour un même participant', async () => {
  const c = app.client();
  await c.login('visiteur@loisirs.demo');
  const self = (await c.get('/api/members')).data[0];
  // Pickleball (mercredi 18:30–20:00) vs Cuisine ados (mercredi 17:00–18:30) : pas de chevauchement
  const pickle = await activityByTitle(c, 'Pickleball', 1);
  assert.equal((await c.post('/api/registrations', { activity_id: pickle.id, member_id: self.id })).status, 201);
  // Créer via l'API admin une activité qui chevauche
  const admin = app.client();
  await admin.login('admin@loisirs.demo');
  const base = (await admin.get(`/api/admin/activities/${pickle.id}`)).data;
  const clash = await admin.post('/api/admin/activities', {
    ...base, title: 'Badminton libre', start_time: '19:00', end_time: '20:30', status: 'published', age_min: 16,
  });
  assert.equal(clash.status, 201);
  const r = await c.post('/api/registrations', { activity_id: clash.data.id, member_id: self.id });
  assert.equal(r.status, 409);
  assert.match(r.data.error, /Conflit d’horaire/);
});

test('capacité, liste d’attente et promotion automatique à l’annulation', async () => {
  const admin = app.client();
  await admin.login('admin@loisirs.demo');
  const base = (await admin.get('/api/admin/activities/1')).data;
  const mini = (await admin.post('/api/admin/activities', {
    ...base, title: 'Atelier test capacité', capacity: 1, age_min: null, age_max: null, weekday: 5, start_time: '08:00', end_time: '09:00', status: 'published',
  })).data;

  const a = app.client(); const b = app.client();
  await a.login('parent@loisirs.demo');
  await b.login('visiteur@loisirs.demo');
  const ma = (await a.get('/api/members')).data[0];
  const mb = (await b.get('/api/members')).data[0];

  const ra = await a.post('/api/registrations', { activity_id: mini.id, member_id: ma.id });
  const rb = await b.post('/api/registrations', { activity_id: mini.id, member_id: mb.id });
  assert.equal(ra.data.status, 'confirmed');
  assert.equal(rb.data.status, 'waitlist');
  assert.equal(rb.data.waitlist_rank, 1);
  assert.equal((await b.post('/api/payments', { registration_ids: [rb.data.id] })).status, 409); // pas de paiement en attente

  const cancel = await a.del(`/api/registrations/${ra.data.id}`);
  assert.equal(cancel.status, 200);
  assert.deepEqual(cancel.data.promoted, [rb.data.id]);
  const mine = (await b.get('/api/registrations')).data.find((r) => r.id === rb.data.id);
  assert.equal(mine.status, 'confirmed');
  const notes = (await b.get('/api/notifications')).data;
  assert.match(notes[0].message, /place s’est libérée/);
  assert.equal((await a.del(`/api/registrations/${ra.data.id}`)).status, 409); // déjà annulée
});

test('paiement et remboursement selon la date d’annulation', async () => {
  const c = app.client();
  await c.login('parent@loisirs.demo');
  const regs = (await c.get('/api/registrations')).data.filter((r) => r.status === 'confirmed' && r.payment_status === 'unpaid');
  assert.ok(regs.length >= 2);
  const [r1, r2] = regs;
  assert.equal((await c.post('/api/payments', { registration_ids: [] })).status, 422);
  const pay = await c.post('/api/payments', { registration_ids: [r1.id, r2.id] });
  assert.equal(pay.status, 201);
  assert.equal(pay.data.total_cents, r1.price_cents + r2.price_cents);
  assert.match(pay.data.reference, /^R-2026-\d{6}$/);
  assert.equal((await c.post('/api/payments', { registration_ids: [r1.id] })).status, 409); // déjà payé

  // Annulation > 7 jours avant le début : remboursement complet
  const refunded = await c.del(`/api/registrations/${r1.id}`);
  assert.equal(refunded.data.refund_cents, r1.price_cents);
  // Annulation tardive : aucun remboursement
  app.setNow('2026-12-01T15:00:00Z'); // la session débute le 2026-12-02
  try {
    await c.login('parent@loisirs.demo'); // la session de 14 jours a expiré entre-temps
    const late = await c.del(`/api/registrations/${r2.id}`);
    assert.equal(late.data.refund_cents, 0);
  } finally {
    app.setNow('2026-11-11T15:00:00Z');
  }
  await c.login('parent@loisirs.demo');
  const history = (await c.get('/api/payments')).data;
  assert.equal(history[0].items.length, 2);
});

test('fenêtre d’inscription : fermée pour le citoyen, ouverte pour le personnel', async () => {
  const c = app.client();
  await c.login('visiteur@loisirs.demo');
  const self = (await c.get('/api/members')).data[0];
  const future = (await c.get('/api/activities?season_id=2')).data[0];
  const r = await c.post('/api/registrations', { activity_id: future.id, member_id: self.id });
  assert.equal(r.status, 409);
  assert.match(r.data.error, /débutent/);
  const staff = app.client();
  await staff.login('agent@loisirs.demo');
  const found = (await staff.get('/api/admin/members?q=noah')).data; // 7 ans au début de la session
  assert.equal(found.length, 1);
  const s = await staff.post('/api/admin/registrations', { activity_id: future.id, member_id: found[0].id });
  assert.equal(s.status, 201);
});

test('annulation d’une activité : inscrits annulés, remboursés et avisés', async () => {
  const admin = app.client();
  await admin.login('admin@loisirs.demo');
  const robot = await activityByTitle(admin, 'Club de robotique', 1);
  const parent = app.client();
  await parent.login('parent@loisirs.demo');
  const lea = (await parent.get('/api/members')).data.find((m) => m.first_name === 'Léa');
  const reg = (await parent.post('/api/registrations', { activity_id: robot.id, member_id: lea.id })).data;
  await parent.post('/api/payments', { registration_ids: [reg.id] });

  const res = await admin.post(`/api/admin/activities/${robot.id}/cancel`);
  assert.equal(res.data.cancelled_registrations, 1);
  const after = (await parent.get('/api/registrations')).data.find((r) => r.id === reg.id);
  assert.equal(after.status, 'cancelled');
  assert.equal(after.payment_status, 'refunded');
  assert.equal(after.refund_cents, reg.price_cents);
  assert.ok(!(await parent.get('/api/activities?q=robotique')).data.length);
  assert.equal((await admin.put(`/api/admin/activities/${robot.id}`, robot)).status, 409);
});

test('administration : liste des participants, CSV sécurisé, capacité, suppression', async () => {
  const admin = app.client();
  await admin.login('admin@loisirs.demo');
  const base = (await admin.get('/api/admin/activities/1')).data;
  const inv = await admin.post('/api/admin/activities', { ...base, title: 'Atelier CSV', capacity: 5, age_min: null, age_max: null, weekday: 1, start_time: '06:00', end_time: '07:00', status: 'published' });
  assert.equal(inv.status, 201);
  const id = inv.data.id;

  const evil = app.client();
  await evil.post('/api/auth/register', signup({ email: 'evil@example.com', first_name: '=CMD()', last_name: 'Test' }));
  const m = (await evil.get('/api/members')).data[0];
  await evil.post('/api/registrations', { activity_id: id, member_id: m.id });

  const csv = await admin.get(`/api/admin/activities/${id}/roster?format=csv`);
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.ok(csv.data.startsWith('﻿'));
  assert.ok(csv.data.includes("\"'=CMD()\""), 'les formules doivent être neutralisées');

  assert.equal((await admin.put(`/api/admin/activities/${id}`, { ...base, capacity: 5, title: 'Atelier CSV', status: 'published', start_time: '06:00', end_time: '07:00', weekday: 1, age_min: null, age_max: null })).status, 200);
  assert.equal((await admin.put(`/api/admin/activities/${id}`, { ...base, capacity: 0 })).status, 422);
  assert.equal((await admin.del(`/api/admin/activities/${id}`)).status, 409); // a un historique
  const empty = (await admin.post('/api/admin/activities', { ...base, title: 'Brouillon vide', status: 'draft' })).data;
  assert.equal((await admin.del(`/api/admin/activities/${empty.id}`)).status, 204);
  // brouillon invisible au public
  assert.equal((await app.client().get(`/api/activities/${(await admin.post('/api/admin/activities', { ...base, title: 'Secret brouillon', status: 'draft' })).data.id}`)).status, 404);
});

test('tableau de bord et gestion des usagers', async () => {
  const admin = app.client();
  await admin.login('admin@loisirs.demo');
  const d = (await admin.get('/api/admin/dashboard')).data;
  assert.ok(d.registrations.confirmed > 0);
  assert.ok(d.money.collected > 0);
  assert.ok(Array.isArray(d.by_category));
  const users = (await admin.get('/api/admin/users?q=bergeron')).data;
  assert.equal(users.length, 1);
  assert.equal(users[0].resident, 0);
  assert.equal((await admin.put(`/api/admin/users/${users[0].id}`, { resident: 1, role: 'citizen' })).status, 200);
  assert.equal((await admin.put('/api/admin/users/1', { resident: 1, role: 'citizen' })).status, 409); // pas son propre rôle
});

test('fichiers statiques : protection contre la traversée de chemin', async () => {
  const r = await fetch(app.base + '/..%2f..%2fpackage.json');
  assert.ok([403, 404].includes(r.status));
  const h = await fetch(app.base + '/api/meta');
  assert.match(h.headers.get('content-security-policy'), /default-src 'self'/);
});
