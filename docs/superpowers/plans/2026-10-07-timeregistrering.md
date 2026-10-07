# Timeregistrering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En offline-PWA til tidsregistrering pr. kunde og opgavetype med individuel timepris og månedsoversigt/CSV-eksport.

**Architecture:** Statiske filer uden byggetrin. Ren logik i `core.js` (ingen DOM, testet med `node --test`), persistens i `store.js` (localStorage, injicerbar storage for test), UI i `app.js` med fire faner. Service worker cacher app-filerne.

**Tech Stack:** HTML, CSS, JavaScript ES-moduler, Node 26 testløber (`node --test`), ingen afhængigheder.

**Spec:** `docs/superpowers/specs/2026-10-07-timeregistrering-design.md`

## Global Constraints

- Ingen npm-afhængigheder, intet byggetrin. `package.json` kun med `"type": "module"` og `"test": "node --test tests/"`.
- Al brugertekst på dansk. Varighed som `t:mm` (fx `2:15`). Beløb som `1.234,50 kr`.
- Timepris i kr ekskl. moms; kopieres ind i registreringen ved oprettelse.
- Data i én localStorage-nøgle `arbejdstid.v1` med feltet `version: 1`.
- Kunder/opgavetyper slettes ikke, de arkiveres (`arkiveret: true`).
- Standard-opgavetyper: Møde, Udvikling, Rådgivning, Transport.
- Manuel tid som antal timer: start 09:00 den valgte dag.
- CSV: semikolon-separeret, decimalkomma, UTF-8 med BOM (`﻿`).
- Mobil først; lys/mørk via `prefers-color-scheme`.
- Alle datoberegninger i lokal tid.

## Review Focus

1. **Ur der kører over midnat** — registreringen hører til startdagen, varigheden er korrekt. Test i Task 2 (`groupByDay`).
2. **Dansk decimalinput** — `"2,5"` og `"2.5"` giver begge 2,5 timer; `""`, `"abc"`, `"0"`, `"-1"` afvises. Test i Task 1 (`parseHours`).
3. **Beskadiget eller tom localStorage** — appen starter med standarddata i stedet for at gå ned. Test i Task 4.
4. **Arkiveret kunde/opgavetype i gamle registreringer** — vises stadig med navn i oversigt og CSV. Test i Task 2 (`summarize`) og Task 3 (`toCSV`).
5. **Note med semikolon, anførselstegn eller linjeskift** — CSV-feltet escapes korrekt. Test i Task 3.

---

## Fælles datamodel (bruges af alle tasks)

```js
// Data
{ version: 1,
  kunder:        [{ id, navn, timepris, arkiveret }],
  opgavetyper:   [{ id, navn, arkiveret }],
  registreringer:[{ id, kundeId, opgavetypeId, start, slut, timepris, note }], // start/slut: ISO-strenge
  ur: null | { kundeId, opgavetypeId, start, note } }
```

---

### Task 1: core.js — varighed, beløb, formatering, input

**Files:**
- Create: `package.json`, `core.js`, `tests/core.test.js`

**Interfaces:**
- Produces (alle `export` fra `core.js`):
  - `durationMs(entry) -> number` (slut − start i ms)
  - `amountOf(entry) -> number` (timer × `entry.timepris`, kr, ikke afrundet)
  - `formatDuration(ms) -> string` (`"t:mm"`, minutter afrundet nedad; 0 → `"0:00"`)
  - `formatKr(n) -> string` (`"1.234,50 kr"`, to decimaler)
  - `parseHours(str) -> number | null` (accepterer komma eller punktum; >0 ellers null)
  - `validateEntry({ start, slut }) -> string | null` (fejltekst `"Slut skal være efter start"` eller null)

- [ ] **Step 1: Skriv fejlende tests** i `tests/core.test.js`:
  - `durationMs({start:'2026-10-07T09:00:00', slut:'2026-10-07T11:15:00'}) === 8100000`
  - `amountOf({start:'…T09:00', slut:'…T10:30', timepris: 800}) === 1200`
  - `formatDuration(8100000) === '2:15'`, `formatDuration(59000) === '0:00'`, `formatDuration(36000000) === '10:00'`
  - `formatKr(1234.5) === '1.234,50 kr'`, `formatKr(0) === '0,00 kr'`
  - `parseHours('2,5') === 2.5`, `parseHours('2.5') === 2.5`; `null` for `''`, `'abc'`, `'0'`, `'-1'`
  - `validateEntry` med slut = start → `'Slut skal være efter start'`; slut før start → samme; gyldig → `null`
- [ ] **Step 2:** `npm test` → FAIL (modul findes ikke)
- [ ] **Step 3:** Implementér i `core.js`. `formatKr` bygges manuelt (tusindtalspunktum, decimalkomma), ikke via `Intl` — så output er ens i Node og Safari.
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** `git add package.json core.js tests && git commit -m "feat: kerne-beregninger og formatering"`

### Task 2: core.js — perioder, gruppering, totaler

**Files:**
- Modify: `core.js`, `tests/core.test.js`

**Interfaces:**
- Consumes: `durationMs`, `amountOf`
- Produces:
  - `monthRange(date: Date, offset = 0) -> { from: Date, to: Date }` (`to` eksklusiv; offset −1 = sidste måned)
  - `inPeriod(entry, from: Date, to: Date) -> boolean` (efter `start`)
  - `groupByDay(entries) -> [{ dag: 'YYYY-MM-DD', ms, entries }]` (nyeste dag først, entries nyeste først)
  - `summarize(entries, kunder, opgavetyper) -> { kunder: [{ kundeId, navn, ms, kr, typer: [{ opgavetypeId, navn, ms, kr }] }], ms, kr }` (kunder sorteret efter navn; ukendt id → navn `'(slettet)'`)

- [ ] **Step 1: Skriv fejlende tests:**
  - `monthRange(new Date(2026,0,15), -1)` → from = 1. dec 2025 00:00, to = 1. jan 2026 00:00
  - `inPeriod` sand for start 31. okt 23:30 i oktober-range, falsk for 1. nov 00:00
  - `groupByDay` med én registrering 7. okt 23:00 → 8. okt 01:00 giver én dag `'2026-10-07'` med `ms === 7200000`
  - `summarize` med to kunder (én arkiveret), to typer, tre registreringer med forskellig `timepris` for samme kunde → korrekte ms/kr pr. kunde og type; arkiveret kunde stadig med sit navn; total = sum
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** Implementér. Dag-nøgle fra lokal dato (`getFullYear/getMonth/getDate`), ikke `toISOString()`.
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** Commit `"feat: perioder og totaler"`

### Task 3: core.js — CSV og backup-validering

**Files:**
- Modify: `core.js`, `tests/core.test.js`

**Interfaces:**
- Consumes: `durationMs`, `amountOf`
- Produces:
  - `toCSV(entries, kunder, opgavetyper) -> string` — BOM + header `Dato;Start;Slut;Kunde;Opgavetype;Timer;Timepris;Beløb;Note`, rækker sorteret ældste først; Dato `dd-mm-yyyy`, Start/Slut `HH:MM`, Timer/Timepris/Beløb med to decimaler og komma, ingen tusindtalsseparator; linjeskift `\r\n`
  - `validateBackup(obj) -> { ok: true, data } | { ok: false, fejl: string }` — kræver `version === 1` og arrays `kunder`, `opgavetyper`, `registreringer`; sætter `ur: null` hvis mangler

- [ ] **Step 1: Skriv fejlende tests:**
  - CSV starter med `'﻿'` og header-linjen ovenfor
  - Række for 1,5 t à 800: indeholder `;1,50;800,00;1200,00;`
  - Note `'møde; "vigtigt"\nopfølgning'` → feltet bliver `"møde; ""vigtigt""\nopfølgning"`
  - Arkiveret kunde vises med navn
  - `validateBackup(null)`, `{}`, `{version:2,…}` → `ok:false`; gyldigt objekt uden `ur` → `ok:true` og `data.ur === null`
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** Implementér. Felter escapes kun hvis de indeholder `;`, `"`, `\r` eller `\n`.
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** Commit `"feat: CSV-eksport og backup-validering"`

### Task 4: store.js — persistens

**Files:**
- Create: `store.js`, `tests/store.test.js`

**Interfaces:**
- Consumes: `validateBackup` fra `core.js`
- Produces:
  - `defaultData() -> Data` (ingen kunder, de fire standard-opgavetyper, `ur: null`)
  - `newId() -> string` (`crypto.randomUUID()`)
  - `createStore(storage = globalThis.localStorage) -> { load(): Data, save(data: Data): void }` — nøgle `arbejdstid.v1`; `load` returnerer `defaultData()` ved manglende, ugyldig JSON eller fejlende `validateBackup`

- [ ] **Step 1: Skriv fejlende tests** med en fake storage (`{ getItem, setItem }` over et `Map`):
  - tom storage → `load()` giver 4 opgavetyper og 0 kunder
  - `save(d)` derefter `load()` → deep-equal `d`
  - storage med `'{ikke json'` → `load()` giver defaultData uden at kaste
  - storage med `'{"version":99}'` → defaultData
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** Implementér
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** Commit `"feat: lokal lagring"`

### Task 5: App-skal og Indstillinger (kunder, opgavetyper)

**Files:**
- Create: `index.html`, `styles.css`, `app.js`, `.claude/launch.json` (statisk server: `python3 -m http.server 8000`)

**Interfaces:**
- Consumes: `createStore`, `newId`, `formatKr`, `parseHours` (til timepris accepteres også komma)
- Produces (internt i `app.js`): `state` (Data), `commit()` (gemmer + genrender), `render()`; fane-id'er `tid`, `registreringer`, `oversigt`, `indstillinger` (sidste valgte fane i `sessionStorage`)

- [ ] **Step 1:** Byg skal: header, indholdsområde, fast bundnavigation med fire faner (dansk tekst), CSS-tokens for lys/mørk, 16 px sidemargin, safe-area-insets for iPhone.
- [ ] **Step 2:** Indstillinger: liste over aktive kunder (navn + `formatKr(timepris)/t`), "Tilføj kunde"-formular (navn, timepris), redigér ved tryk, "Arkivér". Samme for opgavetyper (kun navn). Afsnit "Vis arkiverede" kan gendanne.
- [ ] **Step 3:** Afprøv i browserpanelet ved 375×812: tilføj kunde "Test A/S" à `850,50`, genindlæs → kunden er der med `850,50 kr/t`; arkivér → forsvinder fra listen, vises under arkiverede.
- [ ] **Step 4:** Commit `"feat: app-skal og indstillinger"`

### Task 6: Tid-fanen — ur og manuel registrering

**Files:**
- Modify: `app.js`, `styles.css`

**Interfaces:**
- Consumes: `durationMs`, `formatDuration`, `parseHours`, `validateEntry`, `newId`, `state.ur`

- [ ] **Step 1:** Ingen aktive kunder → tekst "Tilføj først en kunde" med knap til Indstillinger.
- [ ] **Step 2:** Vælgere for kunde og opgavetype (kun ikke-arkiverede; sidst valgte kunde/type huskes i en separat `localStorage`-nøgle `arbejdstid.sidste`, ikke i Data), note-felt, Start-knap inaktiv uden begge valg. Start sætter `state.ur` med `start = new Date().toISOString()`.
- [ ] **Step 3:** Kørende ur: stor visning af `formatDuration`, opdateres hvert sekund (sekunder vises som `t:mm:ss` kun her), Stop opretter registrering med kundens aktuelle timepris og nulstiller `ur`. "Annullér" fjerner uret efter `confirm`.
- [ ] **Step 4:** "Tilføj tid manuelt": dato (standard i dag), skift mellem "Start/slut" og "Antal timer". Antal timer → start 09:00 + timer. Fejl fra `validateEntry`/`parseHours` vises under formularen; intet gemmes.
- [ ] **Step 5:** Afprøv: start ur, genindlæs siden → uret kører videre med korrekt tid; stop → registrering findes. Manuel `2,5` timer → 09:00–11:30.
- [ ] **Step 6:** Commit `"feat: tidsregistrering med ur og manuel indtastning"`

### Task 7: Registreringer-fanen

**Files:**
- Modify: `app.js`, `styles.css`

**Interfaces:**
- Consumes: `groupByDay`, `formatDuration`, `formatKr`, `amountOf`, `validateEntry`

- [ ] **Step 1:** Liste pr. dag (overskrift fx "Onsdag 7. oktober" + dagstotal), hver række: kunde, opgavetype, `HH:MM–HH:MM`, varighed, beløb, note forkortet. Tom tilstand: "Ingen registreringer endnu".
- [ ] **Step 2:** Tryk åbner redigering (dialog/ark): kunde, opgavetype (inkl. den aktuelle selvom arkiveret), dato, start, slut, timepris, note. Gem validerer med `validateEntry`. "Slet" efter `confirm`.
- [ ] **Step 3:** Afprøv: redigér timepris på én registrering → kun den ændres; slet → forsvinder.
- [ ] **Step 4:** Commit `"feat: liste og redigering af registreringer"`

### Task 8: Oversigt-fanen og CSV

**Files:**
- Modify: `app.js`, `styles.css`

**Interfaces:**
- Consumes: `monthRange`, `inPeriod`, `summarize`, `toCSV`, `formatDuration`, `formatKr`

- [ ] **Step 1:** Periodevælger: "Denne måned" (standard), "Sidste måned", "Vælg periode" (fra/til-datoer; til er inklusiv i UI → +1 dag internt).
- [ ] **Step 2:** Kort pr. kunde med timer og beløb; foldbar liste pr. opgavetype; total nederst. Tom periode: "Ingen registreringer i perioden".
- [ ] **Step 3:** "Eksportér CSV" → download `arbejdstid-YYYY-MM-DD_YYYY-MM-DD.csv` via `Blob` + `<a download>`; på iOS bruges `navigator.share({ files })` hvis tilgængelig.
- [ ] **Step 4:** Afprøv: totaler matcher registreringerne; CSV-indholdet læses via JavaScript i siden og stemmer.
- [ ] **Step 5:** Commit `"feat: oversigt og CSV-eksport"`

### Task 9: Backup i Indstillinger

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `validateBackup`, `state`

- [ ] **Step 1:** "Eksportér backup" → `arbejdstid-backup-YYYY-MM-DD.json` (samme download/share-mekanisme som Task 8, delt hjælpefunktion `downloadFile(name, content, type)`).
- [ ] **Step 2:** "Importér backup" → filvælger; ugyldig fil → besked "Filen kunne ikke læses som backup" og intet ændres; gyldig → `confirm("Dette erstatter alle nuværende data. Fortsæt?")` → erstat og genrender.
- [ ] **Step 3:** Afprøv: eksportér, slet en kunde-registrering, importér → data tilbage. Importér en `.txt` → fejlbesked, data uændret.
- [ ] **Step 4:** Commit `"feat: backup og gendannelse"`

### Task 10: PWA — manifest, ikoner, offline

**Files:**
- Create: `manifest.webmanifest`, `sw.js`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/apple-touch-icon.png` (180×180)
- Modify: `index.html` (manifest-link, `apple-touch-icon`, `apple-mobile-web-app-capable`, theme-color, SW-registrering)

**Interfaces:**
- Consumes: alle app-filer (listes i SW's cache)

- [ ] **Step 1:** Manifest: `name` "Arbejdstid", `short_name` "Arbejdstid", `display` "standalone", `start_url` "./", `scope` "./" (relative stier, så det virker under en GitHub Pages-understi).
- [ ] **Step 2:** Ikoner genereres med et lille Python/`sips`-script fra en simpel SVG (ur-symbol); scriptet committes ikke.
- [ ] **Step 3:** `sw.js`: cache-navn `arbejdstid-v1`, precache alle app-filer ved install, cache-first ved fetch, slet gamle caches ved activate.
- [ ] **Step 4:** Afprøv: SW registreret (`navigator.serviceWorker.controller` ikke null efter genindlæsning); manifest indlæses uden fejl i konsollen.
- [ ] **Step 5:** `npm test` → alle tests PASS. Commit `"feat: PWA med offline-understøttelse"`
- [ ] **Step 6:** Tilføj `README.md` med: kør lokalt, kør tests, udgiv på GitHub Pages (Settings → Pages → branch `main`, mappe `/`), installér på iPhone (Safari → Del → Føj til hjemmeskærm), husk at hæve `arbejdstid-v1` ved nye versioner. Commit.
