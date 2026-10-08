# Poster: udgifter, brændstof, kontantudlæg og betalinger

Godkendt i chat 2026-10-08.

## Formål

Ud over tid skal man kunne registrere penge på en kunde: udgifter (fx
materialer), brændstof, kontanter kunden har givet i hånden, og betalinger for
arbejdet. Appen viser, hvad hver kunde skylder.

## Beslutninger

- Udgifter og brændstof viderefaktureres altid til kunden.
- Brændstof tastes som beløb i kr, ikke km.
- Saldo pr. kunde over al tid: arbejde + udgifter + brændstof − kontantudlæg − betalinger.
  Arbejdet regnes med kvartersafrundingen (`amountOf`).
- Beløb tastes ekskl. moms, som timeprisen.
- Indtastning fra Tid-skærmen.

## Data

Ny samling `brugere/{uid}/poster/{id}`:

```
{ kundeId: string, type: 'udgift' | 'braendstof' | 'kontant' | 'betaling',
  dato: 'YYYY-MM-DD', beloeb: number > 0, note: string }
```

Beløbet er altid positivt; typen giver fortegnet. `udgift` og `braendstof`
er +, `kontant` og `betaling` er −. Kontanter til materialer er to poster: et
kontantudlæg og en udgift, der går i nul.

Visningsnavne: Udgift, Brændstof, Kontantudlæg, Betaling.

## Indtastning

- "+ Tilføj tid" på Tid-skærmen bliver "+ Tilføj". Den åbner et valgark:
  Tid, Udgift, Brændstof, Kontantudlæg, Betaling.
- Tid åbner det eksisterende registreringsark.
- De fire andre åbner postarket:
  - typechips øverst
  - kunderække, der bruger kundevælgeren uden opgavesektionen
  - Dato (i dag), Beløb i kr, Note
  - Gem / Slet
  - hjælpetekst: "Beløb ekskl. moms."
- Dagens poster står i "I dag"-listen og tæller ikke med i dagens timer.

## Historik

- Dag-for-dag-listen viser periodens poster sammen med registreringerne.
  Rækkens titel er "Type · Kunde", og beløbet har fortegn. Et tryk åbner postarket.
- Hver kunde i overblikket viser periodens poster summeret pr. type.
- Kortet **Saldo** står efter overblikket og vises uafhængigt af perioden.
  - Det lister alle kunder med en saldo, der ikke er 0, med teksten "Skylder" eller "Til gode".
  - Et tryk på en kunde åbner postarket som Betaling for kunden, med saldoen udfyldt, hvis den er positiv.
- Historik er kun tom, når perioden hverken har registreringer eller poster.
  Saldo-kortet vises dog stadig.

## CSV

Kolonnerne er uændrede. Hver post bliver en linje, sorteret efter dato sammen med registreringerne:

| Kolonne | Indhold |
|---|---|
| Opgavetype | visningsnavnet |
| Start, Slut, Timer, Timepris | tomme |
| Beløb | med fortegn |

## Sky, regler og backup

- `poster` synkroniseres som de andre samlinger; `rens` sætter `note` til `''`.
- Reglerne kræver:
  - præcis felterne ovenfor
  - type blandt de fire
  - `dato` matcher `^\d{4}-\d{2}-\d{2}$`
  - `beloeb` er et tal over 0
  - `note` er tekst
- `validateBackup` godtager backups uden `poster` (giver `[]`) og afviser ugyldige poster.
- `flet` tager telefonens poster med og omskriver `kundeId`.
- Reglerne skal udgives i Firebase-konsollen. Cachen tælles op til v6.

## Test

- Enhedstest:
  - `saldoer`
  - CSV med poster
  - `forskel` for `poster`
  - `flet`
  - `validateBackup`
- Regeltest mod emulatoren.
- Gennemgang i browseren mod emulatorerne.
