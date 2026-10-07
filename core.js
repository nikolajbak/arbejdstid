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
