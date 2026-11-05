// Netlify Function: kart-nåler (scener, barer, mat, møtepunkt, toalett, inngang)
// for det ekte OpenStreetMap-kartet over Ekebergsletta. Lagres i Netlify Blobs.
//
// Hver nål: { id, name, type, lat, lng }  — ekte bredde-/lengdegrad (WGS84).
// type: 'stage' | 'bar' | 'food' | 'meet' | 'toilet' | 'entrance' | 'other'
//
// Endepunkter:
//   GET  /api/mappins                              -> { pins: [...] }
//        Seeder med DEFAULT_PINS første gang (omtrentlige plassholdere).
//   POST /api/mappins { password, action:'upsert', pin:{...} }
//   POST /api/mappins { password, action:'delete', id }
//   POST /api/mappins { password, action:'reset' }
//
// Admin-passord: miljøvariabel ADMIN_PASSWORD (samme som resten).
//
// Lagringsnøkkelen er 'current-v2': eldre nåler (v2.14, x/y-prosent på
// skjematisk kart) var bare plassholdere og forkastes.

import { getStore } from '@netlify/blobs';

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}

const VALID_TYPES = ['stage', 'bar', 'food', 'meet', 'toilet', 'entrance', 'other'];

// Omtrentlige PLASSHOLDERE rundt Ekebergsletta (~59.8936, 10.7808). Den
// faktiske festivalplanløsningen kjenner vi ikke — admin flytter nålene
// presist ut fra det offisielle festivalkartet.
const DEFAULT_PINS = [
  { id: 'p-scream',    name: 'Scream Stage',    type: 'stage',    lat: 59.8932, lng: 10.7815 },
  { id: 'p-vampire',   name: 'Vampire Stage',   type: 'stage',    lat: 59.8950, lng: 10.7790 },
  { id: 'p-moonlight', name: 'Moonlight Stage', type: 'stage',    lat: 59.8948, lng: 10.7835 },
  { id: 'p-storm',     name: 'The Storm Stage', type: 'stage',    lat: 59.8920, lng: 10.7795 },
  { id: 'p-bar1',      name: 'Bar vest',        type: 'bar',      lat: 59.8938, lng: 10.7795 },
  { id: 'p-bar2',      name: 'Bar øst',         type: 'bar',      lat: 59.8940, lng: 10.7828 },
  { id: 'p-bar3',      name: 'Bar Scream',      type: 'bar',      lat: 59.8927, lng: 10.7808 },
  { id: 'p-bar4',      name: 'Bar Storm',       type: 'bar',      lat: 59.8924, lng: 10.7787 },
  { id: 'p-food1',     name: 'Mat (burger)',    type: 'food',     lat: 59.8942, lng: 10.7805 },
  { id: 'p-food2',     name: 'Mat (pizza)',     type: 'food',     lat: 59.8934, lng: 10.7826 },
  { id: 'p-food3',     name: 'Mat (taco)',      type: 'food',     lat: 59.8945, lng: 10.7812 },
  { id: 'p-toilet1',   name: 'Toalett nord',    type: 'toilet',   lat: 59.8953, lng: 10.7808 },
  { id: 'p-toilet2',   name: 'Toalett vest',    type: 'toilet',   lat: 59.8935, lng: 10.7782 },
  { id: 'p-toilet3',   name: 'Toalett øst',     type: 'toilet',   lat: 59.8936, lng: 10.7838 },
  { id: 'p-toilet4',   name: 'Toalett sør',     type: 'toilet',   lat: 59.8921, lng: 10.7815 },
  { id: 'p-meet1',     name: 'Møtepunkt – midten',  type: 'meet', lat: 59.8938, lng: 10.7808 },
  { id: 'p-meet2',     name: 'Møtepunkt – inngang', type: 'meet', lat: 59.8918, lng: 10.7808 },
  { id: 'p-first',     name: 'Førstehjelp',     type: 'other',    lat: 59.8929, lng: 10.7830 },
  { id: 'p-water',     name: 'Gratis vann',     type: 'other',    lat: 59.8943, lng: 10.7798 },
  { id: 'p-entrance',  name: 'Hovedinngang',    type: 'entrance', lat: 59.8914, lng: 10.7808 }
];

function validatePin(p) {
  if (!p || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 60) return 'Ugyldig navn';
  if (!VALID_TYPES.includes(p.type)) return 'Ugyldig type';
  const lat = Number(p.lat), lng = Number(p.lng);
  // Grov sjekk: innenfor Oslo-området (hindrer feilklikk langt unna)
  if (isNaN(lat) || lat < 59.8 || lat > 60.0 || isNaN(lng) || lng < 10.6 || lng > 10.9) return 'Ugyldig posisjon';
  return null;
}

async function getPins(store) {
  let pins = await store.get('current-v2', { type: 'json' });
  if (!pins) { pins = DEFAULT_PINS; await store.setJSON('current-v2', pins); }
  return pins;
}

export default async (req) => {
  const store = getStore('mappins');

  if (req.method === 'GET') {
    return json({ pins: await getPins(store) });
  }

  if (req.method === 'POST') {
    let body = {};
    try { body = await req.json(); } catch (e) { /* tom body */ }
    const expected = process.env.ADMIN_PASSWORD || '';
    if (!expected) return json({ error: 'Admin ikke konfigurert (mangler ADMIN_PASSWORD)' }, 500);
    if (body.password !== expected) return json({ error: 'Feil passord' }, 403);

    let pins = await getPins(store);

    if (body.action === 'reset') {
      pins = DEFAULT_PINS;
      await store.setJSON('current-v2', pins);
      return json({ ok: true, pins });
    }

    if (body.action === 'delete') {
      if (!body.id) return json({ error: 'Mangler id' }, 400);
      pins = pins.filter(p => p.id !== body.id);
      await store.setJSON('current-v2', pins);
      return json({ ok: true, pins });
    }

    if (body.action === 'upsert') {
      const err = validatePin(body.pin);
      if (err) return json({ error: err }, 400);
      const clean = {
        id: body.pin.id || ('pin-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
        name: body.pin.name.trim(),
        type: body.pin.type,
        lat: Math.round(Number(body.pin.lat) * 1e6) / 1e6,
        lng: Math.round(Number(body.pin.lng) * 1e6) / 1e6
      };
      const idx = pins.findIndex(p => p.id === clean.id);
      if (idx >= 0) pins[idx] = clean; else pins.push(clean);
      await store.setJSON('current-v2', pins);
      return json({ ok: true, pins, pin: clean });
    }

    return json({ error: 'Ukjent action' }, 400);
  }

  return json({ error: 'Metode ikke støttet' }, 405);
};

export const config = { path: '/api/mappins' };
