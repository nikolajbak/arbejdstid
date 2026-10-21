# Arbejdstid

Simpel timeregistrering for selvstændige med flere kunder. Start og stop et ur
pr. kunde (opgaven er valgfri), hver kunde med sin egen timepris og farve, og
få et overblik og en CSV-fil til fakturering.

## Sådan bruges den

- **Tid:** tryk **Start ny**, vælg eller opret kunden (og eventuelt en opgave),
  og tryk Start. **Start igen** viser genveje til de seneste kombinationer: ét
  tryk starter uret, og kører et andet ur, gemmes det først. Hold fingeren på
  en genvej for at fjerne den; den kommer igen, næste gang du arbejder på det. **Stop** gemmer; uden opgave
  spørger appen, hvad du lavede. Tryk på kundenavnet på uret for at skifte
  kunde, opgave eller note, og på "Startet" for at rette starttiden. Glemt at
  starte uret? **+ Tilføj** → Tid.
- **Penge på en kunde:** **+ Tilføj** → Udgift, Brændstof, Kontantudlæg eller
  Betaling. Udgifter og brændstof lægges til det, kunden skylder; kontanter
  og betalinger trækkes fra. Kontanter til materialer tastes som et
  kontantudlæg og en udgift, så de går i nul. Tryk **Tilføj billede** på
  posten for at tage et billede af kvitteringen eller vælge et fra Fotos;
  billedet gøres mindre, før det gemmes, og en clips i listen viser, at
  posten har et billede. Billeder følger med, når kunder flyttes til et team,
  men kommer ikke med i backuppen.
- **Kvitteringer læses af sig selv:** når et nyt billede lægges på en
  udgift, sendes det til Gemini, der læser butik, dato, beløb, moms og
  varer. Felterne udfyldes, og købes der brændstof, skifter posten til
  Brændstof. Felter, man selv har rettet, røres ikke, og på en gemt post
  udfyldes kun tomme felter. **Læs kvittering** læser billedet igen. Momsen
  gemmes i feltet *Heraf moms* og kommer med i CSV-eksporten, så posten er
  klar til bogføring. Tjek tallene, før du gemmer.
- **Afrunding:** hver registrering tæller mindst 15 minutter og rundes op til
  nærmeste kvarter, både i tid og beløb. Start og slut gemmes præcist, så
  afrundingen gælder også gamle registreringer.
- **Teams:** tryk på **Mig ▾** øverst for at skifte mellem dine egne data og
  dine teams, se invitationer eller oprette et team. I et team deler I kunder,
  opgaver, poster og saldo, og alle ser alles tid. Under **Hvem**, når du
  starter et ur eller tilføjer tid, vælger du, hvem tiden gælder for; et ur for
  flere giver én registrering pr. person. Historik kan filtreres på person, og
  CSV'en får kolonnen Person. Under Indstillinger → Team inviterer du på
  e-mail (personen skal være godkendt til appen), retter navne, fjerner
  medlemmer, melder dig ud og flytter dine egne data ind i teamet. Flytningen
  gemmer først en backup og tømmer derefter Mig. **Tilføj fra Mig** tager kun
  de kunder og opgaver, du vælger: kunderne flyttes med deres tid og poster,
  opgaverne kopieres, så Mig beholder dem. Registrerer du tid eller en udgift
  for en anden, venter den på personens godkendelse og tæller ikke med i
  saldoen, før personen har godkendt den under **Tid**. Personen får en
  notifikation, hvis de er slået til under Indstillinger → Mere →
  Notifikationer, og du får besked, hvis den afvises.
- **Historik:** vælg måned med pilene eller tryk på titlen for uge, sidste
  måned eller egen periode. Tryk på en kunde for fordelingen pr. opgave, og på
  en registrering for at rette den. **Saldo** viser, hvad hver kunde skylder
  over al tid; tryk på en kunde for at åbne den under Kunder.
  Betalinger og kontantudlæg dækker kundens ældste tid og udgifter først, så
  registreringer og udgifter er mærket **Afregnet** eller **Delvist
  afregnet**, og Saldo viser, hvilken dag kunden er afregnet til og med. **Eksportér CSV** til
  fakturering; poster står i CSV'en med typen som opgavetype og fortegn på
  beløbet.
- **Kunder:** hvad hver kunde skylder i alt, de skyldige øverst. Tryk på en
  kunde for saldo, hvilken dag kunden er afregnet til og med, tid og
  udestående pr. opgave, det udestående dag for dag (ældste først, som
  betalinger dækker), alle betalinger og kontantudlæg og, foldet sammen, det
  afregnede. Herfra tilføjes tid med start og slut (kunden er valgt på
  forhånd), registreres en betaling, det udestående eksporteres som
  CSV, og kunden kan redigeres.
- **Indstillinger:** kunder (navn, timepris, farve), opgavetyper, og under Mere:
  Brugere (administratorer), Backup, Notifikationer og Konto.

Appen er en PWA: den kører i browseren, kan lægges på hjemmeskærmen og virker
uden net. Kun inviterede brugere kan logge ind. Hver brugers data gemmes i
Firebase (Firestore, EU) under brugerens egen konto og synkroniseres, når der
er net.

## Kør lokalt

Lokalt bruger appen Firebases emulatorer i stedet for det rigtige projekt.
Det kræver Java (`brew install openjdk@21`) og `npm install`.

```bash
npm run emulatorer
```

```bash
python3 -m http.server 8000
```

Åbn http://localhost:8000. Bekræftelsesmails sendes ikke; linkene står i
emulatorens log.

## Tests

```bash
npm test
```

```bash
npm run test:regler
```

`npm test` dækker beregninger, formatering, CSV, synkronisering og lagring.
`npm run test:regler` tester sikkerhedsreglerne i `firestore.rules` mod
emulatoren.

## Opsætning af Firebase (én gang)

1. Firestore Database er oprettet i `eur3`, og Email/Password er slået til
   under Authentication → Sign-in method.
2. **Udgiv reglerne:** kopiér indholdet af `firestore.rules` ind under
   Firestore Database → Rules og tryk Publish. Eller fra terminalen:
   `npx firebase login` og derefter
   `npx firebase deploy --only firestore:rules --project arbejdstid-dfdc6`.
   Gør det igen, hver gang `firestore.rules` ændres.
3. **Tillad appens adresse:** Authentication → Settings → Authorized domains →
   tilføj `nikolajbak.github.io`. Ellers kan bekræftelses- og
   nulstillingsmails ikke føre tilbage til appen.
4. **Dansk mail (valgfrit):** Authentication → Templates → Template language:
   Danish, og Project settings → Public-facing name: Arbejdstid.

## Push (én gang)

Notifikationerne sendes af en Cloudflare Worker i `push/`. Alle kommandoer
køres i `push/`.

1. Opret en gratis Cloudflare-konto, og kør `npx wrangler login`.
2. **VAPID-nøgler:** `npx web-push generate-vapid-keys`. Den offentlige nøgle
   skal stå som `VAPID_PUBLIC` i `push/wrangler.toml` og i `push-config.js`.
   Den private lægges kun som hemmelighed, aldrig i en fil i repoet:
   `npx wrangler secret put VAPID_PRIVATE`. Kør også
   `npx wrangler secret put VAPID_SUBJECT` med `mailto:` og din e-mail.
3. `npx wrangler kv namespace create ABONNEMENTER`, og læg id'et under
   `[[kv_namespaces]]` i `push/wrangler.toml`.
4. **Udgiv reglerne først** (se Opsætning af Firebase). Den nye kode kræver
   reglerne for godkendelse.
5. `npx wrangler deploy`, og læg workerens adresse (`https://….workers.dev`)
   i `PUSH_URL` i `push-config.js`. Push derefter appen. Er `PUSH_URL` tom,
   gemmes beskederne bare i køen på telefonen.

**Kvitteringslæsning (gratis):** lav en API-nøgle på
https://aistudio.google.com/apikey uden at slå fakturering til; så bruges
Geminis gratisniveau, der har et loft over kald pr. minut og pr. dag, men
aldrig koster noget. Læg den i workeren med `npx wrangler secret put
GEMINI_API_KEY` og kør `npx wrangler deploy`. Modellen står i `GEMINI_MODEL`
i `push/wrangler.toml`. På gratisniveauet må Google bruge billederne til at
forbedre sine modeller. Uden nøgle virker alt andet; appen siger bare, at
kvitteringen ikke kunne læses. Momsfeltet kræver, at reglerne udgives igen.

På iPhone virker notifikationer kun, når appen er åbnet fra hjemmeskærmen.

**Lokalt:** kopiér `push/.dev.vars.example` til `push/.dev.vars`, og udfyld
`VAPID_PRIVATE` (og evt. `GEMINI_API_KEY`). Start emulatorerne, og kør `npx wrangler dev` i `push/`.
Appen på localhost bruger så workeren på http://127.0.0.1:8787.
`npm run test:push` tester workeren.

## Første administrator (én gang)

1. Åbn appen, tryk **Opret konto**, og bekræft din e-mail via linket.
2. Appen siger nu, at e-mailen ikke er inviteret. I Firebase-konsollen:
   Firestore Database → Start collection `godkendte` → Document ID = din
   e-mail med små bogstaver, med felterne
   `email` (string, samme e-mail), `admin` (boolean, true),
   `inviteret` (timestamp, nu) og `uid` (null).
3. Åbn appen igen. Herefter klares alt under Indstillinger → Brugere.

## Brugere

- **Invitér:** Indstillinger → Mere → Brugere → skriv e-mailen → Invitér. Fortæl selv
  personen adressen på appen. Personen trykker Opret konto med den e-mail og
  bekræfter den.
- **Fjern adgang / administrator:** tryk på brugeren i listen. Data slettes
  ikke, når adgangen fjernes, og kommer tilbage, hvis personen inviteres igen.

## Udgiv på GitHub Pages

1. Læg mappen i et GitHub-repo og push til `main`.
2. På GitHub: Settings → Pages → Source: *Deploy from a branch*, branch `main`,
   mappe `/ (root)`.
3. Efter et minut ligger appen på `https://<brugernavn>.github.io/<repo>/`.

**Nye versioner kommer af sig selv.** Service workeren henter appens filer fra
nettet først (cachen bruges kun uden net), og når appen kommer frem igen, tjekker
den efter ændrede filer og genindlæser. Er man midt i et ark eller et felt,
venter den, til appen lægges væk. Der skal ikke hæves noget versionsnummer.
Tilføjes en ny `.js`-fil, skal den dog med i `FILER` i `sw.js`, så den også
virker uden net.

**Ændres `firestore.rules`, skal reglerne udgives igen** i Firebase-konsollen
(Firestore → Regler → indsæt → Udgiv). Version 3 (det nye design) kræver det:
kunder har nu en farve, og registreringer kan være uden opgave. Version 4
kræver det også: fjernede genveje gemmes på profilen. Version 6 kræver det
også: poster (udgifter, brændstof, kontantudlæg og betalinger). Version 7
kræver det også: teams. Godkendelse og billeder på poster kræver det også, og det gør
moms på kunder. Udgives reglerne ikke,
afvises de nye ændringer.

## Installér på iPhone

1. Åbn adressen i **Safari**.
2. Tryk på Del-knappen → **Føj til hjemmeskærm**.
3. Åbn appen fra hjemmeskærmen.

## Data fra før login

Første gang man logger ind på en telefon, der har data fra før login, tilbyder
appen at overføre dem til kontoen. Kunder og opgavetyper med samme navn slås
sammen. De gamle data slettes ikke, men gemmes til side på telefonen.

## Backup

Data ligger på kontoen. En backup er en ekstra sikkerhed: Indstillinger →
Mere → Backup → Eksportér backup, og gem filen i Filer eller iCloud Drive. Import erstatter
kontoens data med backuppen.
