# Sjakbejs: løn til teamet

Godkendt i chat 2026-11-23 (Nikolaj).

## Formål

I et team modtager én person, sjakbejsen, kundernes betalinger og betaler hvert
medlem. Appen skal vise sjakbejsen, hvad hvert medlem har til gode, og hvad hver
kunde giver i dækningsbidrag efter løn.

## Beslutninger

- Intet skjules. Alle i teamet ser stadig alt, også løn og udbetalinger (Nikolaj 2026-11-23).
- Aflønning er fast timeløn pr. person (Nikolaj 2026-11-23), med en gyldig-fra-dato, så en
  lønændring ikke ændrer det optjente bagud.
- Højst én sjakbejs pr. team: `sjakbejs: uid` på teamdokumentet.
  - Har teamet ingen sjakbejs, eller er sjakbejsen ikke længere medlem, kan ethvert medlem udpege en.
  - Ellers kan kun sjakbejsen give rollen videre eller fjerne den.
  - Den nye sjakbejs skal være medlem.
- Kun sjakbejsen sætter timeløn og opretter, retter og sletter udbetalinger.
- Udbetalinger ligger i deres egen samling (tilgang A), ikke som posttype, så kundens saldo
  og afregning er urørt.
- Timerne til løn er de samme som over for kunden: dagens tid pr. kunde og person rundet op
  til kvarter (`dagsTider`).

## Data

```
teams/{teamId}
  + sjakbejs?: uid | null
  + loen?: { uid: [{ fra: 'YYYY-MM-DD', kr: number }] }   // sorteres efter fra

teams/{teamId}/udbetalinger/{id}
  { person: uid, dato: 'YYYY-MM-DD', beloeb: number > 0, note: string }
```

## Regnestykket pr. person

Kun godkendte registreringer og poster (uden `afventer`).

- Optjent: hver registrerings rundede tid × den timeløn, der gjaldt på registreringens dag.
  Tid uden timeløn den dag tæller 0 kr og vises som »timer uden løn«.
- \+ udlæg: personens `udgift` og `braendstof`.
- − kontanter: personens `kontant` (kundens penge, personen har fået i hånden).
- − udbetalt: personens udbetalinger.
- = til gode (negativt: personen skylder sjakbejsen).

Med på listen: alle medlemmer, plus tidligere medlemmer med noget, der ikke er nul.

## Dækningsbidrag pr. kunde

Kundens tid til kundens pris minus løn for samme tid. Udgifter går lige op (kunden betaler
dem, teamet har lagt dem ud) og indgår ikke. Vises på kundesiden i et team, når der er sat
timeløn.

## Skærm

- Kunder-fanen i et team: kortet **Løn** over kundelisten. Viser sjakbejsen (eller »Ingen
  sjakbejs«) og én række pr. person med, hvad personen har til gode.
- Et tryk på en person åbner et ark: timer, timeløn, optjent, udlæg, kontanter, udbetalt, til
  gode og udbetalingerne (nyeste først). Sjakbejsen ser »Registrér udbetaling« (beløbet er
  udfyldt med det, personen har til gode) og »Sæt timeløn«.
- Arket for et team (Indstillinger → Team) får sektionen **Sjakbejs**: vælg/skift/fjern efter
  reglerne ovenfor.
- Kundesiden: sektionen »Løn og dækningsbidrag« i et team med timeløn.

## Ikke med nu

- CSV over udbetalinger og løn.
- Push ved udbetaling.
- At skjule tal for almindelige medlemmer.

## Tilgange, der blev overvejet

- **A. Egen samling `udbetalinger` (valgt):** kundens saldo, afregning og CSV er urørt.
- **B. Posttype »udbetaling«:** genbruger postarket, men kræver `kundeId` og skulle sorteres fra
  alle kundeberegninger; én glemt filtrering giver forkert saldo.
- Løn som andel af kundens timepris og ren udbetalingslog uden beregning blev fravalgt, fordi
  teamet aflønnes med fast timeløn.
