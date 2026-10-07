// Ren logik uden DOM. Bruges af både app.js og tests.

const TIME_MS = 3600000;

export function durationMs(entry) {
  return new Date(entry.slut) - new Date(entry.start);
}

export function amountOf(entry) {
  return (durationMs(entry) / TIME_MS) * entry.timepris;
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

export function summarize(entries, kunder, opgavetyper) {
  const pr = new Map();
  let ms = 0;
  let kr = 0;
  for (const e of entries) {
    const d = durationMs(e);
    const a = amountOf(e);
    ms += d;
    kr += a;
    if (!pr.has(e.kundeId)) pr.set(e.kundeId, { kundeId: e.kundeId, navn: navnPaa(kunder, e.kundeId), ms: 0, kr: 0, typer: new Map() });
    const k = pr.get(e.kundeId);
    k.ms += d;
    k.kr += a;
    if (!k.typer.has(e.opgavetypeId)) k.typer.set(e.opgavetypeId, { opgavetypeId: e.opgavetypeId, navn: navnPaa(opgavetyper, e.opgavetypeId), ms: 0, kr: 0 });
    const t = k.typer.get(e.opgavetypeId);
    t.ms += d;
    t.kr += a;
  }
  return {
    kunder: [...pr.values()].map((k) => ({ ...k, typer: [...k.typer.values()].sort(efterNavn) })).sort(efterNavn),
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

export function toCSV(entries, kunder, opgavetyper) {
  const linjer = ['Dato;Start;Slut;Kunde;Opgavetype;Timer;Timepris;Beløb;Note'];
  for (const e of [...entries].sort((a, b) => new Date(a.start) - new Date(b.start))) {
    const s = new Date(e.start);
    linjer.push([
      `${p2(s.getDate())}-${p2(s.getMonth() + 1)}-${s.getFullYear()}`,
      klokken(s),
      klokken(new Date(e.slut)),
      navnPaa(kunder, e.kundeId),
      navnPaa(opgavetyper, e.opgavetypeId),
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
const gyldigtUr = (u) => u == null
  || (erTekst(u.kundeId) && erTekst(u.opgavetypeId) && erDato(u.start) && erValgfriTekst(u.note));

export function validateBackup(obj) {
  const fejl = { ok: false, fejl: 'Filen kunne ikke læses som backup' };
  if (!obj || typeof obj !== 'object' || obj.version !== 1) return fejl;
  if (!['kunder', 'opgavetyper', 'registreringer'].every((k) => Array.isArray(obj[k]))) return fejl;
  if (!obj.kunder.every(gyldigKunde) || !obj.opgavetyper.every(gyldigType)
    || !obj.registreringer.every(gyldigReg) || !gyldigtUr(obj.ur)) return fejl;
  return { ok: true, data: { ...obj, ur: obj.ur ?? null } };
}

// --- Synkronisering med skyen ------------------------------------------------

const SAMLINGER = ['kunder', 'opgavetyper', 'registreringer'];

// Udfylder felter, som ældre data kan mangle, så de består databasens regler.
function rens(samling, { id, ...data }) {
  if (samling === 'registreringer') return { ...data, note: data.note ?? '' };
  return { ...data, arkiveret: !!data.arkiveret };
}

// JSON med sorterede nøgler, så rækkefølgen af felter ikke tæller som en ændring.
function fast(v) {
  if (Array.isArray(v)) return `[${v.map(fast).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((n) => `${JSON.stringify(n)}:${fast(v[n])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

// Hvilke dokumenter skal skrives eller slettes for at gå fra foer til efter.
export function forskel(foer, efter) {
  const ops = [];
  for (const samling of SAMLINGER) {
    const gamle = new Map(foer[samling].map((x) => [x.id, fast(rens(samling, x))]));
    const nye = new Set();
    for (const x of efter[samling]) {
      nye.add(x.id);
      const data = rens(samling, x);
      if (gamle.get(x.id) !== fast(data)) ops.push({ type: 'set', samling, id: x.id, data });
    }
    for (const id of gamle.keys()) if (!nye.has(id)) ops.push({ type: 'slet', samling, id });
  }
  if (fast(foer.ur) !== fast(efter.ur)) ops.push({ type: 'ur', ur: efter.ur ?? null });
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
    ur: konto.ur ?? (lokal.ur ? omskriv(lokal.ur) : null),
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
