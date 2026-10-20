// Push-beskeder om godkendelse: abonnement på enheden, status til Indstillinger og
// afsendelse gennem køen i pushkoe.js, så intet går tabt uden net.

import { auth } from './firebase.js';
import { PUSH_URL, VAPID_PUBLIC } from './push-config.js';
import { koeTilfoej, koeSend, pushStatus } from './pushkoe.js';
import { t } from './tilstand.js';
import { besked } from './ui.js';

const TIP = 'arbejdstid.pushtip';
const VENT_MS = 10000;

// localStorage, der aldrig kaster: en fejl i lageret må ikke stoppe en gemning.
const lager = {
  getItem(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  setItem(k, v) {
    try { localStorage.setItem(k, v); } catch {}
  },
};

const understoettet = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function abonnement() {
  const r = await navigator.serviceWorker.getRegistration();
  return (await r?.pushManager.getSubscription()) ?? null;
}

// Kalder workeren med brugerens Firebase-token og giver HTTP-statussen. Kaster uden net.
async function kald(metode, sti, krop) {
  const token = await auth.currentUser.getIdToken();
  const svar = await fetch(PUSH_URL + sti, {
    method: metode,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(krop),
    signal: AbortSignal.timeout?.(VENT_MS),
  });
  return svar.status;
}

// Den offentlige nøgle fra base64url til bytes, som pushManager.subscribe vil have.
function vapidBytes(noegle) {
  const b64 = (noegle + '='.repeat((4 - (noegle.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function status() {
  const ua = navigator.userAgent;
  // iPad i skrivebordstilstand giver sig ud for at være en Mac.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ok = understoettet();
  let abonneret = false;
  if (ok) {
    try { abonneret = Boolean(await abonnement()); } catch {}
  }
  const s = pushStatus({ understoettet: ok, ios, standalone, tilladelse: ok ? Notification.permission : 'default', abonneret });
  return { ...s, abonneret: s.tekst === 'Slået til' };
}

export async function slaaTil() {
  if (!PUSH_URL) return;
  // Spørges først, så tilladelsen bedes om direkte fra trykket (kræves på iPhone).
  if ((await Notification.requestPermission()) !== 'granted') return;
  const r = await navigator.serviceWorker.ready;
  const ab = (await r.pushManager.getSubscription())
    ?? (await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes(VAPID_PUBLIC) }));
  let st;
  try {
    st = await kald('POST', '/abonner', { abonnement: ab.toJSON() });
  } catch (err) {
    st = err;
  }
  if (st !== 200) {
    // Uden abonnement hos workeren kommer der intet; vis det ikke som slået til.
    await ab.unsubscribe();
    throw new Error(`Abonnementet kunne ikke gemmes (${st})`);
  }
}

// Afmelder enheden. Workeren fjerner abonnementet af sig selv, hvis kaldet ikke når frem.
export async function slaaFra() {
  if (!understoettet()) return;
  const ab = await abonnement();
  if (!ab) return;
  if (PUSH_URL) {
    try { await kald('DELETE', '/abonner', { endpoint: ab.endpoint }); } catch {}
  }
  await ab.unsubscribe();
}

// Sender køen. Kører den allerede, køres den én gang til bagefter, så to kald
// (fx start og online) ikke sender de samme beskeder to gange.
let sender = false;
let igen = false;

export async function koerKoe() {
  if (!PUSH_URL) return;
  if (sender) {
    igen = true;
    return;
  }
  sender = true;
  try {
    do {
      igen = false;
      const uid = auth.currentUser?.uid;
      await koeSend(lager, async (b) => {
        // En anden brugers beskeder bliver liggende, til den bruger logger ind igen.
        if (!uid || b.fra !== uid) throw new Error('anden bruger');
        return kald('POST', '/send', { teamId: b.teamId, til: b.til, slags: b.slags, antal: b.antal });
      }, Date.now());
    } while (igen);
  } catch (err) {
    console.error(err);
  } finally {
    sender = false;
  }
}

// Første gang noget venter på en anden, og notifikationer ikke er slået til her.
async function visTip() {
  if (!PUSH_URL || lager.getItem(TIP)) return;
  if (!(await status()).kanSlaaTil) return;
  lager.setItem(TIP, '1');
  besked('Slå notifikationer til under Indstillinger, så du også får besked');
}

// Kaldes fra commit med beskederne fra nyeBeskeder.
export function meld(beskeder) {
  // Uden worker sendes og ryddes intet; så skal der heller ikke samles en kø op.
  if (!PUSH_URL) return;
  const nu = Date.now();
  for (const { til, slags, antal } of beskeder) {
    koeTilfoej(lager, { teamId: t.arbejdssted, til, slags, antal, fra: t.bruger.uid }, nu);
  }
  koerKoe();
  if (beskeder.some((b) => b.slags === 'afventer')) visTip().catch(console.error);
}
