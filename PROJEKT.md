# Arbejdstid: projektbeskrivelse

Designet af Nikolaj Bak og bygget sammen med Claude Code som kodeassistent. Del af en portefølje på otte systemer
bygget fra september til november 2026.

- App til timeregistrering for selvstændige med flere kunder: ur pr. kunde, timepris, udgifter, brændstof, kontantudlæg, betalinger og CSV til fakturering
- Flere brugere med teams og invitationer; kun godkendte brugere får adgang, og teams deler kunder, opgaver, poster og saldo
- Kvitteringer fotograferes og læses af AI (butik, dato, beløb, moms og varer), så posten er klar til bogføring
- Databasens sikkerhedsregler har egne tests og udgives automatisk af GitHub Actions, når testene er grønne
- Teknik: JavaScript-PWA, der virker offline, Firebase (Firestore og Auth), Cloudflare Worker til push og kvitteringslæsning, ca. 165 automatiske tests
- Afregning, hvor betalinger og kontantudlæg dækker kundens ældste tid og udgifter først, så hver post er mærket afregnet eller delvist afregnet, og saldoen viser, hvilken dag kunden er afregnet til og med
- Tid eller udgifter registreret for en kollega venter på kollegaens godkendelse, før de tæller i saldoen; notifikation ved godkendelse og afvisning
- Opgaveliste pr. kunde i tre niveauer (idé, godkendt til udførsel, udført), historik pr. uge, måned eller periode og fordeling pr. opgave
- Profil med færdigheder valgt fra et katalog med forslag, egen tid og indtjening, backup og flytning af egne data ind i et team
- Data i Firebase i EU under brugerens egen konto; kun inviterede brugere kan logge ind
- 85 commits i oktober 2026

Teksten spejler afsnittet Projekter i `profil/fakta.md` i `nikolajbak/jobsoegning`, som er sandhedskilden til
ansøgninger. Ændres projektet væsentligt, så ret begge steder (status pr. 2026-11-02).
