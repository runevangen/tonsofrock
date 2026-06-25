// Netlify Function: favoritter, venner, brukerliste, admin og tribune-posisjon
// Database: Netlify Blobs (nøkkel/verdi)
//
// Endepunkter:
//   GET  /api/favorites?user=Rune       -> { user, favorites, friends, positions, updated }
//   POST /api/favorites { user, favorites, friends } -> lagrer profil
//   GET  /api/users                     -> { users:[{ name, count, updated }] }
//   POST /api/admin-delete { password, users:[...] } -> sletter brukere
//   GET  /api/positions?band=X          -> { band, positions:[{ user, pos, meet }] }
//   POST /api/position { user, band, pos, meet } -> live-lagrer én posisjon
//
// Admin-passord i miljovariabel ADMIN_PASSWORD (settes i Netlify), ikke i koden.

import { getStore } from '@netlify/blobs';

function cleanUser(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length < 3 || trimmed.length > 30) return null;
  if (!/^[A-Za-zæøåÆØÅ0-9_\- ]+$/.test(trimmed)) return null;
  return trimmed;
}

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: CORS });
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });

  const store = getStore('favorites');
  const url = new URL(req.url);

  try {
    // ALLE BRUKERE (venneliste + admin)
    if (req.method === 'GET' && url.pathname.endsWith('/users')) {
      const { blobs } = await store.list();
      const users = [];
      for (const b of blobs) {
        const name = b.key.replace(/^user:/, '');
        const data = await store.get(b.key, { type: 'json' });
        users.push({
          name,
          count: (data && data.favorites) ? data.favorites.length : 0,
          updated: (data && data.updated) || null
        });
      }
      users.sort((a, b) => a.name.localeCompare(b.name));
      return json({ users });
    }

    // ALLE POSISJONER FOR ET BAND (tribune-kart)
    if (req.method === 'GET' && url.pathname.endsWith('/positions')) {
      const band = url.searchParams.get('band');
      if (!band) return json({ error: 'Mangler band' }, 400);
      const { blobs } = await store.list();
      const positions = [];
      for (const b of blobs) {
        const name = b.key.replace(/^user:/, '');
        const data = await store.get(b.key, { type: 'json' });
        const p = data && data.positions && data.positions[band];
        if (p && typeof p.pos === 'number') {
          positions.push({ user: name, pos: p.pos, meet: !!p.meet });
        }
      }
      return json({ band, positions });
    }

    // ADMIN: SLETT BRUKERE
    if (req.method === 'POST' && url.pathname.endsWith('/admin-delete')) {
      const body = await req.json();
      const expected = process.env.ADMIN_PASSWORD || '';
      if (!expected) return json({ error: 'Admin ikke konfigurert (mangler ADMIN_PASSWORD)' }, 500);
      if (body.password !== expected) return json({ error: 'Feil passord' }, 403);
      if (!Array.isArray(body.users)) return json({ error: 'users ma vaere en liste' }, 400);
      let deleted = 0;
      for (const raw of body.users) {
        const u = cleanUser(raw);
        if (u) { await store.delete('user:' + u); deleted++; }
      }
      return json({ ok: true, deleted });
    }

    // LIVE-LAGRE ÉN POSISJON (tribune)
    if (req.method === 'POST' && url.pathname.endsWith('/position')) {
      const body = await req.json();
      const user = cleanUser(body.user);
      if (!user) return json({ error: 'Ugyldig brukernavn' }, 400);
      const band = typeof body.band === 'string' ? body.band.slice(0, 100) : null;
      if (!band) return json({ error: 'Mangler band' }, 400);
      const existing = (await store.get('user:' + user, { type: 'json' })) || {};
      const positions = existing.positions || {};
      // pos = null betyr "fjern meg fra kartet"
      if (body.pos === null || body.pos === undefined) {
        delete positions[band];
      } else {
        const pos = parseInt(body.pos, 10);
        if (isNaN(pos) || pos < 0 || pos > 8) return json({ error: 'Ugyldig posisjon' }, 400);
        positions[band] = { pos, meet: !!body.meet };
      }
      const record = {
        favorites: existing.favorites || [],
        friends: existing.friends || [],
        positions,
        updated: new Date().toISOString()
      };
      await store.setJSON('user:' + user, record);
      return json({ ok: true });
    }

    // HENT PROFIL
    if (req.method === 'GET') {
      const user = cleanUser(url.searchParams.get('user'));
      if (!user) return json({ error: 'Ugyldig brukernavn' }, 400);
      const data = await store.get('user:' + user, { type: 'json' });
      return json({
        user,
        favorites: (data && data.favorites) || [],
        friends: (data && data.friends) || [],
        positions: (data && data.positions) || {},
        updated: (data && data.updated) || null
      });
    }

    // LAGRE PROFIL (favoritter + venner; bevarer posisjoner)
    if (req.method === 'POST') {
      const body = await req.json();
      const user = cleanUser(body.user);
      if (!user) return json({ error: 'Ugyldig brukernavn (3-30 tegn)' }, 400);
      const existing = (await store.get('user:' + user, { type: 'json' })) || {};
      const favorites = Array.isArray(body.favorites)
        ? body.favorites.filter(f => typeof f === 'string' && f.length <= 100).slice(0, 200)
        : (existing.favorites || []);
      const friends = Array.isArray(body.friends)
        ? body.friends.map(cleanUser).filter(Boolean).slice(0, 100)
        : (existing.friends || []);
      const record = {
        favorites, friends,
        positions: existing.positions || {},
        updated: new Date().toISOString()
      };
      await store.setJSON('user:' + user, record);
      return json({ ok: true, user, count: favorites.length, friends: friends.length });
    }

    return json({ error: 'Metode ikke stottet' }, 405);
  } catch (err) {
    return json({ error: 'Serverfeil', detail: String(err) }, 500);
  }
};
