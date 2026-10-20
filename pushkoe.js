// Kø til push-beskeder, der sendes igen, når der er forbindelse.
// Ren logik uden browser-API'er: lageret er noget med getItem/setItem.

const NOEGLE = 'arbejdstid.pushkoe';
const MAKS_ALDER_MS = 7 * 864e5;
// Statusser, hvor et nyt forsøg ikke hjælper: lykkedes, eller serveren afviser beskeden.
const ENDELIGE = new Set([400, 401, 403]);

function laes(lager) {
  try {
    const koe = JSON.parse(lager.getItem(NOEGLE));
    return Array.isArray(koe) ? koe : [];
  } catch {
    return [];
  }
}

function gem(lager, koe) {
  lager.setItem(NOEGLE, JSON.stringify(koe));
}

export function koeTilfoej(lager, besked, nu) {
  gem(lager, [...laes(lager), { ...besked, tid: nu }]);
}

export async function koeSend(lager, send, nu) {
  const behandlet = []; // beskeder, der skal ud af køen igen
  for (const besked of laes(lager)) {
    if (nu - besked.tid > MAKS_ALDER_MS) {
      behandlet.push(besked);
      continue;
    }
    let status;
    try {
      status = await send(besked);
    } catch {
      continue; // netværksfejl: behold og prøv igen senere
    }
    if ((status >= 200 && status < 300) || ENDELIGE.has(status)) behandlet.push(besked);
  }
  // Læs køen igen: send kan have taget tid, og nye beskeder må ikke overskrives.
  const tilbage = new Map();
  for (const b of behandlet) {
    const n = JSON.stringify(b);
    tilbage.set(n, (tilbage.get(n) || 0) + 1);
  }
  gem(lager, laes(lager).filter((b) => {
    const n = JSON.stringify(b);
    const antal = tilbage.get(n) || 0;
    if (!antal) return true;
    tilbage.set(n, antal - 1);
    return false;
  }));
}

export function pushStatus({ understoettet, ios, standalone, tilladelse, abonneret }) {
  if (ios && !standalone) return { tekst: 'Læg appen på hjemmeskærmen for at få notifikationer', kanSlaaTil: false };
  if (!understoettet) return { tekst: 'Ikke muligt i denne browser', kanSlaaTil: false };
  if (tilladelse === 'denied') return { tekst: 'Notifikationer er blokeret i browserens indstillinger', kanSlaaTil: false };
  if (abonneret) return { tekst: 'Slået til', kanSlaaTil: false };
  return { tekst: 'Slået fra', kanSlaaTil: true };
}
