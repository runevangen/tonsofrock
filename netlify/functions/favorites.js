// Netlify Function: favoritter, venner, brukerliste og admin
// Database: Netlify Blobs (nøkkel/verdi)
//
// Endepunkter:
//   GET  /api/favorites?user=Rune       -> { user, favorites, friends, updated }
//   POST /api/favorites { user, favorites, friends } -> lagrer profil
//   GET  /api/users                     -> { users:[{ name, count, updated }] }
//   POST /api/admin-delete { password, users:[...] } -> sletter brukere
//
// Admin-passord ligger i miljovariabel ADMIN_PASSWORD (settes i Netlify),
// IKKE i koden. Apen palogging ellers.

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

    // HENT PROFIL
    if (req.method === 'GET') {
      const user = cleanUser(url.searchParams.get('user'));
      if (!user) return json({ error: 'Ugyldig brukernavn' }, 400);
      const data = await store.get('user:' + user, { type: 'json' });
      return json({
        user,
        favorites: (data && data.favorites) || [],
        friends: (data && data.friends) || [],
        updated: (data && data.updated) || null
      });
    }

    // LAGRE PROFIL
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
      const record = { favorites, friends, updated: new Date().toISOString() };
      await store.setJSON('user:' + user, record);
      return json({ ok: true, user, count: favorites.length, friends: friends.length });
    }

    return json({ error: 'Metode ikke stottet' }, 405);
  } catch (err) {
    return json({ error: 'Serverfeil', detail: String(err) }, 500);
  }
};
