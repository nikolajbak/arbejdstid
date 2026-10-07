# Login, brugere og data i skyen — design

Dato: 2026-10-07
Bygger på: `2026-10-07-timeregistrering-design.md`

## Formål

Appen må kun kunne bruges af inviterede brugere. Hver brugers data gemmes
online under brugerens egen konto, så de overlever en tabt telefon og kan
ses fra flere enheder. Appen skal fortsat virke uden net. Brugere
administreres fra appen selv.

## Platform

- Backend: Firebase, projekt `arbejdstid-dfdc6`, gratis Spark-plan.
  - Firebase Authentication med e-mail og adgangskode.
  - Cloud Firestore i EU (`eur3`) med offline-cache på enheden.
- Firebase JS SDK (modulær) hentes fra `https://www.gstatic.com/firebasejs/<fast version>/`.
  Service workeren precacher disse filer, så appen starter uden net.
- Hosting uændret: GitHub Pages. Intet byggetrin i appen.
- Firebase-konfigurationen ligger i `firebase-config.js`. Den er offentlig med
  vilje; sikkerheden ligger i Firestore-reglerne.
- Kører appen på `localhost`, forbindes den til Firebases lokale emulatorer
  (Auth og Firestore) i stedet for det rigtige projekt.

## Datamodel i Firestore

```
godkendte/{email}                       e-mail med små bogstaver som id
  { email, admin: bool, inviteret: tidsstempel, uid: string | null }

brugere/{uid}
  { email, oprettet: tidsstempel, ur: KørendeUr | null }

brugere/{uid}/kunder/{id}          { navn, timepris, arkiveret }
brugere/{uid}/opgavetyper/{id}     { navn, arkiveret }
brugere/{uid}/registreringer/{id}  { kundeId, opgavetypeId, start, slut, timepris, note }
```

- Felterne for kunder, opgavetyper, registreringer og kørende ur er de samme
  som i dag. Id'erne er de samme UUID'er.
- `godkendte` er brugerdatabasen: hvem der må bruge appen, og hvem der er
  administrator. `uid` sættes af brugeren selv første gang, vedkommende logger
  ind, så administratoren kan se, hvem der har oprettet en konto.
- `brugere/{uid}` oprettes ved første login. Har kontoen ingen opgavetyper, får
  den standardtyperne Møde, Udvikling, Rådgivning og Transport.
- Konflikter: den seneste skrivning til et dokument vinder (Firestores
  standard).

## Sikkerhedsregler (`firestore.rules`)

Definitioner:

- *godkendt*: logget ind, `email_verified == true`, og
  `godkendte/{egen e-mail med små bogstaver}` findes.
- *admin*: godkendt, og eget `godkendte`-dokument har `admin == true`.

Regler:

- `godkendte/{email}`
  - Læs ét dokument: den indloggede bruger må læse sit eget (også før
    e-mailen er bekræftet); admin må læse alle.
  - Liste: kun admin.
  - Opret og slet: kun admin. Admin kan ikke slette sit eget dokument (så man
    ikke låser sig selv ude).
  - Opdatér: admin må ændre `admin` på andres dokumenter, ikke sit eget. En
    godkendt bruger må på sit eget dokument kun sætte `uid` til sin egen uid.
  - Nye dokumenter skal have præcis felterne `email` (lig med id'et),
    `admin` (bool), `inviteret` (tidsstempel) og `uid` (null).
- `brugere/{uid}` og alt under det: læs og skriv kun hvis godkendt og
  `request.auth.uid == uid`. Skrivninger valideres: rigtige felter og typer,
  `timepris` er et tal ≥ 0, `navn` er en ikke-tom tekst, `arkiveret` er bool.
- Alt andet: nægtet.

## Brugerflow

**Loginsiden** vises, når ingen er logget ind. Felter: e-mail og adgangskode.
Knapper: "Log ind", "Opret konto" og linket "Vælg eller nulstil adgangskode".

**Opret konto**: e-mail + adgangskode (mindst 6 tegn, Firebases krav).
Derefter sendes en bekræftelsesmail med appens adresse som returadresse.

**Efter login** tjekker appen i denne rækkefølge:

1. E-mail ikke bekræftet → skærm med "Bekræft din e-mail via linket, vi
   sendte til <e-mail>", knapperne "Jeg har bekræftet" (genindlæser brugeren
   og fornyer token) og "Send igen", samt "Log ud".
2. Ikke på `godkendte` → "Denne e-mail er ikke inviteret. Spørg den, der
   administrerer appen." og "Log ud".
3. Ellers: sæt `uid` på eget `godkendte`-dokument, hvis det mangler, opret
   profilen hvis den mangler, tilbyd overførsel af lokale data (se nedenfor),
   og vis appen.

**Administrator**, Indstillinger → Brugere (kun synlig for admin):

- Liste over `godkendte` med e-mail og status "Inviteret" (`uid` er null)
  eller "Aktiv". Administratorer er markeret.
- "Invitér": e-mail-felt. Opretter dokumentet. Appen sender ingen mail;
  administratoren fortæller selv personen adressen på appen.
- Pr. bruger: "Fjern adgang" (sletter dokumentet efter bekræftelse; data
  bevares) og "Gør til administrator" / "Fjern som administrator". Ikke
  muligt på sig selv.

**Første administrator**: Opret dig i appen, bekræft e-mailen, og opret i
Firebase-konsollen dokumentet `godkendte/<din e-mail>` med
`{ email, admin: true, inviteret: <nu>, uid: null }`. Det er det eneste,
der kræver konsollen.

**Log ud** (Indstillinger): advarer, hvis der er ikke-synkroniserede
ændringer. Logger ud, sletter Firestores lokale cache og genindlæser appen.

**Adgang fjernet**: når en lytter får `permission-denied`, logges brugeren
ud med beskeden "Din adgang er fjernet."

## Data og synkronisering

- `sky.js` lytter på brugerens profil og tre samlinger og holder data i
  hukommelsen i samme form som i dag: `{ kunder, opgavetyper, registreringer, ur }`.
  Visningerne og `core.js` ændres ikke.
- Når appen gemmer, sammenlignes den nye tilstand med den sidst kendte, og
  kun de ændrede dokumenter skrives eller slettes. Sammenligningen er en ren
  funktion `forskel(foer, efter)` i `core.js`, som returnerer en liste af
  `{ type: 'set' | 'slet', samling, id, data }`.
- Skrivninger sker straks lokalt og sendes, når der er net (Firestores
  offline-cache).
- Toppen viser en lille markering "Ikke synkroniseret", så længe der er
  ventende skrivninger.
- Skrivninger samles i batches på højst 500 operationer.

## Overførsel af lokale data

- Findes `arbejdstid.v1` i localStorage med kunder eller registreringer, og er
  `arbejdstid.overfoersel` ikke sat, spørger appen efter første login:
  "Overfør N registreringer fra denne telefon til din konto?"
- Ja: data flettes ind i kontoen. Kunder og opgavetyper med samme navn (uden
  forskel på store og små bogstaver) som eksisterende genbruges, og
  registreringerne peger på dem. Resten lægges til. Et lokalt kørende ur
  overføres kun, hvis kontoen ikke har et. Den lokale nøgle omdøbes til
  `arbejdstid.v1.overfoert-<tidsstempel>`.
- Nej: der spørges ikke igen.
- I begge tilfælde sættes `arbejdstid.overfoersel`.
- Fletningen er en ren funktion `flet(lokal, konto)` i `core.js`, der
  returnerer den nye tilstand.

## Backup og CSV

- CSV-eksport og backup-eksport er uændrede.
- Backup-import erstatter kontoens data efter bekræftelse: de dokumenter, der
  ikke er i backuppen, slettes, og resten skrives (via `forskel`).
- `store.js` bruges kun til at læse de gamle lokale data ved overførsel.

## Fejl

| Situation | Besked |
|---|---|
| Forkert e-mail eller adgangskode | "Forkert e-mail eller adgangskode." |
| E-mail allerede i brug ved oprettelse | "Der findes allerede en konto med den e-mail. Log ind i stedet." |
| For kort adgangskode | "Adgangskoden skal være mindst 6 tegn." |
| Ingen net ved login | "Første login kræver internet." |
| For mange forsøg | "For mange forsøg. Prøv igen om lidt." |
| Nulstilling sendt | "Hvis e-mailen findes, har vi sendt et link." |
| Adgang fjernet | "Din adgang er fjernet." |
| Anden fejl | "Noget gik galt. Prøv igen." |

## Kode

- `firebase-config.js`: projektets konfiguration.
- `firebase.js`: initialiserer app, Auth og Firestore (persistent lokal
  cache), og forbinder til emulatorerne på `localhost`.
- `konto.js`: login, oprettelse, bekræftelse, nulstilling, log ud, tjek af
  godkendelse, invitationer og administratorrettigheder.
- `sky.js`: lyttere, tilstand i hukommelsen, gem via `forskel`, status for
  synkronisering.
- `core.js`: får `forskel` og `flet`.
- `app.js`: loginside, bekræftelses- og ikke-inviteret-skærm, Brugere-sektion,
  Log ud, synkroniseringsmarkering, overførselsdialog. `commit()` gemmer via
  `sky.js`.
- `firestore.rules` og `firebase.json` (emulatoropsætning).
- `sw.js`: ny cache-version og Firebase-filerne i precache.
- `README.md`: opsætning af Firebase, første administrator, invitation.

## Test

- Eksisterende tests består uændret.
- `core.js`: tests for `forskel` og `flet`.
- Reglerne testes mod Firestore-emulatoren med `@firebase/rules-unit-testing`
  (`npm run test:regler`). Kræver Java og `firebase-tools` som
  udviklingsværktøj. Mindst:
  - fremmed bruger kan ikke læse eller skrive en andens data;
  - bruger uden bekræftet e-mail eller uden invitation kan ikke læse egne data;
  - kun admin kan oprette, slette og liste `godkendte`;
  - admin kan ikke slette sig selv eller fjerne sin egen admin;
  - bruger kan kun sætte sin egen `uid` på sit eget dokument;
  - ugyldige felter afvises.
- Browsertest mod emulatorerne på `localhost`: opret konto, bekræftelse,
  invitation, ikke-inviteret, offline-registrering, log ud, overførsel.
- Test mod det rigtige Firebase-projekt (rigtige e-mails og adgangskoder)
  laver brugeren selv efter udgivelse.

## Ikke med

- Login med Apple eller Google.
- Deling af data mellem brugere.
- Sletning af konti fra appen (kræver betalt plan).
- Afsendelse af invitationsmails fra appen.
