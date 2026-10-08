// Ren logik uden DOM. Bruges af både app.js og tests.

const TIME_MS = 3600000;
const KVARTER_MS = 15 * 60000;

// Tiden der faktureres: rundet op til nærmeste kvarter, mindst ét kvarter.
// Start og slut gemmes uændret.
export function durationMs(entry) {
  const ms = new Date(entry.slut) - new Date(entry.start);
  return Math.max(1, Math.ceil(ms / KVARTER_MS)) * KVARTER_MS;
}

export function amountOf(entry) {
  return (durationMs(entry) / TIME_MS) * entry.timepris;
}

// --- Poster: penge på en kunde ud over tiden ---------------------------------------

export const POST_TYPER = { udgift: 'Udgift', braendstof: 'Brændstof', kontant: 'Kontantudlæg', betaling: 'Betaling' };

// Udgifter lægges til det, kunden skylder; kontanter og betalinger trækkes fra.
export function postBeloeb(p) {
  return p.type === 'kontant' || p.type === 'betaling' ? -p.beloeb : p.beloeb;
}

// Hvad hver kunde skylder over al tid. Kunder i nul udelades.
export function saldoer(registreringer, poster, kunder) {
  const pr = new Map();
  const laeg = (id, kr) => pr.set(id, (pr.get(id) ?? 0) + kr);
  for (const r of registreringer) laeg(r.kundeId, amountOf(r));
  for (const p of poster) laeg(p.kundeId, postBeloeb(p));
  return [...pr]
    .filter(([, saldo]) => Math.abs(saldo) >= 0.005)
    .map(([kundeId, saldo]) => ({ kundeId, navn: kunder.find((k) => k.id === kundeId)?.navn ?? '(slettet)', saldo }))
    .sort((a, b) => a.navn.localeCompare(b.navn, 'da'));
}

export function formatDuration(ms) {
  const minutter = Math.floor(Math.max(0, ms) / 60000);
  const t = Math.floor(minutter / 60);
  const m = minutter % 60;
  return `${t}:${String(m).padStart(2, '0')}`;
}

export function formatNumber(n) {
  const [heltal, decimaler] = Math.abs(n).toFixed(2).split('.');
  const medPunktum = heltal.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}${medPunktum},${decimaler}`;
}

export function formatKr(n) {
  return `${formatNumber(n)} kr`;
}

// Tal skrevet med komma eller punktum. Returnerer null hvis ugyldigt.
export function parseNumber(str) {
  const s = String(str ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

export function parseHours(str) {
  const n = parseNumber(str);
  return n !== null && n > 0 ? n : null;
}

export function validateEntry({ start, slut }) {
  return new Date(slut) > new Date(start) ? null : 'Slut skal være efter start';
}

export function monthRange(date, offset = 0) {
  return {
    from: new Date(date.getFullYear(), date.getMonth() + offset, 1),
    to: new Date(date.getFullYear(), date.getMonth() + offset + 1, 1),
  };
}

export function inPeriod(entry, from, to) {
  const s = new Date(entry.start);
  return s >= from && s < to;
}

export function dayKey(date) {
  const d = new Date(date);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const nyesteFoerst = (a, b) => new Date(b.start) - new Date(a.start);

export function groupByDay(entries) {
  const dage = new Map();
  for (const e of [...entries].sort(nyesteFoerst)) {
    const dag = dayKey(e.start);
    if (!dage.has(dag)) dage.set(dag, { dag, ms: 0, entries: [] });
    const g = dage.get(dag);
    g.entries.push(e);
    g.ms += durationMs(e);
  }
  return [...dage.values()];
}

const navnPaa = (liste, id) => liste.find((x) => x.id === id)?.navn ?? '(slettet)';
const efterNavn = (a, b) => a.navn.localeCompare(b.navn, 'da');

export const UDEN_OPGAVE = 'Uden opgave';
const typeNavn = (opgavetyper, id) => (id ? navnPaa(opgavetyper, id) : UDEN_OPGAVE);
// "Uden opgave" står altid sidst.
const typeOrden = (a, b) => (a.opgavetypeId === '') - (b.opgavetypeId === '') || efterNavn(a, b);

// --- Kundefarver ---------------------------------------------------------------

export const FARVER = ['skov', 'ler', 'indigo', 'blomme', 'rosa', 'okker', 'hav', 'skifer'];

// Kundens egen farve, ellers en fast farve ud fra id, så den ikke skifter.
export function farveFor(kunde) {
  if (FARVER.includes(kunde?.farve)) return kunde.farve;
  const id = String(kunde?.id ?? '');
  let sum = 0;
  for (const tegn of id) sum += tegn.codePointAt(0);
  return FARVER[sum % FARVER.length];
}

// Den farve, færrest aktive kunder har. Ved lighed den første.
export function naesteFarve(kunder) {
  const antal = new Map(FARVER.map((f) => [f, 0]));
  for (const k of kunder) if (!k.arkiveret && antal.has(k.farve)) antal.set(k.farve, antal.get(k.farve) + 1);
  return FARVER.reduce((bedst, f) => (antal.get(f) < antal.get(bedst) ? f : bedst));
}

// --- Fortsæt og skift ------------------------------------------------------------

// De seneste kombinationer af kunde og opgave, der kan fortsættes med ét tryk.
export const kombiNoegle = (x) => `${x.kundeId}\u0000${x.opgavetypeId ?? ''}`;

// De seneste unikke kombinationer af kunde og opgave, nyeste først. En skjult
// kombination vises igen, når der er arbejdet på den efter den blev skjult.
export function senesteKombinationer(registreringer, kunder, opgavetyper, ur, antal = 4, skjult = {}) {
  const aktivKunde = new Set(kunder.filter((k) => !k.arkiveret).map((k) => k.id));
  const aktivType = new Set(opgavetyper.filter((t) => !t.arkiveret).map((t) => t.id));
  const set = new Set(ur ? [kombiNoegle(ur)] : []);
  const ud = [];
  for (const r of [...registreringer].sort((a, b) => new Date(b.slut) - new Date(a.slut))) {
    if (ud.length >= antal) break;
    const noegle = kombiNoegle(r);
    const opgavetypeId = r.opgavetypeId ?? '';
    if (set.has(noegle) || !aktivKunde.has(r.kundeId) || (opgavetypeId && !aktivType.has(opgavetypeId))) continue;
    set.add(noegle);
    if (skjult[noegle] && new Date(r.slut) <= new Date(skjult[noegle])) continue;
    ud.push({ kundeId: r.kundeId, opgavetypeId, sidst: r.slut });
  }
  return ud;
}

// Skjuler en kombination fra nu af. Skjulte kombinationer, der er arbejdet på
// siden, fjernes samtidig, så listen ikke vokser.
export function skjulKombination(skjult, registreringer, kombination, nu) {
  const seneste = new Map();
  for (const r of registreringer) {
    const n = kombiNoegle(r);
    if (!seneste.has(n) || new Date(r.slut) > new Date(seneste.get(n))) seneste.set(n, r.slut);
  }
  const ud = {};
  for (const [n, tid] of Object.entries(skjult ?? {})) {
    if (!seneste.has(n) || new Date(seneste.get(n)) <= new Date(tid)) ud[n] = tid;
  }
  ud[kombiNoegle(kombination)] = nu;
  return ud;
}

// "i dag", "i går", "for 3 dage siden" eller datoen.
export function sidenTekst(iso, nu = new Date()) {
  const d = new Date(iso);
  const dage = Math.round((new Date(nu.getFullYear(), nu.getMonth(), nu.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (dage <= 0) return 'i dag';
  if (dage === 1) return 'i går';
  if (dage < 7) return `for ${dage} dage siden`;
  return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
}

// Gemmer det kørende ur som registrering (slut = nu) og starter et nyt.
export function skiftUr(tilstand, ny, nu, timepris, id) {
  const { ur } = tilstand;
  // Med forskellige ure på to enheder kan "nu" ligge før starten; den slags
  // registrering afvises af databasen, så den gemmes ikke.
  const registreringer = ur && new Date(nu) > new Date(ur.start)
    ? [...tilstand.registreringer, { id, kundeId: ur.kundeId, opgavetypeId: ur.opgavetypeId ?? '', start: ur.start, slut: nu, timepris, note: ur.note ?? '' }]
    : tilstand.registreringer;
  return { ...tilstand, registreringer, ur: { kundeId: ny.kundeId, opgavetypeId: ny.opgavetypeId ?? '', start: nu, note: '' } };
}

export function summarize(entries, kunder, opgavetyper, poster = []) {
  const pr = new Map();
  const kundeI = (id) => {
    if (!pr.has(id)) pr.set(id, { kundeId: id, navn: navnPaa(kunder, id), ms: 0, kr: 0, typer: new Map(), poster: new Map() });
    return pr.get(id);
  };
  let ms = 0;
  let kr = 0;
  for (const e of entries) {
    const d = durationMs(e);
    const a = amountOf(e);
    ms += d;
    kr += a;
    const k = kundeI(e.kundeId);
    k.ms += d;
    k.kr += a;
    if (!k.typer.has(e.opgavetypeId)) k.typer.set(e.opgavetypeId, { opgavetypeId: e.opgavetypeId, navn: typeNavn(opgavetyper, e.opgavetypeId), ms: 0, kr: 0 });
    const t = k.typer.get(e.opgavetypeId);
    t.ms += d;
    t.kr += a;
  }
  for (const p of poster) {
    const k = kundeI(p.kundeId);
    k.poster.set(p.type, (k.poster.get(p.type) ?? 0) + p.beloeb);
  }
  const postLinjer = (m) => Object.keys(POST_TYPER).filter((x) => m.has(x)).map((x) => ({ type: x, navn: POST_TYPER[x], kr: m.get(x) }));
  return {
    kunder: [...pr.values()].map((k) => ({ ...k, typer: [...k.typer.values()].sort(typeOrden), poster: postLinjer(k.poster) })).sort(efterNavn),
    ms,
    kr,
  };
}

const p2 = (n) => String(n).padStart(2, '0');
const klokken = (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
const csvTal = (n) => n.toFixed(2).replace('.', ',');
const csvFelt = (v) => {
  let s = String(v ?? '');
  // Excel tolker felter, der starter med = + - @, som formler.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(entries, kunder, opgavetyper, poster = []) {
  const linjer = ['Dato;Start;Slut;Kunde;Opgavetype;Timer;Timepris;Beløb;Note'];
  const dansk = (d) => `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()}`;
  // Poster har kun en dato; de sorteres ved dagens start.
  const alle = [
    ...entries.map((e) => ({ e, t: new Date(e.start) })),
    ...poster.map((p) => ({ p, t: new Date(`${p.dato}T00:00`) })),
  ].sort((a, b) => a.t - b.t);
  for (const { e, p, t } of alle) {
    if (p) {
      // Beløbet er et tal og må gerne starte med minus, så det går uden om csvFelt.
      const felter = [dansk(t), '', '', navnPaa(kunder, p.kundeId), POST_TYPER[p.type], '', ''].map(csvFelt);
      linjer.push([...felter, csvTal(postBeloeb(p)), csvFelt(p.note)].join(';'));
      continue;
    }
    const s = t;
    linjer.push([
      dansk(s),
      klokken(s),
      klokken(new Date(e.slut)),
      navnPaa(kunder, e.kundeId),
      e.opgavetypeId ? navnPaa(opgavetyper, e.opgavetypeId) : '',
      csvTal(durationMs(e) / TIME_MS),
      csvTal(e.timepris),
      csvTal(amountOf(e)),
      e.note,
    ].map(csvFelt).join(';'));
  }
  return '﻿' + linjer.join('\r\n');
}

const erTekst = (v) => typeof v === 'string';
const erTal = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const erDato = (v) => erTekst(v) && !Number.isNaN(new Date(v).getTime());
const erValgfriTekst = (v) => v == null || erTekst(v);

const gyldigKunde = (k) => k && erTekst(k.id) && erTekst(k.navn) && erTal(k.timepris);
const gyldigType = (t) => t && erTekst(t.id) && erTekst(t.navn);
const gyldigReg = (r) => r && erTekst(r.id) && erTekst(r.kundeId) && erTekst(r.opgavetypeId)
  && erDato(r.start) && erDato(r.slut) && new Date(r.slut) > new Date(r.start)
  && erTal(r.timepris) && erValgfriTekst(r.note);
const gyldigPost = (p) => p && erTekst(p.id) && erTekst(p.kundeId) && p.type in POST_TYPER
  && erTekst(p.dato) && /^\d{4}-\d{2}-\d{2}$/.test(p.dato) && erTal(p.beloeb) && p.beloeb > 0 && erValgfriTekst(p.note);
const gyldigtUr = (u) => u == null
  || (erTekst(u.kundeId) && erTekst(u.opgavetypeId) && erDato(u.start) && erValgfriTekst(u.note));

export function validateBackup(obj) {
  const fejl = { ok: false, fejl: 'Filen kunne ikke læses som backup' };
  if (!obj || typeof obj !== 'object' || obj.version !== 1) return fejl;
  if (!['kunder', 'opgavetyper', 'registreringer'].every((k) => Array.isArray(obj[k]))) return fejl;
  if (!obj.kunder.every(gyldigKunde) || !obj.opgavetyper.every(gyldigType)
    || !obj.registreringer.every(gyldigReg) || !gyldigtUr(obj.ur)) return fejl;
  // Ældre backups har ingen poster.
  const poster = obj.poster ?? [];
  if (!Array.isArray(poster) || !poster.every(gyldigPost)) return fejl;
  // En ukendt farve fjernes; databasen tager kun imod de otte nøgler.
  const kunder = obj.kunder.map(({ farve, ...k }) => (FARVER.includes(farve) ? { ...k, farve } : k));
  const skjult = obj.skjult && typeof obj.skjult === 'object' && !Array.isArray(obj.skjult)
    && Object.values(obj.skjult).every((v) => typeof v === 'string') ? obj.skjult : {};
  return { ok: true, data: { ...obj, kunder, poster, ur: obj.ur ?? null, skjult } };
}

// --- Synkronisering med skyen ------------------------------------------------

const SAMLINGER = ['kunder', 'opgavetyper', 'registreringer', 'poster'];

// Udfylder felter, som ældre data kan mangle, så de består databasens regler.
function rens(samling, { id, ...data }) {
  if (samling === 'registreringer' || samling === 'poster') return { ...data, note: data.note ?? '' };
  return { ...data, arkiveret: !!data.arkiveret };
}

// JSON med sorterede nøgler, så rækkefølgen af felter ikke tæller som en ændring.
function fast(v) {
  if (Array.isArray(v)) return `[${v.map(fast).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).filter((n) => v[n] !== undefined).sort().map((n) => `${JSON.stringify(n)}:${fast(v[n])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

// Hvilke dokumenter skal skrives eller slettes for at gå fra foer til efter.
export function forskel(foer, efter) {
  const ops = [];
  for (const samling of SAMLINGER) {
    const gamle = new Map((foer[samling] ?? []).map((x) => [x.id, fast(rens(samling, x))]));
    const nye = new Set();
    for (const x of efter[samling] ?? []) {
      nye.add(x.id);
      const data = rens(samling, x);
      if (gamle.get(x.id) !== fast(data)) ops.push({ type: 'set', samling, id: x.id, data });
    }
    for (const id of gamle.keys()) if (!nye.has(id)) ops.push({ type: 'slet', samling, id });
  }
  if (fast(foer.ur) !== fast(efter.ur)) ops.push({ type: 'ur', ur: efter.ur ?? null });
  if (fast(foer.skjult ?? {}) !== fast(efter.skjult ?? {})) ops.push({ type: 'skjult', skjult: efter.skjult ?? {} });
  return ops;
}

// Fletter data fra telefonen ind i kontoen. Navne, der findes i forvejen, genbruges.
export function flet(lokal, konto) {
  const noegle = (navn) => navn.trim().toLocaleLowerCase('da');
  const flettet = (samling) => {
    const liste = [...konto[samling]];
    const ny = new Map();
    for (const x of lokal[samling]) {
      const fundet = liste.find((y) => noegle(y.navn) === noegle(x.navn));
      if (fundet) ny.set(x.id, fundet.id);
      else liste.push(x);
    }
    return [liste, ny];
  };
  const [kunder, kundeId] = flettet('kunder');
  const [opgavetyper, typeId] = flettet('opgavetyper');
  const kendte = new Set(konto.registreringer.map((r) => r.id));
  const omskriv = (x) => ({
    ...x,
    kundeId: kundeId.get(x.kundeId) ?? x.kundeId,
    opgavetypeId: typeId.get(x.opgavetypeId) ?? x.opgavetypeId,
  });
  return {
    kunder,
    opgavetyper,
    registreringer: [...konto.registreringer, ...lokal.registreringer.filter((r) => !kendte.has(r.id)).map(omskriv)],
    poster: [
      ...(konto.poster ?? []),
      ...(lokal.poster ?? [])
        .filter((p) => !(konto.poster ?? []).some((x) => x.id === p.id))
        .map((p) => ({ ...p, kundeId: kundeId.get(p.kundeId) ?? p.kundeId })),
    ],
    ur: konto.ur ?? (lokal.ur ? omskriv(lokal.ur) : null),
    skjult: konto.skjult ?? {},
  };
}

export function normaliserEmail(s) {
  const e = String(s ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

const FEJL = {
  'auth/invalid-credential': 'Forkert e-mail eller adgangskode.',
  'auth/wrong-password': 'Forkert e-mail eller adgangskode.',
  'auth/user-not-found': 'Forkert e-mail eller adgangskode.',
  'auth/invalid-email': 'Forkert e-mail eller adgangskode.',
  'auth/email-already-in-use': 'Der findes allerede en konto med den e-mail. Log ind i stedet.',
  'auth/weak-password': 'Adgangskoden skal være mindst 6 tegn.',
  'auth/network-request-failed': 'Første login kræver internet.',
  'auth/too-many-requests': 'For mange forsøg. Prøv igen om lidt.',
  'permission-denied': 'Din adgang er fjernet.',
};

export function fejlTekst(kode) {
  return FEJL[kode] ?? 'Noget gik galt. Prøv igen.';
}
