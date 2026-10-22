// Push-worker: gemmer Web Push-abonnementer pr. bruger og sender beskeder til
// teammedlemmer om registreringer, der venter på dem, og til inviterede om
// invitationer til et team. Afsenderen er altid
// uid'en fra det verificerede token, og teksten laves her, så et medlem ikke
// kan sende fri tekst. Læser også kvitteringer for indloggede brugere.
import { lavVerificer } from './token.js';
import { lavLaesKvittering, KvitteringFejl } from './kvittering.js';
import { lavHentTeam } from './team.js';
import { lavSendPush } from './send.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
};

function svar(status, krop) {
  if (krop === undefined) return new Response(null, { status, headers: CORS });
  return new Response(JSON.stringify(krop), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

const RUTER = { 'POST /abonner': abonner, 'DELETE /abonner': afmeld, 'POST /send': send, 'POST /inviter': inviter, 'POST /kvittering': kvittering };

// Appen gemmer billeder under 900.000 tegn; lidt luft til andre data-URL'er.
const MAKS_BILLEDE = 1_200_000;

const TEKSTER = {
  afventer: (afsender, antal) => `${afsender} har registreret ${antal} til dig. Tryk for at godkende.`,
  afvist: (afsender, antal) => `${afsender} afviste ${antal} af dine registreringer.`,
};

const noegle = (uid) => 'uid:' + uid;
// Fra e-mail til uid, så en inviteret kan findes på den e-mail, invitationen har.
const emailNoegle = (email) => 'email:' + email.toLowerCase();
const ikkeTom = (v) => typeof v === 'string' && v !== '';

async function hentAbonnementer(kv, uid) {
  const liste = await kv.get(noegle(uid), 'json');
  return Array.isArray(liste) ? liste : [];
}

async function abonner({ kv, bruger, krop }) {
  const a = krop.abonnement;
  if (!a || !ikkeTom(a.endpoint) || !a.endpoint.startsWith('https://')
    || !ikkeTom(a.keys?.p256dh) || !ikkeTom(a.keys?.auth)) {
    return svar(400, { fejl: 'ugyldigt abonnement' });
  }
  const abonnement = {
    endpoint: a.endpoint,
    expirationTime: a.expirationTime ?? null,
    keys: { p256dh: a.keys.p256dh, auth: a.keys.auth },
  };
  const liste = (await hentAbonnementer(kv, bruger.uid)).filter((x) => x.endpoint !== abonnement.endpoint);
  liste.push(abonnement);
  await kv.put(noegle(bruger.uid), JSON.stringify(liste));
  if (ikkeTom(bruger.email)) await kv.put(emailNoegle(bruger.email), JSON.stringify(bruger.uid));
  return svar(200, { ok: true });
}

async function afmeld({ kv, bruger, krop }) {
  if (!ikkeTom(krop.endpoint)) return svar(400, { fejl: 'mangler endpoint' });
  const liste = await hentAbonnementer(kv, bruger.uid);
  await kv.put(noegle(bruger.uid), JSON.stringify(liste.filter((x) => x.endpoint !== krop.endpoint)));
  return svar(200, { ok: true });
}

async function send({ kv, hentTeam, sendPush, bruger, token, krop }) {
  const { teamId, til, slags, antal } = krop;
  if (!ikkeTom(teamId) || !ikkeTom(til) || !Object.hasOwn(TEKSTER, slags)
    || !Number.isInteger(antal) || antal < 1 || antal > 100) {
    return svar(400, { fejl: 'ugyldigt input' });
  }
  const { team, fejl } = await medlemsTeam(hentTeam, teamId, token, bruger.uid);
  if (fejl) return fejl;
  if (til === bruger.uid || !team.medlemmer.includes(til)) return svar(400, { fejl: 'ugyldig modtager' });

  const afsender = team.navne[bruger.uid] || bruger.email || 'Et medlem';
  const payload = JSON.stringify({
    title: team.navn,
    body: TEKSTER[slags](afsender, antal),
    url: `./?team=${encodeURIComponent(teamId)}` + (slags === 'afventer' ? '&vis=godkend' : ''),
  });

  return svar(200, await skub(kv, sendPush, til, payload));
}

// Henter teamet og tjekker, at afsenderen er medlem. Giver { team } eller { fejl }.
async function medlemsTeam(hentTeam, teamId, token, uid) {
  let team;
  try {
    team = await hentTeam(teamId, token);
  } catch {
    return { fejl: svar(502, { fejl: 'Firestore svarede ikke' }) };
  }
  // En inviteret kan læse teamet uden at være medlem, så medlemskab tjekkes her.
  if (!team || !team.medlemmer.includes(uid)) return { fejl: svar(403, { fejl: 'ingen adgang til teamet' }) };
  return { team };
}

// Sender til alle modtagerens enheder og rydder døde abonnementer op.
async function skub(kv, sendPush, til, payload) {
  const liste = await hentAbonnementer(kv, til);
  let sendt = 0;
  const doede = new Set();
  await Promise.all(liste.map(async (abonnement) => {
    try {
      const { status } = await sendPush(abonnement, payload);
      if (status === 404 || status === 410) doede.add(abonnement.endpoint);
      else if (status >= 200 && status < 300) sendt += 1;
    } catch {
      // Netværksfejl: abonnementet beholdes og prøves igen næste gang.
    }
  }));
  if (doede.size > 0) {
    // Læses igen, så et abonnement tilføjet imens ikke går tabt.
    const nu = await hentAbonnementer(kv, til);
    await kv.put(noegle(til), JSON.stringify(nu.filter((x) => !doede.has(x.endpoint))));
  }
  return { sendt, fjernet: doede.size };
}

// Besked til en inviteret, der allerede bruger appen. Kun en e-mail, der står
// på teamets liste over inviterede, kan få beskeden.
async function inviter({ kv, hentTeam, sendPush, bruger, token, krop }) {
  const { teamId, email } = krop;
  if (!ikkeTom(teamId) || !ikkeTom(email)) return svar(400, { fejl: 'ugyldigt input' });
  const { team, fejl } = await medlemsTeam(hentTeam, teamId, token, bruger.uid);
  if (fejl) return fejl;
  if (!team.inviterede.includes(email.toLowerCase())) return svar(400, { fejl: 'ikke inviteret' });
  const til = await kv.get(emailNoegle(email), 'json');
  // Uden notifikationer slået til ser personen invitationen, næste gang appen åbnes.
  if (!ikkeTom(til) || team.medlemmer.includes(til)) return svar(200, { sendt: 0, fjernet: 0 });
  const afsender = team.navne[bruger.uid] || bruger.email || 'Et medlem';
  const payload = JSON.stringify({
    title: team.navn,
    body: `${afsender} har inviteret dig til teamet ${team.navn}. Tryk for at se invitationen.`,
    url: './?vis=invitationer',
  });
  return svar(200, await skub(kv, sendPush, til, payload));
}

// Billedet kommer som data-URL, som appen også gemmer det.
async function kvittering({ laesKvittering, krop }) {
  const m = typeof krop.billede === 'string' && krop.billede.length <= MAKS_BILLEDE
    && /^data:(image\/(?:jpeg|png|webp|heic|heif));base64,([A-Za-z0-9+/=]+)$/.exec(krop.billede);
  if (!m) return svar(400, { fejl: 'ugyldigt billede' });
  try {
    return svar(200, await laesKvittering(m[1], m[2]));
  } catch (e) {
    if (e instanceof KvitteringFejl) return svar(e.status, { fejl: e.message });
    throw e;
  }
}

export function lavHandler({ verificer, hentTeam, kv, sendPush, laesKvittering }) {
  return async function handler(request) {
    if (request.method === 'OPTIONS') return svar(204);
    const rute = RUTER[`${request.method} ${new URL(request.url).pathname}`];
    if (!rute) return svar(404, { fejl: 'ukendt rute' });

    const [type, token] = (request.headers.get('authorization') ?? '').split(' ');
    if (type !== 'Bearer' || !token) return svar(401, { fejl: 'mangler token' });
    let bruger;
    try {
      bruger = await verificer(token);
    } catch {
      return svar(401, { fejl: 'ugyldigt token' });
    }

    let krop;
    try {
      krop = await request.json();
    } catch {
      return svar(400, { fejl: 'ugyldig JSON' });
    }
    if (!krop || typeof krop !== 'object') return svar(400, { fejl: 'ugyldig JSON' });

    return rute({ kv, hentTeam, sendPush, laesKvittering, bruger, token, krop });
  };
}

let handler;

export default {
  fetch(request, env) {
    // Bygges én gang pr. isolat, så nøglesættet til tokentjek caches.
    handler ??= lavHandler({
      verificer: lavVerificer({ projekt: env.FIREBASE_PROJECT, emulator: env.FIRESTORE_EMULATOR }),
      hentTeam: lavHentTeam({ projekt: env.FIREBASE_PROJECT, emulator: env.FIRESTORE_EMULATOR }),
      kv: env.ABONNEMENTER,
      sendPush: lavSendPush({
        publicKey: env.VAPID_PUBLIC,
        privateKey: env.VAPID_PRIVATE,
        subject: env.VAPID_SUBJECT,
      }),
      laesKvittering: lavLaesKvittering({ noegle: env.GEMINI_API_KEY, kv: env.ABONNEMENTER }),
    });
    return handler(request);
  },
};
