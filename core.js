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
