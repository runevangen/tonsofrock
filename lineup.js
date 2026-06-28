// Netlify Function: festivalprogram (lineup) — lagret i Netlify Blobs
//
// Erstatter den tidligere hardkodede programlisten i index.html. Programmet
// lagres nå som en FLAT liste av oppføringer (ett objekt per konsert/standup/
// event), hver med en stabil id, slik at admin kan redigere band, tid, scene,
// sjanger og type uten at jeg (Claude) må endre kildekoden.
//
// Endepunkter:
//   GET  /api/lineup                                    -> { lineup: [...] }
//        Førstegangskall: seeder Blobs med DEFAULT_LINEUP (dagens 72 band),
//        så de neste kallene leser fra Blobs.
//   POST /api/lineup { password, action:'upsert', performance:{...} }
//        Oppdaterer en eksisterende oppføring (match på id) eller legger til
//        en ny (id mangler/finnes ikke -> ny id genereres).
//   POST /api/lineup { password, action:'delete', id }
//        Sletter én oppføring.
//   POST /api/lineup { password, action:'reset' }
//        Tilbakestiller HELE programmet til DEFAULT_LINEUP (sikkerhetsnett).
//
// Admin-passord: samme miljøvariabel som favoritter-adminet, ADMIN_PASSWORD.

import { getStore } from '@netlify/blobs';

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Dagens 72 oppføringer — brukes til å seede Blobs første gang, og som
// "tilbakestill til original"-sikkerhetsnett i admin-panelet.
const DEFAULT_LINEUP = [{"id":"p001","band":"Black Debbath","day":"Wednesday","stage":"Scream Stage","start":"14:00","end":"14:50","genre":["Heavy Metal","Doom Metal"],"type":"band"},{"id":"p002","band":"Trivium","day":"Wednesday","stage":"Scream Stage","start":"15:55","end":"16:55","genre":["Metalcore","Heavy Metal"],"type":"band"},{"id":"p003","band":"Dumdum Boys","day":"Wednesday","stage":"Scream Stage","start":"18:15","end":"19:25","genre":["Post-Punk"],"type":"band"},{"id":"p004","band":"Bring Me The Horizon","day":"Wednesday","stage":"Scream Stage","start":"21:25","end":"22:55","genre":["Metalcore","Pop"],"type":"band"},{"id":"p005","band":"Cavalera","day":"Wednesday","stage":"Vampire Stage","start":"14:55","end":"15:45","genre":["Thrash Metal"],"type":"band"},{"id":"p006","band":"Babymetal","day":"Wednesday","stage":"Vampire Stage","start":"17:05","end":"18:05","genre":["Metal","Pop Metal"],"type":"band"},{"id":"p007","band":"The Offspring","day":"Wednesday","stage":"Vampire Stage","start":"19:40","end":"21:10","genre":["Punk Rock"],"type":"band"},{"id":"p008","band":"Die Spitz","day":"Wednesday","stage":"Moonlight Stage","start":"14:10","end":"14:55","genre":["Norwegian Rock"],"type":"band"},{"id":"p009","band":"President","day":"Wednesday","stage":"Moonlight Stage","start":"15:25","end":"16:10","genre":["Rock"],"type":"band"},{"id":"p010","band":"The Carburetors","day":"Wednesday","stage":"Moonlight Stage","start":"16:45","end":"17:35","genre":["Hard Rock","Rock"],"type":"band"},{"id":"p011","band":"Blood Incantation","day":"Wednesday","stage":"Moonlight Stage","start":"18:55","end":"19:45","genre":["Death Metal"],"type":"band"},{"id":"p012","band":"BFD + Bathory","day":"Wednesday","stage":"Moonlight Stage","start":"20:20","end":"21:20","genre":["Black Metal"],"type":"band"},{"id":"p013","band":"Martin Beyer-Olsen","day":"Wednesday","stage":"The Storm Stage","start":"14:20","end":"14:50","genre":["Folk"],"type":"annet"},{"id":"p014","band":"Turdus Musicus","day":"Wednesday","stage":"The Storm Stage","start":"16:00","end":"16:30","genre":["Norwegian Folk"],"type":"band"},{"id":"p015","band":"Cécile Moroni","day":"Wednesday","stage":"The Storm Stage","start":"18:10","end":"18:40","genre":["Norwegian Folk"],"type":"annet"},{"id":"p016","band":"Jordsjuk","day":"Wednesday","stage":"The Storm Stage","start":"19:10","end":"19:40","genre":["Traditional Norwegian"],"type":"band"},{"id":"p017","band":"Apocalyptica","day":"Thursday","stage":"Scream Stage","start":"13:50","end":"14:35","genre":["Symphonic Metal","Cello Metal"],"type":"band"},{"id":"p018","band":"D-A-D","day":"Thursday","stage":"Scream Stage","start":"15:45","end":"16:35","genre":["Hard Rock","Heavy Metal"],"type":"band"},{"id":"p019","band":"Anthrax","day":"Thursday","stage":"Scream Stage","start":"17:55","end":"18:55","genre":["Thrash Metal"],"type":"band"},{"id":"p020","band":"Iron Maiden","day":"Thursday","stage":"Scream Stage","start":"20:45","end":"22:55","genre":["Heavy Metal","NWOBHM"],"type":"band"},{"id":"p021","band":"Audrey Horne","day":"Thursday","stage":"Vampire Stage","start":"13:00","end":"13:45","genre":["Hard Rock","Heavy Metal"],"type":"band"},{"id":"p022","band":"Imminence","day":"Thursday","stage":"Vampire Stage","start":"14:45","end":"15:35","genre":["Alternative Metal"],"type":"band"},{"id":"p023","band":"Suicidal Tendencies","day":"Thursday","stage":"Vampire Stage","start":"16:45","end":"17:45","genre":["Funk Metal"],"type":"band"},{"id":"p024","band":"Alice Cooper","day":"Thursday","stage":"Vampire Stage","start":"19:10","end":"20:25","genre":["Shock Rock","Hard Rock"],"type":"band"},{"id":"p025","band":"The Baboon Show","day":"Thursday","stage":"Moonlight Stage","start":"13:15","end":"14:00","genre":["Norwegian Rock"],"type":"band"},{"id":"p026","band":"Grandson","day":"Thursday","stage":"Moonlight Stage","start":"14:35","end":"15:20","genre":["Alternative Rock","Rap Rock"],"type":"band"},{"id":"p027","band":"Yonaka","day":"Thursday","stage":"Moonlight Stage","start":"16:05","end":"16:55","genre":["Alternative Rock"],"type":"band"},{"id":"p028","band":"The Warning","day":"Thursday","stage":"Moonlight Stage","start":"17:40","end":"18:30","genre":["Pop Rock"],"type":"band"},{"id":"p029","band":"PaleFace Swiss","day":"Thursday","stage":"Moonlight Stage","start":"19:20","end":"20:20","genre":["Swiss Rock"],"type":"band"},{"id":"p030","band":"Sarah Løvald","day":"Thursday","stage":"The Storm Stage","start":"14:00","end":"14:30","genre":["Norwegian Pop"],"type":"annet"},{"id":"p031","band":"Angell","day":"Thursday","stage":"The Storm Stage","start":"15:35","end":"16:05","genre":["Black Metal","Death Metal"],"type":"band"},{"id":"p032","band":"Paul Myrehaug","day":"Thursday","stage":"The Storm Stage","start":"17:45","end":"18:15","genre":["Electronic"],"type":"annet"},{"id":"p033","band":"Ramonas Tea Party","day":"Thursday","stage":"The Storm Stage","start":"18:40","end":"19:10","genre":["Rock"],"type":"band"},{"id":"p034","band":"Raga Rockers","day":"Friday","stage":"Scream Stage","start":"13:20","end":"14:10","genre":["Indian Rock"],"type":"band"},{"id":"p035","band":"The Hellacopters","day":"Friday","stage":"Scream Stage","start":"15:05","end":"16:05","genre":["Hard Rock","Rock n Roll"],"type":"band"},{"id":"p036","band":"The Hives","day":"Friday","stage":"Scream Stage","start":"17:10","end":"18:20","genre":["Garage Rock","Punk"],"type":"band"},{"id":"p037","band":"Joan Jett and the Blackhearts ?","day":"Friday","stage":"Scream Stage","start":"19:30","end":"20:50","genre":["Rock","Punk Rock","Hard Rock"],"type":"band"},{"id":"p038","band":"Norge – Frankrike","day":"Friday","stage":"Scream Stage","start":"21:05","end":"22:55","genre":["Rock"],"type":"event"},{"id":"p039","band":"Eivør","day":"Friday","stage":"Vampire Stage","start":"12:30","end":"13:20","genre":["Folk Pop"],"type":"band"},{"id":"p040","band":"Queensrÿche","day":"Friday","stage":"Vampire Stage","start":"14:10","end":"15:00","genre":["Progressive Metal"],"type":"band"},{"id":"p041","band":"Avatar","day":"Friday","stage":"Vampire Stage","start":"16:10","end":"17:05","genre":["Melodic Metal"],"type":"band"},{"id":"p042","band":"Behemoth","day":"Friday","stage":"Vampire Stage","start":"18:25","end":"19:20","genre":["Black Metal","Death Metal"],"type":"band"},{"id":"p043","band":"Rival Sons","day":"Friday","stage":"Vampire Stage","start":"21:30","end":"22:30","genre":["Hard Rock","Blues Rock"],"type":"band"},{"id":"p044","band":"The Funeral Portrait","day":"Friday","stage":"Moonlight Stage","start":"13:00","end":"13:40","genre":["Alternative Metal"],"type":"band"},{"id":"p045","band":"Kublai Khan TX","day":"Friday","stage":"Moonlight Stage","start":"14:10","end":"14:55","genre":["Metalcore"],"type":"band"},{"id":"p046","band":"Storm","day":"Friday","stage":"Moonlight Stage","start":"16:25","end":"16:10","genre":["Black Metal"],"type":"band"},{"id":"p047","band":"Dogstar","day":"Friday","stage":"Moonlight Stage","start":"16:45","end":"17:35","genre":["Alternative Rock"],"type":"band"},{"id":"p048","band":"Elder","day":"Friday","stage":"Moonlight Stage","start":"18:10","end":"19:00","genre":["Stoner Rock"],"type":"band"},{"id":"p049","band":"Mayhem","day":"Friday","stage":"Moonlight Stage","start":"19:40","end":"20:50","genre":["Black Metal"],"type":"band"},{"id":"p050","band":"Possessed","day":"Friday","stage":"Moonlight Stage","start":"21:40","end":"22:30","genre":["Death Metal"],"type":"band"},{"id":"p051","band":"Mørk Medisin + Dag Sørås & Espen Abrahamsen","day":"Friday","stage":"The Storm Stage","start":"15:00","end":"15:30","genre":["Jazz"],"type":"annet"},{"id":"p052","band":"Høst","day":"Friday","stage":"The Storm Stage","start":"17:10","end":"17:40","genre":["Prog Rock","Hard Rock"],"type":"band"},{"id":"p053","band":"Nora Svenningsen","day":"Friday","stage":"The Storm Stage","start":"18:10","end":"18:40","genre":["Norwegian Pop"],"type":"annet"},{"id":"p054","band":"Koco Franco","day":"Friday","stage":"The Storm Stage","start":"19:10","end":"19:40","genre":["Brazilian Rock"],"type":"band"},{"id":"p055","band":"DDR","day":"Saturday","stage":"Scream Stage","start":"14:00","end":"14:50","genre":["Hard Rock"],"type":"band"},{"id":"p056","band":"Sepultura","day":"Saturday","stage":"Scream Stage","start":"16:10","end":"17:10","genre":["Thrash Metal"],"type":"band"},{"id":"p057","band":"Accept","day":"Saturday","stage":"Scream Stage","start":"18:40","end":"19:55","genre":["Heavy Metal","Speed Metal"],"type":"band"},{"id":"p058","band":"Limp Bizkit","day":"Saturday","stage":"Scream Stage","start":"21:25","end":"22:55","genre":[],"type":"band"},{"id":"p059","band":"Pain","day":"Saturday","stage":"Vampire Stage","start":"13:00","end":"13:50","genre":["Industrial Metal"],"type":"band"},{"id":"p060","band":"Black Label Society","day":"Saturday","stage":"Vampire Stage","start":"15:05","end":"15:55","genre":["Heavy Metal","Doom Metal"],"type":"band"},{"id":"p061","band":"Leprous","day":"Saturday","stage":"Vampire Stage","start":"17:25","end":"18:25","genre":["Progressive Metal"],"type":"band"},{"id":"p062","band":"A Perfect Circle","day":"Saturday","stage":"Vampire Stage","start":"20:05","end":"21:15","genre":["Alternative Metal"],"type":"band"},{"id":"p063","band":"Ego Kill Talent","day":"Saturday","stage":"Moonlight Stage","start":"13:00","end":"13:40","genre":["Metalcore"],"type":"band"},{"id":"p064","band":"Slay Squad","day":"Saturday","stage":"Moonlight Stage","start":"14:10","end":"14:55","genre":["Rock"],"type":"band"},{"id":"p065","band":"Gaerea","day":"Saturday","stage":"Moonlight Stage","start":"15:25","end":"16:10","genre":["Black Metal"],"type":"band"},{"id":"p066","band":"Gatecreeper","day":"Saturday","stage":"Moonlight Stage","start":"19:45","end":"17:35","genre":["Death Metal"],"type":"band"},{"id":"p067","band":"Blood Red Throne","day":"Saturday","stage":"Moonlight Stage","start":"18:55","end":"19:45","genre":["Death Metal"],"type":"band"},{"id":"p068","band":"Death To All","day":"Saturday","stage":"Moonlight Stage","start":"20:15","end":"21:15","genre":["Metal"],"type":"band"},{"id":"p069","band":"Javad El Bakali","day":"Saturday","stage":"The Storm Stage","start":"14:00","end":"14:30","genre":["Soul"],"type":"annet"},{"id":"p070","band":"You Know Who","day":"Saturday","stage":"The Storm Stage","start":"16:00","end":"16:30","genre":["Rock"],"type":"band"},{"id":"p071","band":"Bill Bailey","day":"Saturday","stage":"The Storm Stage","start":"18:25","end":"18:55","genre":["Comedy Rock"],"type":"annet"},{"id":"p072","band":"Baphy","day":"Saturday","stage":"The Storm Stage","start":"19:30","end":"20:00","genre":["Rock"],"type":"band"}];

const VALID_DAYS = ['Wednesday', 'Thursday', 'Friday', 'Saturday'];
const VALID_STAGES = ['Scream Stage', 'Vampire Stage', 'Moonlight Stage', 'The Storm Stage'];
const VALID_TYPES = ['band', 'event', 'annet'];

function validatePerformance(p) {
  if (typeof p.band !== 'string' || !p.band.trim() || p.band.length > 120) return 'Ugyldig bandnavn';
  if (!VALID_DAYS.includes(p.day)) return 'Ugyldig dag';
  if (!VALID_STAGES.includes(p.stage)) return 'Ugyldig scene';
  if (!/^\d{2}:\d{2}$/.test(p.start) || !/^\d{2}:\d{2}$/.test(p.end)) return 'Ugyldig klokkeslett (bruk TT:MM)';
  if (!VALID_TYPES.includes(p.type)) return 'Ugyldig type';
  if (p.genre && !Array.isArray(p.genre)) return 'Sjanger må være en liste';
  return null;
}

async function getLineup(store) {
  let lineup = await store.get('current', { type: 'json' });
  if (!lineup) {
    lineup = DEFAULT_LINEUP;
    await store.setJSON('current', lineup);
  }
  return lineup;
}

export default async (req) => {
  const store = getStore('lineup');

  if (req.method === 'GET') {
    const lineup = await getLineup(store);
    return json({ lineup });
  }

  if (req.method === 'POST') {
    let body = {};
    try { body = await req.json(); } catch (e) { /* tom body */ }

    const expected = process.env.ADMIN_PASSWORD || '';
    if (!expected) return json({ error: 'Admin ikke konfigurert (mangler ADMIN_PASSWORD)' }, 500);
    if (body.password !== expected) return json({ error: 'Feil passord' }, 403);

    let lineup = await getLineup(store);

    if (body.action === 'reset') {
      lineup = DEFAULT_LINEUP;
      await store.setJSON('current', lineup);
      return json({ ok: true, lineup });
    }

    if (body.action === 'delete') {
      if (!body.id) return json({ error: 'Mangler id' }, 400);
      lineup = lineup.filter(p => p.id !== body.id);
      await store.setJSON('current', lineup);
      return json({ ok: true, lineup });
    }

    if (body.action === 'upsert') {
      const incoming = body.performance || {};
      const err = validatePerformance(incoming);
      if (err) return json({ error: err }, 400);

      const clean = {
        id: incoming.id || ('p-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
        band: incoming.band.trim(),
        day: incoming.day,
        stage: incoming.stage,
        start: incoming.start,
        end: incoming.end,
        genre: Array.isArray(incoming.genre) ? incoming.genre.slice(0, 6) : [],
        type: incoming.type
      };

      const idx = lineup.findIndex(p => p.id === clean.id);
      if (idx >= 0) lineup[idx] = clean;
      else lineup.push(clean);

      await store.setJSON('current', lineup);
      return json({ ok: true, lineup, performance: clean });
    }

    return json({ error: 'Ukjent action' }, 400);
  }

  return json({ error: 'Metode ikke støttet' }, 405);
};

export const config = {
  path: '/api/lineup'
};
