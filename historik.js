// Fanen Historik: periode, overblik pr. kunde og registreringer dag for dag.

import { dayKey, farveFor, formatDuration, formatKr, groupByDay, inPeriod, monthRange, summarize, toCSV } from './core.js';
import { t, render, kundePaa } from './tilstand.js';
import { h, aabnArk, lukArk, arkTop, downloadFile, felt, ikon, prik } from './ui.js';
import { registreringsRaekke } from './registrering.js';

const DAG_MS = 86400000;

// { type: 'maaned' | 'uge', offset } eller { type: 'egen', fra, til } (datoer som 'YYYY-MM-DD', begge med).
let periode = { type: 'maaned', offset: 0 };

function ugeRange(offset) {
  const i = new Date();
  const from = new Date(i.getFullYear(), i.getMonth(), i.getDate() - ((i.getDay() + 6) % 7) + offset * 7);
  return { from, to: new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7) };
}

function graenser() {
  if (periode.type === 'uge') return ugeRange(periode.offset);
  if (periode.type === 'egen') {
    const from = new Date(`${periode.fra}T00:00`);
    const to = new Date(`${periode.til}T00:00`);
    to.setDate(to.getDate() + 1); // til-datoen er med
    return { from, to };
  }
  return monthRange(new Date(), periode.offset);
}

const kortDato = (d) => d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });

function titel({ from, to }) {
  if (periode.type === 'maaned') {
    const s = from.toLocaleDateString('da-DK', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  const sidste = new Date(to.getTime() - DAG_MS);
  if (periode.type === 'uge' && periode.offset === 0) return 'Denne uge';
  return `${kortDato(from)} – ${kortDato(sidste)}`;
}

function vaelgPeriode(ny) {
  periode = ny;
  lukArk();
  render();
}

function periodeArk() {
  const i = dayKey(new Date());
  const fra = h('input', { type: 'date', value: periode.type === 'egen' ? periode.fra : i, 'aria-label': 'Fra' });
  const til = h('input', { type: 'date', value: periode.type === 'egen' ? periode.til : i, 'aria-label': 'Til og med' });
  const fejl = h('p', { class: 'fejl' });
  const valg = (tekst, ny) => h('button', { class: 'raekke', onclick: () => vaelgPeriode(ny) }, h('span', { class: 'hoved' }, h('span', { class: 'titel' }, tekst)));
  aabnArk(
    arkTop('Periode'),
    h('div', { class: 'kort' },
      valg('Denne uge', { type: 'uge', offset: 0 }),
      valg('Denne måned', { type: 'maaned', offset: 0 }),
      valg('Sidste måned', { type: 'maaned', offset: -1 }),
    ),
    h('div', { class: 'ark-overskrift' }, h('h3', {}, 'Egen periode')),
    h('div', { class: 'kort' },
      h('div', { class: 'raekke tidsfelter' }, h('span', { class: 'hoved' }, 'Fra'), fra),
      h('div', { class: 'raekke tidsfelter' }, h('span', { class: 'hoved' }, 'Til og med'), til),
    ),
    fejl,
    h('button', {
      class: 'knap',
      onclick: () => {
        if (!fra.value || !til.value) return (fejl.textContent = 'Vælg en fra- og til-dato');
        if (til.value < fra.value) return (fejl.textContent = 'Til-datoen skal være efter fra-datoen');
        vaelgPeriode({ type: 'egen', fra: fra.value, til: til.value });
      },
    }, 'Vis periode'),
  );
}

function periodeVaelger(g) {
  const kanSkifte = periode.type !== 'egen';
  const skift = (n) => { periode = { ...periode, offset: periode.offset + n }; render(); };
  return h('div', { class: 'periode' },
    h('button', { class: 'pil', 'aria-label': 'Forrige', disabled: !kanSkifte, onclick: () => skift(-1) }, ikon('venstre')),
    h('button', { class: 'navn', onclick: periodeArk }, titel(g), ikon('ned')),
    h('button', { class: 'pil', 'aria-label': 'Næste', disabled: !kanSkifte, onclick: () => skift(1) }, ikon('hoejre')),
  );
}

function overblik(entries, g) {
  const s = summarize(entries, t.state.kunder, t.state.opgavetyper);
  const farve = (id) => farveFor(kundePaa(id) ?? { id });
  const sidsteDag = new Date(g.to.getTime() - DAG_MS);
  const filnavn = `arbejdstid-${dayKey(g.from)}_${dayKey(sidsteDag)}.csv`;
  const efterTid = [...s.kunder].sort((a, b) => b.ms - a.ms);
  return h('section', { class: 'kort overblik' },
    h('div', { class: 'total' },
      h('span', { class: 'stor' }, formatDuration(s.ms)),
      h('span', { class: 'kr' }, formatKr(s.kr)),
    ),
    h('div', { class: 'bjaelke', role: 'img', 'aria-label': 'Fordeling af tid pr. kunde' },
      efterTid.map((k) => h('span', { 'data-farve': farve(k.kundeId), style: `flex: ${k.ms}` })),
    ),
    efterTid.map((k) => h('details', {},
      h('summary', { class: 'raekke' },
        prik(farve(k.kundeId)),
        h('span', { class: 'hoved' }, h('span', { class: 'titel' }, k.navn)),
        h('span', { class: 'tal' }, h('span', { class: 'titel' }, formatDuration(k.ms)), h('span', { class: 'under' }, formatKr(k.kr))),
        ikon('ned'),
      ),
      k.typer.map((x) => h('div', { class: 'raekke under-raekke' },
        h('span', { class: 'hoved' }, x.navn),
        h('span', { class: 'tal' }, `${formatDuration(x.ms)} · ${formatKr(x.kr)}`),
      )),
    )),
    h('div', { class: 'fod' },
      h('button', {
        class: 'knap sekundaer',
        onclick: () => downloadFile(filnavn, toCSV(entries, t.state.kunder, t.state.opgavetyper), 'text/csv;charset=utf-8'),
      }, 'Eksportér CSV'),
      h('p', { class: 'hjaelp' }, 'Beløb er ekskl. moms.'),
    ),
  );
}

function dagOverskrift(dag) {
  const s = new Date(`${dag}T12:00`).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function visHistorik() {
  const g = graenser();
  const entries = t.state.registreringer.filter((e) => inPeriod(e, g.from, g.to));
  if (!entries.length) return [periodeVaelger(g), h('p', { class: 'tom' }, 'Ingen tid registreret i perioden.')];
  return [
    periodeVaelger(g),
    overblik(entries, g),
    groupByDay(entries).map((d) => [
      h('h3', { class: 'dag' }, h('span', {}, dagOverskrift(d.dag)), h('span', { class: 'tal' }, formatDuration(d.ms))),
      h('div', { class: 'kort' }, d.entries.map(registreringsRaekke)),
    ]),
  ];
}
