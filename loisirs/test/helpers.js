import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { seedDemo, DEMO_PASSWORD } from '../server/seed.js';

export { DEMO_PASSWORD };

/** Démarre l'application sur un port éphémère avec une horloge figée. */
export async function startApp({ date = '2026-11-11T15:00:00Z', seed = true } = {}) {
  let current = new Date(date);
  const db = openDb(':memory:');
  const { server, ctx } = createApp({ db, now: () => current });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  if (seed) seedDemo(ctx);

  function client() {
    let cookie = '';
    const call = async (method, path, body, headers = {}) => {
      const res = await fetch(base + path, {
        method,
        headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
      const type = res.headers.get('content-type') || '';
      const buf = Buffer.from(await res.arrayBuffer());
      const data = res.status === 204 ? null : type.includes('json') ? JSON.parse(buf.toString('utf8')) : buf.toString('utf8'); // Buffer conserve le BOM
      return { status: res.status, data, headers: res.headers };
    };
    return {
      get: (p) => call('GET', p), post: (p, b = {}) => call('POST', p, b), put: (p, b) => call('PUT', p, b), del: (p) => call('DELETE', p),
      raw: call,
      async login(email, password = DEMO_PASSWORD) {
        const r = await call('POST', '/api/auth/login', { email, password });
        if (r.status !== 200) throw new Error('login failed ' + JSON.stringify(r.data));
        return r.data.user;
      },
    };
  }
  return {
    base, db, ctx, client,
    setNow: (d) => { current = new Date(d); },
    close: () => new Promise((r) => { server.close(r); server.closeAllConnections?.(); }),
  };
}

export async function activityByTitle(c, title, seasonId) {
  const { data } = await c.get('/api/activities' + (seasonId ? `?season_id=${seasonId}` : ''));
  return data.find((a) => a.title.startsWith(title));
}
