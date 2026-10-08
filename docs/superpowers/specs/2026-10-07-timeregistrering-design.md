# Timeregistrering — design

Dato: 2026-10-07

## Formål

En simpel app til selvstændige med flere kunder: registrér tid og opgavetype,
med individuel timepris pr. kunde, så det er let at fakturere. Bruges af to
personer, hver med egne data på egen telefon.

## Platform og distribution

- PWA (HTML/CSS/JavaScript, intet byggetrin), installeres via Safari →
  "Føj til hjemmeskærm".
- Hostes på GitHub Pages (https, gratis). Samme URL deles med vennen.
- Virker offline via service worker, der cacher appens filer.
- Al data ligger lokalt på enheden (`localStorage`, én JSON-nøgle). Ingen
  server, intet login, ingen synkronisering mellem brugere.

## Datamodel

```
Kunde      { id, navn, timepris (kr, tal), arkiveret (bool) }
Opgavetype { id, navn, arkiveret (bool) }
Registrering {
  id, kundeId, opgavetypeId,
  start (ISO-tid), slut (ISO-tid),
  timepris (kopieret fra kunden ved oprettelse),
  note (tekst, valgfri)
}
KørendeUr  { kundeId, opgavetypeId, start, note } | null
```

- Varighed = slut − start. Beløb = varighed i timer × registreringens timepris.
- Timeprisen kopieres ind ved oprettelse, så senere prisændringer ikke ændrer
  gamle registreringer. Ved redigering af en registrering kan prisen rettes
  manuelt.
- Kunder og opgavetyper slettes ikke, hvis de er i brug — de arkiveres (skjules
  fra valglister, men gamle registreringer bevares).
- Standard-opgavetyper ved første start: Møde, Udvikling, Rådgivning, Transport.
- Data gemmes med et `version`-felt for fremtidige migreringer.

## Skærme (bundnavigation med fire faner)

1. **Tid**
   - Vælg kunde og opgavetype, valgfri note, tryk Start.
   - Kørende ur vises stort med forløbet tid. Stop opretter en registrering.
   - Uret overlever lukning af appen (gemt starttidspunkt).
   - Knap "Tilføj tid manuelt": dato + start/slut *eller* dato + antal timer.
     Ved antal timer sættes start til 09:00 og slut beregnes.
2. **Registreringer**
   - Liste, nyeste først, grupperet pr. dag med dagstotal.
   - Tryk for at redigere (kunde, opgavetype, tid, timepris, note) eller slette.
3. **Oversigt**
   - Periodevælger: denne måned (standard), sidste måned, eller fra–til.
   - Pr. kunde: timer og beløb, foldet ud pr. opgavetype. Total nederst.
   - Eksport af periodens registreringer som CSV (semikolon-separeret,
     dansk decimalkomma, UTF-8 med BOM så Excel læser æøå korrekt).
4. **Indstillinger**
   - Kunder: tilføj/redigér navn og timepris, arkivér.
   - Opgavetyper: tilføj/omdøb, arkivér.
   - Backup: eksportér alle data som JSON-fil; importér (erstatter efter
     bekræftelse).

## Visning

- Dansk brugerflade. Varighed som `t:mm` (fx 2:15). Beløb som `1.234,50 kr`.
- Mobil først, virker også på computer. Lys og mørk tilstand efter systemet.
- Ingen afrunding; tid gemmes præcist.

## Fejlhåndtering

- Start kræver valgt kunde og opgavetype; knappen er inaktiv indtil da.
- Manuel/redigeret registrering: slut skal være efter start, ellers vises fejl.
- Ugyldig backup-fil ved import: fejlbesked, intet ændres.
- Hvis ingen kunder findes, viser Tid-fanen en henvisning til Indstillinger.

## Kodestruktur

```
index.html        skal + faner
styles.css
app.js            UI: rendering og events
core.js           ren logik: varighed, beløb, periodefiltrering, totaler,
                  formatering, CSV, validering af backup (ingen DOM)
store.js          indlæsning/gemning i localStorage, standarddata
sw.js             service worker (cache af app-filer)
manifest.webmanifest, ikoner
tests/core.test.js  node --test
```

## Test

- `core.js` testes med Nodes indbyggede testløber: varighed, beløb med
  kopieret timepris, periodefiltrering over månedsskifte, totaler pr. kunde og
  opgavetype, dansk formatering, CSV-output, backup-validering.
- UI afprøves manuelt i browseren i telefonstørrelse: start/stop, manuel
  registrering, redigering, oversigt, eksport, genindlæsning med kørende ur.

## Uden for scope

Synkronisering mellem enheder, fælles data, login, fakturagenerering (PDF),
afrunding, flere valutaer.
