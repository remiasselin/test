import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname, sep } from 'node:path';
import { openDb, tx } from './db.js';
import { HttpError, parse, rules as R } from './validate.js';
import {
  hashPassword, verifyPassword, burnVerify, createSession, findSessionUser, destroySession, purgeExpiredSessions,
} from './auth.js';
import {
  ACTIVITY_SELECT, decorateActivity, registerMember, cancelRegistration, cancelActivity, fillFromWaitlist,
  payRegistrations, dashboard, notify, audit, isResidentCity, todayStr, priceFor,
} from './services.js';
import { CATEGORIES, WEEKDAYS, REFUND_DAYS } from './constants.js';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
};
const MAX_BODY = 100 * 1024;

/* ---------- Utilitaires ---------- */
class Reply { constructor(status, body) { this.status = status; this.body = body; } }
class Raw { constructor(content, contentType, filename) { Object.assign(this, { content, contentType, filename }); } }
const reply = (status, body) => new Reply(status, body);

const publicUser = (u) => u && ({
  id: u.id, email: u.email, role: u.role, first_name: u.first_name, last_name: u.last_name,
  phone: u.phone, address: u.address, city: u.city, postal_code: u.postal_code, resident: !!u.resident,
});

const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise l'injection de formules Excel
  return `"${s.replaceAll('"', '""')}"`;
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'Requête trop volumineuse.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(undefined);
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
        return reject(new HttpError(415, 'Format JSON requis.'));
      }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new HttpError(400, 'JSON invalide.')); }
    });
    req.on('error', reject);
  });
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* cookie malformé ignoré */ }
    }
  }
  return out;
}

const SEC_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
};

/* ---------- Application ---------- */
export function createApp({ db = openDb(), now = () => new Date(), secureCookies = false } = {}) {
  const ctx = { db, now };
  const routes = [];
  const route = (method, path, opts, handler) => {
    if (typeof opts === 'function') { handler = opts; opts = {}; }
    const keys = [];
    const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, auth: opts.auth || null, handler });
  };

  const failures = new Map(); // limitation des tentatives de connexion
  const WINDOW_MS = 15 * 60_000;
  const MAX_FAILS = 8;
  const failKey = (ip, email) => `${ip}|${String(email).toLowerCase()}`;
  const tooMany = (key) => {
    const rec = failures.get(key);
    if (!rec) return false;
    if (now().getTime() - rec.first > WINDOW_MS) { failures.delete(key); return false; }
    return rec.count >= MAX_FAILS;
  };
  const addFail = (key) => {
    const rec = failures.get(key);
    if (!rec || now().getTime() - rec.first > WINDOW_MS) failures.set(key, { count: 1, first: now().getTime() });
    else rec.count++;
  };

  const need = (level) => (user) => {
    if (!user) throw new HttpError(401, 'Connexion requise.');
    if (level === 'staff' && user.role === 'citizen') throw new HttpError(403, 'Accès réservé au personnel.');
    if (level === 'admin' && user.role !== 'admin') throw new HttpError(403, 'Accès réservé aux administrateurs.');
  };
  const guards = { user: need('user'), staff: need('staff'), admin: need('admin') };

  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const all = (sql, ...p) => db.prepare(sql).all(...p).map((r) => ({ ...r }));
  const getActivity = (id) => {
    const a = one(`${ACTIVITY_SELECT} WHERE a.id = ?`, id);
    if (!a) throw new HttpError(404, 'Activité introuvable.');
    return { ...a };
  };

  /* ----- Méta ----- */
  route('GET', '/api/meta', () => ({
    categories: CATEGORIES, weekdays: WEEKDAYS, refund_days: REFUND_DAYS, today: todayStr(ctx),
  }));

  /* ----- Authentification ----- */
  route('POST', '/api/auth/register', ({ body, res, ip }) => {
    const d = parse(body, {
      email: R.email(), password: R.password(),
      first_name: R.str({ max: 60 }), last_name: R.str({ max: 60 }),
      birth_date: R.date(), phone: R.phone(), address: R.str({ max: 120, optional: true }),
      city: R.str({ max: 80 }), postal_code: R.postal(),
    });
    if (d.birth_date > todayStr(ctx)) throw new HttpError(422, 'Certaines données sont invalides.', { birth_date: 'Date dans le futur' });
    if (one('SELECT id FROM users WHERE email = ?', d.email)) {
      throw new HttpError(409, 'Un compte existe déjà avec ce courriel.', { email: 'Courriel déjà utilisé' });
    }
    const user = tx(db, () => {
      const info = db.prepare(
        `INSERT INTO users(email, password_hash, first_name, last_name, phone, address, city, postal_code, resident)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      ).run(d.email, hashPassword(d.password), d.first_name, d.last_name, d.phone, d.address, d.city, d.postal_code, isResidentCity(d.city) ? 1 : 0);
      const id = Number(info.lastInsertRowid);
      db.prepare('INSERT INTO members(user_id, first_name, last_name, birth_date, is_self) VALUES (?,?,?,?,1)')
        .run(id, d.first_name, d.last_name, d.birth_date);
      audit(db, id, 'user.register', 'user', id);
      return one('SELECT * FROM users WHERE id = ?', id);
    });
    const s = createSession(db, user.id, now);
    res.cookie = s;
    return reply(201, { user: publicUser(user) });
  });

  route('POST', '/api/auth/login', ({ body, res, ip }) => {
    const d = parse(body, { email: R.email(), password: R.str({ max: 200 }) });
    const key = failKey(ip, d.email);
    if (tooMany(key)) throw new HttpError(429, 'Trop de tentatives. Réessayez dans quelques minutes.');
    const user = one('SELECT * FROM users WHERE email = ?', d.email);
    const ok = user ? verifyPassword(d.password, user.password_hash) : (burnVerify(d.password), false);
    if (!ok) { addFail(key); throw new HttpError(401, 'Courriel ou mot de passe incorrect.'); }
    failures.delete(key);
    purgeExpiredSessions(db, now);
    res.cookie = createSession(db, user.id, now);
    return { user: publicUser(user) };
  });

  route('POST', '/api/auth/logout', ({ cookies, res }) => {
    destroySession(db, cookies.sid);
    res.cookie = { token: '', maxAge: 0 };
    return { ok: true };
  });

  route('GET', '/api/me', ({ user }) => {
    if (!user) return { user: null, unread: 0 };
    const { n } = one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0', user.id);
    return { user: publicUser(user), unread: n };
  });

  route('PUT', '/api/me', { auth: 'user' }, ({ user, body }) => {
    const d = parse(body, {
      first_name: R.str({ max: 60 }), last_name: R.str({ max: 60 }), phone: R.phone(),
      address: R.str({ max: 120, optional: true }), city: R.str({ max: 80 }), postal_code: R.postal(),
    });
    const cityChanged = (user.city || '') !== d.city;
    const resident = cityChanged ? (isResidentCity(d.city) ? 1 : 0) : user.resident;
    db.prepare('UPDATE users SET first_name=?, last_name=?, phone=?, address=?, city=?, postal_code=?, resident=? WHERE id=?')
      .run(d.first_name, d.last_name, d.phone, d.address, d.city, d.postal_code, resident, user.id);
    return { user: publicUser(one('SELECT * FROM users WHERE id = ?', user.id)) };
  });

  route('PUT', '/api/me/password', { auth: 'user' }, ({ user, body, cookies }) => {
    const d = parse(body, { current: R.str({ max: 200 }), password: R.password() });
    if (!verifyPassword(d.current, user.password_hash)) {
      throw new HttpError(422, 'Certaines données sont invalides.', { current: 'Mot de passe actuel incorrect' });
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(d.password), user.id);
    // révoque les autres sessions
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    return { ok: true, relogin: true };
  });

  /* ----- Catalogue public ----- */
  route('GET', '/api/seasons', () => all('SELECT * FROM seasons ORDER BY start_date DESC'));

  function filterActivities(query, { staff }) {
    const where = [];
    const p = [];
    if (!staff) where.push("a.status = 'published'");
    else if (query.status) { where.push('a.status = ?'); p.push(query.status); }
    if (query.season_id) { where.push('a.season_id = ?'); p.push(Number(query.season_id)); }
    if (query.category) { where.push('a.category = ?'); p.push(query.category); }
    if (query.weekday) { where.push('a.weekday = ?'); p.push(Number(query.weekday)); }
    if (query.q) {
      const like = `%${String(query.q).replace(/[%_\\]/g, '\\$&')}%`;
      where.push("(a.title LIKE ? ESCAPE '\\' OR a.description LIKE ? ESCAPE '\\' OR a.location LIKE ? ESCAPE '\\' OR a.instructor LIKE ? ESCAPE '\\')");
      p.push(like, like, like, like);
    }
    if (query.age !== undefined && query.age !== '') {
      const age = Number(query.age);
      where.push('(a.age_min IS NULL OR a.age_min <= ?) AND (a.age_max IS NULL OR a.age_max >= ?)');
      p.push(age, age);
    }
    let sql = `${ACTIVITY_SELECT}${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY a.weekday, a.start_time, a.title`;
    let rows = db.prepare(sql).all(...p).map((r) => decorateActivity(ctx, { ...r }));
    if (query.available === '1') rows = rows.filter((a) => !a.full && a.registration_state === 'open');
    return rows;
  }

  route('GET', '/api/activities', ({ query }) => filterActivities(query, { staff: false }));

  route('GET', '/api/activities/:id', ({ params }) => {
    const a = getActivity(Number(params.id));
    if (a.status === 'draft') throw new HttpError(404, 'Activité introuvable.');
    return decorateActivity(ctx, a);
  });

  /* ----- Participants (famille) ----- */
  const memberSpec = () => ({
    first_name: R.str({ max: 60 }), last_name: R.str({ max: 60 }), birth_date: R.date(),
    health_notes: R.str({ max: 500, optional: true }),
  });
  const futureBirth = (d) => {
    if (d.birth_date > todayStr(ctx)) throw new HttpError(422, 'Certaines données sont invalides.', { birth_date: 'Date dans le futur' });
  };
  const ownMember = (user, id) => {
    const m = one('SELECT * FROM members WHERE id = ? AND user_id = ?', Number(id), user.id);
    if (!m) throw new HttpError(404, 'Participant introuvable.');
    return m;
  };

  route('GET', '/api/members', { auth: 'user' }, ({ user }) =>
    all('SELECT * FROM members WHERE user_id = ? AND archived = 0 ORDER BY is_self DESC, first_name', user.id));

  route('POST', '/api/members', { auth: 'user' }, ({ user, body }) => {
    const d = parse(body, memberSpec());
    futureBirth(d);
    const info = db.prepare('INSERT INTO members(user_id, first_name, last_name, birth_date, health_notes) VALUES (?,?,?,?,?)')
      .run(user.id, d.first_name, d.last_name, d.birth_date, d.health_notes);
    return reply(201, { ...one('SELECT * FROM members WHERE id = ?', Number(info.lastInsertRowid)) });
  });

  route('PUT', '/api/members/:id', { auth: 'user' }, ({ user, params, body }) => {
    const m = ownMember(user, params.id);
    const d = parse(body, memberSpec());
    futureBirth(d);
    db.prepare('UPDATE members SET first_name=?, last_name=?, birth_date=?, health_notes=? WHERE id=?')
      .run(d.first_name, d.last_name, d.birth_date, d.health_notes, m.id);
    return { ...one('SELECT * FROM members WHERE id = ?', m.id) };
  });

  route('DELETE', '/api/members/:id', { auth: 'user' }, ({ user, params }) => {
    const m = ownMember(user, params.id);
    if (m.is_self) throw new HttpError(409, 'Le titulaire du compte ne peut pas être supprimé.');
    const active = one("SELECT COUNT(*) AS n FROM registrations WHERE member_id = ? AND status <> 'cancelled'", m.id).n;
    if (active) throw new HttpError(409, 'Ce participant a des inscriptions actives. Annulez-les d’abord.');
    const history = one('SELECT COUNT(*) AS n FROM registrations WHERE member_id = ?', m.id).n;
    if (history) db.prepare('UPDATE members SET archived = 1 WHERE id = ?').run(m.id);
    else db.prepare('DELETE FROM members WHERE id = ?').run(m.id);
    return reply(204);
  });

  /* ----- Inscriptions du citoyen ----- */
  const REG_SELECT = `
    SELECT r.*, a.title, a.weekday, a.start_time, a.end_time, a.start_date, a.end_date, a.location, a.status AS activity_status,
           m.first_name AS member_first_name, m.last_name AS member_last_name,
           (SELECT COUNT(*) FROM registrations w WHERE w.activity_id = r.activity_id AND w.status = 'waitlist' AND w.id <= r.id) AS waitlist_rank
    FROM registrations r JOIN activities a ON a.id = r.activity_id JOIN members m ON m.id = r.member_id`;

  route('GET', '/api/registrations', { auth: 'user' }, ({ user }) =>
    all(`${REG_SELECT} WHERE r.user_id = ? ORDER BY (r.status = 'cancelled'), a.start_date, r.id`, user.id));

  route('POST', '/api/registrations', { auth: 'user' }, ({ user, body }) => {
    const d = parse(body, { activity_id: R.int({ min: 1 }), member_id: R.int({ min: 1 }) });
    const reg = registerMember(ctx, user, d);
    return reply(201, { ...one(`${REG_SELECT} WHERE r.id = ?`, reg.id) });
  });

  route('DELETE', '/api/registrations/:id', { auth: 'user' }, ({ user, params }) => {
    const reg = one('SELECT * FROM registrations WHERE id = ? AND user_id = ?', Number(params.id), user.id);
    if (!reg) throw new HttpError(404, 'Inscription introuvable.');
    return cancelRegistration(ctx, reg, user);
  });

  route('GET', '/api/payments', { auth: 'user' }, ({ user }) => {
    const pays = all('SELECT * FROM payments WHERE user_id = ? ORDER BY id DESC', user.id);
    for (const p of pays) {
      p.items = all(
        `SELECT r.id, r.price_cents, a.title, m.first_name, m.last_name FROM registrations r
         JOIN activities a ON a.id = r.activity_id JOIN members m ON m.id = r.member_id WHERE r.payment_id = ?`, p.id);
    }
    return pays;
  });

  route('POST', '/api/payments', { auth: 'user' }, ({ user, body }) => {
    const ids = body && body.registration_ids;
    return reply(201, { ...payRegistrations(ctx, user, ids) });
  });

  route('GET', '/api/notifications', { auth: 'user' }, ({ user }) =>
    all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50', user.id));

  route('POST', '/api/notifications/read', { auth: 'user' }, ({ user }) => {
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(user.id);
    return { ok: true };
  });

  /* ================= ADMINISTRATION ================= */
  route('GET', '/api/admin/dashboard', { auth: 'staff' }, ({ query }) => {
    let seasonId = query.season_id ? Number(query.season_id) : null;
    if (!seasonId) {
      const today = todayStr(ctx);
      const s = one('SELECT id FROM seasons WHERE ? BETWEEN registration_open AND end_date ORDER BY start_date LIMIT 1', today)
        || one('SELECT id FROM seasons ORDER BY start_date DESC LIMIT 1');
      seasonId = s ? s.id : null;
    }
    return { season_id: seasonId, ...dashboard(ctx, seasonId) };
  });

  /* Sessions */
  const seasonSpec = () => ({
    name: R.str({ max: 80 }), start_date: R.date(), end_date: R.date(),
    registration_open: R.date(), registration_close: R.date(),
  });
  const checkSeason = (d) => {
    const errors = {};
    if (d.end_date < d.start_date) errors.end_date = 'Doit suivre la date de début';
    if (d.registration_close < d.registration_open) errors.registration_close = 'Doit suivre l’ouverture';
    if (Object.keys(errors).length) throw new HttpError(422, 'Certaines données sont invalides.', errors);
  };
  route('POST', '/api/admin/seasons', { auth: 'staff' }, ({ user, body }) => {
    const d = parse(body, seasonSpec()); checkSeason(d);
    const info = db.prepare('INSERT INTO seasons(name,start_date,end_date,registration_open,registration_close) VALUES (?,?,?,?,?)')
      .run(d.name, d.start_date, d.end_date, d.registration_open, d.registration_close);
    audit(db, user.id, 'season.create', 'season', Number(info.lastInsertRowid));
    return reply(201, { ...one('SELECT * FROM seasons WHERE id = ?', Number(info.lastInsertRowid)) });
  });
  route('PUT', '/api/admin/seasons/:id', { auth: 'staff' }, ({ user, params, body }) => {
    const s = one('SELECT * FROM seasons WHERE id = ?', Number(params.id));
    if (!s) throw new HttpError(404, 'Session introuvable.');
    const d = parse(body, seasonSpec()); checkSeason(d);
    db.prepare('UPDATE seasons SET name=?,start_date=?,end_date=?,registration_open=?,registration_close=? WHERE id=?')
      .run(d.name, d.start_date, d.end_date, d.registration_open, d.registration_close, s.id);
    audit(db, user.id, 'season.update', 'season', s.id);
    return { ...one('SELECT * FROM seasons WHERE id = ?', s.id) };
  });

  /* Activités */
  route('GET', '/api/admin/activities', { auth: 'staff' }, ({ query }) => filterActivities(query, { staff: true }));
  route('GET', '/api/admin/activities/:id', { auth: 'staff' }, ({ params }) => decorateActivity(ctx, getActivity(Number(params.id))));

  const activitySpec = () => ({
    season_id: R.int({ min: 1 }), title: R.str({ min: 3, max: 120 }), description: R.str({ max: 2000, optional: true }),
    category: R.oneOf(Object.keys(CATEGORIES)), location: R.str({ max: 120 }), instructor: R.str({ max: 80, optional: true }),
    age_min: R.int({ min: 0, max: 120, optional: true }), age_max: R.int({ min: 0, max: 120, optional: true }),
    capacity: R.int({ min: 1, max: 1000 }),
    price_resident: R.int({ min: 0, max: 1_000_000 }), price_nonresident: R.int({ min: 0, max: 1_000_000 }),
    weekday: R.int({ min: 1, max: 7 }), start_time: R.time(), end_time: R.time(),
    start_date: R.date(), end_date: R.date(), status: R.oneOf(['draft', 'published']),
  });
  const checkActivity = (d) => {
    const e = {};
    if (!one('SELECT id FROM seasons WHERE id = ?', d.season_id)) e.season_id = 'Session inconnue';
    if (d.age_min != null && d.age_max != null && d.age_min > d.age_max) e.age_max = 'Doit être ≥ âge minimum';
    if (d.end_time <= d.start_time) e.end_time = 'Doit suivre l’heure de début';
    if (d.end_date < d.start_date) e.end_date = 'Doit suivre la date de début';
    if (Object.keys(e).length) throw new HttpError(422, 'Certaines données sont invalides.', e);
  };
  const ACT_COLS = ['season_id', 'title', 'description', 'category', 'location', 'instructor', 'age_min', 'age_max',
    'capacity', 'price_resident', 'price_nonresident', 'weekday', 'start_time', 'end_time', 'start_date', 'end_date', 'status'];

  route('POST', '/api/admin/activities', { auth: 'staff' }, ({ user, body }) => {
    const d = parse(body, activitySpec()); checkActivity(d);
    const info = db.prepare(`INSERT INTO activities(${ACT_COLS.join(',')}) VALUES (${ACT_COLS.map(() => '?').join(',')})`)
      .run(...ACT_COLS.map((c) => d[c]));
    const id = Number(info.lastInsertRowid);
    audit(db, user.id, 'activity.create', 'activity', id);
    return reply(201, decorateActivity(ctx, getActivity(id)));
  });

  route('PUT', '/api/admin/activities/:id', { auth: 'staff' }, ({ user, params, body }) => {
    const a = getActivity(Number(params.id));
    if (a.status === 'cancelled') throw new HttpError(409, 'Une activité annulée ne peut pas être modifiée.');
    const d = parse(body, activitySpec()); checkActivity(d);
    if (d.capacity < a.confirmed_count) {
      throw new HttpError(409, `Capacité inférieure au nombre d’inscrits confirmés (${a.confirmed_count}).`, { capacity: 'Trop basse' });
    }
    tx(db, () => {
      db.prepare(`UPDATE activities SET ${ACT_COLS.map((c) => `${c}=?`).join(',')} WHERE id=?`).run(...ACT_COLS.map((c) => d[c]), a.id);
      fillFromWaitlist(ctx, a.id);
      audit(db, user.id, 'activity.update', 'activity', a.id);
    });
    return decorateActivity(ctx, getActivity(a.id));
  });

  route('POST', '/api/admin/activities/:id/cancel', { auth: 'staff' }, ({ user, params }) =>
    cancelActivity(ctx, Number(params.id), user));

  route('DELETE', '/api/admin/activities/:id', { auth: 'admin' }, ({ user, params }) => {
    const a = getActivity(Number(params.id));
    const n = one('SELECT COUNT(*) AS n FROM registrations WHERE activity_id = ?', a.id).n;
    if (n) throw new HttpError(409, 'Cette activité a un historique d’inscriptions : annulez-la plutôt que de la supprimer.');
    db.prepare('DELETE FROM activities WHERE id = ?').run(a.id);
    audit(db, user.id, 'activity.delete', 'activity', a.id);
    return reply(204);
  });

  /* Liste des participants */
  route('GET', '/api/admin/activities/:id/roster', { auth: 'staff' }, ({ params, query }) => {
    const a = getActivity(Number(params.id));
    const rows = all(
      `SELECT r.id, r.status, r.payment_status, r.price_cents, r.created_at, r.paid_at,
              m.first_name, m.last_name, m.birth_date, m.health_notes,
              u.first_name AS parent_first_name, u.last_name AS parent_last_name, u.email, u.phone, u.resident
       FROM registrations r JOIN members m ON m.id = r.member_id JOIN users u ON u.id = r.user_id
       WHERE r.activity_id = ? AND r.status <> 'cancelled'
       ORDER BY (r.status = 'waitlist'), r.id`, a.id);
    if (query.format === 'csv') {
      const head = ['Statut', 'Prénom', 'Nom', 'Naissance', 'Résident', 'Paiement', 'Contact', 'Courriel', 'Téléphone', 'Notes de santé'];
      const lines = rows.map((r) => [
        r.status === 'confirmed' ? 'Confirmé' : 'Liste d’attente', r.first_name, r.last_name, r.birth_date,
        r.resident ? 'Oui' : 'Non', r.payment_status === 'paid' ? 'Payé' : 'Impayé',
        `${r.parent_first_name} ${r.parent_last_name}`, r.email, r.phone, r.health_notes,
      ].map(csvCell).join(';'));
      return new Raw(
        '\uFEFF' + [head.map(csvCell).join(';'), ...lines].join('\r\n'),
        'text/csv; charset=utf-8',
        `participants-activite-${a.id}.csv`,
      );
    }
    return { activity: decorateActivity(ctx, a), registrations: rows };
  });

  /* Actions sur une inscription */
  const adminReg = (id) => {
    const r = one('SELECT * FROM registrations WHERE id = ?', Number(id));
    if (!r) throw new HttpError(404, 'Inscription introuvable.');
    return r;
  };
  route('DELETE', '/api/admin/registrations/:id', { auth: 'staff' }, ({ user, params }) =>
    cancelRegistration(ctx, adminReg(params.id), user));

  route('POST', '/api/admin/registrations/:id/pay', { auth: 'staff' }, ({ user, params, body }) => {
    const r = adminReg(params.id);
    const owner = one('SELECT * FROM users WHERE id = ?', r.user_id);
    const d = parse(body || {}, { method: R.oneOf(['comptoir', 'cheque', 'virement']) });
    return reply(201, { ...payRegistrations(ctx, owner, [r.id], { actor: user, method: d.method }) });
  });

  route('POST', '/api/admin/registrations/:id/promote', { auth: 'staff' }, ({ user, params }) => {
    const r = adminReg(params.id);
    if (r.status !== 'waitlist') throw new HttpError(409, 'Cette inscription n’est pas en liste d’attente.');
    const a = getActivity(r.activity_id);
    if (a.confirmed_count >= a.capacity) {
      throw new HttpError(409, 'Aucune place disponible. Augmentez la capacité de l’activité.');
    }
    db.prepare("UPDATE registrations SET status = 'confirmed' WHERE id = ?").run(r.id);
    notify(db, r.user_id, `Une place est confirmée pour « ${a.title} ». Veuillez effectuer le paiement.`);
    audit(db, user.id, 'registration.promote', 'registration', r.id, { manual: true });
    return { ok: true };
  });

  route('POST', '/api/admin/registrations', { auth: 'staff' }, ({ user, body }) => {
    const d = parse(body, { activity_id: R.int({ min: 1 }), member_id: R.int({ min: 1 }) });
    const reg = registerMember(ctx, user, d, { staff: true });
    return reply(201, { ...reg });
  });

  /* Usagers */
  route('GET', '/api/admin/members', { auth: 'staff' }, ({ query }) => {
    const q = String(query.q || '').trim();
    if (q.length < 2) return [];
    const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    return all(
      `SELECT m.id, m.first_name, m.last_name, m.birth_date, u.email, u.first_name AS parent_first_name, u.last_name AS parent_last_name
       FROM members m JOIN users u ON u.id = m.user_id
       WHERE m.archived = 0 AND (m.first_name LIKE ? ESCAPE '\\' OR m.last_name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')
       ORDER BY m.last_name, m.first_name LIMIT 20`, like, like, like);
  });

  route('GET', '/api/admin/users', { auth: 'staff' }, ({ query }) => {
    const q = String(query.q || '').trim();
    const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    return all(
      `SELECT id, email, role, first_name, last_name, phone, city, resident, created_at,
         (SELECT COUNT(*) FROM registrations r WHERE r.user_id = users.id AND r.status = 'confirmed') AS registrations
       FROM users WHERE (? = '' OR email LIKE ? ESCAPE '\\' OR first_name LIKE ? ESCAPE '\\' OR last_name LIKE ? ESCAPE '\\')
       ORDER BY last_name, first_name LIMIT 100`, q, like, like, like);
  });

  route('PUT', '/api/admin/users/:id', { auth: 'staff' }, ({ user, params, body }) => {
    const target = one('SELECT * FROM users WHERE id = ?', Number(params.id));
    if (!target) throw new HttpError(404, 'Usager introuvable.');
    const d = parse(body, { resident: R.bool(), role: R.oneOf(['citizen', 'staff', 'admin']) });
    if (d.role !== target.role) {
      if (user.role !== 'admin') throw new HttpError(403, 'Seul un administrateur peut changer un rôle.');
      if (target.id === user.id) throw new HttpError(409, 'Vous ne pouvez pas modifier votre propre rôle.');
    }
    db.prepare('UPDATE users SET resident = ?, role = ? WHERE id = ?').run(d.resident, d.role, target.id);
    if (d.role !== target.role) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
    audit(db, user.id, 'user.update', 'user', target.id, { resident: d.resident, role: d.role });
    return { ok: true };
  });

  /* ---------- Serveur HTTP ---------- */
  async function serveStatic(req, res, pathname) {
    const rel = pathname === '/' ? '/index.html' : pathname;
    const file = normalize(join(PUBLIC_DIR, decodeURIComponent(rel)));
    if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + sep)) return send(res, 403, { error: 'Interdit.' });
    try {
      const data = await readFile(file);
      res.writeHead(200, { ...SEC_HEADERS, 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      send(res, 404, { error: 'Page introuvable.' });
    }
  }

  function send(res, status, payload, extra = {}) {
    const headers = { ...SEC_HEADERS, ...extra };
    if (res.cookie) {
      const c = res.cookie;
      headers['Set-Cookie'] = `sid=${encodeURIComponent(c.token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${c.maxAge}${secureCookies ? '; Secure' : ''}`;
    }
    if (status === 204 || payload === undefined) { res.writeHead(status, headers); return res.end(); }
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(payload));
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Méthode non permise.' });
        return await serveStatic(req, res, url.pathname);
      }
      const matched = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
      if (!matched) {
        const pathExists = routes.some((r) => r.re.test(url.pathname));
        throw new HttpError(pathExists ? 405 : 404, pathExists ? 'Méthode non permise.' : 'Ressource introuvable.');
      }
      const m = url.pathname.match(matched.re);
      const params = Object.fromEntries(matched.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const cookies = parseCookies(req.headers.cookie);
      const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
      const user = findSessionUser(db, cookies.sid, now);
      if (matched.auth) guards[matched.auth](user);
      const out = await matched.handler({
        req, res, params, query: Object.fromEntries(url.searchParams), body, user, cookies,
        ip: req.socket.remoteAddress || '',
      });
      if (out instanceof Raw) {
        res.writeHead(200, {
          ...SEC_HEADERS, 'Content-Type': out.contentType, 'Cache-Control': 'no-store',
          'Content-Disposition': `attachment; filename="${out.filename}"`,
        });
        return res.end(out.content);
      }
      if (out instanceof Reply) return send(res, out.status, out.body);
      send(res, 200, out);
    } catch (err) {
      if (err instanceof HttpError) {
        send(res, err.status, { error: err.message, ...(err.fields ? { fields: err.fields } : {}) });
      } else {
        console.error(err);
        send(res, 500, { error: 'Erreur interne du serveur.' });
      }
    }
  });

  return { server, ctx };
}
