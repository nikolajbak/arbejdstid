# Arbejdstid

Simpel timeregistrering for selvstændige med flere kunder. Registrér tid pr.
kunde og opgavetype, hver kunde med sin egen timepris, og få en oversigt og
CSV-fil til fakturering.

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

- **Invitér:** Indstillinger → Brugere → skriv e-mailen → Invitér. Fortæl selv
  personen adressen på appen. Personen trykker Opret konto med den e-mail og
  bekræfter den.
- **Fjern adgang / administrator:** tryk på brugeren i listen. Data slettes
  ikke, når adgangen fjernes, og kommer tilbage, hvis personen inviteres igen.

## Udgiv på GitHub Pages

1. Læg mappen i et GitHub-repo og push til `main`.
2. På GitHub: Settings → Pages → Source: *Deploy from a branch*, branch `main`,
   mappe `/ (root)`.
3. Efter et minut ligger appen på `https://<brugernavn>.github.io/<repo>/`.

**Ved hver ny version:** hæv `CACHE` i `sw.js` (fx `arbejdstid-v2`). Ellers
bliver telefonerne ved med at vise den gamle version fra cachen.

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
Backup → Eksportér, og gem filen i Filer eller iCloud Drive. Import erstatter
kontoens data med backuppen.
