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
  og betalinger trækkes fra. Beløb er ekskl. moms. Kontanter til materialer
  tastes som et kontantudlæg og en udgift, så de går i nul.
- **Afrunding:** hver registrering tæller mindst 15 minutter og rundes op til
  nærmeste kvarter, både i tid og beløb. Start og slut gemmes præcist, så
  afrundingen gælder også gamle registreringer.
- **Historik:** vælg måned med pilene eller tryk på titlen for uge, sidste
  måned eller egen periode. Tryk på en kunde for fordelingen pr. opgave, og på
  en registrering for at rette den. **Saldo** viser, hvad hver kunde skylder
  over al tid; tryk for at registrere en betaling. **Eksportér CSV** til
  fakturering; poster står i CSV'en med typen som opgavetype og fortegn på
  beløbet.
- **Indstillinger:** kunder (navn, timepris, farve), opgavetyper, og under Mere:
  Brugere (administratorer), Backup og Konto.

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

**Ved hver ny version:** hæv `CACHE` i `sw.js` (fx `arbejdstid-v4`). Ellers
bliver telefonerne ved med at vise den gamle version fra cachen.

**Ændres `firestore.rules`, skal reglerne udgives igen** i Firebase-konsollen
(Firestore → Regler → indsæt → Udgiv). Version 3 (det nye design) kræver det:
kunder har nu en farve, og registreringer kan være uden opgave. Version 4
kræver det også: fjernede genveje gemmes på profilen. Version 6 kræver det
også: poster (udgifter, brændstof, kontantudlæg og betalinger). Udgives reglerne ikke,
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
