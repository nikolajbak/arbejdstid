// Rettearket for en registrering ("Tilføj tid" og ret) og rækken i lister.

import { amountOf, dayKey, durationMs, farveFor, forPersoner, formatDuration, formatKr, medPerson, parseNumber, personNavn, senesteKombinationer, validateEntry } from './core.js';
import { newId } from './store.js';
import { t, commit, aendr, kundePaa, migITeam } from './tilstand.js';
import { h, aabnArk, lukArk, arkTop, felt, ikon, prik, klokken, lokalTid, navnPaa } from './ui.js';
import { aabnVaelger } from './vaelger.js';

const FEM_MIN = 5 * 60000;
const nedTil5 = (ms) => Math.floor(ms / FEM_MIN) * FEM_MIN;

// "Kunde · Opgave", eller kun kunden, når der ikke er en opgave.
export function hvadTekst({ kundeId, opgavetypeId }) {
  const kunde = navnPaa(t.state.kunder, kundeId);
  return opgavetypeId ? `${kunde} · ${navnPaa(t.state.opgavetyper, opgavetypeId)}` : kunde;
}

export function registreringsRaekke(e) {
  return h('button', { class: 'raekke', 'data-farve': farveFor(kundePaa(e.kundeId) ?? { id: e.kundeId }), onclick: () => aabnRegistrering(e) },
    h('span', { class: 'streg' }),
    h('span', { class: 'hoved' },
      h('span', { class: 'titel' }, hvadTekst(e)),
      h('span', { class: 'under' }, `${t.team && e.person ? `${personNavn(t.team, e.person)} · ` : ''}${klokken(e.start)}–${klokken(e.slut)}${e.note ? ` · ${e.note}` : ''}`),
    ),
    h('span', { class: 'tal' },
      h('span', { class: 'titel' }, formatDuration(durationMs(e))),
      h('span', { class: 'under' }, formatKr(amountOf(e))),
    ),
  );
}

export function aabnRegistrering(entry) {
  const ny = !entry;
  const nu = Date.now();
  const fraStart = new Date(nedTil5(nu) - 3600000);
  const seneste = senesteKombinationer(medPerson(t.state.registreringer, migITeam()), t.state.kunder, t.state.opgavetyper, null, 1)[0];
  const valg = {
    kundeId: entry?.kundeId ?? seneste?.kundeId ?? '',
    opgavetypeId: entry?.opgavetypeId ?? seneste?.opgavetypeId ?? '',
    // Kun i et team: hvem tiden gælder for. En eksisterende registrering har én person.
    personer: t.team ? (entry ? [entry.person ?? t.bruger.uid] : [t.bruger.uid]) : null,
  };

  const dato = h('input', { type: 'date', value: dayKey(entry?.start ?? fraStart), 'aria-label': 'Dato' });
  const fra = h('input', { type: 'time', value: klokken(entry?.start ?? fraStart), 'aria-label': 'Fra' });
  const til = h('input', { type: 'time', value: klokken(entry?.slut ?? new Date(nedTil5(nu))), 'aria-label': 'Til' });
  const pris = h('input', { inputmode: 'decimal', value: entry ? String(entry.timepris).replace('.', ',') : '' });
  const note = h('textarea', { value: entry?.note ?? '', placeholder: 'Valgfri' });
  const fejl = h('p', { class: 'fejl' });
  const valgRaekker = h('div', { class: 'kort' });

  function vaelg() {
    aabnVaelger({ ...valg, knap: 'Gem', enkelt: !ny }, (v) => {
      valg.kundeId = v.kundeId;
      valg.opgavetypeId = v.opgavetypeId;
      if (v.personer) valg.personer = v.personer;
      tegnValg();
    });
  }

  function tegnValg() {
    const kunde = kundePaa(valg.kundeId);
    valgRaekker.replaceChildren(
      h('button', { type: 'button', class: 'raekke', onclick: vaelg },
        valg.kundeId ? prik(kunde ?? { id: valg.kundeId }) : null,
        h('span', { class: 'hoved' }, h('span', { class: 'under' }, 'Kunde'),
          h('span', { class: 'titel' }, valg.kundeId ? navnPaa(t.state.kunder, valg.kundeId) : 'Vælg kunde')),
        ikon('hoejre')),
      h('button', { type: 'button', class: 'raekke', onclick: vaelg },
        h('span', { class: 'hoved' }, h('span', { class: 'under' }, 'Opgave'),
          h('span', { class: 'titel' }, valg.opgavetypeId ? navnPaa(t.state.opgavetyper, valg.opgavetypeId) : 'Uden opgave')),
        ikon('hoejre')),
      valg.personer && h('button', { type: 'button', class: 'raekke', onclick: vaelg },
        h('span', { class: 'hoved' }, h('span', { class: 'under' }, 'Hvem'),
          h('span', { class: 'titel' }, valg.personer.map((p) => personNavn(t.team, p)).join(', '))),
        ikon('hoejre')),
    );
  }

  function gem(e) {
    e.preventDefault();
    fejl.textContent = '';
    if (!valg.kundeId) return (fejl.textContent = 'Vælg en kunde');
    if (!dato.value || !fra.value || !til.value) return (fejl.textContent = 'Udfyld dato, fra og til');
    let s = lokalTid(dato.value, fra.value);
    let sl = lokalTid(dato.value, til.value);
    // Til før fra betyder, at arbejdet gik over midnat.
    if (til.value < fra.value) sl = new Date(new Date(sl).getTime() + 86400000).toISOString();
    // Uændrede felter beholder deres præcise tid (med sekunder).
    if (!ny && dato.value === dayKey(entry.start) && fra.value === klokken(entry.start)) {
      s = entry.start;
      if (til.value === klokken(entry.slut)) sl = entry.slut;
    }
    const f = validateEntry({ start: s, slut: sl });
    if (f) return (fejl.textContent = f);
    let timepris;
    if (ny) timepris = kundePaa(valg.kundeId)?.timepris ?? 0;
    else {
      timepris = parseNumber(pris.value);
      if (timepris === null) return (fejl.textContent = 'Skriv en gyldig timepris');
    }
    const data = { kundeId: valg.kundeId, opgavetypeId: valg.opgavetypeId, start: s, slut: sl, timepris, note: note.value.trim() };
    // I et team én registrering pr. valgt person; i Mig én uden person.
    if (ny) t.state.registreringer.push(...forPersoner(data, valg.personer, newId));
    else aendr('registreringer', entry, valg.personer ? { ...data, person: valg.personer[0] } : data);
    lukArk();
    commit();
  }

  function slet() {
    if (!confirm('Slet denne registrering?')) return;
    t.state.registreringer = t.state.registreringer.filter((r) => r.id !== entry.id);
    lukArk();
    commit();
  }

  tegnValg();
  aabnArk(
    h('form', { onsubmit: gem },
      arkTop(ny ? 'Ny registrering' : 'Registrering', h('button', { type: 'submit', class: 'tekstknap staerk' }, 'Gem')),
      valgRaekker,
      h('div', { class: 'kort' },
        h('div', { class: 'raekke tidsfelter' }, h('span', { class: 'hoved' }, 'Dato'), dato),
        h('div', { class: 'raekke tidsfelter' }, h('span', { class: 'hoved' }, 'Tid'), fra, h('span', { class: 'til' }, '–'), til),
      ),
      !ny && felt('Timepris i kr', pris),
      felt('Note', note),
      fejl,
      !ny && h('button', { class: 'knap fare', type: 'button', onclick: slet }, 'Slet registrering'),
    ),
  );
}
