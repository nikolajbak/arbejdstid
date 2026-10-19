# Godkendelse og push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Det, der i et team registreres for en anden (tid og udgifter), venter på personens godkendelse, tæller ikke med i saldoen før da, og personen får en push-besked.

**Architecture:** Ren logik (markering, filtrering, hvilke beskeder der skal sendes, beskedkø) ligger i `core.js` og en ny `pushkoe.js` og testes i Node. Firestore-reglerne håndhæver, at kun personen kan godkende. Push sendes af en Cloudflare Worker i `push/`, som tjekker Firebase-tokenet og teammedlemskab gennem Firestores REST-API med afsenderens eget token. Abonnementer ligger i Workers KV.

**Tech Stack:** Vanilla JS (ES-moduler, ingen bundler), Firebase 13 fra gstatic, Firestore-regler, `node --test`, `@firebase/rules-unit-testing`, Cloudflare Workers + KV, `wrangler`, `jose`, `@block65/webcrypto-web-push`.

**Spec:** `docs/superpowers/specs/2026-10-19-godkendelse-design.md`

## Global Constraints

- Gælder kun i et team. Mig er uændret, og funktionerne skal give samme resultat som i dag, når afsender/person er `null`.
- `afventer` er `true` eller mangler. Ved godkendelse fjernes `afventer` og `oprettetAf`. `false` må aldrig skrives.
- Registreringer og poster uden de nye felter regnes som godkendte.
- Betalinger har aldrig `person`. Udgift, Brændstof og Kontantudlæg har én person i et team.
- Teksten i pushen bygges af workeren: `afventer` → titel `<team>`, tekst `<afsender> har registreret <N> til dig. Tryk for at godkende.`; `afvist` → titel `<team>`, tekst `<afsender> afviste <N> af dine registreringer.`
- Notifikationens url: `./?team=<teamId>&vis=godkend`, ved `afvist` `./?team=<teamId>`.
- `antal` i `/send` er et heltal 1–100. Beskeder i køen ældre end 7 dage droppes.
- Al brugertekst er dansk og følger appens tone. Kode, navne og kommentarer er på dansk som i resten af projektet.
- Nye `.js`-filer i appen skal med i `FILER` i `sw.js`.
- Reglerne skal udgives, før appkoden pushes til `main` (GitHub Pages udgiver ved push).

## Review Focus

- **Ældre teamdata uden de nye felter:** en person, der retter sin egen gamle registrering, og en anden, der retter den (skal så sætte `afventer`), skal begge accepteres af reglerne. Testes i Task 2.
- **Samme bruger på to enheder:** når den ene enhed afviser, må den anden ikke sende `afvist` igen, når sletningen synkroniseres. Testes i Task 1 (`nyeBeskeder` med en basislinje, der allerede mangler posten).
- **At rette sin egen ventende registrering for en anden igen** må ikke sende en ny push. Testes i Task 1.
- **En afsender, der er fjernet fra teamet, eller en modtager uden abonnement:** køen skal droppe beskeden ved 401/403 og ikke prøve igen for evigt. Ingen abonnementer giver `{ sendt: 0 }` og 200. Testes i Task 3 og 4.
- **iPhone uden hjemmeskærm, blokeret tilladelse og browser uden push:** rækken i Indstillinger skal sige hvorfor i stedet for at fejle. Testes via `pushStatus` i Task 4.

---

## Filer

| Fil | Ansvar |
|---|---|
| `core.js` | + `godkendte`, `ventende`, `markerRettelse`, `godkend`, `nyeBeskeder`; `forPersoner`/`registreringerFraUr`/`skiftUr` markerer andres |
| `firestore.rules` | felter og godkendelsesregel for teamets registreringer og poster |
| `push/` (ny) | Worker: `src/index.js` (ruter), `src/token.js`, `src/team.js`, `src/send.js`, `wrangler.toml`, `package.json`, `test/*.test.js` |
| `pushkoe.js` (ny) | ren kø og `pushStatus`, testbar i Node |
| `push.js` (ny) | browserdelen: abonnér, afmeld, send, kør køen |
| `push-config.js` (ny) | workerens adresse og offentlig VAPID-nøgle |
| `godkend.js` (ny) | kortet og arket Til godkendelse |
| `tilstand.js` | + `erstat`, basislinje og beskedhook i `commit` |
| `ui.js`, `registrering.js`, `post.js`, `tid.js`, `historik.js`, `kunder.js`, `indstillinger.js`, `app.js`, `sw.js`, `styles.css`, `README.md` | brug af ovenstående |

---

### Task 1: Kernelogik for godkendelse

**Files:**
- Modify: `core.js` (afsnittet `// --- Teams`, ca. linje 272–312)
- Test: `tests/core.test.js`

**Interfaces:**
- Produces:
  - `godkendte(liste: Array) -> Array`: dem uden `afventer`.
  - `ventende(liste: Array, uid: string) -> Array`: dem med `afventer` og `person === uid`.
  - `markerRettelse(x: object, afsender: string|null) -> object`: ny kopi.
    - `afsender === null` eller `!x.person` giver `x` uden `afventer` og `oprettetAf`.
    - `x.person === afsender` giver det samme.
    - Ellers `{ ...x, afventer: true, oprettetAf: afsender }`.
  - `godkend(x) -> object` = `markerRettelse(x, x.person)`.
  - `forPersoner(base, personer, nyId, afsender = null)`: hver post, hvis `person !== afsender`, får `afventer: true, oprettetAf: afsender`, når `afsender` ikke er null.
  - `registreringerFraUr(ur, {..., person})` bruger `person` som afsender. `skiftUr` arver det.
  - `nyeBeskeder(foer: {registreringer, poster}, efter: {registreringer, poster}, uid: string) -> Array<{ til: string, slags: 'afventer'|'afvist', antal: number }>`, sorteret efter `slags`, så `til`:
    - `afventer`: elementer i `efter` med `afventer`, `oprettetAf === uid` og `person !== uid`, som i `foer` enten mangler eller ikke havde `afventer && oprettetAf === uid`. Grupperes pr. `person`.
    - `afvist`: elementer i `foer` med `afventer`, `person === uid` og `oprettetAf`, som mangler i `efter`. Grupperes pr. `oprettetAf`.

- [ ] **Step 1: Write the failing tests** i `tests/core.test.js`, i et nyt afsnit `// --- Godkendelse`:

```js
import { godkendte, ventende, markerRettelse, godkend, forPersoner, registreringerFraUr, skiftUr, nyeBeskeder } from '../core.js';

const ids = () => { let i = 0; return () => `n${++i}`; };
const base = { kundeId: 'k1', opgavetypeId: '', start: '2026-10-19T08:00:00.000Z', slut: '2026-10-19T09:00:00.000Z', timepris: 500, note: '' };

test('godkendte udelader ventende, ventende giver kun dem til uid', () => {
  const l = [{ id: 'a' }, { id: 'b', afventer: true, person: 'x' }, { id: 'c', afventer: true, person: 'y' }];
  assert.deepEqual(godkendte(l).map((x) => x.id), ['a']);
  assert.deepEqual(ventende(l, 'x').map((x) => x.id), ['b']);
});

test('forPersoner markerer andres registreringer, ikke ens egen', () => {
  const r = forPersoner(base, ['mig', 'ven'], ids(), 'mig');
  assert.equal(r[0].afventer, undefined);
  assert.equal(r[0].oprettetAf, undefined);
  assert.deepEqual([r[1].afventer, r[1].oprettetAf], [true, 'mig']);
  assert.deepEqual(forPersoner(base, null, ids()), [{ id: 'n1', ...base }]);
});

test('registreringerFraUr og skiftUr markerer deltagerne', () => {
  const ur = { kundeId: 'k1', opgavetypeId: '', start: base.start, deltagere: ['mig', 'ven'] };
  const r = registreringerFraUr(ur, { slut: base.slut, timepris: 500, person: 'mig', nyId: ids(), medlemmer: ['mig', 'ven'] });
  assert.deepEqual(r.map((x) => x.afventer ?? false), [false, true]);
  const s = skiftUr({ registreringer: [], ur }, { kundeId: 'k2' }, base.slut, 500, 'id1', { person: 'mig', nyId: ids(), medlemmer: ['mig', 'ven'] });
  assert.deepEqual(s.registreringer.map((x) => x.afventer ?? false), [false, true]);
});

test('markerRettelse: andens rettelse venter, personens egen godkender', () => {
  const x = { id: 'a', person: 'ven' };
  assert.deepEqual(markerRettelse(x, 'mig'), { id: 'a', person: 'ven', afventer: true, oprettetAf: 'mig' });
  assert.deepEqual(markerRettelse({ ...x, afventer: true, oprettetAf: 'mig' }, 'ven'), x);
  assert.deepEqual(godkend({ ...x, afventer: true, oprettetAf: 'mig' }), x);
  assert.deepEqual(markerRettelse({ id: 'b', type: 'betaling' }, 'mig'), { id: 'b', type: 'betaling' });
  assert.deepEqual(markerRettelse({ ...x, afventer: true }, null), x);
});

test('nyeBeskeder: nye ventende grupperes pr. person', () => {
  const v = (id, person) => ({ id, person, afventer: true, oprettetAf: 'mig' });
  const b = nyeBeskeder({ registreringer: [], poster: [] }, { registreringer: [v('a', 'ven'), v('b', 'ven'), v('c', 'tre')], poster: [v('p', 'ven')] }, 'mig');
  assert.deepEqual(b, [{ til: 'tre', slags: 'afventer', antal: 1 }, { til: 'ven', slags: 'afventer', antal: 3 }]);
});

test('nyeBeskeder: egen ventende rettet igen giver ingen besked', () => {
  const a = { id: 'a', person: 'ven', afventer: true, oprettetAf: 'mig', note: '' };
  assert.deepEqual(nyeBeskeder({ registreringer: [a], poster: [] }, { registreringer: [{ ...a, note: 'ny' }], poster: [] }, 'mig'), []);
});

test('nyeBeskeder: afvist går til den, der oprettede, og kun fra personen', () => {
  const a = { id: 'a', person: 'mig', afventer: true, oprettetAf: 'ven' };
  assert.deepEqual(nyeBeskeder({ registreringer: [a], poster: [] }, { registreringer: [], poster: [] }, 'mig'), [{ til: 'ven', slags: 'afvist', antal: 1 }]);
  // Ophavspersonen sletter selv sin ventende: ingen besked.
  assert.deepEqual(nyeBeskeder({ registreringer: [a], poster: [] }, { registreringer: [], poster: [] }, 'ven'), []);
  // Basislinjen mangler allerede posten (slettet på en anden enhed): ingen besked.
  assert.deepEqual(nyeBeskeder({ registreringer: [], poster: [] }, { registreringer: [], poster: [] }, 'mig'), []);
});
```

- [ ] **Step 2: Run `npm test` and verify it fails.** Forventet: import-fejl for `godkendte` m.fl.

- [ ] **Step 3: Implement** funktionerne i `core.js` efter Interfaces. `registreringerFraUr` sender sin `person` videre som `afsender` til `forPersoner`.

- [ ] **Step 4: Run `npm test`.** Forventet: alle grønne, også de eksisterende teamtests.

- [ ] **Step 5: Commit** `feat: kernelogik for godkendelse af det, der registreres for andre`

---

### Task 2: Regler

**Files:**
- Modify: `firestore.rules` (`gyldigPost` og `match /teams/{teamId}` → `registreringer` og `poster`)
- Test: `tests/regler/regler.test.js`

**Interfaces:**
- Produces: de regler, appen skriver mod i Task 5–7. Felterne i et team er `oprettetAf` og `afventer` på registreringer og `person`, `oprettetAf` og `afventer` på poster.

- [ ] **Step 1: Write the failing tests** i teamafsnittet. Ret samtidig den eksisterende test `registrering i et team kræver person, der er medlem`, så `tReg('tre')` fra `ven` har `afventer: true, oprettetAf: 'ven'`. Det er den tilsigtede ændring.

```js
const tVent = (person, af) => ({ ...tReg(person), afventer: true, oprettetAf: af });
const tPost = (data = {}) => ({ kundeId: 'k1', type: 'udgift', dato: '2026-10-19', beloeb: 10, note: '', ...data });
const toMedlemmer = { medlemmer: ['ven', 'tre'], navne: { ven: 'Ven', tre: 'Tre' } };

test('for en anden kræver afventer og oprettetAf = en selv', async () => {
  await medTeam(toMedlemmer);
  await assertFails(setDoc(doc(ven(), 'teams/t1/registreringer/r1'), tReg('tre')));
  await assertFails(setDoc(doc(ven(), 'teams/t1/registreringer/r1'), { ...tReg('tre'), afventer: true }));
  await assertFails(setDoc(doc(ven(), 'teams/t1/registreringer/r1'), tVent('tre', 'tre')));
  await assertFails(setDoc(doc(ven(), 'teams/t1/registreringer/r1'), { ...tVent('tre', 'ven'), afventer: false }));
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/registreringer/r1'), tVent('tre', 'ven')));
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/registreringer/r2'), tReg('ven')));
});

test('kun personen kan godkende, og en andens rettelse venter igen', async () => {
  await medTeam(toMedlemmer);
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/registreringer/r1'), tVent('tre', 'ven')));
  await assertFails(setDoc(doc(ven(), 'teams/t1/registreringer/r1'), tReg('tre')));
  await assertSucceeds(setDoc(doc(tre(), 'teams/t1/registreringer/r1'), tReg('tre')));
  await assertFails(setDoc(doc(ven(), 'teams/t1/registreringer/r1'), { ...tReg('tre'), note: 'rettet' }));
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/registreringer/r1'), { ...tVent('tre', 'ven'), note: 'rettet' }));
});

test('ældre teamdata uden de nye felter kan rettes', async () => {
  await medTeam(toMedlemmer);
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'teams/t1/registreringer/gl'), tReg('tre')));
  await assertSucceeds(setDoc(doc(tre(), 'teams/t1/registreringer/gl'), { ...tReg('tre'), note: 'egen' }));
  await assertFails(setDoc(doc(ven(), 'teams/t1/registreringer/gl'), { ...tReg('tre'), note: 'anden' }));
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/registreringer/gl'), { ...tVent('tre', 'ven'), note: 'anden' }));
});

test('poster: person skal være medlem og findes ikke på betalinger', async () => {
  await medTeam(toMedlemmer);
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/poster/p1'), tPost({ person: 'ven' })));
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/poster/p2'), tPost({ person: 'tre', afventer: true, oprettetAf: 'ven' })));
  await assertFails(setDoc(doc(ven(), 'teams/t1/poster/p3'), tPost({ person: 'tre' })));
  await assertFails(setDoc(doc(ven(), 'teams/t1/poster/p4'), tPost({ person: 'admin', afventer: true, oprettetAf: 'ven' })));
  await assertFails(setDoc(doc(ven(), 'teams/t1/poster/p5'), tPost({ type: 'betaling', person: 'ven' })));
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/poster/p6'), tPost({ type: 'betaling' })));
  await assertFails(setDoc(doc(ven(), 'brugere/ven/poster/p7'), tPost({ person: 'ven' })));
});
```

- [ ] **Step 2: Run `npm run test:regler` and verify the new tests fail.**

- [ ] **Step 3: Implement in `firestore.rules`**
  - `gyldigPost(ekstra)` tager en liste af ekstra tilladte felter. `brugere` kalder med `[]`, teams med `['person', 'oprettetAf', 'afventer']`.
  - En ny funktion i `match /teams/{teamId}`:

```
// Kun personen kan godkende: alt, en anden skriver for personen, venter.
function godkendelseOk() {
  let d = request.resource.data;
  let foer = resource == null ? {} : resource.data;
  return (!('afventer' in d) || (d.afventer == true && 'oprettetAf' in d))
    && (!('person' in d) || d.person == request.auth.uid || d.get('afventer', false) == true)
    && (!('oprettetAf' in d) || d.oprettetAf == request.auth.uid || foer.get('oprettetAf', null) == d.oprettetAf);
}
```

  - `registreringer`: tilladte felter + `oprettetAf`, `afventer`, og `&& godkendelseOk()`.
  - `poster`:
    - `gyldigPost([...])`
    - `&& godkendelseOk()`
    - `&& !(request.resource.data.type == 'betaling' && 'person' in request.resource.data)`
    - person-medlemsreglen som for registreringer, men kun når `'person' in d`.

- [ ] **Step 4: Run `npm run test:regler`.** Forventet: alle grønne.

- [ ] **Step 5: Commit** `feat: regler for godkendelse i teams`

---

### Task 3: Push-worker

**Files:**
- Create: `push/package.json`, `push/wrangler.toml`, `push/src/index.js`, `push/src/token.js`, `push/src/team.js`, `push/src/send.js`, `push/test/worker.test.js`, `push/.gitignore` (`node_modules`, `.dev.vars`, `.wrangler`)
- Modify: rodens `package.json`: script `"test:push": "node --test push/test/*.test.js"`. `npm test` skal ikke tage `push/` med.

**Interfaces:**
- Produces (HTTP, CORS `*`, metoder `POST, DELETE, OPTIONS`, header `authorization, content-type`):
  - `POST /abonner` `{ abonnement: PushSubscriptionJSON }` → `200 { ok: true }`
  - `DELETE /abonner` `{ endpoint }` → `200 { ok: true }`
  - `POST /send` `{ teamId, til, slags, antal }` → `200 { sendt, fjernet }`, `400` ved ugyldigt input, `401` ved tokenfejl, `403` når Firestore ikke giver teamet.
- Internt (til test): `lavHandler({ verificer, hentTeam, kv, sendPush }) -> (request: Request) => Promise<Response>`.
  - `verificer(token) -> Promise<{ uid, email }>`, kaster ved fejl.
  - `hentTeam(teamId, token) -> Promise<{ navn, medlemmer: string[], navne: Record<string,string> } | null>`. `null` betyder ingen adgang.
  - `kv` har `get(key, 'json')` og `put(key, string)`.
  - `sendPush(abonnement, payload: string) -> Promise<{ status: number }>`.
  - `export default { fetch(request, env) }` bygger afhængighederne af `env`: `FIREBASE_PROJECT`, `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT`, `ABONNEMENTER` (KV), valgfri `FIRESTORE_EMULATOR`.
- KV-format: nøgle `uid:<uid>`, værdi `PushSubscriptionJSON[]` unik på `endpoint`.

- [ ] **Step 1: Verify the push library in Workers.**
  - Installér `jose`, `@block65/webcrypto-web-push` og `wrangler` som devDependency i `push/`.
  - Læs pakkens README for den præcise signatur af `buildPushPayload`.
  - Skriv `send.js`: `lavSendPush({ publicKey, privateKey, subject }) -> sendPush`. Den bygger forespørgslen med biblioteket og kalder `fetch(abonnement.endpoint, ...)` med TTL 86400.
  - Kør `npx wrangler dev` med en midlertidig rute, der kalder `sendPush` med et falsk endpoint (`https://example.invalid/`).
  - Forventet: fejlen er en netværksfejl, ikke en importfejl eller en crypto-fejl.
  - Virker biblioteket ikke i workerd, stop og rapportér det, før der bygges videre.

- [ ] **Step 2: Write the failing tests** i `push/test/worker.test.js` med falske afhængigheder:

```js
const team = { navn: 'Holdet', medlemmer: ['mig', 'ven'], navne: { mig: 'Mig', ven: 'Ven' } };
// verificer: 'god' → { uid: 'mig' }, alt andet kaster. hentTeam: 't1' → team, ellers null.
// kv: Map-baseret. sendPush: registrerer kald og svarer status fra en tabel pr. endpoint.

test('401 uden eller med ugyldigt token');                       // /abonner og /send
test('abonner gemmer pr. uid unikt på endpoint, og DELETE fjerner');
test('send: 403 når teamet ikke kan hentes');                    // teamId 't2'
test('send: 400 når til ikke er medlem, er afsender, eller antal ikke er 1–100 heltal, eller slags er ukendt');
test('send: teksten bygges af navne', ...);  // payload JSON: { title: 'Holdet', body: 'Mig har registreret 2 til dig. Tryk for at godkende.', url: './?team=t1&vis=godkend' }
test('send: afvist-tekst og url uden vis');  // body 'Mig afviste 1 af dine registreringer.', url './?team=t1'
test('send: 404/410 fjerner abonnementet, andre fejl beholder det'); // svar { sendt: 1, fjernet: 1 }
test('send: ingen abonnementer giver 200 { sendt: 0, fjernet: 0 }');
test('OPTIONS giver 204 med CORS');
```

  Hver test bruger `new Request('https://w/send', { method: 'POST', headers: { authorization: 'Bearer god' }, body: JSON.stringify(...) })` og læser `await res.json()`.

- [ ] **Step 3: Run `npm run test:push` and verify it fails.**

- [ ] **Step 4: Implement `index.js` (`lavHandler` + default export), `token.js` og `team.js`.**
  - `token.js`: `lavVerificer({ projekt, emulator })`.
    - Uden emulator: `jose.jwtVerify` mod `createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'))`, med `issuer: 'https://securetoken.google.com/' + projekt` og `audience: projekt`.
    - Med emulator: `jose.decodeJwt` uden signaturtjek, med samme krav til `aud`.
    - Begge kræver `email_verified === true` og returnerer `{ uid: sub, email }`.
  - `team.js`: `lavHentTeam({ projekt, emulator })`.
    - GET `${emulator ?? 'https://firestore.googleapis.com'}/v1/projects/${projekt}/databases/(default)/documents/teams/${encodeURIComponent(teamId)}` med `Authorization: Bearer <token>`.
    - Ikke-200 giver `null`.
    - Felterne pakkes ud af REST-formatet: `fields.navn.stringValue`, `fields.medlemmer.arrayValue.values[].stringValue` og `fields.navne.mapValue.fields[uid].stringValue`.

- [ ] **Step 5: Run `npm run test:push`.** Forventet: alle grønne.

- [ ] **Step 6: Konfiguration.**
  - `wrangler.toml`:
    - `name = "arbejdstid-push"`, `main = "src/index.js"`, en aktuel `compatibility_date`
    - `[vars] FIREBASE_PROJECT = "arbejdstid-dfdc6"` og `VAPID_PUBLIC`
    - `[[kv_namespaces]] binding = "ABONNEMENTER"` med id-pladsholder, der udfyldes ved opsætningen
  - `.dev.vars.example` med:
    - `FIREBASE_PROJECT=demo-arbejdstid`
    - `FIRESTORE_EMULATOR=http://127.0.0.1:8080`
    - `VAPID_PRIVATE=` og `VAPID_SUBJECT=mailto:nikolajnbak@icloud.com`
  - Lav et VAPID-nøglepar med `npx web-push generate-vapid-keys`. Den offentlige nøgle går i `wrangler.toml`. Den private går kun i `.dev.vars` og senere i `wrangler secret`, og den committes aldrig.

- [ ] **Step 7: Commit** `feat: push-worker på Cloudflare med tjek af token og teammedlemskab`

---

### Task 4: Beskedkø og pushstatus (ren logik)

**Files:**
- Create: `pushkoe.js`
- Test: `tests/pushkoe.test.js`

**Interfaces:**
- Produces:
  - `koeTilfoej(storage, besked: { teamId, til, slags, antal }, nu: number) -> void`. Gemmer `{ ...besked, tid: nu }` under nøglen `arbejdstid.pushkoe`.
  - `async koeSend(storage, send: (besked) => Promise<number>, nu: number) -> void`. `send` returnerer en HTTP-status, og ved netværksfejl kaster den.
    - Status 2xx, 400, 401 og 403 fjerner beskeden.
    - Andre statusser og kast beholder den.
    - Beskeder ældre end `7 * 864e5` ms fjernes uden at blive sendt.
    - Mens køen sendes, kan en ny besked tilføjes. Den må ikke tabes.
  - `pushStatus({ understoettet, ios, standalone, tilladelse, abonneret }) -> { tekst: string, kanSlaaTil: boolean }`:
    - `ios && !standalone` → `'Læg appen på hjemmeskærmen for at få notifikationer'`, false
    - `!understoettet` → `'Ikke muligt i denne browser'`, false
    - `tilladelse === 'denied'` → `'Notifikationer er blokeret i browserens indstillinger'`, false
    - `abonneret` → `'Slået til'`, false
    - ellers `'Slået fra'`, true

- [ ] **Step 1: Write the failing tests** med en `Map`-baseret storage (`getItem`/`setItem`):
  - `'køen sender og fjerner ved 200, 401 og 403, beholder ved 500 og netværksfejl'`
  - `'køen dropper beskeder ældre end 7 dage uden at sende'`
  - `'pushStatus giver den rigtige tekst for hver situation'`, med de fem tilfælde ovenfor ordret

- [ ] **Step 2: Run `npm test` and verify it fails.**
- [ ] **Step 3: Implement `pushkoe.js`.** Ingen import fra browser-API'er.
- [ ] **Step 4: Run `npm test`.** Forventet: grønt.
- [ ] **Step 5: Commit** `feat: kø til push-beskeder og status for notifikationer`

---

### Task 5: Saldo, mærker og registrering for andre i appen

**Files:**
- Modify:
  - `tilstand.js`: + `erstat(samling, x)`, der erstatter elementet med samme id, eller tilføjer det
  - `ui.js`: + `ventendeMaerke(x) -> Node|null` med teksten `Venter på dig` hvis `x.person === t.bruger.uid`, ellers `Venter på <personNavn>`
  - `registrering.js`: rækken (ca. linje 18–30) og `gem` (ca. linje 108–110)
  - `post.js`: `postRaekke`, `aabnPost` og `gem`
  - `tid.js`: "I dag" og `gemUr`/skift (de får markeringen gratis fra Task 1, fordi `person: migITeam()` allerede sendes med)
  - `historik.js`: ca. linje 110, 155 og 192
  - `kunder.js`: ca. linje 41 og 90
  - `styles.css`: `.raekke.venter .tal { opacity: .5 }` og mærkets farve
- Test: manuelt i browseren (Task 8). Logikken er dækket i Task 1.

**Interfaces:**
- Consumes: `godkendte`, `markerRettelse`, `forPersoner(..., afsender)` fra Task 1.
- Produces: `erstat` (bruges i Task 6), `ventendeMaerke`.

- [ ] **Step 1: Saldo og overblik regner kun med det godkendte.**
  - `saldoer`, `afregning` og `kundeOversigt` kaldes med `godkendte(t.state.registreringer)` og `godkendte(t.state.poster)`.
  - `summarize` og CSV i `historik.js` får `godkendte(entries)` og `godkendte(poster)`.
  - Listerne dag for dag viser stadig alt.
- [ ] **Step 2: Rækker.** For en ventende registrering eller post vises `ventendeMaerke` i stedet for `afregnetMaerke`, og rækken får klassen `venter`.
- [ ] **Step 3: Registrering for andre.**
  - Ny registrering: `forPersoner(data, valg.personer, newId, migITeam())`.
  - Rettelse: `erstat('registreringer', markerRettelse({ ...aktuel, ...data, person }, migITeam()))`. `aktuel` er det aktuelle element i `t.state`, ligesom `aendr` slår det op.
- [ ] **Step 4: Hvem på poster.**
  - I et team og når typen ikke er `betaling`: en række chips efter kunden, én pr. medlem med en selv først (samme orden som `vaelger.js` `tegnHvem`). Kun én kan vælges, og `valg.person` er en selv fra start.
  - Ved Betaling forsvinder chipsene, og `person` udelades.
  - Ny post: `{ id, ...data, person }` gennem `markerRettelse(…, migITeam())`, så en anden person giver `afventer`. Rettelse: `erstat('poster', markerRettelse({ ...aktuel, ...data, person }, migITeam()))`.
- [ ] **Step 5: Run `npm test`.** Forventet: grønt.
- [ ] **Step 6: Kort kontrol i browseren.**
  - Start emulatorer og `python3 -m http.server 8000`.
  - Med to testbrugere i et team: registrér tid for den anden.
  - Rækken skal vise `Venter på <navn>`, og saldoen under Historik → Saldo skal være uændret.
- [ ] **Step 7: Commit** `feat: registreringer og udgifter for andre venter og tæller ikke med i saldoen`

---

### Task 6: Til godkendelse

**Files:**
- Create: `godkend.js`
- Modify: `tid.js` (skærmens top, før `urkort()`), `tilstand.js` (`t.visGodkend: false`), `sw.js` (`FILER`), `styles.css`

**Interfaces:**
- Consumes: `ventende`, `godkend` (Task 1), `erstat` (Task 5), `personNavn`.
- Produces: `godkendKort() -> Node|null` (null i Mig eller uden ventende), `aabnGodkend() -> void`.

- [ ] **Step 1: Implement `godkendKort`.** Et kort med teksten `<N> venter på din godkendelse`, der kalder `aabnGodkend`. Det vises øverst på Tid-fanen. Er `t.visGodkend` sand og data hentet, nulstilles flaget, og arket åbnes.
- [ ] **Step 2: Implement `aabnGodkend`.**
  - Arket har titlen `Til godkendelse` og knappen `Godkend alle` øverst.
  - Rækkerne viser det ventende for en selv, ældste først: registreringer efter `start`, poster efter `dato`.
  - Hver række viser:
    - kunde og opgave (registrering) eller posttype og kunde (post)
    - dato, og for tid `HH:MM–HH:MM`
    - beløbet
    - `fra <personNavn(oprettetAf)>`
  - Hver række har knapperne `Godkend` og `Afvis`.
  - Godkend: `erstat(samling, godkend(x))`, `commit()`.
  - Afvis: `confirm('Slet registreringen? <navn> får besked.')` eller `'Slet posten? <navn> får besked.'`, så fjernes elementet fra `t.state`, og `commit()` kaldes.
  - Et tryk på rækken (uden for knapperne) åbner den eksisterende redigering, `aabnRegistrering` eller `aabnPost`.
  - Arket tegnes om efter hver handling og lukkes, når listen er tom.
- [ ] **Step 3: Tilføj `./godkend.js` til `FILER` i `sw.js`.**
- [ ] **Step 4: Kort kontrol i browseren.**
  - Som den anden testbruger: kortet viser 1.
  - Godkend: saldoen stiger med beløbet.
  - Opret en ny og afvis den: den forsvinder hos begge.
- [ ] **Step 5: Commit** `feat: kort og ark til godkendelse`

---

### Task 7: Push i appen

**Files:**
- Create: `push-config.js` (`PUSH_URL`, `VAPID_PUBLIC`; lokalt `http://127.0.0.1:8787` når `LOKAL`), `push.js`
- Modify:
  - `tilstand.js`: basislinje og hook i `commit`
  - `app.js`: sæt basislinjen i `data`-callbacken fra `startSky` (ca. linje 225), kør køen ved login og ved `online`, og læs `?team=&vis=` efter `efterLogin`
  - `indstillinger.js`: rækken Notifikationer under Mere
  - `sw.js`: `push` og `notificationclick`, og `push.js`, `pushkoe.js` og `push-config.js` i `FILER`
  - `README.md`: sektionen "Push (én gang)" med opsætningstrinene fra spec'en, og en linje under Teams om godkendelse

**Interfaces:**
- Consumes: `nyeBeskeder` (Task 1), `koeTilfoej`/`koeSend`/`pushStatus` (Task 4), workerens HTTP-API (Task 3), `aabnGodkend`/`t.visGodkend` (Task 6).
- Produces (`push.js`):
  - `async status() -> { tekst, kanSlaaTil }`
  - `async slaaTil() -> void`
  - `async slaaFra() -> void`
  - `meld(beskeder: Array<{til, slags, antal}>) -> void`
  - `async koerKoe() -> void`
  - `send` henter `await auth.currentUser.getIdToken()` til `Authorization`.

- [ ] **Step 1: Hook i `commit`.**
  - `tilstand.js` holder `basis` (en kopi af `{ registreringer, poster }`).
  - `commit()` gør i et team:
    1. `beskeder = nyeBeskeder(basis, t.state, t.bruger.uid)`
    2. `basis = kopi`
    3. `meld(beskeder)`, når der er nogen
  - `app.js` sætter `basis` ved hver `data` fra skyen og ved skift af arbejdssted. Så giver sletninger fra en anden enhed ingen dobbelt `afvist`.
  - `meld` lægger hver besked i køen med `teamId: t.arbejdssted` og kalder `koerKoe()`.
- [ ] **Step 2: Første gang uden notifikationer.** Når `meld` får en `afventer`-besked, og `status().kanSlaaTil` er sand, vises én gang (flag i `localStorage` `arbejdstid.pushtip`) `besked('Slå notifikationer til under Indstillinger, så du også får besked')`.
- [ ] **Step 3: Abonnement.**
  - `slaaTil`:
    1. `Notification.requestPermission()`
    2. `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`. Nøglen er `VAPID_PUBLIC` dekodet fra base64url, som i Vinted-appens `vapidBytes`.
    3. `POST /abonner`
  - `slaaFra`: `DELETE /abonner` og `unsubscribe()`.
  - `status()` sætter `ios` ud fra user agent, `standalone` ud fra `matchMedia('(display-mode: standalone)')` eller `navigator.standalone`, og `abonneret` ud fra `pushManager.getSubscription()`.
- [ ] **Step 4: Indstillinger.** Under Mere tilføjes `merRaekke('Notifikationer', status.tekst, …)`.
  - Med `kanSlaaTil` kalder et tryk `slaaTil`. Når de er slået til, spørger trykket `confirm('Slå notifikationer fra på denne enhed?')` og kalder `slaaFra`.
  - Rækken tegnes om bagefter.
- [ ] **Step 5: Service worker.**
  - `push`: `showNotification(title, { body, data: { url }, icon: './icons/icon-192.png', badge: './icons/icon-192.png' })`.
  - `notificationclick`: findes et klientvindue, `navigate(url)` + `focus()`. Ellers `clients.openWindow(url)`. URL'en løses mod `self.registration.scope`.
- [ ] **Step 6: Åbning fra en notifikation.**
  - Efter login læser `app.js` `?team` og `?vis`.
  - Er teamet blandt `t.teams`, kaldes `skiftArbejdssted(team)`. Ved `vis=godkend` sættes `t.visGodkend = true`, og der skiftes til Tid-fanen.
  - Til sidst fjernes parametrene med `history.replaceState`.
- [ ] **Step 7: Run `npm test`.** Forventet: grønt.
- [ ] **Step 8: Commit** `feat: push-beskeder om godkendelse`

---

### Task 8: Verifikation fra ende til anden og udgivelse

**Files:** ingen nye. Kun rettelser, hvis noget fejler.

- [ ] **Step 1: Alle tests.** Kør `npm test`, `npm run test:regler` og `npm run test:push`. Forventet: alle grønne.
- [ ] **Step 2: Lokalt fra ende til anden.** Kør `npm run emulatorer`, `python3 -m http.server 8000` og i `push/` `npx wrangler dev` med `.dev.vars`. Med to testbrugere i hver sin browserprofil eller fane:
  1. A og B er i samme team. B slår notifikationer til.
  2. A registrerer tid og en udgift for B. Saldoen er uændret hos begge, og rækkerne viser `Venter på B` hos A.
  3. B modtager én push med `A har registreret 2 til dig. Tryk for at godkende.` Et tryk åbner teamet og Til godkendelse.
  4. B godkender den ene, og saldoen stiger. B afviser den anden, og A får pushen om afvisning.
  5. A går offline, registrerer for B og går online igen. Pushen kommer, når der er net.
  - Kan Chromes push ikke nå frem fra den lokale opsætning, verificeres trin 3–5 i stedet med workerens svar (`sendt: 1`) og køen i `localStorage`. Det skal siges i rapporten.
- [ ] **Step 3: Opsætning, som brugeren selv laver.** Kontooprettelse og login er ikke agentens:
  - Cloudflare-konto og `npx wrangler login`
  - `npx firebase login`
  - Bed brugeren om dem, og fortsæt derefter med resten.
- [ ] **Step 4: Udgiv.**
  1. `npx wrangler kv namespace create ABONNEMENTER`, og læg id'et i `wrangler.toml`.
  2. `npx wrangler secret put VAPID_PRIVATE` og `npx wrangler secret put VAPID_SUBJECT`.
  3. `npx wrangler deploy`, og læg adressen i `push-config.js`.
  4. `npx firebase deploy --only firestore:rules --project arbejdstid-dfdc6`.
  5. Commit og push til `main`.
- [ ] **Step 5: Én test i produktion** på en iPhone med appen på hjemmeskærmen: slå notifikationer til, få en registrering fra en anden, og godkend fra pushen.
