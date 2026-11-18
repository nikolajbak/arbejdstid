// Til godkendelse: kortet øverst på Tid-fanen og arket med det, der venter på en selv.

import { POST_TYPER, amountOf, farveFor, formatKr, godkend, personNavn, postBeloeb, ventende } from './core.js';
import { t, commit, erstat, kundePaa, migITeam } from './tilstand.js';
import { h, aabnArk, arkTop, ikon, klokken, navnPaa } from './ui.js';
import { aabnPost } from './post.js';
import { aabnRegistrering, hvadTekst } from './registrering.js';

const kortDato = (d) => d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });

// Det ventende for en selv, ældste først: registreringer efter start, poster efter dato.
function venterPaaMig() {
  const uid = migITeam();
  if (!uid) return [];
  const reg = ventende(t.state.registreringer, uid).map((x) => ({ samling: 'registreringer', x, tid: new Date(x.start) }));
  const pos = ventende(t.state.poster, uid).map((x) => ({ samling: 'poster', x, tid: new Date(`${x.dato}T00:00`) }));
  return [...reg, ...pos].sort((a, b) => a.tid - b.tid);
}

const VIS_GODKEND_MS = 15000;

// Det åbne ark, så det tegnes om, når data ændres (her eller fra en anden enhed).
let aabent = null;

// Kortet "N venter på din godkendelse"; null i Mig eller uden noget, der venter.
export function godkendKort() {
  aabent?.tegn();
  const n = venterPaaMig().length;
  // Fra en notifikation: åbn arket, når der er noget at godkende. Første data kommer ofte
  // fra cachen uden den nye post, så ønsket bliver stående, til det udløber (t.visGodkend er tidspunktet).
  if (t.visGodkend) {
    if (Date.now() - t.visGodkend > VIS_GODKEND_MS) t.visGodkend = 0;
    else if (n) {
      t.visGodkend = 0;
      queueMicrotask(aabnGodkend);
    }
  }
  if (!n) return null;
  return h('button', { class: 'kort godkend-kort raekke', onclick: aabnGodkend },
    h('span', { class: 'hoved' }, h('span', { class: 'titel' }, `${n} venter på din godkendelse`)),
    ikon('hoejre'),
  );
}

function fjern(samling, x) {
  t.state[samling] = t.state[samling].filter((y) => y.id !== x.id);
}

function raekke({ samling, x }) {
  const reg = samling === 'registreringer';
  const fra = personNavn(t.team, x.oprettetAf);
  const titel = reg ? hvadTekst(x) : `${POST_TYPER[x.type]} · ${navnPaa(t.state.kunder, x.kundeId)}`;
  const naar = reg ? `${kortDato(new Date(x.start))} · ${klokken(x.start)}–${klokken(x.slut)}` : kortDato(new Date(`${x.dato}T12:00`));
  const beloeb = reg ? formatKr(amountOf(x, t.state.kunder)) : (() => { const b = postBeloeb(x); return `${b < 0 ? '−' : '+'}${formatKr(Math.abs(b))}`; })();
  const godkendDen = () => { erstat(samling, godkend(x)); commit(); };
  const afvis = () => {
    if (!confirm(`${reg ? 'Slet registreringen?' : 'Slet posten?'} ${fra} får besked.`)) return;
    fjern(samling, x);
    commit();
  };
  return h('div', { class: 'godkend-raekke', 'data-farve': farveFor(kundePaa(x.kundeId) ?? { id: x.kundeId }) },
    h('button', { type: 'button', class: 'raekke', onclick: () => (reg ? aabnRegistrering(x) : aabnPost(x)) },
      h('span', { class: 'streg' }),
      h('span', { class: 'hoved' },
        h('span', { class: 'titel' }, titel),
        h('span', { class: 'under' }, `${naar} · fra ${fra}`),
      ),
      h('span', { class: 'tal' }, h('span', { class: 'titel' }, beloeb)),
    ),
    h('div', { class: 'godkend-knapper' },
      h('button', { type: 'button', class: 'knap sekundaer lille', onclick: afvis }, 'Afvis'),
      h('button', { type: 'button', class: 'knap lille', 'data-farve': farveFor(kundePaa(x.kundeId) ?? { id: x.kundeId }), onclick: godkendDen }, 'Godkend'),
    ),
  );
}

export function aabnGodkend() {
  if (aabent) return;
  const liste = h('div', { class: 'kort' });
  const godkendAlle = () => {
    for (const { samling, x } of venterPaaMig()) erstat(samling, godkend(x));
    ark.close();
    commit();
  };
  const tegn = () => {
    const rk = venterPaaMig();
    if (!rk.length) return ark.close();
    liste.replaceChildren(...rk.map(raekke));
  };
  const ark = aabnArk({ onLuk: () => { aabent = null; } },
    arkTop('Til godkendelse', h('button', { type: 'button', class: 'tekstknap staerk', onclick: godkendAlle }, 'Godkend alle')),
    liste,
  );
  aabent = { tegn };
  tegn();
}
