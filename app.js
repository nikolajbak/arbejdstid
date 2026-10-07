import {
  amountOf, dayKey, durationMs, formatDuration, formatKr, groupByDay, inPeriod, monthRange,
  parseHours, parseNumber, summarize, toCSV, validateEntry,
} from './core.js';
import { createStore, newId } from './store.js';

const store = createStore();
let state = store.load();

const FANER = {
  tid: 'Tid',
  registreringer: 'Registreringer',
  oversigt: 'Oversigt',
  indstillinger: 'Indstillinger',
};

let fane = 'tid';
try { fane = sessionStorage.getItem('arbejdstid.fane') || 'tid'; } catch {}
if (!FANER[fane]) fane = 'tid';

const indhold = document.getElementById('indhold');
const ark = document.getElementById('ark');

// --- Hjælpere -------------------------------------------------------------

// Bygger DOM-elementer. Tekst sættes altid som tekstnoder, aldrig som HTML.
function h(tag, attrs = {}, ...boern) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value' || (k in el && typeof v !== 'string')) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const b of boern.flat()) {
    if (b == null || b === false) continue;
    el.append(b instanceof Node ? b : String(b));
  }
  return el;
}

function commit() {
  store.save(state);
  render();
}

function skiftFane(ny) {
  fane = ny;
  try { sessionStorage.setItem('arbejdstid.fane', ny); } catch {}
  render();
  window.scrollTo(0, 0);
}

function aabnArk(...boern) {
  ark.replaceChildren(h('div', { class: 'ark-indhold' }, ...boern));
  ark.showModal();
}

function lukArk() {
  ark.close();
}

ark.addEventListener('click', (e) => {
  if (e.target === ark) lukArk();
});

const aktive = (liste) => liste.filter((x) => !x.arkiveret);
const arkiverede = (liste) => liste.filter((x) => x.arkiveret);

function felt(etiket, input) {
  return h('label', { class: 'felt' }, h('span', {}, etiket), input);
}

// --- Indstillinger --------------------------------------------------------

function redigerKunde(kunde) {
  const ny = !kunde;
  const navn = h('input', { value: kunde?.navn ?? '', autocomplete: 'off', required: true });
  const pris = h('input', { value: kunde ? String(kunde.timepris).replace('.', ',') : '', inputmode: 'decimal', autocomplete: 'off', placeholder: 'fx 850' });
  const fejl = h('p', { class: 'fejl' });

  function gem(e) {
    e.preventDefault();
    const n = navn.value.trim();
    const p = parseNumber(pris.value);
    if (!n) return (fejl.textContent = 'Skriv et navn');
    if (p === null) return (fejl.textContent = 'Skriv en timepris, fx 850 eller 850,50');
    if (ny) state.kunder.push({ id: newId(), navn: n, timepris: p, arkiveret: false });
    else Object.assign(kunde, { navn: n, timepris: p });
    lukArk();
    commit();
  }

  aabnArk(
    h('form', { onsubmit: gem },
      h('h3', {}, ny ? 'Ny kunde' : 'Redigér kunde'),
      felt('Navn', navn),
      felt('Timepris i kr ekskl. moms', pris),
      !ny && h('p', { class: 'hjaelp' }, 'En ny timepris gælder kun for tid, der registreres fremover.'),
      fejl,
      h('div', { class: 'knapper' },
        h('button', { class: 'knap', type: 'submit' }, 'Gem'),
        !ny && h('button', { class: 'knap fare', type: 'button', onclick: () => { kunde.arkiveret = true; lukArk(); commit(); } }, 'Arkivér kunde'),
        h('button', { class: 'knap sekundaer', type: 'button', onclick: lukArk }, 'Annullér'),
      ),
    ),
  );
  if (ny) navn.focus();
}

function redigerType(type) {
  const ny = !type;
  const navn = h('input', { value: type?.navn ?? '', autocomplete: 'off' });
  const fejl = h('p', { class: 'fejl' });

  function gem(e) {
    e.preventDefault();
    const n = navn.value.trim();
    if (!n) return (fejl.textContent = 'Skriv et navn');
    if (ny) state.opgavetyper.push({ id: newId(), navn: n, arkiveret: false });
    else type.navn = n;
    lukArk();
    commit();
  }

  aabnArk(
    h('form', { onsubmit: gem },
      h('h3', {}, ny ? 'Ny opgavetype' : 'Redigér opgavetype'),
      felt('Navn', navn),
      fejl,
      h('div', { class: 'knapper' },
        h('button', { class: 'knap', type: 'submit' }, 'Gem'),
        !ny && h('button', { class: 'knap fare', type: 'button', onclick: () => { type.arkiveret = true; lukArk(); commit(); } }, 'Arkivér opgavetype'),
        h('button', { class: 'knap sekundaer', type: 'button', onclick: lukArk }, 'Annullér'),
      ),
    ),
  );
  if (ny) navn.focus();
}

function arkivSektion(liste, beskriv) {
  const arkiv = arkiverede(liste);
  if (!arkiv.length) return null;
  return h('details', { class: 'arkiv' },
    h('summary', {}, `Vis arkiverede (${arkiv.length})`),
    h('div', { class: 'kort' },
      arkiv.map((x) => h('div', { class: 'raekke' },
        h('span', { class: 'hoved' }, h('span', { class: 'titel' }, x.navn), beskriv && h('span', { class: 'under' }, beskriv(x))),
        h('button', { class: 'knap sekundaer lille', onclick: () => { x.arkiveret = false; commit(); } }, 'Gendan'),
      )),
    ),
  );
}

function visIndstillinger() {
  const kunder = aktive(state.kunder).sort((a, b) => a.navn.localeCompare(b.navn, 'da'));
  const typer = aktive(state.opgavetyper);
  return [
    h('h2', {}, 'Kunder'),
    h('div', { class: 'kort' },
      kunder.length
        ? kunder.map((k) => h('button', { class: 'raekke', onclick: () => redigerKunde(k) },
          h('span', { class: 'hoved' }, h('span', { class: 'titel' }, k.navn)),
          h('span', { class: 'tal under' }, `${formatKr(k.timepris)}/t`),
        ))
        : h('p', { class: 'tom' }, 'Ingen kunder endnu'),
    ),
    h('div', { class: 'knapper' }, h('button', { class: 'knap sekundaer', onclick: () => redigerKunde() }, 'Tilføj kunde')),
    arkivSektion(state.kunder, (k) => `${formatKr(k.timepris)}/t`),

    h('h2', {}, 'Opgavetyper'),
    h('div', { class: 'kort' },
      typer.length
        ? typer.map((t) => h('button', { class: 'raekke', onclick: () => redigerType(t) },
          h('span', { class: 'hoved' }, h('span', { class: 'titel' }, t.navn)),
        ))
        : h('p', { class: 'tom' }, 'Ingen opgavetyper'),
    ),
    h('div', { class: 'knapper' }, h('button', { class: 'knap sekundaer', onclick: () => redigerType() }, 'Tilføj opgavetype')),
    arkivSektion(state.opgavetyper),
  ];
}

// --- Registreringsformular (ny manuel og redigering) ----------------------

const p2 = (n) => String(n).padStart(2, '0');
const klokken = (iso) => { const d = new Date(iso); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const lokalTid = (dato, tid) => new Date(`${dato}T${tid}`).toISOString();
const kundePaa = (id) => state.kunder.find((k) => k.id === id);
const navnPaa = (liste, id) => liste.find((x) => x.id === id)?.navn ?? '(slettet)';

// Aktive valgmuligheder plus den aktuelle, selvom den er arkiveret.
function vaelger(liste, valgt, tomTekst) {
  const muligheder = liste.filter((x) => !x.arkiveret || x.id === valgt);
  return h('select', {},
    h('option', { value: '' }, tomTekst),
    muligheder.map((x) => h('option', { value: x.id, selected: x.id === valgt }, x.navn)),
  );
}

function sidsteValg() {
  try { return JSON.parse(localStorage.getItem('arbejdstid.sidste')) ?? {}; } catch { return {}; }
}

function huskValg(kundeId, opgavetypeId) {
  try { localStorage.setItem('arbejdstid.sidste', JSON.stringify({ kundeId, opgavetypeId })); } catch {}
}

function registreringsArk(entry) {
  const ny = !entry;
  const sidste = sidsteValg();
  const kunde = vaelger(state.kunder, entry?.kundeId ?? sidste.kundeId, 'Vælg kunde');
  const type = vaelger(state.opgavetyper, entry?.opgavetypeId ?? sidste.opgavetypeId, 'Vælg opgavetype');
  const dato = h('input', { type: 'date', value: dayKey(entry?.start ?? new Date()) });
  const start = h('input', { type: 'time', value: entry ? klokken(entry.start) : '09:00' });
  const slut = h('input', { type: 'time', value: entry ? klokken(entry.slut) : '' });
  const timer = h('input', { inputmode: 'decimal', placeholder: 'fx 2,5', autocomplete: 'off' });
  const pris = h('input', { inputmode: 'decimal', value: entry ? String(entry.timepris).replace('.', ',') : '' });
  const note = h('textarea', { value: entry?.note ?? '', placeholder: 'Valgfri' });
  const fejl = h('p', { class: 'fejl' });

  let medTimer = ny;
  const startSlut = h('div', { class: 'to-kolonner' }, felt('Start', start), felt('Slut', slut));
  const antal = felt('Antal timer', timer);
  const segment = ny && h('div', { class: 'segment' },
    h('button', { type: 'button', onclick: () => skiftMode(true) }, 'Antal timer'),
    h('button', { type: 'button', onclick: () => skiftMode(false) }, 'Start og slut'),
  );
  function skiftMode(t) {
    medTimer = t;
    antal.hidden = !t;
    startSlut.hidden = t;
    if (segment) [...segment.children].forEach((b, i) => b.setAttribute('aria-pressed', String((i === 0) === t)));
  }

  function gem(e) {
    e.preventDefault();
    fejl.textContent = '';
    if (!kunde.value) return (fejl.textContent = 'Vælg en kunde');
    if (!type.value) return (fejl.textContent = 'Vælg en opgavetype');
    if (!dato.value) return (fejl.textContent = 'Vælg en dato');
    let s;
    let sl;
    if (medTimer) {
      const t = parseHours(timer.value);
      if (t === null) return (fejl.textContent = 'Skriv antal timer, fx 2,5');
      s = lokalTid(dato.value, '09:00');
      sl = new Date(new Date(s).getTime() + t * 3600000).toISOString();
    } else {
      if (!start.value || !slut.value) return (fejl.textContent = 'Udfyld start og slut');
      s = lokalTid(dato.value, start.value);
      sl = lokalTid(dato.value, slut.value);
      // Slut før start betyder, at arbejdet gik over midnat.
      if (slut.value < start.value) sl = new Date(new Date(sl).getTime() + 86400000).toISOString();
      // Uændrede felter beholder deres præcise tid (med sekunder).
      if (!ny && dato.value === dayKey(entry.start) && start.value === klokken(entry.start)) {
        s = entry.start;
        if (slut.value === klokken(entry.slut)) sl = entry.slut;
      }
    }
    const f = validateEntry({ start: s, slut: sl });
    if (f) return (fejl.textContent = f);
    let timepris;
    if (ny) timepris = kundePaa(kunde.value)?.timepris ?? 0;
    else {
      timepris = parseNumber(pris.value);
      if (timepris === null) return (fejl.textContent = 'Skriv en gyldig timepris');
    }
    const data = { kundeId: kunde.value, opgavetypeId: type.value, start: s, slut: sl, timepris, note: note.value.trim() };
    if (ny) state.registreringer.push({ id: newId(), ...data });
    else Object.assign(entry, data);
    huskValg(kunde.value, type.value);
    lukArk();
    commit();
  }

  function slet() {
    if (!confirm('Slet denne registrering?')) return;
    state.registreringer = state.registreringer.filter((r) => r !== entry);
    lukArk();
    commit();
  }

  aabnArk(
    h('form', { onsubmit: gem },
      h('h3', {}, ny ? 'Tilføj tid' : 'Redigér registrering'),
      felt('Kunde', kunde),
      felt('Opgavetype', type),
      felt('Dato', dato),
      segment,
      antal,
      startSlut,
      !ny && felt('Timepris i kr', pris),
      felt('Note', note),
      fejl,
      h('div', { class: 'knapper' },
        h('button', { class: 'knap', type: 'submit' }, 'Gem'),
        !ny && h('button', { class: 'knap fare', type: 'button', onclick: slet }, 'Slet registrering'),
        h('button', { class: 'knap sekundaer', type: 'button', onclick: lukArk }, 'Annullér'),
      ),
    ),
  );
  skiftMode(medTimer);
}

// --- Tid ------------------------------------------------------------------

function urTekst(start) {
  const ms = Math.max(0, Date.now() - new Date(start));
  const sek = Math.floor(ms / 1000) % 60;
  return `${formatDuration(ms)}:${p2(sek)}`;
}

function startUr(kundeId, opgavetypeId, note) {
  state.ur = { kundeId, opgavetypeId, note, start: new Date().toISOString() };
  huskValg(kundeId, opgavetypeId);
  commit();
}

function stopUr() {
  const ur = state.ur;
  state.registreringer.push({
    id: newId(),
    kundeId: ur.kundeId,
    opgavetypeId: ur.opgavetypeId,
    start: ur.start,
    slut: new Date().toISOString(),
    timepris: kundePaa(ur.kundeId)?.timepris ?? 0,
    note: ur.note ?? '',
  });
  state.ur = null;
  commit();
}

function visTid() {
  if (!aktive(state.kunder).length && !state.ur) {
    return h('div', { class: 'kort' },
      h('p', { class: 'tom' }, 'Tilføj først en kunde med en timepris.'),
      h('div', { class: 'form-kort' }, h('button', { class: 'knap', onclick: () => skiftFane('indstillinger') }, 'Gå til Indstillinger')),
    );
  }

  if (state.ur) {
    const ur = state.ur;
    return [
      h('div', { class: 'kort' },
        h('div', { class: 'ur' },
          h('div', { class: 'tid', id: 'ur-tid' }, urTekst(ur.start)),
          h('div', { class: 'hvad' }, h('span', { class: 'prik' }),
            `${navnPaa(state.kunder, ur.kundeId)} · ${navnPaa(state.opgavetyper, ur.opgavetypeId)}`),
          ur.note && h('div', { class: 'hvad' }, ur.note),
          h('div', { class: 'hvad' }, `Startet ${klokken(ur.start)}`),
        ),
        h('div', { class: 'form-kort' },
          h('button', { class: 'knap', onclick: stopUr }, 'Stop og gem'),
          h('div', { class: 'knapper' },
            h('button', { class: 'knap fare', onclick: () => { if (confirm('Annullér uret uden at gemme?')) { state.ur = null; commit(); } } }, 'Annullér'),
          ),
        ),
      ),
    ];
  }

  const sidste = sidsteValg();
  const kunde = vaelger(aktive(state.kunder), sidste.kundeId, 'Vælg kunde');
  const type = vaelger(aktive(state.opgavetyper), sidste.opgavetypeId, 'Vælg opgavetype');
  const note = h('input', { placeholder: 'Valgfri', autocomplete: 'off' });
  const startKnap = h('button', { class: 'knap', type: 'submit' }, 'Start');
  const opdater = () => { startKnap.disabled = !kunde.value || !type.value; };
  kunde.addEventListener('change', opdater);
  type.addEventListener('change', opdater);
  opdater();

  return [
    h('form', { class: 'kort form-kort', onsubmit: (e) => { e.preventDefault(); startUr(kunde.value, type.value, note.value.trim()); } },
      felt('Kunde', kunde),
      felt('Opgavetype', type),
      felt('Note', note),
      h('div', { class: 'knapper' }, startKnap),
    ),
    h('div', { class: 'knapper' }, h('button', { class: 'knap sekundaer', onclick: () => registreringsArk() }, 'Tilføj tid manuelt')),
  ];
}

setInterval(() => {
  const el = document.getElementById('ur-tid');
  if (el && state.ur) el.textContent = urTekst(state.ur.start);
}, 1000);

// --- Registreringer -------------------------------------------------------

function dagOverskrift(dag) {
  const t = new Date(`${dag}T12:00`).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function visRegistreringer() {
  if (!state.registreringer.length) return h('p', { class: 'tom' }, 'Ingen registreringer endnu');
  return groupByDay(state.registreringer).map((g) => [
    h('h2', { class: 'dag' }, h('span', {}, dagOverskrift(g.dag)), h('span', {}, formatDuration(g.ms))),
    h('div', { class: 'kort' },
      g.entries.map((e) => h('button', { class: 'raekke', onclick: () => registreringsArk(e) },
        h('span', { class: 'hoved' },
          h('span', { class: 'titel' }, `${navnPaa(state.kunder, e.kundeId)} · ${navnPaa(state.opgavetyper, e.opgavetypeId)}`),
          h('span', { class: 'under' }, `${klokken(e.start)}–${klokken(e.slut)}${e.note ? ` · ${e.note}` : ''}`),
        ),
        h('span', { class: 'tal' },
          h('span', { class: 'titel' }, formatDuration(durationMs(e))),
          h('span', { class: 'under' }, formatKr(amountOf(e))),
        ),
      )),
    ),
  ]);
}

// --- Filer ----------------------------------------------------------------

// Del-arket på iPhone, ellers almindelig download.
async function downloadFile(navn, indhold, type) {
  const fil = new File([indhold], navn, { type });
  if (navigator.canShare?.({ files: [fil] })) {
    try {
      await navigator.share({ files: [fil] });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(fil);
  const a = h('a', { href: url, download: navn });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- Oversigt -------------------------------------------------------------

let periode = { valg: 'denne', fra: '', til: '' };

function periodeGraenser() {
  if (periode.valg === 'denne') return monthRange(new Date(), 0);
  if (periode.valg === 'sidste') return monthRange(new Date(), -1);
  if (!periode.fra || !periode.til) return null;
  const from = new Date(`${periode.fra}T00:00`);
  const to = new Date(`${periode.til}T00:00`);
  to.setDate(to.getDate() + 1); // til-datoen er inklusiv i brugerfladen
  return to > from ? { from, to } : null;
}

function visOversigt() {
  const valg = h('select', { onchange: (e) => { periode.valg = e.target.value; render(); } },
    [['denne', 'Denne måned'], ['sidste', 'Sidste måned'], ['egen', 'Vælg periode']]
      .map(([v, t]) => h('option', { value: v, selected: periode.valg === v }, t)),
  );
  const top = [felt('Periode', valg)];
  if (periode.valg === 'egen') {
    const fra = h('input', { type: 'date', value: periode.fra, onchange: (e) => { periode.fra = e.target.value; render(); } });
    const til = h('input', { type: 'date', value: periode.til, onchange: (e) => { periode.til = e.target.value; render(); } });
    top.push(h('div', { class: 'to-kolonner' }, felt('Fra', fra), felt('Til og med', til)));
  }

  const g = periodeGraenser();
  if (!g) return [...top, h('p', { class: 'tom' }, 'Vælg en fra- og til-dato')];

  const entries = state.registreringer.filter((e) => inPeriod(e, g.from, g.to));
  if (!entries.length) return [...top, h('p', { class: 'tom' }, 'Ingen registreringer i perioden')];

  const s = summarize(entries, state.kunder, state.opgavetyper);
  const sidsteDag = new Date(g.to.getTime() - 86400000);
  const filnavn = `arbejdstid-${dayKey(g.from)}_${dayKey(sidsteDag)}.csv`;

  return [
    ...top,
    h('h2', {}, 'Pr. kunde'),
    h('div', { class: 'kort' },
      s.kunder.map((k) => h('details', { class: 'kunde' },
        h('summary', { class: 'raekke' },
          h('span', { class: 'pil', 'aria-hidden': 'true' }, '›'),
          h('span', { class: 'hoved' }, h('span', { class: 'titel' }, k.navn)),
          h('span', { class: 'tal' }, h('span', { class: 'titel' }, formatKr(k.kr)), h('span', { class: 'under' }, formatDuration(k.ms))),
        ),
        k.typer.map((t) => h('div', { class: 'raekke under-raekke' },
          h('span', { class: 'hoved' }, t.navn),
          h('span', { class: 'tal' }, `${formatDuration(t.ms)} · ${formatKr(t.kr)}`),
        )),
      )),
      h('div', { class: 'total raekke' },
        h('span', {}, 'I alt', h('span', { class: 'under' }, formatDuration(s.ms))),
        h('span', { class: 'stor' }, formatKr(s.kr)),
      ),
    ),
    h('p', { class: 'hjaelp' }, 'Beløb er ekskl. moms.'),
    h('div', { class: 'knapper' },
      h('button', { class: 'knap', onclick: () => downloadFile(filnavn, toCSV(entries, state.kunder, state.opgavetyper), 'text/csv;charset=utf-8') }, 'Eksportér CSV'),
    ),
  ];
}

// --- Rendering ------------------------------------------------------------

const VISNINGER = {
  tid: visTid,
  registreringer: visRegistreringer,
  oversigt: visOversigt,
  indstillinger: visIndstillinger,
};

function render() {
  document.getElementById('titel').textContent = FANER[fane];
  for (const b of document.querySelectorAll('.faner button')) {
    if (b.dataset.fane === fane) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  indhold.replaceChildren(...[VISNINGER[fane]()].flat(Infinity).filter(Boolean));
}

for (const b of document.querySelectorAll('.faner button')) {
  b.addEventListener('click', () => skiftFane(b.dataset.fane));
}

render();
