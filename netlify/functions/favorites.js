// Netlify Function: lagrer og henter favoritter per brukernavn
// Bruker Netlify Blobs som database (nøkkel/verdi)
//
// Endepunkter (alle via /.netlify/functions/favorites):
//   GET  ?user=Rune          → henter favoritter for "Rune"
//   POST { user, favorites } → lagrer favoritter for en bruker
//
// Åpen tilgang (ingen passord). Validering: brukernavn 3–30 tegn,
// kun bokstaver, tall, bindestrek og understrek.

import { getStore } from '@netlify/blobs';

// Renser og validerer brukernavn
function cleanUser(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length < 3 || trimmed.length > 30) return null;
  // Kun trygge tegn — hindrer rare nøkler i databasen
  if (!/^[A-Za-z0-9æøåÆØÅ_\- ]+$/.test(trimmed)) return null;
  return trimmed;
}

export default async (req, context) => {
  const store = getStore('favorites');
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers });
  }

  try {
    // ---- HENT favoritter ----
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const user = cleanUser(url.searchParams.get('user'));
      if (!user) {
        return new Response(JSON.stringify({ error: 'Ugyldig brukernavn' }), { status: 400, headers });
      }
      const data = await store.get(`user:${user}`, { type: 'json' });
      return new Response(JSON.stringify({
        user,
        favorites: (data && data.favorites) || [],
        updated: (data && data.updated) || null
      }), { status: 200, headers });
    }

    // ---- LAGRE favoritter ----
    if (req.method === 'POST') {
      const body = await req.json();
      const user = cleanUser(body.user);
      if (!user) {
        return new Response(JSON.stringify({ error: 'Ugyldig brukernavn (3–30 tegn)' }), { status: 400, headers });
      }
      if (!Array.isArray(body.favorites)) {
        return new Response(JSON.stringify({ error: 'favorites må være en liste' }), { status: 400, headers });
      }
      // Begrens størrelse: maks 200 favoritter, hvert navn maks 100 tegn
      const favorites = body.favorites
        .filter(f => typeof f === 'string' && f.length <= 100)
        .slice(0, 200);

      const record = { favorites, updated: new Date().toISOString() };
      await store.setJSON(`user:${user}`, record);
      return new Response(JSON.stringify({ ok: true, user, count: favorites.length }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: 'Metode ikke støttet' }), { status: 405, headers });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Serverfeil', detail: String(err) }), { status: 500, headers });
  }
};
