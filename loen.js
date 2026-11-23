// Løn til teamet: sjakbejsen, timeløn pr. medlem, udbetalinger og hvad hver har til gode.

import { dayKey, daekningsbidrag, formatDuration, formatKr, godkendte, loenOversigt, loenVed, parseNumber, personNavn, saetLoen } from './core.js';
import { newId } from './store.js';
import { t, commit, erstat } from './tilstand.js';
import { h, aabnArk, lukArk, arkTop, besked, chip, felt, ikon } from './ui.js';
import { saetSjakbejs, saetTeamLoen } from './team.js';

const kr = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
const iDag = () => dayKey(new Date());
const navn = (uid) => personNavn(t.team, uid);
const migSelv = (uid) => (uid === t.bruger.uid ? `${navn(uid)} (dig)` : navn(uid));
const langDato = (dag) => new Date(`${dag}T12:00`).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });

// Sjakbejsen, hvis det er et medlem; en fjernet sjakbejs tæller som ingen.
export const sjakbejs = () => (t.team?.sjakbejs && t.team.medlemmer.includes(t.team.sjakbejs) ? t.team.sjakbejs : null);
export const erSjakbejs = () => !!t.team && sjakbejs() === t.bruger.uid;

const oversigt = () => loenOversigt(t.team, t.state.registreringer, t.state.poster, t.state.udbetalinger ?? []);
const tilGodeTekst = (n) => (n >= 0.005 ? 'Til gode' : n <= -0.005 ? 'Skylder sjakbejsen' : 'Afregnet');

const fejlTekst = (err) => (err?.code === 'permission-denied' ? 'Det må kun sjakbejsen' : 'Det kunne ikke gemmes. Prøv igen.');

// --- Kortet på Kunder-fanen ----------------------------------------------------------

export function loenKort() {
  if (!t.team) return null;
  const s = sjakbejs();
  const personer = oversigt();
  const iAlt = personer.reduce((n, p) => n + Math.max(0, p.tilGode), 0);
  return [
    h('h3', { class: 'dag' }, h('span', {}, 'Løn'), s && iAlt >= 0.005 && h('span', { class: 'tal' }, `${formatKr(iAlt)} til gode`)),
    h('div', { class: 'kort' },
      h('div', { class: 'raekke' }, h('span', { class: 'hoved' },
        h('span', { class: 'under' }, 'Sjakbejs'),
        h('span', { class: 'titel' }, s ? migSelv(s) : 'Ingen sjakbejs'),
        !s && h('span', { class: 'under' }, 'Vælg en under Indstillinger → Team'))),
      personer.map((p) => h('button', { class: 'raekke', onclick: () => aabnPerson(p.person) },
        h('span', { class: 'hoved' },
          h('span', { class: 'titel' }, migSelv(p.person)),
          h('span', { class: 'under' }, `${formatDuration(p.ms)} timer`, p.msUdenLoen > 0 && h('span', { class: 'aaben' }, ` · ${formatDuration(p.msUdenLoen)} uden timeløn`))),
        h('span', { class: 'tal' },
          Math.abs(p.tilGode) >= 0.005 && h('span', { class: 'titel' }, formatKr(Math.abs(p.tilGode))),
          h('span', { class: 'under' }, Math.abs(p.tilGode) < 0.005 && p.msUdenLoen > 0 ? 'Mangler timeløn' : tilGodeTekst(p.tilGode))),
        ikon('hoejre'))),
    ),
  ];
}

// --- Én person -------------------------------------------------------------------------

export function aabnPerson(uid) {
  const indhold = h('div');
  const tegn = () => {
    const p = oversigt().find((x) => x.person === uid) ?? { ms: 0, msUdenLoen: 0, optjent: 0, udlaeg: 0, kontant: 0, udbetalt: 0, tilGode: 0 };
    const sats = loenVed(t.team.loen, uid, iDag());
    const linje = (titel, vaerdi, under) => h('div', { class: 'raekke' },
      h('span', { class: 'hoved' }, h('span', { class: 'titel' }, titel), under && h('span', { class: 'under' }, under)),
      h('span', { class: 'tal' }, h('span', { class: 'titel' }, vaerdi)));
    const udb = (t.state.udbetalinger ?? []).filter((u) => u.person === uid).sort((a, b) => (a.dato < b.dato ? 1 : -1));
    const trin = [...(t.team.loen?.[uid] ?? [])].reverse();
    const sj = erSjakbejs();
    // h() springer false over og folder lister ud; det gør replaceChildren ikke.
    indhold.replaceChildren(h('div', {},
      h('div', { class: 'kort' },
        linje('Timer', formatDuration(p.ms), p.msUdenLoen > 0 ? `${formatDuration(p.msUdenLoen)} uden timeløn` : null),
        linje('Timeløn nu', sats === null ? 'Ikke sat' : `${formatKr(sats)}/t`),
        linje('Optjent', formatKr(p.optjent)),
        linje('Udlæg', `+${formatKr(p.udlaeg)}`, 'Udgifter og brændstof'),
        linje('Kontanter fra kunder', `−${formatKr(p.kontant)}`),
        linje('Udbetalt', `−${formatKr(p.udbetalt)}`),
        linje(tilGodeTekst(p.tilGode), formatKr(Math.abs(p.tilGode))),
      ),
      sj && h('div', { class: 'knapper' },
        h('button', { type: 'button', class: 'knap', onclick: () => aabnUdbetaling(null, { person: uid, beloeb: p.tilGode > 0 ? p.tilGode : undefined }, tegn) }, 'Registrér udbetaling'),
        h('button', { type: 'button', class: 'knap sekundaer', onclick: () => aabnTimeloen(uid, tegn) }, 'Sæt timeløn')),
      !sj && h('p', { class: 'hjaelp' }, sjakbejs() ? `Kun ${navn(sjakbejs())} kan sætte timeløn og registrere udbetalinger.` : 'Teamet har ingen sjakbejs. Vælg en under Indstillinger → Team.'),
      h('div', { class: 'ark-overskrift' }, h('h3', {}, 'Udbetalinger')),
      udb.length
        ? h('div', { class: 'kort' }, udb.map((u) => h(sj ? 'button' : 'div', { class: 'raekke', type: sj ? 'button' : null, onclick: sj ? () => aabnUdbetaling(u, {}, tegn) : null },
          h('span', { class: 'hoved' }, h('span', { class: 'titel' }, langDato(u.dato)), u.note && h('span', { class: 'under' }, u.note)),
          h('span', { class: 'tal' }, h('span', { class: 'titel' }, formatKr(u.beloeb))))))
        : h('p', { class: 'tom' }, 'Ingen udbetalinger endnu.'),
      trin.length > 0 && [
        h('div', { class: 'ark-overskrift' }, h('h3', {}, 'Timeløn')),
        h('div', { class: 'kort' }, trin.map((x) => linje(`Fra ${langDato(x.fra)}`, `${formatKr(x.kr)}/t`))),
      ],
    ));
  };
  tegn();
  aabnArk(h('div', { class: 'ark-top' }, h('span'), h('h3', {}, migSelv(uid)),
    h('button', { type: 'button', class: 'tekstknap staerk', onclick: lukArk }, 'Luk')), indhold);
}

// --- Udbetaling ------------------------------------------------------------------------

// forslag: { person, beloeb } for en ny. efter: kaldes, når den er gemt eller slettet.
export function aabnUdbetaling(u, forslag = {}, efter = () => {}) {
  const ny = !u;
  const valg = { person: u?.person ?? forslag.person ?? t.team.medlemmer[0] };
  const dato = h('input', { type: 'date', value: u?.dato ?? iDag(), 'aria-label': 'Dato' });
  const startBeloeb = u?.beloeb ?? forslag.beloeb;
  const beloeb = h('input', { inputmode: 'decimal', autocomplete: 'off', placeholder: 'fx 5000', value: startBeloeb ? kr(startBeloeb) : '' });
  const note = h('textarea', { value: u?.note ?? '', placeholder: 'Valgfri, fx MobilePay eller bankoverførsel' });
  const fejl = h('p', { class: 'fejl' });
  const hvem = h('div', { class: 'chips' });
  const tegnHvem = () => hvem.replaceChildren(...[...new Set([...t.team.medlemmer, valg.person])].map((p) =>
    chip(migSelv(p), { valgt: p === valg.person, onclick: () => { valg.person = p; tegnHvem(); } })));

  function gem(e) {
    e.preventDefault();
    fejl.textContent = '';
    if (!erSjakbejs()) return (fejl.textContent = 'Det må kun sjakbejsen');
    if (!dato.value) return (fejl.textContent = 'Vælg en dato');
    const b = parseNumber(beloeb.value);
    if (b === null || b <= 0) return (fejl.textContent = 'Skriv et beløb over 0, fx 5000 eller 5.000,00');
    const data = { id: u?.id ?? newId(), person: valg.person, dato: dato.value, beloeb: b, note: note.value.trim() };
    t.state.udbetalinger ??= [];
    erstat('udbetalinger', data);
    lukArk();
    commit();
    efter();
    if (ny) besked(`Udbetaling til ${navn(valg.person)} registreret`);
  }

  function slet() {
    if (!confirm('Slet udbetalingen?')) return;
    t.state.udbetalinger = t.state.udbetalinger.filter((x) => x.id !== u.id);
    lukArk();
    commit();
    efter();
  }

  tegnHvem();
  aabnArk(h('form', { onsubmit: gem },
    arkTop(ny ? 'Udbetaling' : 'Ret udbetaling', h('button', { type: 'submit', class: 'tekstknap staerk' }, 'Gem')),
    h('div', { class: 'ark-overskrift' }, h('h3', {}, 'Til')),
    hvem,
    h('div', { class: 'kort' }, h('div', { class: 'raekke tidsfelter' }, h('span', { class: 'hoved' }, 'Dato'), dato)),
    felt('Beløb i kr', beloeb),
    felt('Note', note),
    fejl,
    !ny && h('button', { class: 'knap fare', type: 'button', onclick: slet }, 'Slet udbetalingen'),
  ));
}

// --- Timeløn ---------------------------------------------------------------------------

export function aabnTimeloen(uid, efter = () => {}) {
  const fra = h('input', { type: 'date', value: iDag(), 'aria-label': 'Gælder fra' });
  const nu = loenVed(t.team.loen, uid, iDag());
  const beloeb = h('input', { inputmode: 'decimal', autocomplete: 'off', placeholder: 'fx 220', value: nu === null ? '' : kr(nu) });
  const fejl = h('p', { class: 'fejl' });
  const gemLoen = async (loen) => {
    const foer = t.team.loen;
    t.team.loen = loen;
    lukArk();
    efter();
    try {
      await saetTeamLoen(t.team.id, loen);
    } catch (err) {
      t.team.loen = foer;
      efter();
      besked(fejlTekst(err));
    }
  };

  function gem(e) {
    e.preventDefault();
    fejl.textContent = '';
    if (!erSjakbejs()) return (fejl.textContent = 'Det må kun sjakbejsen');
    if (!fra.value) return (fejl.textContent = 'Vælg en dato');
    const b = parseNumber(beloeb.value);
    if (b === null || b <= 0) return (fejl.textContent = 'Skriv en timeløn over 0, fx 220');
    gemLoen(saetLoen(t.team.loen, uid, fra.value, b));
  }

  const trin = t.team.loen?.[uid] ?? [];
  aabnArk(h('form', { onsubmit: gem },
    arkTop(`Timeløn for ${navn(uid)}`, h('button', { type: 'submit', class: 'tekstknap staerk' }, 'Gem')),
    felt('Kr. i timen', beloeb),
    h('div', { class: 'kort' }, h('div', { class: 'raekke tidsfelter' }, h('span', { class: 'hoved' }, 'Gælder fra'), fra)),
    h('p', { class: 'hjaelp' }, 'Tid før datoen beholder den timeløn, der gjaldt dengang. Samme dato igen retter beløbet.'),
    fejl,
    trin.length > 0 && [
      h('div', { class: 'ark-overskrift' }, h('h3', {}, 'Tidligere')),
      h('div', { class: 'kort' }, [...trin].reverse().map((x) => h('div', { class: 'raekke' },
        h('span', { class: 'hoved' }, h('span', { class: 'titel' }, `Fra ${langDato(x.fra)}`), h('span', { class: 'under' }, `${formatKr(x.kr)}/t`)),
        h('button', { type: 'button', class: 'tekstknap', onclick: () => { if (confirm('Fjern denne timeløn?')) gemLoen(saetLoen(t.team.loen, uid, x.fra, null)); } }, 'Fjern')))),
    ],
  ));
}

// --- Sektionen i Indstillinger → Team -----------------------------------------------------

export function sjakbejsSektion() {
  const team = t.team;
  if (!team) return null;
  const s = sjakbejs();
  const uid = t.bruger.uid;
  // Har teamet ingen sjakbejs, kan alle vælge; ellers kun sjakbejsen selv.
  const maa = !s || s === uid;
  const vaelg = async (ny) => {
    const tekst = ny === null ? 'Fjern sjakbejsen? Så kan ingen sætte timeløn eller registrere udbetalinger, før en ny er valgt.'
      : ny === uid ? 'Bliv sjakbejs? Du modtager kundernes betalinger og står for at betale teamet.'
        : `Gør ${navn(ny)} til sjakbejs?${s === uid ? ' Du kan ikke selv tage rollen tilbage.' : ''}`;
    if (!confirm(tekst)) return;
    try {
      await saetSjakbejs(team.id, ny);
    } catch (err) {
      besked(fejlTekst(err));
    }
  };
  return [
    h('div', { class: 'ark-overskrift' }, h('h3', {}, 'Sjakbejs')),
    h('div', { class: 'kort' },
      h('div', { class: 'raekke' }, h('span', { class: 'hoved' },
        h('span', { class: 'titel' }, s ? migSelv(s) : 'Ingen sjakbejs'),
        h('span', { class: 'under' }, 'Modtager kundernes betalinger, sætter timeløn og betaler teamet')),
        s === uid && h('button', { type: 'button', class: 'tekstknap', onclick: () => vaelg(null) }, 'Fjern')),
    ),
    maa && h('div', { class: 'chips' }, team.medlemmer.filter((m) => m !== s).map((m) =>
      chip(s === uid ? `Giv til ${navn(m)}` : m === uid ? 'Bliv sjakbejs' : navn(m), { onclick: () => vaelg(m) }))),
    !maa && h('p', { class: 'hjaelp' }, `Kun ${navn(s)} kan give rollen videre.`),
  ];
}

// --- Kundesiden ---------------------------------------------------------------------------

// Løn og dækningsbidrag for kunden. Kun i et team, hvor der er sat timeløn.
export function kundeLoen(kundeId) {
  if (!t.team?.loen || !Object.keys(t.team.loen).length) return null;
  const d = daekningsbidrag(kundeId, godkendte(t.state.registreringer), t.team, t.state.kunder);
  if (d.tidKr < 0.005) return null;
  const linje = (titel, vaerdi, under) => h('div', { class: 'raekke' },
    h('span', { class: 'hoved' }, h('span', { class: 'titel' }, titel), under && h('span', { class: 'under' }, under)),
    h('span', { class: 'tal' }, h('span', { class: 'titel' }, vaerdi)));
  return [
    h('h2', { class: 'sektion-top' }, h('span', {}, 'Løn og dækningsbidrag'), h('span', { class: 'tal total-i-dag' }, formatKr(d.bidrag))),
    h('div', { class: 'kort' },
      linje('Tid til kunden', formatKr(d.tidKr), 'Uden moms'),
      linje('Løn', `−${formatKr(d.loen)}`, d.msUdenLoen > 0 ? `${formatDuration(d.msUdenLoen)} uden timeløn` : null),
      linje('Dækningsbidrag', formatKr(d.bidrag), 'Udgifter går lige op og er ikke med'),
    ),
  ];
}
