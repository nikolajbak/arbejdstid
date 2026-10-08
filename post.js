// Arket for en post (udgift, brændstof, kontantudlæg eller betaling) og rækken i lister.

import { POST_TYPER, dayKey, farveFor, formatKr, parseNumber, postBeloeb } from './core.js';
import { newId } from './store.js';
import { t, commit, aendr, kundePaa } from './tilstand.js';
import { h, aabnArk, lukArk, arkTop, chip, felt, ikon, prik, navnPaa } from './ui.js';
import { aabnVaelger } from './vaelger.js';

const kr = (n) => String(n).replace('.', ',');

export function postRaekke(p) {
  const beloeb = postBeloeb(p);
  return h('button', { class: 'raekke', 'data-farve': farveFor(kundePaa(p.kundeId) ?? { id: p.kundeId }), onclick: () => aabnPost(p) },
    h('span', { class: 'streg' }),
    h('span', { class: 'hoved' },
      h('span', { class: 'titel' }, `${POST_TYPER[p.type]} · ${navnPaa(t.state.kunder, p.kundeId)}`),
      p.note && h('span', { class: 'under' }, p.note),
    ),
    h('span', { class: 'tal' }, h('span', { class: 'titel' }, `${beloeb < 0 ? '−' : '+'}${formatKr(Math.abs(beloeb))}`)),
  );
}

// forvalg: { type, kundeId, beloeb } for en ny post.
export function aabnPost(post, forvalg = {}) {
  const ny = !post;
  const valg = {
    type: post?.type ?? forvalg.type ?? 'udgift',
    kundeId: post?.kundeId ?? forvalg.kundeId ?? '',
  };
  const startBeloeb = post?.beloeb ?? forvalg.beloeb;

  const dato = h('input', { type: 'date', value: post?.dato ?? dayKey(new Date()), 'aria-label': 'Dato' });
  const beloeb = h('input', { inputmode: 'decimal', autocomplete: 'off', placeholder: 'fx 450', value: startBeloeb ? kr(startBeloeb) : '' });
  const note = h('textarea', { value: post?.note ?? '', placeholder: 'Valgfri' });
  const fejl = h('p', { class: 'fejl' });
  const typer = h('div', { class: 'chips' });
  const kundeRaekke = h('div', { class: 'kort' });
  const titel = h('h3', {});

  function tegnTyper() {
    titel.textContent = POST_TYPER[valg.type];
    typer.replaceChildren(...Object.entries(POST_TYPER).map(([type, navn]) => chip(navn, {
      valgt: type === valg.type,
      onclick: () => { valg.type = type; tegnTyper(); },
    })));
  }

  function tegnKunde() {
    const kunde = kundePaa(valg.kundeId);
    kundeRaekke.replaceChildren(h('button', {
      type: 'button',
      class: 'raekke',
      onclick: () => aabnVaelger({ kundeId: valg.kundeId, knap: 'Vælg', udenOpgave: true }, (v) => { valg.kundeId = v.kundeId; tegnKunde(); }),
    },
    valg.kundeId ? prik(kunde ?? { id: valg.kundeId }) : null,
    h('span', { class: 'hoved' }, h('span', { class: 'under' }, 'Kunde'),
      h('span', { class: 'titel' }, valg.kundeId ? navnPaa(t.state.kunder, valg.kundeId) : 'Vælg kunde')),
    ikon('hoejre')));
  }

  function gem(e) {
    e.preventDefault();
    fejl.textContent = '';
    if (!valg.kundeId) return (fejl.textContent = 'Vælg en kunde');
    if (!dato.value) return (fejl.textContent = 'Vælg en dato');
    const b = parseNumber(beloeb.value);
    if (b === null || b <= 0) return (fejl.textContent = 'Skriv et beløb over 0');
    const data = { kundeId: valg.kundeId, type: valg.type, dato: dato.value, beloeb: b, note: note.value.trim() };
    if (ny) t.state.poster.push({ id: newId(), ...data });
    else aendr('poster', post, data);
    lukArk();
    commit();
  }

  function slet() {
    if (!confirm('Slet posten?')) return;
    t.state.poster = t.state.poster.filter((p) => p.id !== post.id);
    lukArk();
    commit();
  }

  tegnTyper();
  tegnKunde();
  aabnArk(
    h('form', { onsubmit: gem },
      h('div', { class: 'ark-top' },
        h('button', { type: 'button', class: 'tekstknap', onclick: lukArk }, 'Annullér'),
        titel,
        h('button', { type: 'submit', class: 'tekstknap staerk' }, 'Gem')),
      typer,
      kundeRaekke,
      h('div', { class: 'kort' },
        h('div', { class: 'raekke tidsfelter' }, h('span', { class: 'hoved' }, 'Dato'), dato),
      ),
      felt('Beløb i kr', beloeb),
      h('p', { class: 'hjaelp' }, 'Beløb ekskl. moms.'),
      felt('Note', note),
      fejl,
      !ny && h('button', { class: 'knap fare', type: 'button', onclick: slet }, 'Slet posten'),
    ),
  );
}

// Valget bag "+ Tilføj" på Tid-skærmen.
export function aabnTilfoej(aabnTid) {
  const valg = (tekst, handling) => h('button', { type: 'button', class: 'raekke', onclick: () => { lukArk(); handling(); } },
    h('span', { class: 'hoved' }, h('span', { class: 'titel' }, tekst)), ikon('hoejre'));
  aabnArk(
    arkTop('Tilføj'),
    h('div', { class: 'kort' },
      valg('Tid', aabnTid),
      ...Object.entries(POST_TYPER).map(([type, navn]) => valg(navn, () => aabnPost(null, { type }))),
    ),
  );
}
