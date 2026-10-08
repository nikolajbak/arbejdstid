# Redesign af Arbejdstid — design

Dato: 2026-10-08
Bygger på: `2026-10-07-timeregistrering-design.md`, `2026-10-07-login-og-sky-design.md`

## Formål

Appen skal føles som en moderne iPhone-app, ikke som et regneark. Start og
stop af uret er den primære handling og skal kunne ske med ét tryk. Brugeren
skifter ofte mellem kunder i løbet af en dag (blandede dage), så hurtigt skift
er lige så vigtigt som at starte. Kunder og opgavetyper skal kunne oprettes
dér, hvor de vælges.

Brugerens krav:

- Moderne, elegant, intuitivt og effektivt flow; ingen rullelister; ikke
  kedelige farver.
- Start/stop er den primære registrering.
- Opret kunde og opgavetype direkte fra valget.
- Ingen zoom.
- Ingen standard-opgavetyper.

Valgt stil: **C — farverig, kundens farve**. Det kørende ur er et stort kort i
kundens farve; "Fortsæt" er farvede felter. Inspiration: Timery, Toggl Track,
Harvest, Tyme.

## Opbygning

Tre faner i bundnavigationen: **Tid**, **Historik**, **Indstillinger**.
Login-, bekræftelses- og ikke-inviteret-skærmene er uændrede i indhold, men
får det nye udseende.

## Farver

Otte kundefarver. Nøglen gemmes på kunden som `farve`.

| Nøgle | Lys tilstand | Mørk tilstand |
|---|---|---|
| `skov` | #2F7D6B | #4FB39A |
| `ler` | #C8643B | #E88A62 |
| `indigo` | #5B6CC9 | #8A97F0 |
| `blomme` | #8E4B8F | #C27FC3 |
| `rosa` | #C24E72 | #EC7FA0 |
| `okker` | #A87A1E | #D9AE52 |
| `hav` | #2C7DA0 | #5DB2D6 |
| `skifer` | #5E6B78 | #94A2B0 |

- Det kørende kort bruger farven som fuld baggrund med hvid tekst (mørk
  tilstand: mørk tekst `#101112`).
- Fortsæt-felter og andre bløde flader bruger farven blandet 18 % ind i
  baggrunden (`color-mix`), med teksten i farven gjort mørkere (lys) eller
  lysere (mørk), så kontrasten er mindst 4,5:1.
- Lister viser en farveprik eller en lodret farvestreg.
- `naesteFarve(kunder)`: den aktive farve, der bruges af færrest kunder; ved
  lighed den første i tabellens rækkefølge.
- `farveFor(kunde)`: kundens `farve`, hvis den er en kendt nøgle, ellers en
  fast nøgle beregnet ud fra en simpel hash af kundens id (så den ikke
  skifter).

Neutrale farver: baggrund #FBFAF7 / #101112, flader #FFFFFF / #1A1B1D,
sekundær tekst #7A766E / #9A9DA3, hårlinjer #ECE8E0 / #2A2C2F. Fejl #B3261E /
#F2867C.

Typografi: systemets skrift (`-apple-system`). Uret bruger
`font-variant-numeric: tabular-nums`, vægt 300, 44–56 px. Overskrifter 28 px
vægt 700. Brødtekst 16 px; ingen tekst under 12 px; felter mindst 16 px.

Former: kort 20 px hjørner, felter 14 px, knapper og chips helt runde.

## Skærmen Tid

Fra toppen:

1. **Urkortet.**
   - Intet ur kører: mørkt neutralt kort med "Intet ur kører", `0:00:00` og
     knappen **Start ny**, der åbner vælgerarket.
   - Ur kører: kortet i kundens farve med "Kunde · Opgave" (eller kun kunde),
     tiden (t:mm:ss, opdateres hvert sekund), "Startet hh:mm" og knappen
     **Stop**.
     - Tryk på "Kunde · Opgave" åbner vælgerarket for det kørende ur (skift
       kunde/opgave) med notefelt.
     - Tryk på "Startet hh:mm" åbner et lille ark, hvor starttiden kan rettes
       (klokkeslæt, ikke i fremtiden).
     - Et lille "Annullér ur" i arket for det kørende ur (med bekræftelse).
2. **Fortsæt.** Op til fire felter i et 2×2-gitter, et pr. kombination fra
   `senesteKombinationer`. Hvert felt viser kunde og opgave (eller kun kunde)
   i kundens bløde farve. Ét tryk:
   - intet ur kører → start uret med den kombination;
   - et ur kører → `skiftUr`: gem det kørende som registrering og start det
     nye; vis beskeden "Gemte {kunde} · {t:mm}".
   Er der ingen tidligere registreringer, vises i stedet en kort tekst: "Når
   du har stoppet et ur, ligger det her, så du kan fortsætte med ét tryk."
3. **I dag.** Overskrift med dagens samlede tid (inkl. kørende ur). Dagens
   registreringer, nyeste først: farvestreg, "Kunde · Opgave", tidsrum og
   varighed. Tryk åbner rettearket. Under listen: **+ Tilføj tid**.

**Stop.**

- Har uret en opgave: gem straks, vis "Gemte {kunde} · {t:mm}".
- Uden opgave: åbn arket "Hvad lavede du?" med kunde, varighed og beløb øverst,
  opgavetyperne som chips (ét tryk gemmer med den type), "+ Ny" (opretter og
  gemmer), et notefelt og "Gem uden opgave". Lukkes arket uden valg, kører
  uret videre.

## Vælgerarket (kunde og opgave)

Bruges ved Start ny, ved det kørende ur og i rettearket.

- **Kunde:** søgefelt øverst (filtrerer aktive kunder, ingen forskel på store
  og små bogstaver). Liste med farveprik og navn; den valgte er markeret.
  Er søgeteksten ikke tom og findes ikke præcist, vises **+ Opret "{tekst}"**.
  Tryk vælger den nye kunde (farve `naesteFarve`) og viser et timeprisfelt
  (påkrævet, kr pr. time, ≥ 0) under navnet. Kunden oprettes først, når arket
  bekræftes; mangler timeprisen, vises "Skriv en timepris".
- **Opgave (valgfri):** aktive opgavetyper som chips; tryk igen fjerner valget.
  **+ Ny** viser et felt; Enter eller "Tilføj" opretter typen og vælger den.
- **Bekræft-knap:** "Start" (ny), "Gem" (kørende ur/rettearket), i den valgte
  kundes farve. Uden valgt kunde er knappen grå, og et tryk viser "Vælg en
  kunde".

## Rettearket (registrering)

Bruges til "Tilføj tid" og til at rette.

- Øverst: Annullér · titel ("Ny registrering"/"Registrering") · **Gem**.
- Kunde og opgave som rækker, der åbner vælgerarket.
- Dato, fra og til med iOS' egne hjul (`input type=date/time`), vist som små
  grå knapper. Til før fra betyder over midnat (som i dag). Uændrede tider
  bevarer sekunderne (som i dag).
- Timepris (kun ved ret; ny bruger kundens timepris).
- Note.
- "Slet registrering" (kun ved ret, med bekræftelse).
- Tilføj tid starter med i dag, fra = nu − 1 time (rundet ned til 5 min), til =
  nu (rundet ned til 5 min), og den seneste kombination forvalgt.

## Historik

- **Periodevælger:** "‹ Oktober 2026 ›" skifter måned. Tryk på titlen åbner
  et ark med "Denne uge", "Denne måned", "Sidste måned" og "Egen periode"
  (fra–til, begge med).
- **Overbliksskort:** samlet tid og beløb, en vandret bjælke med hver kundes
  andel af tiden i kundens farve, en række pr. kunde (prik, navn, t:mm,
  beløb). Tryk på en kunde folder fordelingen pr. opgavetype ud (inkl. "Uden
  opgave"). "Eksportér CSV" og "Beløb er ekskl. moms." i kortet.
- **Registreringer:** periodens registreringer grupperet pr. dag (som i dag),
  med dagens samlede tid; tryk åbner rettearket.
- Tom periode: "Ingen tid registreret i perioden."

## Indstillinger

- **Kunder:** liste med prik, navn og timepris; "+ Ny kunde". Tryk åbner et
  ark med navn, timepris og farvevælger (8 runde prikker) samt "Arkivér".
  Arkiverede under "Vis arkiverede" med "Gendan".
- **Opgavetyper:** chips; "+ Ny". Tryk åbner ark med navn og "Arkivér".
  Arkiverede som ovenfor.
- **Mere:** rækkerne **Brugere** (kun admin), **Backup** og **Konto** åbner
  hver et ark med det indhold, de har i dag.

## Data og regler

- Kunde: `{ navn, timepris, arkiveret, farve? }`, `farve` er en af de otte
  nøgler.
- Registrering og ur: `opgavetypeId` er en tekst; tom tekst `''` betyder "uden
  opgave".
- Nye profiler oprettes uden opgavetyper (`sikrProfil` opretter kun profilen).
  `defaultData()` får ingen opgavetyper.
- `summarize`: registreringer med tomt `opgavetypeId` samles som "Uden
  opgave" (sidst i listen).
- `toCSV`: tom opgavetype giver tomt felt.
- `validateBackup`: `farve` valgfri tekst; `opgavetypeId` må være `''`.
- `firestore.rules`: kunder tillader `farve` (en af de otte nøgler);
  `opgavetypeId` må være `''`. Brugeren skal udgive reglerne igen; README og
  den afsluttende besked siger det.

## Rene funktioner (core.js)

- `senesteKombinationer(registreringer, kunder, opgavetyper, ur, antal = 4)`
  → `[{ kundeId, opgavetypeId }]`: unikke kombinationer sorteret efter seneste
  `slut`, uden arkiverede kunder, uden kombinationer hvis opgavetype er
  arkiveret (en tom opgave er tilladt), og uden det kørende urs kombination.
- `naesteFarve(kunder)`, `farveFor(kunde)`, `FARVER` (nøgler i rækkefølge).
- `skiftUr(tilstand, ny, nu, timepris)` → ny tilstand: det kørende ur gemmes
  som registrering (slut = nu) og et nyt ur startes med `ny` (kundeId,
  opgavetypeId) og start = nu. Kører intet ur, startes kun det nye.

## Interaktion og detaljer

- **Ingen zoom:** viewport `maximum-scale=1, user-scalable=no`,
  `touch-action: manipulation` på `html`, og `gesturestart` forhindres.
- **Ark** glider op fra bunden (200 ms); `prefers-reduced-motion` slår
  animationer fra. Arket kan lukkes ved tryk udenfor.
- **Beskeder** ("Gemte …") vises nederst over navigationen i 3 sekunder.
- Alle knapper og rækker er mindst 44 px høje.
- Fanen huskes i `sessionStorage` (`arbejdstid.fane`); gamle værdier
  ("registreringer", "oversigt") giver "historik".
- `sw.js`: `CACHE = 'arbejdstid-v3'` og de nye filer i precache.

## Kode

- `ui.js`: `h`, ark (åbn/luk), besked (toast), chips, felter, ikoner.
- `vaelger.js`: vælgerarket.
- `tid.js`, `historik.js`, `indstillinger.js`: hver sin fane og sine ark.
- `app.js`: opstart, login-skærme, faner, `commit`, tilstand.
- `core.js`, `store.js`, `sky.js`, `konto.js`: ændres kun som beskrevet under
  data.

## Test

- `core.js`: `senesteKombinationer`, `naesteFarve`, `farveFor`, `skiftUr`,
  `summarize` og `toCSV` med tom opgave, `validateBackup` med `farve` og tom
  opgave, `defaultData` uden opgavetyper.
- Regeltests: kunde med gyldig og ugyldig `farve`; registrering og ur med tom
  opgave.
- Browsertest mod emulatorerne i 375×812, lys og mørk: start fra Fortsæt, skift
  med ét tryk, opret kunde og opgave fra vælgerarket, stop uden opgave, ret
  starttid, ret og slet registrering, Tilføj tid, Historik med periodeskift og
  CSV, Indstillinger med farvevalg, ingen zoom (viewport-meta).
- Afsluttende uafhængig kodegennemgang.

## Ikke med

- Fortryd efter skift/stop.
- Widgets, Live Activities og notifikationer (ikke muligt i en PWA på iOS).
- Faste "favorit"-timere ud over de seneste kombinationer.
