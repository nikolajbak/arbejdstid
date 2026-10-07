import { formatKr, parseNumber } from './core.js';
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
    else if (k in el && typeof v !== 'string') el[k] = v;
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

// --- Rendering ------------------------------------------------------------

const VISNINGER = {
  tid: () => h('p', { class: 'tom' }, 'Kommer snart'),
  registreringer: () => h('p', { class: 'tom' }, 'Kommer snart'),
  oversigt: () => h('p', { class: 'tom' }, 'Kommer snart'),
  indstillinger: visIndstillinger,
};

function render() {
  document.getElementById('titel').textContent = FANER[fane];
  for (const b of document.querySelectorAll('.faner button')) {
    if (b.dataset.fane === fane) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  indhold.replaceChildren(...[VISNINGER[fane]()].flat().filter(Boolean));
}

for (const b of document.querySelectorAll('.faner button')) {
  b.addEventListener('click', () => skiftFane(b.dataset.fane));
}

render();
