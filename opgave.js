// Fremtidige opgaver på en kunde: arket og listen på kundesiden.
// En opgave starter som idé, godkendes til udførsel og markeres til sidst udført.

import { OPGAVE_NIVEAUER, dayKey } from './core.js';
import { newId } from './store.js';
import { t, commit, erstat } from './tilstand.js';
import { h, aabnArk, lukArk, chip, felt, ikon } from './ui.js';

// Næste niveau og teksten på knappen, der flytter opgaven dertil.
const NAESTE = { ide: ['godkendt', 'Godkend'], godkendt: ['udfoert', 'Udført'] };

const kortDato = (dag) => new Date(`${dag}T12:00`).toLocaleDateString('da-DK', {
  day: 'numeric', month: 'short', ...(dag.slice(0, 4) === String(new Date().getFullYear()) ? {} : { year: 'numeric' }),
});

// Datoen følger niveauet: hvornår opgaven blev noteret, godkendt eller udført.
const DATO_TEKST = { ide: 'Noteret', godkendt: 'Godkendt', udfoert: 'Udført' };

function flyt(o, niveau) {
  erstat('opgaver', { ...(t.state.opgaver.find((x) => x.id === o.id) ?? o), niveau, dato: dayKey(new Date()) });
  commit();
}

// forvalg: { kundeId, niveau } for en ny opgave.
export function aabnOpgave(opgave, forvalg = {}) {
  const ny = !opgave;
  let niveau = opgave?.niveau ?? forvalg.niveau ?? 'ide';
  const titel = h('input', { value: opgave?.titel ?? '', placeholder: 'fx Nyt tag på carporten', autocomplete: 'off' });
  const note = h('textarea', { value: opgave?.note ?? '', placeholder: 'Valgfri' });
  const niveauer = h('div', { class: 'chips' });
  const fejl = h('p', { class: 'fejl' });

  function tegnNiveauer() {
    niveauer.replaceChildren(...Object.entries(OPGAVE_NIVEAUER).map(([n, navn]) => chip(navn, {
      valgt: n === niveau,
      onclick: () => { niveau = n; tegnNiveauer(); },
    })));
  }

  function gem(e) {
    e.preventDefault();
    if (!titel.value.trim()) return (fejl.textContent = 'Skriv, hvad opgaven går ud på');
    const data = { titel: titel.value.trim(), note: note.value.trim(), niveau };
    if (ny) t.state.opgaver.push({ id: newId(), kundeId: forvalg.kundeId, ...data, dato: dayKey(new Date()) });
    else {
      // Arket kan holde en ældre kopi, hvis der er kommet data fra en anden enhed.
      const aktuel = t.state.opgaver.find((x) => x.id === opgave.id) ?? opgave;
      erstat('opgaver', { ...aktuel, ...data, dato: niveau === aktuel.niveau ? aktuel.dato : dayKey(new Date()) });
    }
    lukArk();
    commit();
  }

  function slet() {
    if (!confirm('Slet opgaven?')) return;
    t.state.opgaver = t.state.opgaver.filter((x) => x.id !== opgave.id);
    lukArk();
    commit();
  }

  tegnNiveauer();
  aabnArk(
    h('form', { onsubmit: gem },
      h('div', { class: 'ark-top' },
        h('button', { type: 'button', class: 'tekstknap', onclick: lukArk }, 'Annullér'),
        h('h3', {}, ny ? 'Ny opgave' : 'Opgave'),
        h('button', { type: 'submit', class: 'tekstknap staerk' }, 'Gem')),
      felt('Opgave', titel),
      niveauer,
      felt('Note', note),
      fejl,
      !ny && h('button', { class: 'knap fare', type: 'button', onclick: slet }, 'Slet opgaven'),
    ),
  );
  if (ny) titel.focus();
}

function opgaveRaekke(o) {
  const naeste = NAESTE[o.niveau];
  return h('div', { class: 'raekke opgave' },
    h('button', { type: 'button', class: 'hoved', onclick: () => aabnOpgave(o) },
      h('span', { class: 'titel' }, o.titel),
      h('span', { class: 'under' }, `${DATO_TEKST[o.niveau]} ${kortDato(o.dato)}`, o.note && ` · ${o.note}`)),
    naeste && h('button', { type: 'button', class: 'knap sekundaer lille', onclick: () => flyt(o, naeste[0]) }, naeste[1]),
  );
}

// Listen på kundesiden: idéer og godkendte opgaver, og de udførte foldet sammen.
export function opgaveListe(kundeId, kanTilfoeje) {
  const alle = (t.state.opgaver ?? []).filter((o) => o.kundeId === kundeId);
  const paa = (niveau, nyesteFoerst = false) => alle.filter((o) => o.niveau === niveau)
    .sort((a, b) => (nyesteFoerst ? b.dato.localeCompare(a.dato) : a.dato.localeCompare(b.dato)) || a.titel.localeCompare(b.titel, 'da'));
  const ideer = paa('ide');
  const godkendte = paa('godkendt');
  const udfoerte = paa('udfoert', true);
  const gruppe = (titel, liste) => liste.length > 0 && [
    h('h3', { class: 'dag' }, h('span', {}, titel), h('span', { class: 'tal' }, String(liste.length))),
    h('div', { class: 'kort' }, liste.map(opgaveRaekke)),
  ];
  return [
    !alle.length && h('p', { class: 'hjaelp' }, 'Skriv idéer ned, godkend dem til udførsel, og markér dem udført, når de er lavet.'),
    gruppe('Godkendt til udførsel', godkendte),
    gruppe('Idéer', ideer),
    kanTilfoeje && h('button', { class: 'tekstknap tilfoej', onclick: () => aabnOpgave(null, { kundeId }) }, ikon('plus'), 'Ny idé'),
    udfoerte.length > 0 && h('details', { class: 'afregnet-liste' },
      h('summary', { class: 'tekstknap' }, `Vis udførte (${udfoerte.length})`, ikon('ned')),
      h('div', { class: 'kort' }, udfoerte.map(opgaveRaekke)),
    ),
  ];
}
