// Netlify Function: kart-nåler (scener, mat, møtepunkt, toalett, inngang)
// for det skjematiske Ekeberg-kartet. Lagres i Netlify Blobs.
//
// Hver nål: { id, name, type, x, y }  — x/y i prosent (0-100) av kartet.
// type: 'stage' | 'food' | 'meet' | 'toilet' | 'entrance' | 'other'
//
// Endepunkter:
//   GET  /api/mappins                              -> { pins: [...] }
//        Seeder med DEFAULT_PINS første gang (omtrentlige plassholdere).
//   POST /api/mappins { password, action:'upsert', pin:{...} }
//   POST /api/mappins { password, action:'delete', id }
//   POST /api/mappins { password, action:'reset' }
//
// Admin-passord: miljøvariabel ADMIN_PASSWORD (samme som resten).

import { getStore } from '@netlify/blobs';

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}

const VALID_TYPES = ['stage', 'food', 'meet', 'toilet', 'entrance', 'other'];

// Omtrentlige PLASSHOLDERE — flyttes presist i admin ut fra det offisielle
// 2026-kartet. x/y er prosent på det skjematiske kartet (0,0 = oppe til venstre).
const DEFAULT_PINS = [
  { id: 'p-scream',   name: 'Scream Stage',   type: 'stage',    x: 50, y: 80 },
  { id: 'p-vampire',  name: 'Vampire Stage',  type: 'stage',    x: 22, y: 40 },
  { id: 'p-moonlight',name: 'Moonlight Stage',type: 'stage',    x: 78, y: 42 },
  { id: 'p-storm',    name: 'The Storm Stage',type: 'stage',    x: 50, y: 22 },
  { id: 'p-food1',    name: 'Mat (burger)',   type: 'food',     x: 35, y: 58 },
  { id: 'p-food2',    name: 'Mat (pizza)',    type: 'food',     x: 65, y: 62 },
  { id: 'p-food3',    name: 'Mat (taco)',     type: 'food',     x: 62, y: 30 },
  { id: 'p-meet1',    name: 'Møtepunkt – midten', type: 'meet', x: 50, y: 50 },
  { id: 'p-meet2',    name: 'Møtepunkt – inngang', type: 'meet',x: 50, y: 92 },
  { id: 'p-toilet',   name: 'Toalett',        type: 'toilet',   x: 28, y: 64 },
  { id: 'p-entrance', name: 'Hovedinngang',   type: 'entrance', x: 50, y: 95 }
];

function validatePin(p) {
  if (!p || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 60) return 'Ugyldig navn';
  if (!VALID_TYPES.includes(p.type)) return 'Ugyldig type';
  const x = Number(p.x), y = Number(p.y);
  if (isNaN(x) || x < 0 || x > 100 || isNaN(y) || y < 0 || y > 100) return 'Ugyldig posisjon';
  return null;
}

async function getPins(store) {
  let pins = await store.get('current', { type: 'json' });
  if (!pins) { pins = DEFAULT_PINS; await store.setJSON('current', pins); }
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
      await store.setJSON('current', pins);
      return json({ ok: true, pins });
    }

    if (body.action === 'delete') {
      if (!body.id) return json({ error: 'Mangler id' }, 400);
      pins = pins.filter(p => p.id !== body.id);
      await store.setJSON('current', pins);
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
      await store.setJSON('current', pins);
      return json({ ok: true, pins, pin: clean });
    }

    return json({ error: 'Ukjent action' }, 400);
  }

  return json({ error: 'Metode ikke støttet' }, 405);
};

export const config = { path: '/api/mappins' };
