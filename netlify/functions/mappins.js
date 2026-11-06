// Netlify Function: kart-nåler (scener, barer, mat, møtepunkt, toalett, inngang)
// for det offisielle Tons of Rock 2026-festivalkartet (lagt over OpenStreetMap). Lagres i Netlify Blobs.
//
// Hver nål: { id, name, type, x, y }  — x/y i prosent (0-100) av festivalkart-bildet
// (0,0 = øverst til venstre). Appen regner om til lat/lng for gatekartet.
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
// Lagringsnøkkelen er 'current-v3': eldre nåler var gjetninger og forkastes.

import { getStore } from '@netlify/blobs';

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}

const VALID_TYPES = ['stage', 'bar', 'food', 'meet', 'toilet', 'entrance', 'other'];

// Posisjoner avlest fra det offisielle 2026-kartet (x/y i % av bildet). Omtrentlige
// (±2 %) — admin kan finjustere. Møtepunktene er forslag, ikke fra kartet.
const DEFAULT_PINS = [
  { id: 'p01', name: 'Moonlight Stage', type: 'stage', x: 70, y: 15 },
  { id: 'p02', name: 'Vampire Stage', type: 'stage', x: 10, y: 44 },
  { id: 'p03', name: 'The Storm Stage', type: 'stage', x: 32, y: 64 },
  { id: 'p04', name: 'Scream Stage', type: 'stage', x: 89, y: 63 },
  { id: 'p05', name: 'The Swamp', type: 'stage', x: 81, y: 28 },
  { id: 'p06', name: 'Bar', type: 'bar', x: 48, y: 26 },
  { id: 'p07', name: 'Bar', type: 'bar', x: 41, y: 31 },
  { id: 'p08', name: 'Bar', type: 'bar', x: 34, y: 34 },
  { id: 'p09', name: 'Bar', type: 'bar', x: 66, y: 43 },
  { id: 'p10', name: 'Bar', type: 'bar', x: 80, y: 43 },
  { id: 'p11', name: 'Bar', type: 'bar', x: 81, y: 46 },
  { id: 'p12', name: 'Bar', type: 'bar', x: 82, y: 48 },
  { id: 'p13', name: 'Bar', type: 'bar', x: 44, y: 52 },
  { id: 'p14', name: 'Bar', type: 'bar', x: 46, y: 54 },
  { id: 'p15', name: 'Bar', type: 'bar', x: 48, y: 57 },
  { id: 'p16', name: 'Bar', type: 'bar', x: 64, y: 54 },
  { id: 'p17', name: 'Bar', type: 'bar', x: 56, y: 80 },
  { id: 'p18', name: 'Bar', type: 'bar', x: 52, y: 81 },
  { id: 'p19', name: 'Bar', type: 'bar', x: 49, y: 82 },
  { id: 'p20', name: 'Mat', type: 'food', x: 26, y: 33 },
  { id: 'p21', name: 'Mat', type: 'food', x: 43, y: 42 },
  { id: 'p22', name: 'Mat', type: 'food', x: 67, y: 45 },
  { id: 'p23', name: 'Mat', type: 'food', x: 84, y: 39 },
  { id: 'p24', name: 'Mat', type: 'food', x: 24, y: 53 },
  { id: 'p25', name: 'Mat', type: 'food', x: 24, y: 57 },
  { id: 'p26', name: 'Mat', type: 'food', x: 27, y: 60 },
  { id: 'p27', name: 'Mat', type: 'food', x: 42, y: 85 },
  { id: 'p28', name: 'Toalett', type: 'toilet', x: 58, y: 20 },
  { id: 'p29', name: 'Toalett', type: 'toilet', x: 58, y: 40 },
  { id: 'p30', name: 'Toalett', type: 'toilet', x: 86, y: 73 },
  { id: 'p31', name: 'Toalett', type: 'toilet', x: 28, y: 88 },
  { id: 'p32', name: 'Inngang / utgang', type: 'entrance', x: 16, y: 82 },
  { id: 'p33', name: 'Utgang', type: 'entrance', x: 62, y: 12 },
  { id: 'p34', name: 'Utgang', type: 'entrance', x: 80, y: 79 },
  { id: 'p35', name: 'Camp', type: 'other', x: 85, y: 34 },
  { id: 'p36', name: 'Market', type: 'other', x: 52, y: 30 },
  { id: 'p37', name: 'Vinhagen', type: 'other', x: 57, y: 35 },
  { id: 'p38', name: 'Tivoli', type: 'other', x: 69, y: 38 },
  { id: 'p39', name: 'VIP-område', type: 'other', x: 62, y: 49 },
  { id: 'p40', name: 'Blind Spot', type: 'other', x: 72, y: 70 },
  { id: 'p41', name: 'Black Diamond', type: 'other', x: 70, y: 77 },
  { id: 'p42', name: 'Merchandise', type: 'other', x: 35, y: 74 },
  { id: 'p43', name: 'Førstehjelp', type: 'other', x: 36, y: 86 },
  { id: 'p44', name: 'Tilgjengelighet (HC)', type: 'other', x: 27, y: 41 },
  { id: 'p45', name: 'Tilgjengelighet (HC)', type: 'other', x: 77, y: 51 },
  { id: 'p46', name: 'Møtepunkt – inngang', type: 'meet', x: 20, y: 79 },
  { id: 'p47', name: 'Møtepunkt – midten', type: 'meet', x: 45, y: 47 }
];

function validatePin(p) {
  if (!p || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 60) return 'Ugyldig navn';
  if (!VALID_TYPES.includes(p.type)) return 'Ugyldig type';
  const x = Number(p.x), y = Number(p.y);
  if (isNaN(x) || x < 0 || x > 100 || isNaN(y) || y < 0 || y > 100) return 'Ugyldig posisjon';
  return null;
}

async function getPins(store) {
  let pins = await store.get('current-v3', { type: 'json' });
  if (!pins) { pins = DEFAULT_PINS; await store.setJSON('current-v3', pins); }
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
      await store.setJSON('current-v3', pins);
      return json({ ok: true, pins });
    }

    if (body.action === 'delete') {
      if (!body.id) return json({ error: 'Mangler id' }, 400);
      pins = pins.filter(p => p.id !== body.id);
      await store.setJSON('current-v3', pins);
      return json({ ok: true, pins });
    }

    if (body.action === 'upsert') {
      const err = validatePin(body.pin);
      if (err) return json({ error: err }, 400);
      const clean = {
        id: body.pin.id || ('pin-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
        name: body.pin.name.trim(),
        type: body.pin.type,
        x: Math.round(Number(body.pin.x) * 10) / 10,
        y: Math.round(Number(body.pin.y) * 10) / 10
      };
      const idx = pins.findIndex(p => p.id === clean.id);
      if (idx >= 0) pins[idx] = clean; else pins.push(clean);
      await store.setJSON('current-v3', pins);
      return json({ ok: true, pins, pin: clean });
    }

    return json({ error: 'Ukjent action' }, 400);
  }

  return json({ error: 'Metode ikke støttet' }, 405);
};

export const config = { path: '/api/mappins' };
