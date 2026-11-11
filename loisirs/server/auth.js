import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { SESSION_DAYS } from './constants.js';

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

const DUMMY_HASH = hashPassword('dummy-password-for-timing');
/** Évite de révéler l'existence d'un compte par le temps de réponse. */
export function burnVerify(password) { verifyPassword(password, DUMMY_HASH); }

const sha = (t) => createHash('sha256').update(t).digest('hex');

export function createSession(db, userId, now) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(now().getTime() + SESSION_DAYS * 86400_000).toISOString();
  db.prepare('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?,?,?)').run(sha(token), userId, expires);
  return { token, maxAge: SESSION_DAYS * 86400 };
}

export function findSessionUser(db, token, now) {
  if (!token) return null;
  const row = db.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).get(sha(token), now().toISOString());
  return row || null;
}

export function destroySession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
}

export function purgeExpiredSessions(db, now) {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now().toISOString());
}
