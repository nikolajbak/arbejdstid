// Byggeklodser til brugerfladen: elementer, ark, beskeder og små komponenter.

import { farveFor } from './core.js';

// Bygger DOM-elementer. Tekst sættes altid som tekstnoder, aldrig som HTML.
export function h(tag, attrs = {}, ...boern) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value' || (k in el && typeof v !== 'string')) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const b of boern.flat(Infinity)) {
    if (b == null || b === false) continue;
    el.append(b instanceof Node ? b : String(b));
  }
  return el;
}

// --- Ikoner ---------------------------------------------------------------------

const IKONER = {
  plus: 'M12 5v14M5 12h14',
  play: 'M8 5.5v13l10.5-6.5z',
  stop: 'M7 7h10v10H7z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  venstre: 'M15 5l-7 7 7 7',
  hoejre: 'M9 5l7 7-7 7',
  ned: 'M6 9l6 6 6-6',
  soeg: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
};

export function ikon(navn) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `ikon ikon-${navn}`);
  const sti = document.createElementNS(ns, 'path');
  sti.setAttribute('d', IKONER[navn]);
  svg.append(sti);
  return svg;
}

// --- Ark ------------------------------------------------------------------------

// Ark glider op fra bunden. Flere kan ligge oven på hinanden.
// aabnArk({ onLuk }, ...boern) eller aabnArk(...boern).
export function aabnArk(...args) {
  const valg = args[0] && !(args[0] instanceof Node) && !Array.isArray(args[0]) && typeof args[0] === 'object' ? args.shift() : {};
  const ark = h('dialog', { class: 'ark' }, h('div', { class: 'ark-indhold' }, ...args));
  ark.addEventListener('click', (e) => { if (e.target === ark) ark.close(); });
  ark.addEventListener('close', () => {
    ark.remove();
    valg.onLuk?.();
  });
  document.body.append(ark);
  ark.showModal();
  return ark;
}

export function lukArk() {
  const aabne = document.querySelectorAll('dialog.ark[open]');
  aabne[aabne.length - 1]?.close();
}

// Øverste række i et ark: Annullér · titel · handling.
export function arkTop(titel, handling) {
  return h('div', { class: 'ark-top' },
    h('button', { type: 'button', class: 'tekstknap', onclick: lukArk }, 'Annullér'),
    h('h3', {}, titel),
    handling ?? h('span'),
  );
}

// --- Besked ---------------------------------------------------------------------

let beskedTimer;

export function besked(tekst) {
  const el = document.getElementById('besked');
  el.textContent = tekst;
  el.classList.add('vis');
  clearTimeout(beskedTimer);
  beskedTimer = setTimeout(() => el.classList.remove('vis'), 3000);
}

// --- Små komponenter --------------------------------------------------------------

export function felt(etiket, input) {
  return h('label', { class: 'felt' }, h('span', {}, etiket), input);
}

export function chip(tekst, { valgt = false, farve, onclick } = {}) {
  return h('button', { type: 'button', class: 'chip', 'aria-pressed': String(valgt), 'data-farve': farve, onclick }, tekst);
}

// Farveprik for en kunde (eller en farvenøgle).
export function prik(kundeEllerFarve) {
  const farve = typeof kundeEllerFarve === 'string' ? kundeEllerFarve : farveFor(kundeEllerFarve);
  return h('span', { class: 'prik', 'data-farve': farve, 'aria-hidden': 'true' });
}

// --- Tid og tekst -----------------------------------------------------------------

export const p2 = (n) => String(n).padStart(2, '0');
export const klokken = (iso) => { const d = new Date(iso); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
export const lokalTid = (dato, tid) => new Date(`${dato}T${tid}`).toISOString();
export const navnPaa = (liste, id) => liste.find((x) => x.id === id)?.navn ?? '(slettet)';

// --- Filer ------------------------------------------------------------------------

// Del-arket på iPhone, ellers almindelig download. Giver false, hvis brugeren
// lukkede del-arket uden at gemme.
export async function downloadFile(navn, indhold, type) {
  const fil = new File([indhold], navn, { type });
  if (navigator.canShare?.({ files: [fil] })) {
    try {
      await navigator.share({ files: [fil] });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(fil);
  const a = h('a', { href: url, download: navn });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

// "Afregnet" eller "Delvist afregnet" foran en rækkes undertekst; ellers intet.
const AFREGNET = { afregnet: 'Afregnet', delvis: 'Delvist afregnet' };
export function afregnetMaerke(status) {
  return AFREGNET[status] ? h('span', { class: 'afregnet' }, AFREGNET[status]) : null;
}
