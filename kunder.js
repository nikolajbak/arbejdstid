// Fanen Kunder: hvad hver kunde skylder, og pr. kunde opgaver, udestående og afregninger.

import { POST_TYPER, dayKey, formatDuration, formatKr, kundeOversigt, personNavn, toCSV } from './core.js';
import { t, render, gaaTil, kundePaa } from './tilstand.js';
import { h, downloadFile, ikon, prik } from './ui.js';
import { registreringsRaekke } from './registrering.js';
import { aabnPost, postRaekke } from './post.js';
import { redigerKunde } from './indstillinger.js';

// Den åbne kunde, eller null for listen. Nulstilles ved skift af arbejdssted.
let valgt = null;
let valgtSted = null;

export function aabnKunde(id) {
  valgt = id;
  valgtSted = t.arbejdssted;
  gaaTil('kunder');
}

const vis = (id) => () => { valgt = id; render(); window.scrollTo(0, 0); };

// Året vises kun, når det ikke er i år.
const aar = (dag) => (dag.slice(0, 4) === String(new Date().getFullYear()) ? {} : { year: 'numeric' });
const langDato = (dag) => new Date(`${dag}T12:00`).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', ...aar(dag) });
const dagTekst = (dag) => {
  const s = new Date(`${dag}T12:00`).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long', ...aar(dag) });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const navnPaaKunde = (id) => kundePaa(id)?.navn ?? '(slettet)';

const saldoTekst = (saldo) => (saldo >= 0.005 ? 'Skylder' : saldo <= -0.005 ? 'Til gode' : 'Alt afregnet');

function betaling(kundeId, saldo) {
  aabnPost(null, { type: 'betaling', kundeId, beloeb: saldo > 0 ? Math.round(saldo * 100) / 100 : undefined });
}

// --- Listen -----------------------------------------------------------------------

function kundeListe() {
  const alle = new Set([...t.state.kunder.filter((k) => !k.arkiveret).map((k) => k.id), ...t.state.registreringer.map((r) => r.kundeId), ...t.state.poster.map((p) => p.kundeId)]);
  const kunder = [...alle].map((id) => ({ id, navn: navnPaaKunde(id), o: kundeOversigt(id, t.state.registreringer, t.state.poster, t.state.opgavetyper) }))
    // Arkiverede og slettede kunder vises kun, mens der er noget udestående.
    .filter((k) => (kundePaa(k.id) && !kundePaa(k.id).arkiveret) || Math.abs(k.o.saldo) >= 0.005);
  if (!kunder.length) return h('p', { class: 'tom' }, 'Ingen kunder endnu. Opret dem under Indstillinger.');
  const skylder = kunder.filter((k) => k.o.saldo >= 0.005).sort((a, b) => b.o.saldo - a.o.saldo);
  const resten = kunder.filter((k) => k.o.saldo < 0.005).sort((a, b) => a.navn.localeCompare(b.navn, 'da'));
  const iAlt = skylder.reduce((n, k) => n + k.o.saldo, 0);
  const raekke = (k) => h('button', { class: 'raekke', onclick: vis(k.id) },
    prik(kundePaa(k.id) ?? { id: k.id }),
    h('span', { class: 'hoved' },
      h('span', { class: 'titel' }, k.navn),
      h('span', { class: 'under' }, k.o.afregnetTil ? `Afregnet t.o.m. ${langDato(k.o.afregnetTil)}` : k.o.udestaaende.length ? 'Intet afregnet endnu' : 'Ingen åbne poster')),
    h('span', { class: 'tal' },
      Math.abs(k.o.saldo) >= 0.005 && h('span', { class: 'titel' }, formatKr(Math.abs(k.o.saldo))),
      h('span', { class: 'under' }, saldoTekst(k.o.saldo))),
    ikon('hoejre'),
  );
  return [
    h('section', { class: 'kort kunde-total' },
      h('span', { class: 'under' }, 'Udestående i alt'),
      h('span', { class: 'stor' }, formatKr(iAlt)),
      h('span', { class: 'under' }, skylder.length === 1 ? '1 kunde skylder' : `${skylder.length} kunder skylder`),
    ),
    skylder.length > 0 && [h('h3', { class: 'dag' }, h('span', {}, 'Skylder')), h('div', { class: 'kort' }, skylder.map(raekke))],
    resten.length > 0 && [h('h3', { class: 'dag' }, h('span', {}, skylder.length ? 'Øvrige' : 'Kunder')), h('div', { class: 'kort' }, resten.map(raekke))],
  ];
}

// --- Én kunde ---------------------------------------------------------------------

// Linjer grupperet pr. dag i den rækkefølge, de kommer.
function dagGrupper(linjer, status) {
  const dage = [];
  for (const l of linjer) {
    if (dage.at(-1)?.dag !== l.dag) dage.push({ dag: l.dag, linjer: [] });
    dage.at(-1).linjer.push(l);
  }
  return dage.map((d) => [
    h('h3', { class: 'dag' }, h('span', {}, dagTekst(d.dag))),
    h('div', { class: 'kort' }, d.linjer.map((l) => (l.slags === 'registrering' ? registreringsRaekke(l.x, status.get(l.x.id)) : postRaekke(l.x, status.get(l.x.id))))),
  ]);
}

function sektion(titel, tal) {
  return h('h2', { class: 'sektion-top' }, h('span', {}, titel), tal && h('span', { class: 'tal total-i-dag' }, tal));
}

function kundeSide(id) {
  const kunde = kundePaa(id);
  const o = kundeOversigt(id, t.state.registreringer, t.state.poster, t.state.opgavetyper);
  const csv = () => downloadFile(
    `arbejdstid-${navnPaaKunde(id).replace(/[^\p{L}\p{N}]+/gu, '-')}-udestaaende-${dayKey(new Date())}.csv`,
    toCSV(o.udestaaende.filter((l) => l.slags === 'registrering').map((l) => l.x), t.state.kunder, t.state.opgavetyper,
      o.udestaaende.filter((l) => l.slags === 'post').map((l) => l.x), t.team ? (p) => personNavn(t.team, p) : null),
    'text/csv;charset=utf-8',
  );
  const msIAlt = o.opgaver.reduce((n, x) => n + x.ms, 0);
  return [
    h('button', { class: 'tekstknap tilbage', onclick: vis(null) }, ikon('venstre'), 'Kunder'),
    h('section', { class: 'kort kunde-hoved' },
      h('div', { class: 'kunde-navn' },
        prik(kunde ?? { id }),
        h('h2', {}, navnPaaKunde(id)),
        kunde?.timepris != null && h('span', { class: 'under tal' }, `${formatKr(kunde.timepris)}/t`),
      ),
      h('span', { class: 'under' }, saldoTekst(o.saldo)),
      h('span', { class: 'stor' }, formatKr(Math.abs(o.saldo))),
      h('span', { class: 'under' }, o.afregnetTil ? `Afregnet t.o.m. ${langDato(o.afregnetTil)}` : o.udestaaende.length ? 'Intet afregnet endnu' : null),
      h('div', { class: 'handlinger' },
        h('button', { class: 'knap', onclick: () => betaling(id, o.saldo) }, 'Registrér betaling'),
        h('div', { class: 'to' },
          o.udestaaende.length > 0 && h('button', { class: 'knap sekundaer lille', onclick: csv }, 'Eksportér CSV'),
          kunde && h('button', { class: 'knap sekundaer lille', onclick: () => redigerKunde(kunde) }, 'Redigér kunde'),
        ),
      ),
    ),

    sektion('Opgaver', msIAlt > 0 && formatDuration(msIAlt)),
    o.opgaver.length
      ? h('div', { class: 'kort' }, o.opgaver.map((x) => h('div', { class: 'raekke' },
        h('span', { class: 'hoved' },
          h('span', { class: 'titel' }, x.navn),
          h('span', { class: 'under' }, x.aabent >= 0.005 ? h('span', { class: 'aaben' }, `${formatKr(x.aabent)} udestående`) : h('span', { class: 'afregnet' }, 'Afregnet'))),
        h('span', { class: 'tal' }, h('span', { class: 'titel' }, formatDuration(x.ms)), h('span', { class: 'under' }, formatKr(x.kr))),
      )))
      : h('p', { class: 'tom' }, 'Ingen tid registreret.'),

    sektion('Udestående', o.udestaaendeKr >= 0.005 && formatKr(o.udestaaendeKr)),
    o.udestaaende.length
      ? [h('p', { class: 'hjaelp' }, 'Ældste først. Næste betaling dækker det øverste.'), dagGrupper(o.udestaaende, o.status)]
      : h('p', { class: 'tom' }, 'Intet udestående.'),

    sektion('Afregninger', o.betalt >= 0.005 && formatKr(o.betalt)),
    o.afregninger.length
      ? h('div', { class: 'kort' }, o.afregninger.map((p) => h('button', { class: 'raekke', onclick: () => aabnPost(p) },
        h('span', { class: 'hoved' },
          h('span', { class: 'titel' }, POST_TYPER[p.type]),
          h('span', { class: 'under' }, langDato(p.dato), p.note && ` · ${p.note}`)),
        h('span', { class: 'tal' }, h('span', { class: 'titel' }, formatKr(p.beloeb))),
      )))
      : h('p', { class: 'tom' }, 'Ingen betalinger endnu.'),

    o.afregnet.length > 0 && h('details', { class: 'afregnet-liste' },
      h('summary', { class: 'tekstknap' }, `Vis afregnet (${o.afregnet.length})`, ikon('ned')),
      dagGrupper(o.afregnet, o.status),
    ),
  ];
}

export function visKunder() {
  if (valgtSted !== t.arbejdssted) {
    valgtSted = t.arbejdssted;
    valgt = null;
  }
  const findes = valgt && (kundePaa(valgt) || t.state.registreringer.some((r) => r.kundeId === valgt) || t.state.poster.some((p) => p.kundeId === valgt));
  return findes ? kundeSide(valgt) : kundeListe();
}
