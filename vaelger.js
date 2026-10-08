// Vælgerarket: vælg (eller opret) kunde og eventuelt opgave.

import { farveFor, naesteFarve, parseNumber } from './core.js';
import { newId } from './store.js';
import { t, commit, aktive } from './tilstand.js';
import { h, aabnArk, lukArk, arkTop, chip, felt, ikon, prik } from './ui.js';

const noegle = (s) => String(s ?? '').trim().toLocaleLowerCase('da');
const efterNavn = (a, b) => a.navn.localeCompare(b.navn, 'da');

// paaValg({ kundeId, opgavetypeId, note }) kaldes, når brugeren bekræfter.
// En ny kunde oprettes først ved bekræftelse; en ny opgave oprettes med det samme.
// udenOpgave skjuler opgavedelen, fx for en post.
export function aabnVaelger({ kundeId = '', opgavetypeId = '', knap, note = '', visNote = false, ekstra = null, udenOpgave = false } = {}, paaValg) {
  let valgtKunde = kundeId;
  let valgtType = opgavetypeId ?? '';
  // { navn, farve } når brugeren er ved at oprette en ny kunde.
  let nyKunde = null;

  const soeg = h('input', { type: 'search', placeholder: 'Søg eller opret kunde', autocomplete: 'off', enterkeyhint: 'done', oninput: tegnKunder });
  const pris = h('input', { inputmode: 'decimal', autocomplete: 'off', placeholder: 'fx 850' });
  const kundeliste = h('div', { class: 'kort valgliste' });
  const typer = h('div', { class: 'chips' });
  const noteFelt = visNote && h('input', { value: note, autocomplete: 'off', placeholder: 'Valgfri' });
  const fejl = h('p', { class: 'fejl' });
  const bekraeft = h('button', { type: 'button', class: 'knap', onclick: bekraeftValg }, knap);

  // Den valgte kunde vises også, selvom den er arkiveret.
  const kunder = () => t.state.kunder.filter((k) => !k.arkiveret || k.id === valgtKunde).sort(efterNavn);

  function opdaterKnap() {
    const k = nyKunde ?? t.state.kunder.find((x) => x.id === valgtKunde);
    if (k) {
      bekraeft.dataset.farve = nyKunde ? nyKunde.farve : farveFor(k);
      bekraeft.classList.remove('graa');
    } else {
      delete bekraeft.dataset.farve;
      bekraeft.classList.add('graa');
    }
  }

  function tegnKunder() {
    const s = noegle(soeg.value);
    const synlige = kunder().filter((k) => noegle(k.navn).includes(s));
    const findes = aktive(t.state.kunder).some((k) => noegle(k.navn) === s);
    const raekker = synlige.map((k) => h('button', {
      type: 'button',
      class: 'raekke',
      'aria-selected': String(!nyKunde && k.id === valgtKunde),
      onclick: () => { valgtKunde = k.id; nyKunde = null; fejl.textContent = ''; tegnKunder(); },
    }, prik(k), h('span', { class: 'hoved' }, h('span', { class: 'titel' }, k.navn)), !nyKunde && k.id === valgtKunde && ikon('check')));

    if (nyKunde) {
      raekker.unshift(h('div', { class: 'ny-kunde-blok' },
        h('div', { class: 'raekke', 'aria-selected': 'true', 'data-farve': nyKunde.farve },
          prik(nyKunde.farve), h('span', { class: 'hoved' }, h('span', { class: 'titel' }, nyKunde.navn), h('span', { class: 'under' }, 'Ny kunde')), ikon('check')),
        h('div', { class: 'ny-kunde' }, felt('Timepris i kr pr. time', pris)),
      ));
    }
    if (s && !findes && noegle(nyKunde?.navn) !== s) {
      const navn = soeg.value.trim();
      raekker.push(h('button', {
        type: 'button',
        class: 'raekke opret',
        'data-farve': naesteFarve(t.state.kunder),
        onclick: () => {
          nyKunde = { navn, farve: naesteFarve(t.state.kunder) };
          valgtKunde = '';
          fejl.textContent = '';
          tegnKunder();
          pris.focus();
        },
      }, ikon('plus'), h('span', { class: 'hoved' }, h('span', { class: 'titel' }, `Opret "${navn}"`))));
    }
    if (!raekker.length) raekker.push(h('p', { class: 'tom' }, 'Skriv kundens navn for at oprette den.'));
    kundeliste.replaceChildren(...raekker);
    opdaterKnap();
  }

  function tegnTyper() {
    const liste = t.state.opgavetyper.filter((x) => !x.arkiveret || x.id === valgtType).sort(efterNavn);
    const nyFelt = h('input', { autocomplete: 'off', placeholder: 'Ny opgave', enterkeyhint: 'done' });
    const tilfoej = () => {
      const navn = nyFelt.value.trim();
      if (!navn) return;
      const fundet = aktive(t.state.opgavetyper).find((x) => noegle(x.navn) === noegle(navn));
      if (fundet) valgtType = fundet.id;
      else {
        valgtType = newId();
        t.state.opgavetyper.push({ id: valgtType, navn, arkiveret: false });
        commit();
      }
      tegnTyper();
    };
    nyFelt.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); tilfoej(); } });
    const nyRaekke = h('div', { class: 'ny-type', hidden: true },
      nyFelt, h('button', { type: 'button', class: 'knap sekundaer lille', onclick: tilfoej }, 'Tilføj'));
    typer.replaceChildren(
      ...liste.map((x) => chip(x.navn, {
        valgt: x.id === valgtType,
        onclick: () => { valgtType = valgtType === x.id ? '' : x.id; tegnTyper(); },
      })),
      h('button', {
        type: 'button',
        class: 'chip ny',
        onclick: (e) => { e.currentTarget.hidden = true; nyRaekke.hidden = false; nyFelt.focus(); },
      }, ikon('plus'), 'Ny'),
      nyRaekke,
    );
  }

  function bekraeftValg() {
    fejl.textContent = '';
    let id = valgtKunde;
    if (nyKunde) {
      const p = parseNumber(pris.value);
      if (p === null) return (fejl.textContent = 'Skriv en timepris');
      id = newId();
      t.state.kunder.push({ id, navn: nyKunde.navn, timepris: p, arkiveret: false, farve: nyKunde.farve });
      commit();
    }
    if (!id) return (fejl.textContent = 'Vælg en kunde');
    lukArk();
    paaValg({ kundeId: id, opgavetypeId: valgtType, note: noteFelt ? noteFelt.value.trim() : note });
  }

  tegnKunder();
  tegnTyper();
  aabnArk(
    arkTop(knap === 'Start' ? 'Start ur' : udenOpgave ? 'Kunde' : 'Kunde og opgave'),
    h('div', { class: 'soeg' }, ikon('soeg'), soeg),
    kundeliste,
    !udenOpgave && h('div', { class: 'ark-overskrift' }, h('h3', {}, 'Opgave'), h('span', { class: 'valgfri' }, 'valgfri')),
    !udenOpgave && typer,
    noteFelt && felt('Note', noteFelt),
    fejl,
    bekraeft,
    ekstra,
  );
}
