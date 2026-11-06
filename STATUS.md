# Tons of Rock – status og oversikt

Sist oppdatert: 2026-11-05 · gjeldende versjon: **v2.16.0-beta**

Dette er en flerbruker-festivalapp (hobbyprosjekt for en vennegjeng). Appen
er fra 2026-utgaven og prepes nå for neste år. Denne fila er et startpunkt
for å fortsette arbeidet (f.eks. i Claude Code på personlig maskin).

## Hvordan starte videre
```
git clone https://github.com/runevangen/tonsofrock.git
cd tonsofrock
```
Appen er ikke «live» for publikum nå; endringer kan trygt kjøres til `main`
(Netlify auto-deployer til tonsofrock.netlify.app).

## Arkitektur
- **`index.html`** – hele frontend i én fil (vanilla JS, ingen byggesteg). Lastes opp som den er.
- **`netlify/functions/favorites.js`** – backend: favoritter, venner, brukerliste, admin, tribune-posisjon, PIN.
- **`netlify/functions/lineup.js`** – backend: festivalprogrammet (band/tid/scene/sjanger/type), lagret i Netlify Blobs.
- **`netlify/functions/mappins.js`** – backend: kart-nåler (scene/mat/møtepunkt/toalett/inngang), Netlify Blobs.
- **`netlify.toml`** – `/api/*`-redirects. **Hver ny funksjon trenger BÅDE en fil i `netlify/functions/` OG en `[[redirects]]`-oppføring her.**
- **`package.json`** – deklarerer `@netlify/blobs`.
- Lagring: **Netlify Blobs** (nøkkel/verdi). Posisjons-lesingen bruker `consistency: 'strong'`; resten er eventuell.

## Viktige særegenheter (lett å snuble i)
- **Admin-passord** ligger i Netlify-miljøvariabelen `ADMIN_PASSWORD` (ikke i koden). Gjenbrukes av favorites/lineup/mappins.
- **PIN** lagres aldri i klartekst – saltet SHA-256 (Web Crypto). Se `preservePin()` i favorites.js: PIN-feltene MÅ bevares på hver skriveoperasjon som bygger ny record, ellers slettes PIN-en.
- **Tribune-posisjon** datamodell: `positions[band] = { pos:0-8, sub:0-8, status:'present'|'planned', meet:bool }`. `pos` = sone (3×3), `sub` = finjustering i sonen (4 = midten). Bakoverkompatibelt (manglende sub/status → midten/er her).
- **Kart** (`index.html`): Leaflet 1.9.4 fra cdnjs + OSM-fliser (`tile.openstreetmap.org`, må beholde attribusjon). Senter `MAP_CENTER` ~59.8936°N, 10.7808°Ø. GPS vises direkte i lat/lng – ingen kalibrering lenger. OSM-tile-policy er OK for en liten vennegjeng; ved mer trafikk bør en egen tile-leverandør brukes.
- **Kart-nåler** er admin-plasserte og delt. Nåler er `{id,name,type,lat,lng}`. Seedet med omtrentlige GJETTEDE plassholdere (`DEFAULT_PINS` i mappins.js) – festivalens egen plan er ikke kjent og må flyttes presist via admin.
- Footer-versjon = deploy-kvittering. Ser du gammelt nr.? Hard refresh / privat vindu (cache).

## Testing (etablert mønster)
- Syntaks: `node --check` på funksjoner; for index.html hentes `<script>`-blokken ut og `node --check`-es.
- Backend: `node --input-type=module` med in-memory mock som erstatter `@netlify/blobs`.
- Frontend: jsdom-tester med mocket `fetch` (og `navigator.geolocation` for kartet).
- Visuelt: Playwright-skjermbilder (chromium er forhåndsinstallert).
- Sandkassen når IKKE Netlify/Blobs live – all live-oppførsel må testes av Rune.

## Hva som er gjort (nyeste først)
- **v2.16.0** Offisielt festivalkart 2026 (`kart-2026.jpg`, brukt med tillatelse fra Rune) som `L.imageOverlay` over OSM, bryter Festivalkart/Gatekart. Nåler lagres igjen som x/y-% av bildet (`current-v3`, 47 nåler avlest fra kartet); lat/lng regnes ut via `FEST_BOUNDS` (grov kalibrering, bildet antatt nord-opp — juster ved behov). I festivalmodus vises bare møtepunkt-nåler (resten står på bildet).
- **v2.15.0** Ekte kart: Leaflet + OpenStreetMap (ODbL, kildehenvisning i kartet) i stedet for skjematisk SVG. Nåler bruker lat/lng, ny type 🍺 bar, 20 plassholder-nåler (barer, toaletter, mat, førstehjelp, vann). Lagring flyttet til Blobs-nøkkel `current-v2`. `.modal-overlay` z-index 100→400 (modaler havnet bak fullskjerm-kartet).
- **v2.14.0** Ekebergsletta-kart: eget skjematisk kart, GPS «jeg er her», admin-plasserbare nåler (mappins.js).
- **v2.13.x** Tribune: klikk sone → fullskjerm med fulle navn + piler; minikart med prikker + teller; brødsmule/sonenavn.
- **v2.12.0** Tribune: finjustering i sonen (sub) + status planlagt/er her.
- **v2.11.x** Posisjon: optimistisk buffer (egen posisjon henger ikke) + strong consistency (andres ferske).
- **v2.10–2.11** PIN-autentisering (opprett/verify/husket enhet/admin-reset), «logg på» tilbyr opprett, «sett PIN»-knapp.
- Tidligere: review-fikser (XSS-escaping, tilgjengelighet, lang=no), admin-redigering av program, tema, tekststørrelse, venner, m.m.

## Åpne punkter / neste steg
- **Kart:** plassere de ekte 2026-mat/møtepunktene via admin. (Se egen GitHub-issue.)
- **Mulig:** «✨ Møt meg her» som personlig nål på kartet (i tillegg til møtepunkt-nåler).
- **Kjent teknisk gjeld (fra kodegjennomgang):** skrive-API-ene (`/favorites`, `/position`, `/mappins`-GET) er uautentiserte for lesing/skriving av vanlige data – PIN gjelder bare innloggings-UI, ikke skrive-API-et. Greit for en liten vennegjeng, men bør vurderes hvis appen deles bredt.
- **Programdata:** to oppføringer har sluttid før starttid og må få riktige tider: `p046` (Storm, fredag Moonlight) og `p066` (Gatecreeper, lørdag). Krever de faktiske spilletidene.
- **Opprydding:** test-profiler i skyen (f.eks. «Runepin») kan slettes via admin før neste år.
