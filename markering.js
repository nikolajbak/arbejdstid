// Markering af det, der venter på en selv i alle teams, uanset hvilket arbejdssted der er åbent:
// lyttere pr. team, tallet på »Mig ▾« og tallet på appens ikon på hjemmeskærmen.

import { markeringer } from './core.js';
import { lytVentende } from './team.js';
import { t, render } from './tilstand.js';

const lyttere = new Map(); // teamId → stop
let sidst = null;

export const markering = () => markeringer(t.venterITeam, t.teams, t.invitationer);

// Kaldes, hver gang listen over teams eller invitationer ændres.
export function foelgTeams() {
  const uid = t.bruger.uid;
  const ids = new Set(t.teams.map((x) => x.id));
  for (const [id, stop] of lyttere) {
    if (ids.has(id)) continue;
    stop();
    lyttere.delete(id);
    delete t.venterITeam[id];
  }
  for (const id of ids) {
    if (lyttere.has(id)) continue;
    lyttere.set(id, lytVentende(id, uid, (n) => {
      t.venterITeam[id] = n;
      opdater();
    }, (err) => {
      // Fx fjernet fra teamet: listen over teams fjerner lytteren bagefter.
      if (err.code !== 'permission-denied') console.error(err);
      t.venterITeam[id] = 0;
      opdater();
    }));
  }
  opdater();
}

// Tegner igen og sætter ikonets tal, når noget er ændret.
function opdater() {
  const m = markering();
  const noegle = JSON.stringify(m.prTeam) + m.ialt;
  if (noegle === sidst) return;
  sidst = noegle;
  render();
  if (m.klar) saetIkon(m.ialt);
}

function saetIkon(n) {
  Promise.resolve()
    .then(() => (n ? navigator.setAppBadge?.(n) : navigator.clearAppBadge?.()))
    .catch(() => {});
  // Service workeren lægger nye notifikationer til, når appen ikke er fremme.
  navigator.serviceWorker?.controller?.postMessage({ maerke: n });
}

// Ved log ud: ingen lyttere og intet tal på ikonet.
export function stopMarkering() {
  for (const stop of lyttere.values()) stop();
  lyttere.clear();
  t.venterITeam = {};
  sidst = null;
  saetIkon(0);
}
