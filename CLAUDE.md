# Arbejdstid

Timeregistrering for selvstændige med flere kunder: ur pr. kunde, poster
(udgifter, brændstof, kontantudlæg, betalinger), teams og CSV til fakturering.
Brugervejledning og engangsopsætning: `README.md`.

## Overblik

| | |
|---|---|
| Repo | `nikolajbak/arbejdstid` · lokalt `~/Arbejdstid` · direkte på `main` |
| Kører på | GitHub Pages → https://nikolajbak.github.io/arbejdstid/ · Cloudflare Worker `arbejdstid-push` + KV `ABONNEMENTER` → https://arbejdstid-push.arbejdstid-push.workers.dev |
| Data | Firebase `arbejdstid-dfdc6`: Firestore (`eur3`) + Auth (e-mail/adgangskode, kun inviterede) |
| Stack | Vanilla JS-moduler uden build · Firebase JS SDK · Worker i JS (`push/`) · tests med `node --test` |
| Betalte API'er | Gemini (gratisniveauet, nøgle uden fakturering) til kvitteringslæsning i workeren |

## Kommandoer

```bash
npm run emulatorer            # Firebase-emulatorer (auth + firestore); kræver openjdk@21
python3 -m http.server 8000   # appen → http://localhost:8000 (bruger emulatorerne)
npm test                      # ren logik: beregninger, CSV, synk, lagring
npm run test:regler           # firestore.rules mod emulatoren
npm run test:push             # workeren
cd push && npx wrangler dev --port 8787    # workeren lokalt (kræver push/.dev.vars)
```

## Arkitektur

| Del | Filer |
|---|---|
| Ren logik uden DOM (bruges af app og tests) | `core.js` |
| Opstart, login, faner | `app.js`, `konto.js`, `tilstand.js`, `ui.js` |
| Fanerne | `tid.js`, `historik.js`, `kunder.js`, `indstillinger.js` |
| Ark | `vaelger.js`, `registrering.js`, `post.js`, `opgave.js`, `godkend.js`, `teamark.js` |
| Firestore og synk | `firebase.js`, `firebase-config.js` (offentlig med vilje), `sky.js`, `store.js`, `team.js` |
| Kvitteringer | `billede.js`, `kvittering.js` → workerens `push/src/kvittering.js` (Gemini) |
| Push | `push.js`, `pushkoe.js`, `push-config.js` → `push/src/` (`index.js`, `send.js`, `token.js`, `team.js`) |
| Sikkerhedsregler | `firestore.rules` (tests i `tests/regler/`) |
| Offline og opdatering | `sw.js` (`FILER`) |

## Udrulning

- **Appen:** push til `main` → GitHub Pages. Intet versionsnummer: service
  workeren henter netværk først og genindlæser selv ved ændrede filer.
  **En ny `.js`-fil skal med i `FILER` i `sw.js`**, ellers virker den ikke
  offline.
- **`firestore.rules`:** udgives af GitHub Actions (`.github/workflows/regler.yml`),
  når filen ændres på `main`, efter regeltestene. Kræver repo-secret
  `FIREBASE_SERVICE_ACCOUNT`. Udgives reglerne ikke, afviser Firestore de nye
  felter — appen udgives samtidig, så tjek at workflowet »Regler« er grønt.
  Manuelt: kør workflowet eller
  `npx firebase deploy --only firestore:rules --project arbejdstid-dfdc6`.
- **Workeren:** udgives af GitHub Actions (`.github/workflows/worker.yml`), når
  `push/` ændres på `main`, efter workerens tests. Kræver repo-secrets
  `CLOUDFLARE_API_TOKEN` og `CLOUDFLARE_ACCOUNT_ID`. Manuelt: kør workflowet
  »Worker« eller `cd push && npx wrangler deploy`.

## Data og hemmeligheder

- Hver brugers data ligger under brugerens egen konto; teams deler kunder,
  opgaver, poster og saldo. Godkendte brugere står i samlingen `godkendte`
  (dokument-id = e-mail med små bogstaver).
- Worker-secrets (`npx wrangler secret put`): `VAPID_PRIVATE`,
  `VAPID_SUBJECT`, `GEMINI_API_KEY`. Lokalt i `push/.dev.vars` (gitignored,
  skabelon i `.dev.vars.example`).
- Offentligt med vilje: `VAPID_PUBLIC` (`push/wrangler.toml` og
  `push-config.js`), `firebase-config.js`.
- KV `ABONNEMENTER` rummer også Geminis modelliste og modelhelbred
  (`gemini:…`).

## Faldgruber

- **Afrunding:** hver registrering tæller mindst 15 min og rundes op til
  nærmeste kvarter i både tid og beløb. Start/slut gemmes præcist, så
  afrundingen sker ved visning og beregning.
- **Betalinger dækker ældste tid og udgifter først**; derfra kommer
  »Afregnet«/»Delvist afregnet« og »afregnet til og med«.
- **Tid for en anden** venter på personens godkendelse og tæller ikke i
  saldoen før.
- **Gemini-modellen vælges som i Kalorietælleren:** nyeste Flash, nøglen har
  adgang til, med kapløb og helbred pr. model.
- Emulatorerne kræver Java: `PATH` sættes i npm-scripterne til
  `/opt/homebrew/opt/openjdk@21/bin`.
- Notifikationer på iPhone virker kun, når appen er åbnet fra hjemmeskærmen.

## Konventioner

- Dansk i brugerflade, filnavne og funktionsnavne. Hver fil starter med en
  kommentar om, hvad den er.
- Ren logik i `core.js` med tests; DOM-kode i de øvrige moduler.
- Planer og specs fra superpowers-skills ligger i `docs/superpowers/`.
