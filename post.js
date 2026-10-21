// Arket for en post (udgift, brændstof, kontantudlæg eller betaling) og rækken i lister.

import { POST_TYPER, dayKey, farveFor, formatKr, kvitteringNote, markerRettelse, parseNumber, personNavn, postBeloeb } from './core.js';
import { newId } from './store.js';
import { t, commit, erstat, kundePaa, migITeam } from './tilstand.js';
import { h, aabnArk, lukArk, arkTop, chip, felt, ikon, prik, navnPaa, afregnetMaerke, ventendeMaerke } from './ui.js';
import { komprimer } from './billede.js';
import { kanLaese, laesKvittering } from './kvittering.js';
import { aabnVaelger } from './vaelger.js';

const kr = (n) => String(n).replace('.', ',');

// En ventende post viser, hvem den venter på, i stedet for afregnet-mærket.
export function postRaekke(p, status) {
  const beloeb = postBeloeb(p);
  const maerke = ventendeMaerke(p) ?? afregnetMaerke(status);
  return h('button', { class: p.afventer ? 'raekke venter' : 'raekke', 'data-farve': farveFor(kundePaa(p.kundeId) ?? { id: p.kundeId }), onclick: () => aabnPost(p) },
    h('span', { class: 'streg' }),
    h('span', { class: 'hoved' },
      h('span', { class: 'titel' }, `${POST_TYPER[p.type]} · ${navnPaa(t.state.kunder, p.kundeId)}`),
      (maerke || p.note) && h('span', { class: 'under' }, maerke, maerke && p.note && ' · ', p.note),
    ),
    p.bilag && h('span', { class: 'bilag-maerke', title: 'Har billede' }, ikon('clips')),
    h('span', { class: 'tal' }, h('span', { class: 'titel' }, `${beloeb < 0 ? '−' : '+'}${formatKr(Math.abs(beloeb))}`)),
  );
}

// Billedet i fuld størrelse.
function visBillede(billede) {
  aabnArk(
    h('div', { class: 'ark-top' }, h('span'), h('h3', {}, 'Billede'),
      h('button', { type: 'button', class: 'tekstknap staerk', onclick: lukArk }, 'Luk')),
    h('img', { class: 'bilag-stort', src: billede, alt: 'Billede på posten' }),
  );
}

// forvalg: { type, kundeId, beloeb } for en ny post.
export function aabnPost(post, forvalg = {}) {
  const ny = !post;
  const valg = {
    type: post?.type ?? forvalg.type ?? 'udgift',
    kundeId: post?.kundeId ?? forvalg.kundeId ?? '',
    // Kun i et team: hvem der har afholdt udgiften. Én person, ellers tæller den flere gange.
    person: t.team ? (post?.person ?? t.bruger.uid) : null,
  };
  const startBeloeb = post?.beloeb ?? forvalg.beloeb;

  const dato = h('input', { type: 'date', value: post?.dato ?? dayKey(new Date()), 'aria-label': 'Dato' });
  const beloeb = h('input', { inputmode: 'decimal', autocomplete: 'off', placeholder: 'fx 450', value: startBeloeb ? kr(startBeloeb) : '' });
  const note = h('textarea', { value: post?.note ?? '', placeholder: 'Valgfri' });
  const moms = h('input', { inputmode: 'decimal', autocomplete: 'off', placeholder: 'Valgfri', value: post?.moms ? kr(post.moms) : '' });
  const momsFelt = felt('Heraf moms i kr', moms);
  // Felter, brugeren selv har rettet i arket. En læst kvittering skriver ikke hen over dem.
  const roert = new Set();
  for (const [navn, input] of Object.entries({ dato, beloeb, note, moms })) input.addEventListener('input', () => roert.add(navn));
  const fejl = h('p', { class: 'fejl' });
  const typer = h('div', { class: 'chips' });
  const kundeRaekke = h('div', { class: 'kort' });
  const titel = h('h3', {});
  const hvem = h('div', { class: 'post-hvem' });
  // billede: data-URL eller null. hentet: false, mens et gemt billede hentes,
  // eller hvis det ikke kunne hentes; så røres det ikke ved Gem. status: tekst om læsningen af kvitteringen.
  const bilag = { billede: null, hentet: !post?.bilag, aendret: false, status: '' };
  const bilagKort = h('div', { class: 'kort bilag' });
  const vaelgFil = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
    const fil = vaelgFil.files[0];
    vaelgFil.value = '';
    if (!fil) return;
    fejl.textContent = '';
    try {
      Object.assign(bilag, { billede: await komprimer(fil), hentet: true, aendret: true, status: '' });
    } catch {
      fejl.textContent = 'Billedet kunne ikke læses. Prøv et andet.';
      return tegnBilag();
    }
    if (valg.type !== 'betaling' && kanLaese()) laes(bilag.billede);
    tegnBilag();
  } });

  // Læser kvitteringen og udfylder de felter, brugeren ikke selv har rettet.
  // På en gemt post udfyldes kun tomme felter, så intet gemt overskrives.
  async function laes(billede) {
    bilag.status = 'Læser kvitteringen …';
    let k;
    try {
      k = await laesKvittering(billede);
    } catch (e) {
      k = { fejl: e.message };
    }
    if (bilag.billede !== billede) return;
    const fyld = (navn, input, vaerdi) => {
      if (vaerdi && !roert.has(navn) && (ny || !input.value)) input.value = vaerdi;
    };
    if (k.fejl) bilag.status = k.fejl;
    else if (!k.erKvittering) bilag.status = 'Billedet ligner ikke en kvittering. Udfyld selv.';
    else {
      fyld('beloeb', beloeb, k.total ? kr(k.total) : '');
      fyld('moms', moms, k.moms ? kr(k.moms) : '');
      fyld('dato', dato, k.dato);
      fyld('note', note, kvitteringNote(k));
      if (k.braendstof && ny && valg.type === 'udgift') { valg.type = 'braendstof'; tegnTyper(); }
      bilag.status = 'Udfyldt fra kvitteringen. Tjek tallene, før du gemmer.';
    }
    tegnBilag();
  }

  function tegnTyper() {
    titel.textContent = POST_TYPER[valg.type];
    momsFelt.hidden = valg.type === 'betaling';
    typer.replaceChildren(...Object.entries(POST_TYPER).map(([type, navn]) => chip(navn, {
      valgt: type === valg.type,
      onclick: () => { valg.type = type; tegnTyper(); },
    })));
    tegnHvem();
  }

  // En betaling er kundens, ikke en persons, så Hvem forsvinder ved Betaling.
  function tegnHvem() {
    hvem.hidden = !valg.person || valg.type === 'betaling';
    if (hvem.hidden) return hvem.replaceChildren();
    const uid = t.bruger.uid;
    // Man selv først, så de andre efter navn, som i vælgeren. En fjernet person på en gammel post vises også.
    const alle = [...new Set([...t.team.medlemmer, valg.person])]
      .sort((a, b) => (a === uid ? -1 : b === uid ? 1 : personNavn(t.team, a).localeCompare(personNavn(t.team, b), 'da')));
    hvem.replaceChildren(
      h('div', { class: 'ark-overskrift' }, h('h3', {}, 'Hvem')),
      h('div', { class: 'chips' }, alle.map((p) => chip(p === uid ? `${personNavn(t.team, p)} (dig)` : personNavn(t.team, p), {
        valgt: p === valg.person,
        onclick: () => { valg.person = p; tegnHvem(); },
      }))),
    );
  }

  function tegnKunde() {
    const kunde = kundePaa(valg.kundeId);
    kundeRaekke.replaceChildren(h('button', {
      type: 'button',
      class: 'raekke',
      onclick: () => aabnVaelger({ kundeId: valg.kundeId, knap: 'Vælg', udenOpgave: true }, (v) => { valg.kundeId = v.kundeId; tegnKunde(); }),
    },
    valg.kundeId ? prik(kunde ?? { id: valg.kundeId }) : null,
    h('span', { class: 'hoved' }, h('span', { class: 'under' }, 'Kunde'),
      h('span', { class: 'titel' }, valg.kundeId ? navnPaa(t.state.kunder, valg.kundeId) : 'Vælg kunde')),
    ikon('hoejre')));
  }

  function tegnBilag(tekst) {
    const knap = (navn, onclick, klasse = 'tekstknap') => h('button', { type: 'button', class: klasse, onclick }, navn);
    if (tekst) return bilagKort.replaceChildren(h('p', { class: 'hjaelp' }, tekst));
    if (!bilag.billede) {
      return bilagKort.replaceChildren(knap('Tilføj billede', () => vaelgFil.click(), 'raekke'),
        h('p', { class: 'hjaelp' }, 'Tag et billede af kvitteringen, eller vælg et fra Fotos.'));
    }
    bilagKort.replaceChildren(
      h('button', { type: 'button', class: 'bilag-vis', onclick: () => visBillede(bilag.billede) },
        h('img', { src: bilag.billede, alt: 'Billede på posten' })),
      h('div', { class: 'bilag-knapper' },
        knap('Skift billede', () => vaelgFil.click()),
        kanLaese() && valg.type !== 'betaling' && bilag.status !== 'Læser kvitteringen …'
          && knap('Læs kvittering', () => { laes(bilag.billede); tegnBilag(); }),
        knap('Fjern', () => { Object.assign(bilag, { billede: null, hentet: true, aendret: true, status: '' }); tegnBilag(); })),
      bilag.status && h('p', { class: 'hjaelp' }, bilag.status),
    );
  }

  function gem(e) {
    e.preventDefault();
    fejl.textContent = '';
    if (!valg.kundeId) return (fejl.textContent = 'Vælg en kunde');
    if (!dato.value) return (fejl.textContent = 'Vælg en dato');
    const b = parseNumber(beloeb.value);
    if (b === null || b <= 0) return (fejl.textContent = 'Skriv et beløb over 0, fx 1250 eller 1.250,00');
    // En betaling har ingen moms; et tomt felt betyder ingen moms.
    const m = valg.type === 'betaling' || !moms.value.trim() ? 0 : parseNumber(moms.value);
    if (m === null || m < 0 || m > b) return (fejl.textContent = 'Momsen skal være et tal mellem 0 og beløbet');
    const data = { kundeId: valg.kundeId, type: valg.type, dato: dato.value, beloeb: b, note: note.value.trim(),
      bilag: bilag.hentet ? !!bilag.billede : !!post?.bilag, ...(m > 0 && { moms: m }) };
    // En betaling har ingen person; en udgift for en anden venter på dennes godkendelse.
    const person = valg.person && valg.type !== 'betaling' ? { person: valg.person } : {};
    const id = post?.id ?? newId();
    if (bilag.aendret) {
      if (bilag.billede) t.sky.gemBilag(id, bilag.billede);
      else if (!ny) t.sky.sletBilag(id);
    }
    if (ny) t.state.poster.push(markerRettelse({ id, ...data, ...person }, migITeam()));
    else {
      // Arket kan holde en ældre kopi, hvis der er kommet data fra en anden enhed.
      const { person: _, moms: __, ...aktuel } = t.state.poster.find((p) => p.id === post.id) ?? post;
      erstat('poster', markerRettelse({ ...aktuel, ...data, ...person }, migITeam()));
    }
    lukArk();
    commit();
  }

  function slet() {
    if (!confirm('Slet posten?')) return;
    t.state.poster = t.state.poster.filter((p) => p.id !== post.id);
    if (post.bilag) t.sky.sletBilag(post.id);
    lukArk();
    commit();
  }

  tegnTyper();
  tegnKunde();
  if (bilag.hentet) tegnBilag();
  else {
    tegnBilag('Henter billede …');
    t.sky.hentBilag(post.id)
      .then((billede) => {
        if (bilag.aendret) return;
        Object.assign(bilag, { billede, hentet: true });
        tegnBilag(billede ? null : 'Billedet findes ikke længere.');
      })
      .catch(() => { if (!bilag.aendret) tegnBilag('Billedet kan ikke hentes uden net.'); });
  }
  aabnArk(
    h('form', { onsubmit: gem },
      h('div', { class: 'ark-top' },
        h('button', { type: 'button', class: 'tekstknap', onclick: lukArk }, 'Annullér'),
        titel,
        h('button', { type: 'submit', class: 'tekstknap staerk' }, 'Gem')),
      typer,
      kundeRaekke,
      hvem,
      h('div', { class: 'kort' },
        h('div', { class: 'raekke tidsfelter' }, h('span', { class: 'hoved' }, 'Dato'), dato),
      ),
      felt('Beløb i kr', beloeb),
      momsFelt,
      felt('Note', note),
      bilagKort,
      vaelgFil,
      fejl,
      !ny && h('button', { class: 'knap fare', type: 'button', onclick: slet }, 'Slet posten'),
    ),
  );
}

// Valget bag "+ Tilføj" på Tid-skærmen.
export function aabnTilfoej(aabnTid) {
  const valg = (tekst, handling) => h('button', { type: 'button', class: 'raekke', onclick: () => { lukArk(); handling(); } },
    h('span', { class: 'hoved' }, h('span', { class: 'titel' }, tekst)), ikon('hoejre'));
  aabnArk(
    arkTop('Tilføj'),
    h('div', { class: 'kort' },
      valg('Tid', aabnTid),
      ...Object.entries(POST_TYPER).map(([type, navn]) => valg(navn, () => aabnPost(null, { type }))),
    ),
  );
}
