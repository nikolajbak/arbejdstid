// Arket for en post (udgift, brændstof, kontantudlæg eller betaling) og rækken i lister.

import { POST_TYPER, dayKey, farveFor, formatKr, markerRettelse, parseNumber, personNavn, postBeloeb } from './core.js';
import { newId } from './store.js';
import { t, commit, erstat, kundePaa, migITeam } from './tilstand.js';
import { h, aabnArk, lukArk, arkTop, chip, felt, ikon, prik, navnPaa, afregnetMaerke, ventendeMaerke } from './ui.js';
import { aabnVaelger } from './vaelger.js';

const kr = (n) => String(n).replace('.', ',');

// En ventende post viser, hvem den venter på, i stedet for afregnet-mærket.
export function postRaekke(p, status) {
  const beloeb = postBeloeb(p);
  const maerke = ventendeMaerke(p) ?? afregnetMaerke(status);
  return h('button', { class: p.afventer ? 'raekke venter' : 'raekke', 'data-farve': farveFor(kundePaa(p.kundeId) ?? { id: p.kundeId }), onclick: () => aabnPost(p) },
    h('span', { class: 'streg' }),
    h('span', { class: 'hoved' },
      h('span', { class: 'titel' }, `${POST_TYPER[p.type]} · ${navnPaa(t.state.kunder, p.kundeId)}`),
      (maerke || p.note) && h('span', { class: 'under' }, maerke, maerke && p.note && ' · ', p.note),
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
    // Kun i et team: hvem der har afholdt udgiften. Én person, ellers tæller den flere gange.
    person: t.team ? (post?.person ?? t.bruger.uid) : null,
  };
  const startBeloeb = post?.beloeb ?? forvalg.beloeb;

  const dato = h('input', { type: 'date', value: post?.dato ?? dayKey(new Date()), 'aria-label': 'Dato' });
  const beloeb = h('input', { inputmode: 'decimal', autocomplete: 'off', placeholder: 'fx 450', value: startBeloeb ? kr(startBeloeb) : '' });
  const note = h('textarea', { value: post?.note ?? '', placeholder: 'Valgfri' });
  const fejl = h('p', { class: 'fejl' });
  const typer = h('div', { class: 'chips' });
  const kundeRaekke = h('div', { class: 'kort' });
  const titel = h('h3', {});
  const hvem = h('div', { class: 'post-hvem' });

  function tegnTyper() {
    titel.textContent = POST_TYPER[valg.type];
    typer.replaceChildren(...Object.entries(POST_TYPER).map(([type, navn]) => chip(navn, {
      valgt: type === valg.type,
      onclick: () => { valg.type = type; tegnTyper(); },
    })));
    tegnHvem();
  }

  // En betaling er kundens, ikke en persons, så Hvem forsvinder ved Betaling.
  function tegnHvem() {
    hvem.hidden = !valg.person || valg.type === 'betaling';
    if (hvem.hidden) return hvem.replaceChildren();
    const uid = t.bruger.uid;
    // Man selv først, så de andre efter navn, som i vælgeren. En fjernet person på en gammel post vises også.
    const alle = [...new Set([...t.team.medlemmer, valg.person])]
      .sort((a, b) => (a === uid ? -1 : b === uid ? 1 : personNavn(t.team, a).localeCompare(personNavn(t.team, b), 'da')));
    hvem.replaceChildren(
      h('div', { class: 'ark-overskrift' }, h('h3', {}, 'Hvem')),
      h('div', { class: 'chips' }, alle.map((p) => chip(p === uid ? `${personNavn(t.team, p)} (dig)` : personNavn(t.team, p), {
        valgt: p === valg.person,
        onclick: () => { valg.person = p; tegnHvem(); },
      }))),
    );
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
    if (b === null || b <= 0) return (fejl.textContent = 'Skriv et beløb over 0, fx 1250 eller 1.250,00');
    const data = { kundeId: valg.kundeId, type: valg.type, dato: dato.value, beloeb: b, note: note.value.trim() };
    // En betaling har ingen person; en udgift for en anden venter på dennes godkendelse.
    const person = valg.person && valg.type !== 'betaling' ? { person: valg.person } : {};
    if (ny) t.state.poster.push(markerRettelse({ id: newId(), ...data, ...person }, migITeam()));
    else {
      // Arket kan holde en ældre kopi, hvis der er kommet data fra en anden enhed.
      const { person: _, ...aktuel } = t.state.poster.find((p) => p.id === post.id) ?? post;
      erstat('poster', markerRettelse({ ...aktuel, ...data, ...person }, migITeam()));
    }
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
      hvem,
      h('div', { class: 'kort' },
        h('div', { class: 'raekke tidsfelter' }, h('span', { class: 'hoved' }, 'Dato'), dato),
      ),
      felt('Beløb i kr', beloeb),
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
