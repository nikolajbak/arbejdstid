// Arbejdssted og teams: vælg Mig eller et team, invitationer, sektionen Team i
// Indstillinger og flytning af egne data ind i et team.

import { dayKey, fejlTekst, normaliserEmail, personNavn } from './core.js';
import { migSted, teamSted } from './sky.js';
import {
  opretTeam, blivMedlem, inviter, traekTilbage, fjernMedlem, omdoeb, saetMitNavn, hentData, flytData,
} from './team.js';
import { t, skiftArbejdssted } from './tilstand.js';
import { h, aabnArk, lukArk, arkTop, besked, downloadFile, felt, ikon } from './ui.js';

const raekke = (titel, under, onclick, valgt = false) => h('button', { type: 'button', class: 'raekke', onclick },
  h('span', { class: 'hoved' }, h('span', { class: 'titel' }, titel), under && h('span', { class: 'under' }, under)),
  valgt ? ikon('check') : ikon('hoejre'));

const antalMedlemmer = (x) => `${x.medlemmer.length} ${x.medlemmer.length === 1 ? 'medlem' : 'medlemmer'}`;

// Venter, til teamet står på listen over ens teams, og skifter så til det.
function skiftNaarKlar(id, derefter) {
  const tjek = () => {
    if (!t.teams.some((x) => x.id === id)) return setTimeout(tjek, 150);
    skiftArbejdssted(id);
    derefter?.();
  };
  tjek();
}

// --- Arket bag "Mig ▾" -------------------------------------------------------------

export function aabnSteder() {
  const vaelg = (id) => () => {
    lukArk();
    if (id !== t.arbejdssted) skiftArbejdssted(id);
  };
  aabnArk(
    arkTop('Arbejdssted'),
    h('div', { class: 'kort' },
      raekke('Mig', 'Kun dine egne data', vaelg(null), !t.arbejdssted),
      t.teams.map((x) => raekke(x.navn, antalMedlemmer(x), vaelg(x.id), x.id === t.arbejdssted)),
    ),
    t.invitationer.length > 0 && [
      h('div', { class: 'ark-overskrift' }, h('h3', {}, 'Invitationer')),
      h('div', { class: 'kort' }, t.invitationer.map((x) => h('div', { class: 'raekke' },
        h('span', { class: 'hoved' }, h('span', { class: 'titel' }, x.navn), h('span', { class: 'under' }, antalMedlemmer(x))),
        h('button', { type: 'button', class: 'knap lille', onclick: () => tagImod(x) }, 'Bliv medlem'),
      ))),
    ],
    h('button', { type: 'button', class: 'knap sekundaer', onclick: opretArk }, ikon('plus'), 'Opret team'),
  );
}

async function tagImod(x) {
  try {
    await blivMedlem(x.id, t.bruger);
  } catch (err) {
    return besked(fejlTekst(err.code));
  }
  lukArk();
  skiftNaarKlar(x.id, () => tilbydFlyt(x.id));
}

function opretArk() {
  const navn = h('input', { autocomplete: 'off', placeholder: 'fx Holdet', enterkeyhint: 'done' });
  const fejl = h('p', { class: 'fejl' });
  lukArk();
  aabnArk(
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        const n = navn.value.trim();
        if (!n) return (fejl.textContent = 'Skriv et navn');
        let id;
        try {
          id = await opretTeam(n, t.bruger);
        } catch (err) {
          return (fejl.textContent = fejlTekst(err.code));
        }
        lukArk();
        skiftNaarKlar(id, () => tilbydFlyt(id));
      },
    },
      arkTop('Opret team', h('button', { type: 'submit', class: 'tekstknap staerk' }, 'Opret')),
      felt('Teamets navn', navn),
      h('p', { class: 'hjaelp' }, 'Bagefter kan du invitere andre på e-mail og tage dine egne kunder og registreringer med.'),
      fejl,
    ),
  );
  navn.focus();
}

// --- Flyt mine data hertil ---------------------------------------------------------

// Spørger efter oprettelse eller medlemskab, hvis Mig har noget at flytte.
async function tilbydFlyt(teamId) {
  let mig;
  try {
    mig = await hentData(migSted(t.bruger.uid).data, migSted(t.bruger.uid).person);
  } catch {
    return;
  }
  if (!mig.kunder.length && !mig.registreringer.length && !mig.poster.length) return;
  const navn = t.teams.find((x) => x.id === teamId)?.navn ?? 'teamet';
  aabnArk(
    arkTop('Dine data'),
    h('p', {}, `Vil du tage dine ${mig.kunder.length} kunder og ${mig.registreringer.length} registreringer med ind i ${navn}?`),
    h('p', { class: 'hjaelp' }, 'Du kan også gøre det senere under Indstillinger → Team.'),
    h('div', { class: 'knapper' },
      h('button', { type: 'button', class: 'knap', onclick: () => { lukArk(); flytHertil(teamId); } }, 'Flyt mine data hertil'),
      h('button', { type: 'button', class: 'knap sekundaer', onclick: lukArk }, 'Ikke nu'),
    ),
  );
}

// Henter altid Mig på ny, så intet ændret i mellemtiden slettes uden at blive flyttet.
export async function flytHertil(teamId) {
  const uid = t.bruger.uid;
  const navn = t.teams.find((x) => x.id === teamId)?.navn ?? 'teamet';
  if (!navigator.onLine) return besked('Flytning kræver internet');
  let mig;
  try {
    mig = await hentData(migSted(uid).data, migSted(uid).person);
  } catch {
    return besked('Flytning kræver internet');
  }
  if (mig.ur) return alert('Stop uret i Mig, før du flytter dine data.');
  if (!mig.kunder.length && !mig.opgavetyper.length && !mig.registreringer.length && !mig.poster.length) {
    return besked('Der er ingen data i Mig at flytte');
  }
  if (!confirm(`Dine kunder, opgaver, registreringer og poster flyttes til ${navn}. Mig bliver tom. En backup gemmes først.`)) return;
  const gemt = await downloadFile(`arbejdstid-backup-${dayKey(new Date())}.json`, JSON.stringify({ version: 1, ...mig }, null, 2), 'application/json');
  if (!gemt && !confirm('Backuppen blev ikke gemt. Flyt alligevel?')) return;
  besked('Flytter …');
  let antal;
  try {
    antal = await flytData({ data: mig, sted: migSted(uid) }, teamSted(teamId, uid), uid);
  } catch (err) {
    console.error(err);
    return besked(err.code === 'unavailable' ? 'Flytning kræver internet' : fejlTekst(err.code));
  }
  if (t.arbejdssted !== teamId) skiftArbejdssted(teamId);
  besked(`Flyttet ${antal} ${antal === 1 ? 'registrering' : 'registreringer'}`);
}

// --- Sektionen Team i Indstillinger ------------------------------------------------

function tekstArk(titel, etiket, vaerdi, gem) {
  const input = h('input', { value: vaerdi, autocomplete: 'off', enterkeyhint: 'done' });
  const fejl = h('p', { class: 'fejl' });
  aabnArk(h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return (fejl.textContent = 'Skriv et navn');
      try {
        await gem(v);
      } catch (err) {
        return (fejl.textContent = fejlTekst(err.code));
      }
      lukArk();
    },
  }, arkTop(titel, h('button', { type: 'submit', class: 'tekstknap staerk' }, 'Gem')), felt(etiket, input), fejl));
}

const proev = (fn) => async () => {
  try {
    await fn();
  } catch (err) {
    besked(fejlTekst(err.code));
  }
};

function meldUd(team) {
  if (t.state.ur) return alert('Stop dit ur, før du melder dig ud.');
  const sidste = team.medlemmer.length === 1;
  const tekst = sidste
    ? `Du er det sidste medlem. Teamet og dets data kan ikke åbnes af nogen bagefter. Meld dig ud af ${team.navn}?`
    : `Meld dig ud af ${team.navn}? Dine registreringer bliver i teamet.`;
  if (!confirm(tekst)) return;
  proev(() => fjernMedlem(team.id, t.bruger.uid))();
}

export function teamSektion() {
  const team = t.team;
  if (!team) return null;
  const uid = t.bruger.uid;
  const email = h('input', { type: 'email', autocomplete: 'off', placeholder: 'navn@firma.dk', enterkeyhint: 'send' });
  const fejl = h('p', { class: 'fejl' });
  const send = async (e) => {
    e.preventDefault();
    fejl.textContent = '';
    const adr = normaliserEmail(email.value);
    if (!adr) return (fejl.textContent = 'Skriv en gyldig e-mail');
    if (team.inviterede.includes(adr)) return (fejl.textContent = 'Den e-mail er allerede inviteret');
    if (adr === normaliserEmail(t.bruger.email)) return (fejl.textContent = 'Du er allerede med');
    try {
      await inviter(team.id, adr);
    } catch (err) {
      return (fejl.textContent = fejlTekst(err.code));
    }
    email.value = '';
    besked(`${adr} er inviteret`);
  };
  const medlemmer = [...team.medlemmer].sort((a, b) => (a === uid ? -1 : b === uid ? 1 : personNavn(team, a).localeCompare(personNavn(team, b), 'da')));

  return [
    h('h2', {}, 'Team'),
    h('div', { class: 'kort' },
      raekke('Navn', team.navn, () => tekstArk('Teamets navn', 'Navn', team.navn, (v) => omdoeb(team.id, v))),
      raekke('Dit navn i teamet', personNavn(team, uid), () => tekstArk('Dit navn', 'Navn i teamet', personNavn(team, uid), (v) => saetMitNavn(team.id, uid, v))),
    ),
    h('div', { class: 'ark-overskrift' }, h('h3', {}, 'Medlemmer')),
    h('div', { class: 'kort' }, medlemmer.map((m) => (m === uid
      ? h('div', { class: 'raekke' }, h('span', { class: 'hoved' }, h('span', { class: 'titel' }, personNavn(team, m)), h('span', { class: 'under' }, 'Dig')))
      : h('div', { class: 'raekke' },
        h('span', { class: 'hoved' }, h('span', { class: 'titel' }, personNavn(team, m))),
        h('button', {
          type: 'button',
          class: 'tekstknap',
          onclick: () => { if (confirm(`Fjern ${personNavn(team, m)} fra ${team.navn}? Registreringerne bliver i teamet.`)) proev(() => fjernMedlem(team.id, m))(); },
        }, 'Fjern'))))),
    team.inviterede.length > 0 && [
      h('div', { class: 'ark-overskrift' }, h('h3', {}, 'Inviterede')),
      h('div', { class: 'kort' }, team.inviterede.map((adr) => h('div', { class: 'raekke' },
        h('span', { class: 'hoved' }, h('span', { class: 'titel' }, adr), h('span', { class: 'under' }, 'Venter')),
        h('button', { type: 'button', class: 'tekstknap', onclick: proev(() => traekTilbage(team.id, adr)) }, 'Træk tilbage')))),
    ],
    h('form', { class: 'inviter', onsubmit: send },
      felt('Invitér e-mail', email),
      h('button', { type: 'submit', class: 'knap sekundaer lille' }, 'Invitér'),
    ),
    fejl,
    h('p', { class: 'hjaelp' }, 'Personen skal være godkendt til appen af en administrator. Invitationen står under Mig ▾.'),
    h('div', { class: 'kort' },
      raekke('Flyt mine data hertil', 'Kunder, opgaver, registreringer og poster fra Mig', () => flytHertil(team.id)),
    ),
    h('div', { class: 'knapper' }, h('button', { type: 'button', class: 'knap fare', onclick: () => meldUd(team) }, 'Meld dig ud')),
  ];
}

