// Fanen Indstillinger: kunder, opgavetyper og arkene Brugere, Backup og Konto.

import { FARVER, dayKey, farveFor, formatKr, naesteFarve, normaliserEmail, parseNumber, validateBackup } from './core.js';
import { newId } from './store.js';
import { logUd, inviter, fjernAdgang, saetAdmin } from './konto.js';
import { t, commit, aendr, aktive, arkiverede } from './tilstand.js';
import { h, aabnArk, lukArk, arkTop, chip, felt, ikon, prik, besked, downloadFile } from './ui.js';

const efterNavn = (a, b) => a.navn.localeCompare(b.navn, 'da');
const kr = (n) => `${formatKr(n)}/t`;

// --- Kunder ---------------------------------------------------------------------

export function redigerKunde(kunde) {
  const ny = !kunde;
  let farve = ny ? naesteFarve(t.state.kunder) : farveFor(kunde);
  const navn = h('input', { value: kunde?.navn ?? '', autocomplete: 'off', placeholder: 'Kundens navn' });
  const pris = h('input', { value: kunde ? String(kunde.timepris).replace('.', ',') : '', inputmode: 'decimal', autocomplete: 'off', placeholder: 'fx 850' });
  const fejl = h('p', { class: 'fejl' });
  const farver = h('div', { class: 'farver', role: 'radiogroup', 'aria-label': 'Farve' });

  function tegnFarver() {
    farver.replaceChildren(...FARVER.map((f) => h('button', {
      type: 'button',
      class: 'farvevalg',
      role: 'radio',
      'aria-checked': String(f === farve),
      'aria-label': f,
      'data-farve': f,
      onclick: () => { farve = f; tegnFarver(); },
    }, f === farve && ikon('check'))));
  }
  tegnFarver();

  function gem(e) {
    e.preventDefault();
    const n = navn.value.trim();
    const p = parseNumber(pris.value);
    if (!n) return (fejl.textContent = 'Skriv et navn');
    if (p === null) return (fejl.textContent = 'Skriv en timepris, fx 850 eller 850,50');
    if (ny) t.state.kunder.push({ id: newId(), navn: n, timepris: p, arkiveret: false, farve });
    else aendr('kunder', kunde, { navn: n, timepris: p, farve });
    lukArk();
    commit();
  }

  aabnArk(
    h('form', { onsubmit: gem },
      arkTop(ny ? 'Ny kunde' : 'Kunde', h('button', { type: 'submit', class: 'tekstknap staerk' }, 'Gem')),
      felt('Navn', navn),
      felt('Timepris i kr ekskl. moms', pris),
      !ny && h('p', { class: 'hjaelp' }, 'En ny timepris gælder kun for tid, der registreres fremover.'),
      h('div', { class: 'felt' }, h('span', {}, 'Farve'), farver),
      fejl,
      !ny && h('button', {
        type: 'button',
        class: 'knap fare',
        onclick: () => { aendr('kunder', kunde, { arkiveret: true }); lukArk(); commit(); },
      }, 'Arkivér kunde'),
    ),
  );
  if (ny) navn.focus();
}

// --- Opgavetyper ----------------------------------------------------------------

export function redigerType(type) {
  const ny = !type;
  const navn = h('input', { value: type?.navn ?? '', autocomplete: 'off', placeholder: 'fx Møde' });
  const fejl = h('p', { class: 'fejl' });

  function gem(e) {
    e.preventDefault();
    const n = navn.value.trim();
    if (!n) return (fejl.textContent = 'Skriv et navn');
    if (ny) t.state.opgavetyper.push({ id: newId(), navn: n, arkiveret: false });
    else aendr('opgavetyper', type, { navn: n });
    lukArk();
    commit();
  }

  aabnArk(
    h('form', { onsubmit: gem },
      arkTop(ny ? 'Ny opgavetype' : 'Opgavetype', h('button', { type: 'submit', class: 'tekstknap staerk' }, 'Gem')),
      felt('Navn', navn),
      fejl,
      !ny && h('button', {
        type: 'button',
        class: 'knap fare',
        onclick: () => { aendr('opgavetyper', type, { arkiveret: true }); lukArk(); commit(); },
      }, 'Arkivér opgavetype'),
    ),
  );
  if (ny) navn.focus();
}

function arkivSektion(samling, beskriv) {
  const arkiv = arkiverede(t.state[samling]).sort(efterNavn);
  if (!arkiv.length) return null;
  return h('details', { class: 'arkiv' },
    h('summary', {}, `Vis arkiverede (${arkiv.length})`),
    h('div', { class: 'kort' },
      arkiv.map((x) => h('div', { class: 'raekke' },
        samling === 'kunder' && prik(x),
        h('span', { class: 'hoved' }, h('span', { class: 'titel' }, x.navn), beskriv && h('span', { class: 'under' }, beskriv(x))),
        h('button', { class: 'knap sekundaer lille', onclick: () => { aendr(samling, x, { arkiveret: false }); commit(); } }, 'Gendan'),
      )),
    ),
  );
}

// --- Backup ---------------------------------------------------------------------

function backupArk() {
  const fejl = h('p', { class: 'fejl' });
  const fil = h('input', {
    type: 'file',
    accept: '.json,application/json',
    hidden: true,
    onchange: async () => {
      const valgt = fil.files[0];
      fil.value = '';
      fejl.textContent = '';
      if (!valgt) return;
      let r;
      try {
        r = validateBackup(JSON.parse(await valgt.text()));
      } catch {
        r = { ok: false, fejl: 'Filen kunne ikke læses som backup' };
      }
      if (!r.ok) return (fejl.textContent = r.fejl);
      if (!confirm('Dette erstatter alle nuværende data. Fortsæt?')) return;
      const { version, ...data } = r.data;
      t.state = data;
      lukArk();
      commit();
      besked('Backup indlæst');
    },
  });
  aabnArk(
    arkTop('Backup'),
    h('p', { class: 'hjaelp' }, 'Data gemmes på din konto. En backup er en ekstra sikkerhed, fx i Filer eller iCloud Drive.'),
    h('div', { class: 'knapper' },
      h('button', {
        class: 'knap',
        onclick: () => downloadFile(`arbejdstid-backup-${dayKey(new Date())}.json`, JSON.stringify({ version: 1, ...t.state }, null, 2), 'application/json'),
      }, 'Eksportér backup'),
      h('button', { class: 'knap sekundaer', onclick: () => fil.click() }, 'Indlæs backup'),
    ),
    fil,
    fejl,
  );
}

// --- Konto ----------------------------------------------------------------------

function logUdMedAdvarsel() {
  if (t.ventende && !confirm('Du har ændringer, der ikke er synkroniseret. Log ud alligevel?')) return;
  t.sky.stop();
  logUd();
}

function kontoArk() {
  aabnArk(
    arkTop('Konto'),
    h('div', { class: 'kort' }, h('div', { class: 'raekke' }, h('span', { class: 'hoved' }, h('span', { class: 'under' }, 'Logget ind som'), h('span', { class: 'titel' }, t.bruger.email)))),
    h('div', { class: 'knapper' }, h('button', { class: 'knap fare', onclick: logUdMedAdvarsel }, 'Log ud')),
  );
}

// --- Brugere (kun administratorer) --------------------------------------------

const brugerStatus = (b) => [b.uid ? 'Aktiv' : 'Inviteret', b.admin && 'Administrator'].filter(Boolean).join(' · ');
let brugerListeEl = null;
let brugerBesked = null;
const kunneIkkeGemme = () => { if (brugerBesked) brugerBesked.textContent = 'Ændringen kunne ikke gemmes. Prøv igen.'; };

function redigerBruger(b) {
  aabnArk(
    arkTop(b.email),
    h('p', { class: 'hjaelp' }, brugerStatus(b)),
    h('div', { class: 'knapper' },
      h('button', {
        class: 'knap sekundaer',
        onclick: () => { lukArk(); saetAdmin(b.email, !b.admin).catch(kunneIkkeGemme); },
      }, b.admin ? 'Fjern som administrator' : 'Gør til administrator'),
      h('button', {
        class: 'knap fare',
        onclick: () => {
          if (!confirm(`Fjern adgangen for ${b.email}? Brugerens data bevares.`)) return;
          lukArk();
          fjernAdgang(b.email).catch(kunneIkkeGemme);
        },
      }, 'Fjern adgang'),
    ),
  );
}

function brugerRaekker() {
  const egen = normaliserEmail(t.bruger.email);
  return t.brugerliste.map((b) => {
    const indre = h('span', { class: 'hoved' }, h('span', { class: 'titel' }, b.email), h('span', { class: 'under' }, brugerStatus(b)));
    return b.email === egen
      ? h('div', { class: 'raekke' }, indre)
      : h('button', { class: 'raekke', onclick: () => redigerBruger(b) }, indre, ikon('hoejre'));
  });
}

// Kaldes, når brugerlisten ændres. Kun listen tegnes om, så en halvt skrevet
// invitation ikke forsvinder.
export function opdaterBrugere() {
  if (brugerListeEl?.isConnected) brugerListeEl.replaceChildren(...brugerRaekker());
}

function brugereArk() {
  const email = h('input', { type: 'email', inputmode: 'email', autocapitalize: 'off', autocomplete: 'off', placeholder: 'navn@eksempel.dk' });
  brugerBesked = h('p', { class: 'fejl' });
  brugerListeEl = h('div', { class: 'kort' }, brugerRaekker());
  aabnArk(
    arkTop('Brugere'),
    brugerListeEl,
    h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        brugerBesked.textContent = '';
        const ny = normaliserEmail(email.value);
        if (!ny) return (brugerBesked.textContent = 'Skriv en gyldig e-mail.');
        if (t.brugerliste.some((b) => b.email === ny)) return (brugerBesked.textContent = 'Den e-mail er allerede inviteret.');
        inviter(ny).catch(kunneIkkeGemme);
        email.value = '';
        besked(`Inviterede ${ny}`);
      },
    },
      felt('Invitér med e-mail', email),
      h('button', { class: 'knap', type: 'submit' }, 'Invitér'),
    ),
    brugerBesked,
    h('p', { class: 'hjaelp' }, 'Fortæl selv den inviterede adressen på appen. Personen opretter en konto med den e-mail, du har inviteret.'),
  );
}

// --- Fanen ----------------------------------------------------------------------

function merRaekke(titel, under, onclick) {
  return h('button', { class: 'raekke', onclick },
    h('span', { class: 'hoved' }, h('span', { class: 'titel' }, titel), under && h('span', { class: 'under' }, under)),
    ikon('hoejre'),
  );
}

export function visIndstillinger() {
  const kunder = aktive(t.state.kunder).sort(efterNavn);
  const typer = aktive(t.state.opgavetyper).sort(efterNavn);
  return [
    h('div', { class: 'sektion-top' }, h('h2', {}, 'Kunder'),
      h('button', { class: 'tekstknap', onclick: () => redigerKunde() }, ikon('plus'), 'Ny kunde')),
    kunder.length
      ? h('div', { class: 'kort' }, kunder.map((k) => h('button', { class: 'raekke', onclick: () => redigerKunde(k) },
        prik(k),
        h('span', { class: 'hoved' }, h('span', { class: 'titel' }, k.navn)),
        h('span', { class: 'tal under' }, kr(k.timepris)),
        ikon('hoejre'),
      )))
      : h('p', { class: 'tom' }, 'Ingen kunder endnu. Du kan også oprette dem, når du starter et ur.'),
    arkivSektion('kunder', (k) => kr(k.timepris)),

    h('div', { class: 'sektion-top' }, h('h2', {}, 'Opgavetyper'),
      h('button', { class: 'tekstknap', onclick: () => redigerType() }, ikon('plus'), 'Ny')),
    typer.length
      ? h('div', { class: 'chips' }, typer.map((x) => chip(x.navn, { onclick: () => redigerType(x) })))
      : h('p', { class: 'tom' }, 'Ingen opgavetyper endnu. Opgaven er valgfri, når du registrerer tid.'),
    arkivSektion('opgavetyper'),

    h('h2', {}, 'Mere'),
    h('div', { class: 'kort' },
      t.godk?.admin && merRaekke('Brugere', `${t.brugerliste.length} med adgang`, brugereArk),
      merRaekke('Backup', 'Eksportér eller indlæs', backupArk),
      merRaekke('Konto', t.bruger.email, kontoArk),
    ),
  ];
}
