// Fanen Tid: urkortet, Start igen og dagens registreringer.

import { amountOf, dayKey, durationMs, farveFor, formatDuration, formatKr, medPerson, personNavn, registreringerFraUr, senesteKombinationer, sidenTekst, skiftUr, skjulKombination } from './core.js';
import { newId } from './store.js';
import { t, commit, aktive, kundePaa, migITeam } from './tilstand.js';
import { h, aabnArk, lukArk, arkTop, besked, chip, felt, ikon, klokken, lokalTid, navnPaa, p2 } from './ui.js';
import { aabnVaelger } from './vaelger.js';
import { aabnTilfoej, postRaekke } from './post.js';
import { aabnRegistrering, hvadTekst, registreringsRaekke } from './registrering.js';

const nuIso = () => new Date().toISOString();
const farvePaa = (kundeId) => farveFor(kundePaa(kundeId) ?? { id: kundeId });
const timeprisPaa = (kundeId) => kundePaa(kundeId)?.timepris ?? 0;

function urTekst(start) {
  const ms = Math.max(0, Date.now() - new Date(start));
  return `${formatDuration(ms)}:${p2(Math.floor(ms / 1000) % 60)}`;
}

const gemteBesked = (r, antal = 1) => besked(`Gemte ${navnPaa(t.state.kunder, r.kundeId)} · ${formatDuration(durationMs(r))}${antal > 1 ? ` × ${antal} personer` : ''}`);

// --- Start, skift og stop -------------------------------------------------------

// Personerne uret kører for, som de står i vælgeren. Kun én selv: ingen deltagere.
const mineValg = () => (t.team ? [t.bruger.uid] : null);
// Kun deltagere, der stadig er medlemmer.
const deltagereAf = (ur) => {
  const aktive = (ur?.deltagere ?? []).filter((p) => t.team?.medlemmer.includes(p));
  return aktive.length ? aktive : mineValg();
};

function medDeltagere(ur, personer) {
  const { deltagere, ...uden } = ur;
  const alene = !personer || (personer.length === 1 && personer[0] === t.bruger.uid);
  return alene ? uden : { ...uden, deltagere: personer };
}

function start({ kundeId, opgavetypeId, note = '', personer = null }) {
  t.state.ur = medDeltagere({ kundeId, opgavetypeId: opgavetypeId ?? '', start: nuIso(), note }, personer);
  commit();
}

// Et dobbelttryk må ikke ramme det felt, der efter første tryk ligger under fingeren.
let sidsteSkift = 0;

// Fortsæt: kører et ur, gemmes det, og det nye startes med det samme.
function fortsaet(kombination) {
  if (Date.now() - sidsteSkift < 1000) return;
  sidsteSkift = Date.now();
  const gammelt = t.state.ur;
  if (!gammelt) return start(kombination);
  const id = newId();
  t.state = skiftUr(t.state, kombination, nuIso(), timeprisPaa(gammelt.kundeId), id, { person: migITeam(), nyId: newId, medlemmer: t.team?.medlemmer ?? null });
  commit();
  gemteBesked(t.state.registreringer.find((r) => r.id === id));
}

// Gemmer uret som registrering. Kun hvis det er det samme ur, der stadig kører,
// så et ark, der lukkes eller trykkes to gange, ikke gemmer to gange.
function gemUr(ur, slut, opgavetypeId, note) {
  if (!t.state.ur || t.state.ur.start !== ur.start || t.state.ur.kundeId !== ur.kundeId) return;
  // Med forskellige ure på to enheder kan sluttiden ligge før starten. Den slags
  // afvises af databasen, så uret stoppes uden at gemme.
  const s = slut > ur.start ? slut : nuIso();
  if (s <= ur.start) {
    t.state.ur = null;
    commit();
    return;
  }
  // Én registrering pr. deltager, ellers én for en selv.
  const nye = registreringerFraUr(ur, { slut: s, timepris: timeprisPaa(ur.kundeId), opgavetypeId, note, person: migITeam(), nyId: newId, medlemmer: t.team?.medlemmer ?? null });
  t.state.registreringer.push(...nye);
  t.state.ur = null;
  commit();
  gemteBesked(nye[0], nye.length);
}

function stop() {
  const ur = t.state.ur;
  if (!ur) return;
  const slut = nuIso();
  if (ur.opgavetypeId) return gemUr(ur, slut, ur.opgavetypeId, ur.note ?? '');
  stopArk(ur, slut);
}

// "Hvad lavede du?" Lukkes arket uden valg, kører uret videre.
function stopArk(ur, slut) {
  const r = { ...ur, slut, timepris: timeprisPaa(ur.kundeId) };
  const note = h('input', { value: ur.note ?? '', autocomplete: 'off', placeholder: 'Valgfri' });
  const gem = (opgavetypeId) => { lukArk(); gemUr(ur, slut, opgavetypeId, note.value.trim()); };
  const nyFelt = h('input', { autocomplete: 'off', placeholder: 'Ny opgave', enterkeyhint: 'done' });
  const tilfoej = () => {
    const navn = nyFelt.value.trim();
    if (!navn) return;
    const fundet = aktive(t.state.opgavetyper).find((x) => x.navn.trim().toLocaleLowerCase('da') === navn.toLocaleLowerCase('da'));
    let id = fundet?.id;
    if (!id) {
      id = newId();
      t.state.opgavetyper.push({ id, navn, arkiveret: false });
    }
    gem(id);
  };
  nyFelt.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); tilfoej(); } });
  const nyRaekke = h('div', { class: 'ny-type', hidden: true }, nyFelt, h('button', { type: 'button', class: 'knap sekundaer lille', onclick: tilfoej }, 'Gem'));
  const typer = aktive(t.state.opgavetyper).sort((a, b) => a.navn.localeCompare(b.navn, 'da'));

  aabnArk(
    arkTop('Hvad lavede du?'),
    h('div', { class: 'stop-top blod', 'data-farve': farvePaa(ur.kundeId) },
      h('span', { class: 'kunde' }, navnPaa(t.state.kunder, ur.kundeId)),
      h('span', { class: 'tid' }, formatDuration(durationMs(r))),
      h('span', {}, formatKr(amountOf(r))),
    ),
    h('div', { class: 'chips', 'data-farve': farvePaa(ur.kundeId) },
      typer.map((x) => chip(x.navn, { onclick: () => gem(x.id) })),
      h('button', {
        type: 'button',
        class: 'chip ny',
        onclick: (e) => { e.currentTarget.hidden = true; nyRaekke.hidden = false; nyFelt.focus(); },
      }, ikon('plus'), 'Ny'),
    ),
    nyRaekke,
    felt('Note', note),
    h('button', { type: 'button', class: 'knap sekundaer', onclick: () => gem('') }, 'Gem uden opgave'),
  );
}

// Skift kunde, opgave eller note for det kørende ur, eller annullér det.
function retUr() {
  const ur = t.state.ur;
  const annuller = h('button', {
    type: 'button',
    class: 'knap fare',
    onclick: () => {
      if (!confirm('Annullér uret uden at gemme?')) return;
      lukArk();
      t.state.ur = null;
      commit();
    },
  }, 'Annullér ur');
  aabnVaelger({ kundeId: ur.kundeId, opgavetypeId: ur.opgavetypeId, knap: 'Gem', note: ur.note ?? '', visNote: true, ekstra: annuller, personer: deltagereAf(ur) }, (v) => {
    if (!t.state.ur || t.state.ur.start !== ur.start) return;
    t.state.ur = medDeltagere({ ...t.state.ur, kundeId: v.kundeId, opgavetypeId: v.opgavetypeId, note: v.note }, v.personer);
    commit();
  });
}

function retStart() {
  const ur = t.state.ur;
  const tid = h('input', { type: 'time', value: klokken(ur.start), 'aria-label': 'Startet' });
  const fejl = h('p', { class: 'fejl' });
  aabnArk(
    h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        if (!t.state.ur || t.state.ur.start !== ur.start) return lukArk();
        if (!tid.value) return (fejl.textContent = 'Vælg et klokkeslæt');
        if (tid.value === klokken(ur.start)) return lukArk();
        const ny = lokalTid(dayKey(ur.start), tid.value);
        if (new Date(ny) > new Date()) return (fejl.textContent = 'Starttiden kan ikke være i fremtiden');
        t.state.ur = { ...t.state.ur, start: ny };
        lukArk();
        commit();
      },
    },
      arkTop('Startet', h('button', { type: 'submit', class: 'tekstknap staerk' }, 'Gem')),
      h('div', { class: 'kort' }, h('div', { class: 'raekke tidsfelter' }, h('span', { class: 'hoved' }, 'Klokken'), tid)),
      fejl,
    ),
  );
}

// --- Skærmen --------------------------------------------------------------------

function urkort() {
  const ur = t.state.ur;
  if (!ur) {
    return h('section', { class: 'urkort tomt' },
      h('span', { class: 'hvad' }, 'Intet ur kører'),
      h('div', { class: 'tid' }, '0:00:00'),
      h('div', { class: 'bund' },
        h('span'),
        h('button', { class: 'knap', onclick: () => aabnVaelger({ knap: 'Start', visNote: true, personer: mineValg() }, start) }, ikon('play'), 'Start ny'),
      ),
    );
  }
  return h('section', { class: 'urkort', 'data-farve': farvePaa(ur.kundeId) },
    h('button', { class: 'hvad', onclick: retUr }, hvadTekst(ur), ikon('ned')),
    ur.deltagere?.length > 0 && h('p', { class: 'note' }, ur.deltagere.map((p) => personNavn(t.team, p)).join(', ')),
    ur.note && h('p', { class: 'note' }, ur.note),
    h('div', { class: 'tid', id: 'ur-tid' }, urTekst(ur.start)),
    h('div', { class: 'bund' },
      h('button', { class: 'startet', onclick: retStart }, `Startet ${klokken(ur.start)}`),
      h('button', { class: 'knap', onclick: stop }, ikon('stop'), 'Stop'),
    ),
  );
}

// Kalder handling efter et langt tryk. Returnerer en funktion, der fortæller,
// om det seneste tryk var langt, så det almindelige klik kan springes over.
function langtTryk(el, handling) {
  let timer;
  let langt = false;
  el.addEventListener('pointerdown', () => {
    langt = false;
    timer = setTimeout(() => { langt = true; navigator.vibrate?.(10); handling(); }, 500);
  });
  for (const e of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(e, () => clearTimeout(timer));
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  return () => langt;
}

function genvejArk(k) {
  aabnArk(
    arkTop('Genvej'),
    h('div', { class: 'stop-top blod', 'data-farve': farvePaa(k.kundeId) },
      h('span', { class: 'kunde' }, navnPaa(t.state.kunder, k.kundeId)),
      h('span', {}, k.opgavetypeId ? navnPaa(t.state.opgavetyper, k.opgavetypeId) : 'Uden opgave'),
    ),
    h('p', { class: 'hjaelp' }, 'Registreringerne bliver liggende. Genvejen kommer igen, næste gang du arbejder på det.'),
    h('button', {
      type: 'button',
      class: 'knap fare',
      onclick: () => {
        t.state.skjult = skjulKombination(t.state.skjult, medPerson(t.state.registreringer, migITeam()), k, nuIso());
        lukArk();
        commit();
      },
    }, 'Fjern fra Start igen'),
  );
}

function genvej(k) {
  let varLangt;
  const knap = h('button', {
    class: 'fortsaet blod',
    'data-farve': farvePaa(k.kundeId),
    onclick: () => { if (!varLangt()) fortsaet(k); },
  },
    h('span', { class: 'kunde' }, navnPaa(t.state.kunder, k.kundeId)),
    h('span', { class: 'opgave' }, k.opgavetypeId ? navnPaa(t.state.opgavetyper, k.opgavetypeId) : 'Uden opgave'),
    h('span', { class: 'siden' }, sidenTekst(k.sidst)),
    ikon('play'),
  );
  varLangt = langtTryk(knap, () => genvejArk(k));
  return knap;
}

function fortsaetFelter() {
  // I et team bygger genvejene på ens egne registreringer.
  const kombinationer = senesteKombinationer(medPerson(t.state.registreringer, migITeam()), t.state.kunder, t.state.opgavetyper, t.state.ur, 4, t.state.skjult);
  return [
    h('h2', {}, 'Start igen'),
    kombinationer.length
      ? [
        h('div', { class: 'felt-gitter' }, kombinationer.map(genvej)),
        h('p', { class: 'hjaelp genvej-hjaelp' }, 'Hold fingeren på en genvej for at fjerne den.'),
      ]
      : h('p', { class: 'hjaelp' }, 'Når du har stoppet et ur, ligger det her, så du kan starte det igen med ét tryk.'),
  ];
}

function dagensTotal() {
  const i = dayKey(new Date());
  let ms = t.state.registreringer.filter((r) => dayKey(r.start) === i).reduce((s, r) => s + durationMs(r), 0);
  if (t.state.ur) ms += Math.max(0, Date.now() - new Date(t.state.ur.start));
  return formatDuration(ms);
}

function iDag() {
  const i = dayKey(new Date());
  const dagens = t.state.registreringer
    .filter((r) => dayKey(r.start) === i)
    .sort((a, b) => new Date(b.start) - new Date(a.start));
  const poster = t.state.poster.filter((p) => p.dato === i);
  return [
    h('h2', { class: 'sektion-top' }, h('span', {}, 'I dag'), h('span', { class: 'tal total-i-dag', id: 'dag-total' }, dagensTotal())),
    (dagens.length || poster.length) && h('div', { class: 'kort' }, dagens.map((e) => registreringsRaekke(e)), poster.map((p) => postRaekke(p))),
    h('button', { class: 'tekstknap tilfoej', onclick: () => aabnTilfoej(() => aabnRegistrering()) }, ikon('plus'), 'Tilføj'),
  ];
}

export function visTid() {
  return [urkort(), fortsaetFelter(), iDag()];
}

setInterval(() => {
  if (!t.state?.ur) return;
  const ur = document.getElementById('ur-tid');
  if (ur) ur.textContent = urTekst(t.state.ur.start);
  const dag = document.getElementById('dag-total');
  if (dag) dag.textContent = dagensTotal();
}, 1000);
