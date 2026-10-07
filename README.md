# Arbejdstid

Simpel timeregistrering for selvstændige med flere kunder. Registrér tid pr.
kunde og opgavetype, hver kunde med sin egen timepris, og få en oversigt og
CSV-fil til fakturering.

Appen er en PWA: den kører i browseren, kan lægges på hjemmeskærmen og virker
uden net. Al data ligger kun på den enkelte enhed — der er ingen server og
intet login.

## Kør lokalt

```bash
python3 -m http.server 8000
```

Åbn http://localhost:8000.

## Tests

```bash
npm test
```

Testene dækker beregninger, formatering, CSV og lagring (`core.js`, `store.js`).

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

## Backup

Data ligger kun på telefonen. Gå til Indstillinger → Backup → Eksportér en gang
imellem, og gem filen i Filer eller iCloud Drive. Samme sted kan en backup
importeres igen, fx på en ny telefon.
