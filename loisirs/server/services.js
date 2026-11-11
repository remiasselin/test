import { tx } from './db.js';
import { HttpError } from './validate.js';
import { REFUND_DAYS, TIMEZONE, RESIDENT_CITY } from './constants.js';

/* ---------- Dates ---------- */
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE });
export const todayStr = (ctx) => dayFmt.format(ctx.now());

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function ageOn(birth, ref) {
  const [by, bm, bd] = birth.split('-').map(Number);
  const [ry, rm, rd] = ref.split('-').map(Number);
  let age = ry - by;
  if (rm < bm || (rm === bm && rd < bd)) age--;
  return age;
}

export function isResidentCity(city) {
  const norm = String(city || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  return norm === RESIDENT_CITY;
}

/* ---------- Activités ---------- */
export const ACTIVITY_SELECT = `
  SELECT a.*, s.name AS season_name, s.registration_open, s.registration_close,
    (SELECT COUNT(*) FROM registrations r WHERE r.activity_id = a.id AND r.status = 'confirmed') AS confirmed_count,
    (SELECT COUNT(*) FROM registrations r WHERE r.activity_id = a.id AND r.status = 'waitlist') AS waitlist_count
  FROM activities a JOIN seasons s ON s.id = a.season_id`;

export function registrationState(ctx, a) {
  const today = todayStr(ctx);
  if (a.status === 'cancelled') return 'cancelled';
  if (today > a.end_date) return 'ended';
  if (today < a.registration_open) return 'not_yet';
  if (today > a.registration_close) return 'closed';
  return 'open';
}

export function decorateActivity(ctx, a) {
  return {
    ...a,
    spots_left: Math.max(0, a.capacity - a.confirmed_count),
    full: a.confirmed_count >= a.capacity,
    registration_state: registrationState(ctx, a),
  };
}

export const priceFor = (activity, resident) => (resident ? activity.price_resident : activity.price_nonresident);

/* ---------- Notifications & audit ---------- */
export function notify(db, userId, message) {
  db.prepare('INSERT INTO notifications(user_id, message) VALUES (?,?)').run(userId, message);
}
export function audit(db, actorId, action, entity, entityId, detail) {
  db.prepare('INSERT INTO audit_log(user_id, action, entity, entity_id, detail) VALUES (?,?,?,?,?)')
    .run(actorId ?? null, action, entity, entityId ?? null, detail ? JSON.stringify(detail) : null);
}

/* ---------- Inscriptions ---------- */
const timesOverlap = (a, b) => a.start_time < b.end_time && b.start_time < a.end_time;
const datesOverlap = (a, b) => a.start_date <= b.end_date && b.start_date <= a.end_date;

export function registerMember(ctx, actor, { activity_id, member_id }, { staff = false } = {}) {
  const { db } = ctx;
  return tx(db, () => {
    const activity = db.prepare(`${ACTIVITY_SELECT} WHERE a.id = ?`).get(activity_id);
    if (!activity) throw new HttpError(404, 'Activité introuvable.');
    if (activity.status !== 'published') throw new HttpError(409, "Cette activité n'est pas ouverte aux inscriptions.");

    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(member_id);
    if (!member || (!staff && member.user_id !== actor.id)) throw new HttpError(404, 'Participant introuvable.');
    if (member.archived) throw new HttpError(409, 'Ce participant est archivé.');
    const owner = db.prepare('SELECT * FROM users WHERE id = ?').get(member.user_id);

    const today = todayStr(ctx);
    if (today > activity.end_date) throw new HttpError(409, 'Cette activité est terminée.');
    if (!staff) {
      if (today < activity.registration_open) throw new HttpError(409, `Les inscriptions débutent le ${activity.registration_open}.`);
      if (today > activity.registration_close) throw new HttpError(409, 'La période d’inscription est terminée.');
    }

    const age = ageOn(member.birth_date, activity.start_date);
    if (activity.age_min != null && age < activity.age_min) {
      throw new HttpError(409, `Âge minimum requis : ${activity.age_min} ans (au début de l’activité).`);
    }
    if (activity.age_max != null && age > activity.age_max) {
      throw new HttpError(409, `Âge maximum : ${activity.age_max} ans (au début de l’activité).`);
    }

    const dup = db.prepare(
      "SELECT id FROM registrations WHERE activity_id = ? AND member_id = ? AND status <> 'cancelled'",
    ).get(activity.id, member.id);
    if (dup) throw new HttpError(409, 'Ce participant est déjà inscrit à cette activité.');

    const others = db.prepare(
      `SELECT a.title, a.weekday, a.start_time, a.end_time, a.start_date, a.end_date
       FROM registrations r JOIN activities a ON a.id = r.activity_id
       WHERE r.member_id = ? AND r.status <> 'cancelled' AND a.weekday = ?`,
    ).all(member.id, activity.weekday);
    const clash = others.find((o) => timesOverlap(o, activity) && datesOverlap(o, activity));
    if (clash) throw new HttpError(409, `Conflit d’horaire avec « ${clash.title} » (${clash.start_time}–${clash.end_time}).`);

    const status = activity.confirmed_count < activity.capacity ? 'confirmed' : 'waitlist';
    const price = priceFor(activity, !!owner.resident);
    const info = db.prepare(
      `INSERT INTO registrations(activity_id, member_id, user_id, status, price_cents, created_by)
       VALUES (?,?,?,?,?,?)`,
    ).run(activity.id, member.id, owner.id, status, price, actor.id);
    const id = Number(info.lastInsertRowid);

    const who = `${member.first_name} ${member.last_name}`;
    notify(db, owner.id, status === 'confirmed'
      ? `Inscription confirmée : ${who} — ${activity.title}. Le paiement est à effectuer pour réserver définitivement la place.`
      : `${who} est en liste d’attente pour « ${activity.title} ». Vous serez avisé si une place se libère.`);
    audit(db, actor.id, 'registration.create', 'registration', id, { status, staff });
    return db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);
  });
}

/** Promeut, dans l'ordre d'arrivée, les inscrits en liste d'attente tant qu'il reste des places. */
export function fillFromWaitlist(ctx, activityId) {
  const { db } = ctx;
  return tx(db, () => {
    const a = db.prepare(`${ACTIVITY_SELECT} WHERE a.id = ?`).get(activityId);
    if (!a || a.status !== 'published') return [];
    let free = a.capacity - a.confirmed_count;
    if (free <= 0) return [];
    const queue = db.prepare(
      `SELECT r.*, m.first_name, m.last_name FROM registrations r JOIN members m ON m.id = r.member_id
       WHERE r.activity_id = ? AND r.status = 'waitlist' ORDER BY r.id LIMIT ?`,
    ).all(activityId, free);
    for (const r of queue) {
      db.prepare("UPDATE registrations SET status = 'confirmed' WHERE id = ?").run(r.id);
      notify(db, r.user_id, `Bonne nouvelle : une place s’est libérée. ${r.first_name} ${r.last_name} est maintenant inscrit à « ${a.title} ». Veuillez effectuer le paiement.`);
      audit(db, null, 'registration.promote', 'registration', r.id);
      free--;
    }
    return queue.map((r) => r.id);
  });
}

export function cancelRegistration(ctx, reg, actor, { byCity = false } = {}) {
  const { db } = ctx;
  return tx(db, () => {
    const current = db.prepare('SELECT * FROM registrations WHERE id = ?').get(reg.id);
    if (current.status === 'cancelled') throw new HttpError(409, 'Cette inscription est déjà annulée.');
    const a = db.prepare('SELECT * FROM activities WHERE id = ?').get(current.activity_id);
    const m = db.prepare('SELECT * FROM members WHERE id = ?').get(current.member_id);

    let refund = 0;
    let paymentStatus = current.payment_status;
    if (current.payment_status === 'paid') {
      const eligible = byCity || todayStr(ctx) <= addDays(a.start_date, -REFUND_DAYS);
      if (eligible) { refund = current.price_cents; paymentStatus = 'refunded'; }
    }
    db.prepare(
      `UPDATE registrations SET status = 'cancelled', cancelled_at = datetime('now'),
         refund_cents = ?, payment_status = ? WHERE id = ?`,
    ).run(refund, paymentStatus, current.id);

    if (actor.id !== current.user_id || byCity) {
      notify(db, current.user_id, `L’inscription de ${m.first_name} ${m.last_name} à « ${a.title} » a été annulée par le Service des loisirs.${refund ? ' Un remboursement sera émis.' : ''}`);
    }
    audit(db, actor.id, 'registration.cancel', 'registration', current.id, { refund, byCity });
    const promoted = current.status === 'confirmed' ? fillFromWaitlist(ctx, a.id) : [];
    return { refund_cents: refund, promoted };
  });
}

export function cancelActivity(ctx, activityId, actor) {
  const { db } = ctx;
  return tx(db, () => {
    const a = db.prepare('SELECT * FROM activities WHERE id = ?').get(activityId);
    if (!a) throw new HttpError(404, 'Activité introuvable.');
    if (a.status === 'cancelled') throw new HttpError(409, 'Activité déjà annulée.');
    db.prepare("UPDATE activities SET status = 'cancelled' WHERE id = ?").run(a.id);
    const regs = db.prepare("SELECT * FROM registrations WHERE activity_id = ? AND status <> 'cancelled'").all(a.id);
    for (const r of regs) cancelRegistration(ctx, r, actor, { byCity: true });
    audit(db, actor.id, 'activity.cancel', 'activity', a.id, { registrations: regs.length });
    return { cancelled_registrations: regs.length };
  });
}

/* ---------- Paiement (simulé) ---------- */
export function payRegistrations(ctx, owner, ids, { actor = owner, method = 'en_ligne' } = {}) {
  const { db } = ctx;
  if (!Array.isArray(ids) || ids.length === 0) throw new HttpError(422, 'Aucune inscription sélectionnée.');
  return tx(db, () => {
    const uniq = [...new Set(ids.map(Number))];
    const rows = uniq.map((id) => db.prepare('SELECT * FROM registrations WHERE id = ? AND user_id = ?').get(id, owner.id));
    if (rows.some((r) => !r)) throw new HttpError(404, 'Inscription introuvable.');
    if (rows.some((r) => r.status !== 'confirmed' || r.payment_status !== 'unpaid')) {
      throw new HttpError(409, 'Seules les inscriptions confirmées et impayées peuvent être payées.');
    }
    const total = rows.reduce((s, r) => s + r.price_cents, 0);
    const info = db.prepare(
      'INSERT INTO payments(user_id, reference, total_cents, method, created_by) VALUES (?,?,?,?,?)',
    ).run(owner.id, `TMP-${Date.now()}-${Math.random()}`, total, method, actor.id);
    const paymentId = Number(info.lastInsertRowid);
    const reference = `R-${todayStr(ctx).slice(0, 4)}-${String(paymentId).padStart(6, '0')}`;
    db.prepare('UPDATE payments SET reference = ? WHERE id = ?').run(reference, paymentId);
    for (const r of rows) {
      db.prepare("UPDATE registrations SET payment_status = 'paid', payment_id = ?, paid_at = datetime('now') WHERE id = ?")
        .run(paymentId, r.id);
    }
    audit(db, actor.id, 'payment.create', 'payment', paymentId, { total, method, count: rows.length });
    return db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  });
}

/* ---------- Statistiques ---------- */
export function dashboard(ctx, seasonId) {
  const { db } = ctx;
  const totals = db.prepare(
    `SELECT COALESCE(SUM(status='confirmed'),0) AS confirmed, COALESCE(SUM(status='waitlist'),0) AS waitlist,
            COALESCE(SUM(status='cancelled'),0) AS cancelled FROM registrations`,
  ).get();
  const money = db.prepare(
    `SELECT (SELECT COALESCE(SUM(total_cents),0) FROM payments) AS collected,
            (SELECT COALESCE(SUM(refund_cents),0) FROM registrations) AS refunded,
            (SELECT COALESCE(SUM(price_cents),0) FROM registrations WHERE status='confirmed' AND payment_status='unpaid') AS outstanding`,
  ).get();
  const counts = db.prepare(
    `SELECT (SELECT COUNT(*) FROM activities WHERE status='published') AS published_activities,
            (SELECT COUNT(*) FROM users WHERE role='citizen') AS citizens,
            (SELECT COUNT(*) FROM members WHERE archived=0) AS members`,
  ).get();
  const activities = db.prepare(
    `SELECT a.id, a.title, a.category, a.capacity,
       (SELECT COUNT(*) FROM registrations r WHERE r.activity_id=a.id AND r.status='confirmed') AS confirmed,
       (SELECT COUNT(*) FROM registrations r WHERE r.activity_id=a.id AND r.status='waitlist') AS waitlist
     FROM activities a WHERE a.status='published' AND a.season_id = ? ORDER BY a.title`,
  ).all(seasonId ?? -1);
  const byCategory = {};
  for (const a of activities) byCategory[a.category] = (byCategory[a.category] || 0) + a.confirmed;
  return {
    registrations: { ...totals },
    money: { ...money, net: money.collected - money.refunded },
    counts: { ...counts },
    activities: activities.map((a) => ({ ...a })),
    by_category: Object.entries(byCategory).map(([category, confirmed]) => ({ category, confirmed })),
  };
}
