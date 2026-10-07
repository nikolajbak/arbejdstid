# Login, brugere og data i skyen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kun inviterede brugere kan bruge Arbejdstid; hver brugers data ligger i Firestore under egen konto og virker offline; administratorer styrer brugerlisten i appen.

**Architecture:** Firebase Auth (e-mail/adgangskode) og Firestore med persistent offline-cache, indlæst som ES-moduler fra gstatic. `sky.js` holder tilstanden i samme form som i dag og skriver kun forskellen (`forskel` i `core.js`), så visningerne er næsten uændrede. Sikkerheden ligger i `firestore.rules`, som testes mod emulatoren.

**Tech Stack:** Vanilla JS-moduler, Firebase JS SDK 13.0.0 (gstatic), Node 26 `node --test`, firebase-tools 15 + @firebase/rules-unit-testing 6 (kun udvikling), OpenJDK 21 (Homebrew) til emulatoren.

**Spec:** `docs/superpowers/specs/2026-10-07-login-og-sky-design.md`

## Global Constraints

- Intet byggetrin i appen. Firebase hentes fra `https://www.gstatic.com/firebasejs/13.0.0/firebase-{app,auth,firestore}.js`.
- Ingen Analytics. `measurementId` udelades fra konfigurationen.
- Firestore-stier og felter præcis som i specens datamodel. `godkendte`-id = e-mail med små bogstaver.
- På `localhost`/`127.0.0.1`: projectId `demo-arbejdstid`, Auth-emulator `http://127.0.0.1:9099`, Firestore-emulator `127.0.0.1:8080`.
- Alle brugertekster på dansk, fejltekster præcis som i specens fejltabel.
- `npm test` (eksisterende glob `tests/*.test.js`) skal fortsat bestå; regeltests ligger i `tests/regler/` og køres med `npm run test:regler`.
- Jeg (agenten) må ikke oprette konti eller indtaste adgangskoder mod det rigtige projekt; al browsertest sker mod emulatorerne.

## Review Focus

1. Remote eller ekko-snapshot ankommer, mens brugeren skriver i et felt → feltet må ikke miste fokus eller indhold (render kun når data reelt er ændret).
2. Firestore returnerer felter og dokumenter i vilkårlig rækkefølge → `forskel` må ikke se det som en ændring, og kunder/opgavetyper vises sorteret efter navn.
3. Kold start uden net med tidligere login → appen åbner med cachede data; første login nogensinde uden net → "Første login kræver internet."
4. E-mail med store bogstaver eller mellemrum (fx " Ven@Mail.dk ") ved invitation og login → matcher samme `godkendte`-dokument.
5. Backup-eksport skal stadig kunne importeres (state har ikke længere `version`; eksport tilføjer `version: 1`).

---

### Task 1: Udviklingsværktøj og sikkerhedsregler

**Files:**
- Create: `firestore.rules`, `firebase.json`, `.gitignore`, `tests/regler/regler.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run test:regler`; regler som Task 3–6 skriver op imod.

- [ ] **Step 1: Installér Java og udviklingspakker**

```bash
brew install openjdk@21
npm install --save-dev firebase-tools@15 @firebase/rules-unit-testing@6 firebase@13
```

`.gitignore`: `node_modules/`, `*-debug.log`. `package.json` scripts tilføjes:
`"test:regler": "PATH=\"/opt/homebrew/opt/openjdk@21/bin:$PATH\" firebase emulators:exec --only firestore --project demo-arbejdstid \"node --test tests/regler/*.test.js\""`.
`firebase.json`: `firestore.rules` som regelfil; emulatorer auth 9099, firestore 8080, ui slået fra.

- [ ] **Step 2: Skriv regeltests** i `tests/regler/regler.test.js` med `initializeTestEnvironment({ projectId: 'demo-arbejdstid', firestore: { rules: readFileSync('firestore.rules','utf8') } })`. Opsætning med `withSecurityRulesDisabled`: `godkendte/admin@x.dk {admin:true, uid:'admin'}`, `godkendte/ven@x.dk {admin:false, uid:null}`. Kontekster: `authenticatedContext(uid, { email, email_verified })`. Tests (hver `assertSucceeds`/`assertFails`):

```
egen data: ven (verified) kan skrive/læse brugere/ven/kunder/k1 {navn:'A',timepris:500,arkiveret:false}
fremmed: admin kan IKKE læse brugere/ven/kunder/k1
ubekræftet: ven med email_verified:false kan IKKE læse brugere/ven/...
ikke inviteret: frem@x.dk (verified) kan IKKE skrive brugere/frem/kunder/k1
ikke inviteret kan læse eget godkendte/frem@x.dk (findes ikke → get lykkes med tomt resultat), men ikke godkendte/ven@x.dk
store bogstaver: token email 'Ven@X.dk' matcher godkendte/ven@x.dk
kun admin: ven kan IKKE oprette godkendte/ny@x.dk; admin kan oprette {email:'ny@x.dk',admin:false,inviteret:serverTimestamp(),uid:null}
admin kan IKKE oprette med email != id eller med ekstra felter
kun admin kan liste godkendte
admin kan IKKE slette godkendte/admin@x.dk; kan slette godkendte/ven@x.dk
admin kan sætte admin:true på ven; IKKE admin:false på sig selv
ven kan sætte uid:'ven' på eget dokument; IKKE uid:'andet'; IKKE admin:true
validering: kunder med timepris -1, navn '' eller ekstra felt afvises
validering: registrering med slut <= start afvises; gyldig {kundeId,opgavetypeId,start,slut,timepris,note} accepteres
profil: brugere/ven {email:'ven@x.dk', oprettet: serverTimestamp(), ur:null} accepteres; ur med start som tal afvises
```

- [ ] **Step 3: Kør dem mod en `firestore.rules` der nægter alt** (`allow read, write: if false;`)

Run: `npm run test:regler` · Expected: FAIL på alle "kan"-tests, PASS på "kan IKKE".

- [ ] **Step 4: Skriv `firestore.rules`** efter specens afsnit "Sikkerhedsregler". Brug `request.auth.token.email.lower()` til e-mail-opslag, `diff(resource.data).affectedKeys().hasOnly([...])` til de begrænsede opdateringer, `keys().hasOnly`/`hasAll` til feltvalidering, og `slut > start` (ISO-strenge i UTC sammenlignes leksikografisk).

- [ ] **Step 5:** Run: `npm run test:regler` · Expected: alle PASS. `npm test` · Expected: 30 pass.

- [ ] **Step 6: Commit** `feat: firestore-regler med tests mod emulatoren`

### Task 2: Rene funktioner i core.js

**Files:** Modify `core.js`, `tests/core.test.js`

**Interfaces:**
- Produces:
  - `forskel(foer, efter) -> Op[]`, hvor `Op = { type:'set', samling, id, data } | { type:'slet', samling, id } | { type:'ur', ur }`; `samling ∈ 'kunder'|'opgavetyper'|'registreringer'`; `data` er elementet uden `id`. Elementer sammenlignes med nøgle-sorteret JSON.
  - `flet(lokal, konto) -> tilstand` (`{kunder, opgavetyper, registreringer, ur}`).
  - `normaliserEmail(s) -> string | null` (trim + små bogstaver; null hvis ikke `x@y.z`).
  - `fejlTekst(kode) -> string` for Firebase-fejlkoder.

- [ ] **Step 1: Skriv tests**

```js
test('forskel finder nye, ændrede og slettede elementer', ...)
  foer kunder [{id:'a',navn:'A',timepris:1,arkiveret:false},{id:'b',...}]
  efter: a med timepris 2, b fjernet, c tilføjet
  → [{type:'set',samling:'kunder',id:'a',data:{navn:'A',timepris:2,arkiveret:false}},
     {type:'set',samling:'kunder',id:'c',...},{type:'slet',samling:'kunder',id:'b'}]  (rækkefølge: set før slet, i efter-/foer-rækkefølge)
test('forskel ignorerer nøglerækkefølge og listerækkefølge') → []
test('forskel melder ændret ur som én ur-op') → [{type:'ur', ur:{...}}]; uændret ur → ingen
test('flet genbruger kunde og opgavetype med samme navn uanset store bogstaver')
  lokal kunde {id:'l1',navn:'acme'}, konto {id:'k1',navn:'ACME'} → ingen ny kunde, lokal registrering får kundeId 'k1'
test('flet tilføjer nye kunder og registreringer og springer kendte registrerings-id over')
test('flet overfører kun lokalt ur, hvis kontoen intet har')
test('normaliserEmail', ...) ' Ven@Mail.DK ' → 'ven@mail.dk'; 'ven', '', 'a@b' → null
test('fejlTekst', ...)
  'auth/invalid-credential','auth/wrong-password','auth/user-not-found','auth/invalid-email' → 'Forkert e-mail eller adgangskode.'
  'auth/email-already-in-use' → 'Der findes allerede en konto med den e-mail. Log ind i stedet.'
  'auth/weak-password' → 'Adgangskoden skal være mindst 6 tegn.'
  'auth/network-request-failed' → 'Første login kræver internet.'
  'auth/too-many-requests' → 'For mange forsøg. Prøv igen om lidt.'
  'permission-denied' → 'Din adgang er fjernet.'
  'noget-andet' → 'Noget gik galt. Prøv igen.'
```

- [ ] **Step 2:** Run `npm test` · Expected: FAIL (ikke eksporteret).
- [ ] **Step 3:** Implementér i `core.js`.
- [ ] **Step 4:** Run `npm test` · Expected: alle pass.
- [ ] **Step 5: Commit** `feat: forskel, flet og hjælpere til skyen`

### Task 3: Firebase-forbindelse og konto

**Files:** Create `firebase-config.js`, `firebase.js`, `konto.js`

**Interfaces:**
- Consumes: `normaliserEmail` (Task 2), `defaultData` (store.js).
- Produces:
  - `firebase.js`: `export const auth, db, LOKAL` (LOKAL = kører mod emulatorer). Firestore med `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`.
  - `konto.js`: `lytKonto(cb)`, `logInd(email, kode)`, `opretKonto(email, kode)` (sender bekræftelse med `url: location.origin + location.pathname`), `sendBekraeftelse()`, `nulstilKode(email)`, `opdaterBruger() -> user` (reload + `getIdToken(true)`), `hentGodkendelse(email) -> {email,admin,uid} | null`, `sikrProfil(user, godk)` (sætter uid hvis null, opretter profil + standardopgavetyper hvis profilen mangler), `logUd()` (signOut, `terminate`, `clearIndexedDbPersistence`, `location.reload()`), `lytBrugere(cb)`, `inviter(email)`, `fjernAdgang(email)`, `saetAdmin(email, bool)`.

- [ ] **Step 1:** Skriv filerne. `firebase-config.js` indeholder brugerens konfiguration uden `measurementId`.
- [ ] **Step 2: Verificér import i browseren** mod emulatorerne (`npx firebase emulators:start --only auth,firestore --project demo-arbejdstid` i baggrunden, `python3 -m http.server 8000`): i konsollen `await import('./konto.js')` uden fejl, og `opretKonto('test@x.dk','test1234')` giver en bruger i emulatoren.
  Ruling: tynde SDK-indpakninger unit-testes ikke; de dækkes af regeltests (Task 1) og browsertesten (Task 6).
- [ ] **Step 3: Commit** `feat: forbindelse til firebase og kontofunktioner`

### Task 4: sky.js

**Files:** Create `sky.js`

**Interfaces:**
- Consumes: `db`, `forskel`.
- Produces: `startSky(uid, { data(tilstand), status(ventende: boolean), fejl(err) }) -> { gem(tilstand), stop() }`.
  - Lytter på `brugere/{uid}` og de tre samlinger med `includeMetadataChanges: true`.
  - Kalder `data` første gang, når alle fire har svaret, og derefter kun når `forskel(sidst, ny)` ikke er tom (Review Focus 1). `sidst` er en dyb kopi.
  - Kunder og opgavetyper sorteres efter navn (`localeCompare` med `'da'`).
  - `status` kaldes, når samlet `hasPendingWrites` skifter.
  - `gem`: ops = `forskel(sidst, tilstand)`, `sidst = kopi(tilstand)`, skriv i `writeBatch` à højst 500; `ur`-op bliver `update(profil, { ur })`. Commit-løftet afventes ikke (offline), men fejl går til `fejl`.
  - `fejl` med kode `permission-denied` fra en lytter går videre til `fejl`.

- [ ] **Step 1:** Skriv `sky.js`.
- [ ] **Step 2: Verificér i browseren** mod emulatorerne med en godkendt testbruger (oprettet via `withSecurityRulesDisabled`-svarende REST-kald eller emulatorens Firestore-REST): `startSky` leverer data; `gem` med en ny kunde gør dokumentet synligt i emulatoren.
- [ ] **Step 3: Commit** `feat: synkronisering af data med firestore`

### Task 5: Login-flow i appen

**Files:** Modify `app.js`, `index.html`, `styles.css`

**Interfaces:** Consumes Task 2–4.

- [ ] **Step 1:** Opstart i `app.js` erstatter `createStore().load()`:
  - `lytKonto`: ingen bruger → `visLogin()`; ikke bekræftet → `visBekraeft()`; `hentGodkendelse` null → `visIkkeInviteret()`; ellers `sikrProfil`, `startSky`, og vis appen. Kan godkendelsen ikke hentes (offline uden cache) → "Første login kræver internet."
  - Mens login-skærme vises, skjules bundnavigationen (`body.ude`).
  - Loginsiden: e-mail, adgangskode, "Log ind", "Opret konto", linket "Vælg eller nulstil adgangskode" (besked: "Hvis e-mailen findes, har vi sendt et link."). Fejl vises med `fejlTekst`. Besked gemt i `sessionStorage['arbejdstid.besked']` vises øverst og slettes.
  - Bekræft-skærm: "Bekræft din e-mail via linket, vi sendte til <e-mail>", "Jeg har bekræftet", "Send igen", "Log ud".
  - Ikke-inviteret: "Denne e-mail er ikke inviteret. Spørg den, der administrerer appen." og "Log ud".
- [ ] **Step 2:** `commit()` kalder `sky.gem(state)` og `render()`. Sky's `data` sætter `state` og renderer. `fejl` med `permission-denied` → besked "Din adgang er fjernet." i sessionStorage og `logUd()`. Fjern `store.beskadiget`-advarslen.
- [ ] **Step 3:** `#sync` i headeren viser "Ikke synkroniseret", når `status(true)`.
- [ ] **Step 4:** Indstillinger → sektion "Konto": e-mail og "Log ud" (advarsel "Du har ændringer, der ikke er synkroniseret. Log ud alligevel?" når der er ventende).
- [ ] **Step 5: Verificér i browseren** mod emulatorerne: opret konto → bekræft-skærm; bekræft via emulatorens `oobCodes`-endpoint → ikke-inviteret; opret `godkendte` via emulator-REST med regler slået fra (`Authorization: Bearer owner`) → appen vises med standardopgavetyper; start/stop ur → registrering findes i emulatoren; log ud → loginside, og IndexedDB-cachen er tom.
- [ ] **Step 6:** `npm test` · Expected: alle pass. **Commit** `feat: login, bekræftelse og konto i appen`

### Task 6: Brugere, overførsel, backup, offline og udgivelse

**Files:** Modify `app.js`, `sw.js`, `README.md`

- [ ] **Step 1: Brugere** (kun når egen godkendelse har `admin`): Indstillinger → "Brugere" med liste fra `lytBrugere` (e-mail, "Inviteret"/"Aktiv", "Administrator"), felt + "Invitér" (`normaliserEmail`; ugyldig → "Skriv en gyldig e-mail."), pr. anden bruger "Fjern adgang" (confirm) og "Gør til administrator"/"Fjern som administrator".
- [ ] **Step 2: Overførsel** efter første `data`: hvis `localStorage['arbejdstid.v1']` består `validateBackup`, har kunder eller registreringer, og `arbejdstid.overfoersel` ikke er sat → `confirm("Overfør N registreringer fra denne telefon til din konto?")`; ja → `state = flet(lokal, state)`, `commit()`, omdøb nøglen til `arbejdstid.v1.overfoert-<Date.now()>`; i begge tilfælde sæt `arbejdstid.overfoersel = '1'`.
- [ ] **Step 3: Backup:** eksport skriver `{ version: 1, ...state }` (Review Focus 5); hjælpetekst: "Data gemmes på din konto. En backup er en ekstra sikkerhed." Import uændret (går via `commit` → `forskel`).
- [ ] **Step 4: sw.js:** `CACHE = 'arbejdstid-v2'`; precache de nye filer og de tre gstatic-URL'er; fetch-handleren svarer kun fra cache for samme origin og `https://www.gstatic.com/firebasejs/`, alt andet går direkte til nettet.
- [ ] **Step 5: Verificér i browseren** mod emulatorerne: invitér `ven@x.dk` som admin → status "Inviteret"; opret og bekræft ven i en anden fane-session → status "Aktiv"; ven ser ikke admins data; fjern adgang → ven logges ud med "Din adgang er fjernet."; overførsel med en lokal `arbejdstid.v1`; backup-eksport → import giver samme data; offline (emulator stoppet): registrering gemmes, "Ikke synkroniseret" vises, forsvinder når emulatoren kører igen.
- [ ] **Step 6: README:** opsætning (regler udgives via konsollen → Firestore → Rules, eller `npx firebase deploy --only firestore:rules --project arbejdstid-dfdc6` efter `npx firebase login`), autoriseret domæne `nikolajbak.github.io` under Authentication → Settings, første administrator, invitation, `npm run test:regler`.
- [ ] **Step 7:** `npm test` og `npm run test:regler` · Expected: alle pass. **Commit** `feat: brugeradministration, overførsel og offline-cache`
