// Netlify Function: favoritter, venner, brukerliste, admin, tribune-posisjon og PIN
// Database: Netlify Blobs (nøkkel/verdi)
//
// Endepunkter:
//   GET  /api/favorites?user=Rune       -> { user, favorites, friends, positions, updated }
//   POST /api/favorites { user, favorites, friends } -> lagrer profil (bevarer PIN)
//   GET  /api/users                     -> { users:[{ name, count, updated, hasPin }] }
//   POST /api/admin-delete { password, users:[...] } -> sletter brukere
//   POST /api/admin-delete { password, action:'reset-pin', user } -> nullstiller PIN på én bruker
//   GET  /api/positions?band=X          -> { band, positions:[{ user, pos, meet }] }
//   POST /api/position { user, band, pos, meet } -> live-lagrer én posisjon (bevarer PIN)
//   GET  /api/pin-status?user=X         -> { user, exists, hasPin } (avslører ALDRI PIN-en)
//   POST /api/pin-set { user, action:'set', pin, oldPin? }    -> claim/sett PIN (4 siffer)
//   POST /api/pin-set { user, action:'verify', pin }          -> { ok, hasPin }
//
// Admin-passord i miljovariabel ADMIN_PASSWORD (settes i Netlify), ikke i koden.
// PIN lagres ALDRI i klartekst — kun saltet SHA-256-hash (Web Crypto, tilgjengelig
// som global `crypto` i Netlify sin Deno-baserte funksjonsruntime).

import { getStore } from '@netlify/blobs';

function cleanUser(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length < 3 || trimmed.length > 30) return null;
  if (!/^[A-Za-zæøåÆØÅ0-9_\- ]+$/.test(trimmed)) return null;
  return trimmed;
}

function cleanPin(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const s = String(raw).trim();
  return /^\d{4}$/.test(s) ? s : null;
}

function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPin(pin, salt) {
  const enc = new TextEncoder().encode(salt + ':' + pin);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function pinMatches(pin, record) {
  if (!record || !record.pinHash || !record.pinSalt) return true; // ingen PIN satt = åpen profil
  const got = await hashPin(pin || '', record.pinSalt);
  return got === record.pinHash;
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
    // ALLE BRUKERE (venneliste + admin) — inkluderer hvem som har PIN
    if (req.method === 'GET' && url.pathname.endsWith('/users')) {
      const { blobs } = await store.list();
      const users = [];
      for (const b of blobs) {
        const name = b.key.replace(/^user:/, '');
        const data = await store.get(b.key, { type: 'json' });
        users.push({
          name,
          count: (data && data.favorites) ? data.favorites.length : 0,
          updated: (data && data.updated) || null,
          hasPin: !!(data && data.pinHash)
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

    // PIN-STATUS for ett navn: finnes profilen, og er den PIN-beskyttet?
    // Avslører ALDRI selve PIN-en — bare om en er satt.
    if (req.method === 'GET' && url.pathname.endsWith('/pin-status')) {
      const user = cleanUser(url.searchParams.get('user'));
      if (!user) return json({ error: 'Ugyldig brukernavn' }, 400);
      const data = await store.get('user:' + user, { type: 'json' });
      return json({
        user,
        exists: !!data,
        hasPin: !!(data && data.pinHash)
      });
    }

    // ADMIN: SLETT BRUKERE eller NULLSTILL PIN PÅ ÉN BRUKER
    if (req.method === 'POST' && url.pathname.endsWith('/admin-delete')) {
      const body = await req.json();
      const expected = process.env.ADMIN_PASSWORD || '';
      if (!expected) return json({ error: 'Admin ikke konfigurert (mangler ADMIN_PASSWORD)' }, 500);
      if (body.password !== expected) return json({ error: 'Feil passord' }, 403);

      // Admin kan nullstille PIN på én bruker (sikkerhetsnett ved glemt PIN)
      if (body.action === 'reset-pin') {
        const u = cleanUser(body.user);
        if (!u) return json({ error: 'Ugyldig brukernavn' }, 400);
        const rec = await store.get('user:' + u, { type: 'json' });
        if (!rec) return json({ error: 'Fant ikke bruker' }, 404);
        delete rec.pinHash;
        delete rec.pinSalt;
        rec.updated = new Date().toISOString();
        await store.setJSON('user:' + u, rec);
        return json({ ok: true, reset: u });
      }

      if (!Array.isArray(body.users)) return json({ error: 'users ma vaere en liste' }, 400);
      let deleted = 0;
      for (const raw of body.users) {
        const u = cleanUser(raw);
        if (u) { await store.delete('user:' + u); deleted++; }
      }
      return json({ ok: true, deleted });
    }

    // SETT eller VERIFISER PIN på en profil.
    //   action:'verify' -> sjekk at PIN stemmer (eller at profilen er åpen, dvs. ingen PIN satt)
    //   action:'set'    -> sett PIN. Hvis profilen alt har PIN, kreves gammel PIN (oldPin) for å endre.
    if (req.method === 'POST' && url.pathname.endsWith('/pin-set')) {
      const body = await req.json();
      const user = cleanUser(body.user);
      if (!user) return json({ error: 'Ugyldig brukernavn' }, 400);
      const rec = (await store.get('user:' + user, { type: 'json' })) || null;

      if (body.action === 'verify') {
        const ok = await pinMatches(body.pin, rec);
        return json({ ok, hasPin: !!(rec && rec.pinHash) });
      }

      if (body.action === 'set') {
        const pin = cleanPin(body.pin);
        if (!pin) return json({ error: 'PIN må være 4 siffer' }, 400);
        // Hvis profilen alt har PIN, kan den ikke overskrives uten å kjenne den gamle
        // (hindrer at noen kaprer et navn som allerede er sikret av en annen)
        if (rec && rec.pinHash) {
          const ok = await pinMatches(body.oldPin, rec);
          if (!ok) return json({ error: 'Profilen er allerede sikret med PIN' }, 403);
        }
        const base = rec || { favorites: [], friends: [], positions: {} };
        const salt = randomSalt();
        base.pinHash = await hashPin(pin, salt);
        base.pinSalt = salt;
        base.updated = new Date().toISOString();
        await store.setJSON('user:' + user, base);
        return json({ ok: true });
      }

      return json({ error: 'Ukjent action' }, 400);
    }

    // LIVE-LAGRE ÉN POSISJON (tribune) — bevarer PIN
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
      // VIKTIG: bevar PIN-feltene — ellers slettes PIN hver gang noen flytter seg på kartet
      if (existing.pinHash) { record.pinHash = existing.pinHash; record.pinSalt = existing.pinSalt; }
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

    // LAGRE PROFIL (favoritter + venner; bevarer posisjoner OG PIN)
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
      // VIKTIG: bevar PIN-feltene — ellers slettes PIN hver gang noen lagrer favoritter
      if (existing.pinHash) { record.pinHash = existing.pinHash; record.pinSalt = existing.pinSalt; }
      await store.setJSON('user:' + user, record);
      return json({ ok: true, user, count: favorites.length, friends: friends.length });
    }

    return json({ error: 'Metode ikke stottet' }, 405);
  } catch (err) {
    return json({ error: 'Serverfeil', detail: String(err) }, 500);
  }
};
