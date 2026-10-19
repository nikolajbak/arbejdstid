# Godkendelse: det, der registreres for en anden, skal bekræftes

Godkendt i chat 2026-10-19. Bygger på [teams](2026-10-08-teams-design.md).

## Formål

I et team kan man allerede registrere tid for hinanden. Nu kan man også registrere udgifter for hinanden. Det, man registrerer for en anden, tæller først med i overblikket over, hvad kunden skylder, når personen selv har godkendt det. Personen får en push-besked om, at der venter noget.

## Beslutninger

- Godkendelse kræves, når den, der skriver, ikke er den person, registreringen eller posten gælder for. Det gælder også et ur for flere: kollegernes registreringer venter på dem, mens ens egen gælder med det samme.
- Mig er uændret. Der er kun én person.
- Udgift, Brændstof og Kontantudlæg får en person i et team. Betalinger hører til teamet og har ingen person, så de kræver ikke godkendelse.
- Det, der venter på godkendelse, tæller ikke med i saldo, afregning, Kunder, overblik eller CSV. Det vises i listerne mærket som ventende.
- Retter en anden end personen en registrering eller post, venter den på godkendelse igen. Retter personen selv noget, gælder det med det samme.
- Afvis sletter registreringen eller posten, og den, der oprettede den, får en push om det.
- Push sendes fra en Cloudflare Worker (gratis plan) med Web Push og VAPID. Firebase bruges ikke til push, så Firebase-projektet bliver på den gratis Spark-plan.

## Data

Kun i et team. Felterne kommer oven i dem, teamsspecifikationen beskriver.

```
teams/{teamId}/registreringer/{id}
  { ...som i dag, person: uid,
    oprettetAf?: uid,      // den, der sidst oprettede eller rettede den, hvis det ikke var personen selv
    afventer?: true }      // mangler, når den er godkendt

teams/{teamId}/poster/{id}
  { ...som i dag,
    person?: uid,          // udgift, brændstof og kontantudlæg; mangler på betalinger og på ældre poster
    oprettetAf?: uid,
    afventer?: true }
```

- `afventer` er `true` eller mangler. Ved godkendelse fjernes feltet. `false` bruges ikke.
- Ældre registreringer og poster uden felterne regnes som godkendte.
- `oprettetAf` sættes ved hver skrivning fra en anden end personen. Den, der skrev sidst, er altså den, der får besked ved afvisning.
- Ældre poster uden `person` hører til teamet som i dag.

## Beregninger (`core.js`)

- `godkendte(liste)` giver det, der ikke har `afventer`.
- `ventende(liste, uid)` giver det, der venter på `uid`.
- `saldoer`, `afregning`, `kundeOversigt`, `summarize` og `toCSV` kaldes med `godkendte(...)` fra skærmene. Funktionerne selv ændres ikke.
- `forPersoner` og `registreringerFraUr` får `afsender` (den indloggede brugers uid i et team, ellers null). Hver registrering, hvis `person` ikke er afsenderen, får `afventer: true` og `oprettetAf: afsender`. Det samme gælder `skiftUr`.
- `markerRettelse(x, afsender)` bruges, når en eksisterende registrering eller post rettes:
  - Er afsenderen personen, fjernes `afventer` og `oprettetAf`.
  - Ellers sættes `afventer: true` og `oprettetAf: afsender`.
- `flytTilTeam` og `flytUdvalgtTilTeam` er uændrede. Ens egne data har en selv som person og er godkendte.

## Skærme

### Hvem på poster

- Arket for en post får sektionen **Hvem** i et team, når typen er Udgift, Brændstof eller Kontantudlæg.
  - Det er samme chips som i vælgeren til tid, men kun én kan vælges. En udgift er afholdt af én person, og flere poster med samme beløb ville tælle udgiften flere gange.
  - Man selv er valgt fra start.
- Skiftes typen til Betaling, forsvinder Hvem, og posten får ingen person.

### Mærker i listerne

- En ventende registrering eller post viser **Venter på <navn>** for den, der oprettede den, og **Venter på dig** for personen.
- Mærket står i stedet for Afregnet eller Delvist afregnet, som ventende aldrig er.
- Beløbet vises nedtonet.

### Til godkendelse

- Øverst på Tid-fanen, i et team med noget, der venter på en selv, står kortet **N venter på din godkendelse**. Kortet vises ikke i Mig.
- Et tryk åbner arket **Til godkendelse**. Ældste står øverst. Hver række viser:
  - kunde og opgave eller posttype
  - dato, og for tid start og slut
  - beløb
  - **fra <navn>**
- Hver række har knapperne **Godkend** og **Afvis**. Øverst står **Godkend alle**.
- Afvis beder om bekræftelse ("Slet registreringen? <navn> får besked.").
- Et tryk på rækken åbner registreringen eller posten som i dag. Gemmer personen derfra, er den godkendt.
- Arket lukker af sig selv, når listen er tom.

### Notifikationer

- Indstillinger får rækken **Notifikationer** med **Slå til** eller **Slået til · Slå fra**. Rækken vises i både Mig og teams, fordi den gælder enheden.
  - Kan browseren ikke modtage push, står der "Ikke muligt i denne browser".
  - På iPhone, når appen ikke er åbnet fra hjemmeskærmen, står der "Læg appen på hjemmeskærmen for at få notifikationer".
- Første gang man registrerer noget for en anden, og notifikationer ikke er slået til på enheden, viser appen én gang beskeden "Slå notifikationer til under Indstillinger, så du også får besked".

## Push

### Worker (`push/`)

En Cloudflare Worker med to ruter. Begge kræver `Authorization: Bearer <Firebase ID-token>`.

- **`POST /abonner`** `{ abonnement }`:
  - Gemmer enhedens Web Push-abonnement i Workers KV under nøglen `uid:<uid>`. Værdien er en liste af abonnementer, én pr. enhed, og `endpoint` er unik.
  - **`DELETE /abonner`** `{ endpoint }` fjerner abonnementet.
- **`POST /send`** `{ teamId, til, slags: 'afventer' | 'afvist', antal }`:
  - Henter `teams/{teamId}` gennem Firestores REST-API med afsenderens eget token. Svarer Firestore ikke 200, er afsenderen ikke medlem, og kaldet afvises med 403.
  - `til` skal stå i `medlemmer` og må ikke være afsenderen. `antal` skal være et heltal fra 1 til 100.
  - Teksten laves af workeren ud fra teamets `navne`, så et medlem ikke kan sende fri tekst:
    - `afventer`: titel "<team>", tekst "<afsender> har registreret <N> til dig. Tryk for at godkende."
    - `afvist`: titel "<team>", tekst "<afsender> afviste <N> af dine registreringer."
  - Beskeden har `url` `./?team=<teamId>&vis=godkend` (ved afvist uden `vis`).
  - Sendes til alle `til`s abonnementer. Svarer push-tjenesten 404 eller 410, fjernes abonnementet.

Tokentjek:
- RS256 mod Googles nøgler fra `securetoken@system.gserviceaccount.com`. Nøglerne caches efter `Cache-Control`.
- `aud` skal være Firebase-projektets id og `iss` `https://securetoken.google.com/<id>`.
- `exp` må ikke være overskredet, og `email_verified` skal være sand.

Godkendelseslisten (`godkendte`) tjekkes ikke af workeren. Den tjekkes af Firestore, når teamet hentes.

Konfiguration:
- Hemmeligheder: `VAPID_PRIVATE`, `VAPID_SUBJECT`.
- Variabler: `VAPID_PUBLIC`, `FIREBASE_PROJECT`.
- Lokal udvikling: med `FIRESTORE_EMULATOR=http://127.0.0.1:8080` accepteres emulatorens usignerede tokens, og teamet hentes fra emulatoren. Variablen findes ikke i produktion.

Biblioteket til Web Push skal virke i Workers' runtime (WebCrypto, ingen Node `crypto`). Valget afprøves i første opgave i planen, før resten bygges på det.

### Appen

- `push-config.js` indeholder workerens adresse og den offentlige VAPID-nøgle. Begge er offentlige.
- `push.js`:
  - `slaaTil()` beder om tilladelse, abonnerer med `pushManager` og sender abonnementet til `/abonner`.
  - `slaaFra()` afmelder.
  - `send(teamId, til, slags, antal)` sender en besked.
- Afsendelsen sker, når registreringerne eller posterne er gemt i tilstanden:
  - Der sendes én besked pr. modtager med antallet: et ur for tre giver to beskeder.
  - Fejler kaldet eller er der intet net, lægges beskeden i en kø i `localStorage`. Køen sendes ved næste start og ved `online`.
  - Beskeder ældre end 7 dage droppes.
- `sw.js` får en `push`-lytter, der viser notifikationen, og en `notificationclick`-lytter, der fokuserer et åbent vindue eller åbner `url`.
- Ved start læser appen `?team=…&vis=godkend`, skifter til teamet og åbner Til godkendelse. Derefter fjernes parametrene fra adressen.
- `push.js` og `push-config.js` kommer med i `FILER` i `sw.js`.

## Regler

For `teams/{teamId}/registreringer` og `teams/{teamId}/poster`. `d` er `request.resource.data`.

- Tilladte felter udvides med `oprettetAf` og `afventer`, og for poster `person`.
- `afventer` skal være `true`, hvis feltet findes.
- **Kun personen kan godkende:** findes `d.person`, og er afsenderen ikke `d.person`, skal `d.afventer == true`.
- `oprettetAf` skal, hvis feltet findes, være afsenderens uid eller være uændret.
- En post med `person` skal have et medlem som person, eller personen skal være uændret, ligesom for registreringer.
- `person` er ikke tilladt på betalinger.
- Sletning er uændret: alle medlemmer kan slette.

Reglerne skal udgives i konsollen, før koden pushes.

## Fejl

- Ingen tilladelse til notifikationer: rækken viser "Notifikationer er blokeret i browserens indstillinger".
- Workeren svarer 401 eller 403: beskeden droppes fra køen. Det sker fx, når afsenderen er fjernet fra teamet. Der vises ingen fejl, fordi registreringen er gemt og kortet i appen stadig viser, hvad der venter.
- Er personen fjernet fra teamet, mens noget venter, bliver det stående som ventende, og det tæller ikke med. Det kan slettes af alle medlemmer som i dag.

## Ikke med

- En samlet liste over ventende på tværs af teams. Man ser listen i det team, man står i, og pushen skifter til det rigtige.
- Påmindelser om noget, der har ventet længe.
- At sletning af en andens godkendte registrering skal godkendes. Alle medlemmer kan stadig slette alt i teamet.
- Push i Mig.
- At dele en udgift mellem flere personer.

## Opsætning (én gang)

1. Opret en gratis Cloudflare-konto, og kør `npx wrangler login` i `push/`.
2. Lav VAPID-nøgler, og læg den private som hemmelighed (`npx wrangler secret put VAPID_PRIVATE`).
3. `npx wrangler kv namespace create ABONNEMENTER`, og læg id'et i `push/wrangler.toml`.
4. `npx wrangler deploy`, og læg workerens adresse i `push-config.js`.
5. Udgiv `firestore.rules`.

README'en beskriver trinene.

## Test

- **Enhedstest (`npm test`):**
  - `godkendte` og `ventende`
  - `forPersoner`, `registreringerFraUr` og `skiftUr` markerer andres registreringer og ikke ens egen
  - `markerRettelse` i begge retninger
  - saldo, afregning og CSV med ventende udeladt
  - køen: tilføj, send, drop efter 7 dage og ved 401/403
- **Worker (`npm run test:push`):** med falsk `fetch` og KV:
  - ugyldigt, udløbet og forkert `aud` giver 401
  - ikke-medlem (Firestore 403) giver 403
  - `til` uden for teamet eller lig afsender giver 400
  - teksten bygges af `navne`
  - 410 fjerner abonnementet
- **Regeltest (`npm run test:regler`):**
  - et medlem kan oprette for en anden med `afventer` og ikke uden
  - kun personen kan fjerne `afventer`
  - en andens rettelse uden `afventer` afvises
  - `oprettetAf` kan ikke sættes til en anden
  - en post med person uden for teamet afvises
  - person på en betaling afvises
- **I browseren:** to testbrugere mod emulatorerne og `wrangler dev`:
  - registrér tid og en udgift for den anden, og se saldoen uændret
  - modtag pushen i Chrome, tryk på den, og godkend, så saldoen ændres
  - afvis, og se pushen til afsenderen
- **På telefon:** én test i produktion på en iPhone med appen på hjemmeskærmen.
