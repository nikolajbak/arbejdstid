# Teams: registrér for hinanden

Godkendt i chat 2026-10-08.

## Formål

Kolleger, der arbejder sammen som ligeværdige, skal kunne:

- registrere tid for hinanden, også for flere på én gang
- dele kunder
- se hinandens tid, poster og saldo

Hver bruger beholder sit eget arbejdssted ("Mig") og kan være med i et eller flere teams.

## Beslutninger

- Alle i et team ser alt i teamet.
- Teamet har fælles kunder med én timepris pr. kunde. Registreringer kopierer timeprisen som i dag.
- Alle brugere kan oprette et team og invitere andre på e-mail. En invitation virker kun for brugere, som en administrator har godkendt.
- Alle medlemmer kan invitere, trække invitationer tilbage og fjerne medlemmer. Man kan også melde sig ud selv.
- Man kan flytte sine egne data ind i et team:
  - Appen tilbyder det, når man opretter et team, og når man bliver medlem.
  - Det kan også gøres senere under Indstillinger → Team.
- Data flyttes, de kopieres ikke.

## Data

```
teams/{teamId}
  { navn: string,
    medlemmer: [uid],                 // mindst én
    navne: { uid: string },           // visningsnavn pr. medlem
    inviterede: [email],              // små bogstaver
    oprettet: timestamp }

teams/{teamId}/personer/{uid}         // pr. medlem; svarer til profilen brugere/{uid}
  { ur: null | { kundeId, opgavetypeId, start, note?, deltagere?: [uid] },
    skjult?: map }

teams/{teamId}/kunder|opgavetyper|poster/{id}   // som under brugere/{uid}
teams/{teamId}/registreringer/{id}              // som under brugere/{uid} + person: uid
```

- Visningsnavnet er som udgangspunkt delen af e-mailen før @. Man kan rette det under Indstillinger → Team.
- `deltagere` mangler eller er tom, når uret kun kører for én selv.

## Arbejdssted

- `sky.js` startes med et arbejdssted i stedet for et uid:
  - `{ data: doc(...), person: doc(...) }`
  - Mig er `brugere/{uid}` for begge.
  - Et team er `teams/{id}` for data og `teams/{id}/personer/{uid}` for ur og skjulte genveje.
- Teamdokumentet lyttes til for sig, så navne, medlemmer og invitationer altid er aktuelle.
- Tilstanden får `team: null | { id, navn, medlemmer, navne, inviterede }`.
- Øverst på hver fane står arbejdsstedets navn med "▾".
  - Et tryk åbner et ark med Mig, ens teams, invitationer til en med knappen "Bliv medlem", og "Opret team".
  - Valget huskes i `localStorage`. Findes teamet ikke længere, åbner appen Mig.
- Ens teams og invitationer hentes med to forespørgsler:
  - `medlemmer array-contains uid`
  - `inviterede array-contains email`

## Registrering for flere

Gælder kun i et team.

- Vælgeren til kunde og opgave (start ur, ret ur, "+ Tilføj → Tid") får en sektion **Hvem** med en chip for hvert medlem. Man selv er valgt fra start, og mindst én skal være valgt.
- Ur:
  - Valgte man flere, gemmes de i `ur.deltagere`.
  - Ved stop (og ved skift med ét tryk) laves én registrering pr. deltager med samme start, slut, kunde, opgave, timepris og note.
  - Uden deltagere laves én registrering for en selv.
- "+ Tilføj → Tid" laver også én registrering pr. valgt person.
- Når en eksisterende registrering rettes, rettes kun den ene. Personen kan skiftes til ét andet medlem.
- Tid-skærmen viser kun ens eget ur. Når uret kører for flere, står navnene på uret.
- "I dag" viser hele teamets registreringer for dagen, med personens navn i undertitlen.

## Historik i teamet

- Over periodevælgeren står chips til at filtrere på person: Alle, så hvert medlem med "Mig" først. Filteret gælder:
  - overblikket
  - listen dag for dag
  - CSV
- Poster og Saldo filtreres ikke, fordi de hører til teamet.
- CSV i et team får en sidste kolonne, `Person`. CSV fra Mig er uændret.
- En registrering, hvis person ikke længere er medlem, viser personens gemte navn. Findes navnet ikke, står der "(tidligere medlem)".

## Indstillinger i teamet

- Kunder og opgavetyper vises som i dag, men for teamet.
- Sektionen **Team** har:
  - teamets navn, som kan rettes
  - "Dit navn i teamet"
  - medlemmer, hver med "Fjern" (med bekræftelse)
  - inviterede, hver med "Træk tilbage"
  - feltet "Invitér e-mail"
  - "Flyt mine data hertil"
  - "Meld dig ud"
- Under Mere står Backup og Brugere kun i Mig. Konto står begge steder.

## Flyt mine data hertil

1. Appen bekræfter med teksten "Dine kunder, opgaver, registreringer og poster flyttes til <team>. Mig bliver tom. En backup gemmes først." Kører et ur i Mig, skal det stoppes først, og appen siger det.
2. Den henter backupfilen af Mig til telefonen. Det er samme fil som Backup laver.
3. Den fletter ind i teamet:
   - Kunder og opgavetyper med samme navn (store og små bogstaver ignoreres) genbruges, ligesom i `flet`.
   - Registreringer får `person` = ens uid.
   - Id'er bevares, og id'er, teamet allerede har, springes over. Så kan flytningen køres igen uden at noget kommer med to gange.
4. Først når teamets skrivninger er bekræftet af serveren, slettes Mig's kunder, opgavetyper, registreringer og poster. Bliver flytningen afbrudt, ligger data begge steder, men intet går tabt.
5. Appen skifter til teamet og viser "Flyttet N registreringer".

Det kræver net. Uden net viser appen "Flytning kræver internet".

## Regler

- **Medlem:** man er godkendt, og ens uid står i `get(teams/{id}).data.medlemmer`.
- **Teamdokumentet:**
  - Læses af medlemmer og af inviterede (ens e-mail står i `inviterede`). Det gælder også forespørgsler (`list`).
  - Oprettes af en godkendt bruger med `medlemmer == [uid]`, `navne` med kun ens eget uid, og med `oprettet`.
  - Et medlem må opdatere teamet:
    - `navn`, `navne` og `inviterede` må ændres
    - medlemmer må kun fjernes, ikke tilføjes
    - et fjernet medlem må gerne stå i `navne`, så det gemte navn kan vises
  - En inviteret må blive medlem. I samme skrivning skal man:
    - tilføje kun sit eget uid til `medlemmer`
    - fjerne kun sin egen e-mail fra `inviterede`
    - sætte kun sit eget navn i `navne`
    - ikke ændre andet
  - Teamdokumentet kan ikke slettes.
- **`personer/{uid}`:** læses af medlemmer og skrives kun af den person, uid'et tilhører. `ur` valideres som i dag, og `deltagere` skal være en liste af tekster, hvis feltet findes.
- **`kunder`, `opgavetyper`, `poster`:** samme feltregler som under `brugere/{uid}`, men adgangen gives til medlemmer.
- **`registreringer`:** samme feltregler som under `brugere/{uid}`, og derudover er `person` påkrævet og skal være et medlem.
- Reglerne skal udgives i konsollen, før koden pushes.

## Fejl

- **Afvist adgang til et team:** afviser en lytter i et team adgangen, fx fordi man er fjernet, skifter appen til Mig og viser "Du er ikke længere med i <team>". Den logger ikke ud. I Mig er det som i dag.
- **Invitation:** e-mailen skal se gyldig ud og må ikke allerede være medlem eller inviteret.
- **Udmelding:** man kan ikke melde sig ud, mens ens ur kører i teamet. Er man det sidste medlem, advarer appen: "Teamet og dets data kan ikke åbnes af nogen bagefter."

## Ikke med

- At se kollegaers kørende ure.
- Forskellig timepris pr. person.
- Flytning fra et team tilbage til Mig.
- At slette et team.

## Test

- **Enhedstest:**
  - opdeling af et ur i én registrering pr. deltager (stop og skift)
  - "+ Tilføj" for flere
  - personfilteret
  - CSV med Person-kolonnen
  - flytningens fletning: person sættes, navne genbruges, og en anden kørsel giver ingen dubletter
  - `forskel` og `flet` med `person`
- **Regeltest:**
  - en, der ikke er medlem, afvises
  - en inviteret kan blive medlem, men ikke tilføje andre
  - et medlem kan fjerne andre, men ikke tilføje dem
  - en fjernet person mister adgang
  - `person` skal være et medlem
  - `personer/{uid}` skrives kun af den person, det tilhører
- **I browseren:** to testbrugere mod emulatorerne. Opret team, invitér, bliv medlem, flyt data, registrér for begge, se Historik, fjern et medlem.
