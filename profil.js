// Profilen: navn, e-mail, billede, fødselsdag, færdigheder, teams og egne tal.
// Ens egen kan redigeres; et andet medlems vises fra teamet uden tal.

import {
  FAERDIGHEDER, MAKS_FAERDIGHEDER, egenFaerdighed, fejlTekst, foedselsdagTekst, foreslaaFaerdigheder, formatDuration, formatKr,
  kendtFaerdighed, personNavn, profilTal, soegFaerdigheder,
} from './core.js';
import { profilbillede } from './billede.js';
import { gemBillede, gemProfil, hentKatalog, hentProfil, standardNavn } from './team.js';
import { t, render } from './tilstand.js';
import { h, aabnArk, lukArk, arkTop, besked, chip, felt, foldbar, ikon } from './ui.js';

// Hentede profiler, så et ark kan åbne med det samme og opdateres bagefter.
const profiler = new Map();
const egen = () => profiler.get(t.bruger.uid);
// Om færdighederne på en profil er foldet ud; huskes, mens appen er åben.
let faerdighederAabne = true;

const initialer = (navn) => String(navn ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((d) => d[0].toUpperCase()).join('');

function avatar(p, stor = false) {
  const klasse = stor ? 'avatar stor' : 'avatar';
  return p?.billede
    ? h('img', { class: klasse, src: p.billede, alt: '' })
    : h('span', { class: klasse, 'aria-hidden': 'true' }, initialer(p?.navn));
}

const raekke = (titel, under, onclick) => h(onclick ? 'button' : 'div', { type: onclick ? 'button' : undefined, class: 'raekke', onclick },
  h('span', { class: 'hoved' }, h('span', { class: 'under' }, titel), h('span', { class: 'titel' }, under)),
  onclick && ikon('hoejre'));

// Et medlem, der ikke har åbnet appen siden profilerne kom, har kun navnet i teamet.
async function hent(uid) {
  const p = await hentProfil(uid);
  const min = uid === t.bruger.uid;
  if (!p.navn) p.navn = min ? standardNavn(t.bruger.email) : personNavn(t.team, uid);
  if (!p.email && min) p.email = t.bruger.email;
  profiler.set(uid, p);
  return p;
}

// --- Rækken øverst i Indstillinger -------------------------------------------------

export function profilKort() {
  const tegn = () => h('button', { type: 'button', class: 'kort raekke profil-kort', onclick: () => visProfil() },
    avatar(egen() ?? { navn: standardNavn(t.bruger.email) }),
    h('span', { class: 'hoved' },
      h('span', { class: 'titel' }, egen()?.navn ?? standardNavn(t.bruger.email)),
      h('span', { class: 'under' }, 'Din profil')),
    ikon('hoejre'));
  let el = tegn();
  if (!egen()) {
    hent(t.bruger.uid).then(() => {
      const ny = tegn();
      el.replaceWith(ny);
      el = ny;
    }, console.error);
  }
  return el;
}

// --- Profilen ----------------------------------------------------------------------

// Arket åbner først, når profilen er klar, så det glider op i fuld højde.
export async function visProfil(uid = t.bruger.uid) {
  const min = uid === t.bruger.uid;
  let p = profiler.get(uid);
  const kendt = Boolean(p);
  if (!kendt) {
    try {
      p = await hent(uid);
    } catch (err) {
      console.error(err);
      return besked('Profilen kunne ikke hentes. Prøv igen med internet.');
    }
  }
  const indhold = h('div', { class: 'profil' });
  // Ændringer vises med det samme; rækken i Indstillinger følger med.
  const opdater = (felter) => {
    p = { ...p, ...felter };
    profiler.set(uid, p);
    if (min) render();
    vis();
  };
  const vis = () => indhold.replaceChildren(...profilIndhold(p, min, opdater).flat(Infinity).filter((x) => x instanceof Node));
  vis();
  aabnArk(arkTop(min ? 'Din profil' : 'Profil'), indhold);
  if (kendt) {
    hent(uid).then((ny) => {
      if (JSON.stringify(ny) === JSON.stringify(p) || indhold.contains(document.activeElement)) return;
      p = ny;
      vis();
    }, console.error);
  }
}

function profilIndhold(p, min, opdater) {
  const gem = async (felter) => {
    try {
      await gemProfil(p.uid, felter);
    } catch (err) {
      return besked(fejlTekst(err.code));
    }
    opdater(felter);
  };
  const skiftBillede = async (billede) => {
    const foer = p.billede;
    opdater({ billede });
    try {
      await gemBillede(p.uid, billede);
    } catch (err) {
      console.error(err);
      opdater({ billede: foer });
      besked('Billedet kunne ikke gemmes. Prøv igen.');
    }
  };
  const fil = h('input', { type: 'file', accept: 'image/*', hidden: true });
  fil.addEventListener('change', async () => {
    const f = fil.files?.[0];
    fil.value = '';
    if (!f) return;
    knap.classList.add('arbejder');
    try {
      await skiftBillede(await profilbillede(f));
    } catch (err) {
      console.error(err);
      knap.classList.remove('arbejder');
      besked('Billedet kunne ikke læses. Prøv et andet.');
    }
  });
  const knap = h('button', { type: 'button', class: 'avatar-knap', 'aria-label': p.billede ? 'Skift profilbillede' : 'Tilføj profilbillede', onclick: () => fil.click() },
    avatar(p, true), h('span', { class: 'kamera', 'aria-hidden': 'true' }, ikon('kamera')));

  // Fødselsdagen gemmes uden at tegne arket om, ellers lukker datovælgeren undervejs.
  const alder = h('span', { class: 'titel' }, p.foedselsdag ? foedselsdagTekst(p.foedselsdag).split(' · ')[1] : 'Ikke angivet');
  const dato = h('input', { type: 'date', value: p.foedselsdag ?? '', max: new Date().toISOString().slice(0, 10) });
  dato.addEventListener('change', async () => {
    const v = dato.value || null;
    alder.textContent = v ? foedselsdagTekst(v).split(' · ')[1] : 'Ikke angivet';
    try {
      await gemProfil(p.uid, { foedselsdag: v });
      p.foedselsdag = v;
      profiler.set(p.uid, p);
    } catch (err) {
      besked(fejlTekst(err.code));
    }
  });

  const teams = min ? t.teams : t.teams.filter((x) => x.medlemmer.includes(p.uid));
  const faerdigheder = p.faerdigheder ?? [];

  return [
    h('div', { class: 'profil-top' },
      min ? [fil, knap] : avatar(p, true),
      min && p.billede && h('button', { type: 'button', class: 'tekstknap fjern', onclick: () => skiftBillede(null) }, 'Fjern billede'),
    ),
    h('div', { class: 'kort' },
      raekke('Navn', p.navn, min ? () => navnArk(p.navn, (navn) => gem({ navn })) : null),
      raekke('E-mail', p.email ?? '—'),
      min
        ? h('label', { class: 'raekke' }, h('span', { class: 'hoved' }, h('span', { class: 'under' }, 'Fødselsdag'), alder), dato)
        : p.foedselsdag && raekke('Fødselsdag', foedselsdagTekst(p.foedselsdag)),
    ),

    faerdigheder.length
      ? foldbar([h('h3', {}, 'Færdigheder'), h('span', { class: 'valgfri' }, ` · ${faerdigheder.length}`)],
        h('div', { class: 'chips' }, faerdigheder.map((f) => h('span', { class: 'chip' }, f))),
        { aaben: faerdighederAabne, klasse: 'sektion', onSkift: (v) => { faerdighederAabne = v; } })
      : [h('div', { class: 'ark-overskrift' }, h('h3', {}, 'Færdigheder')),
        h('p', { class: 'tom' }, min ? 'Vælg dine færdigheder, så dit team ved, hvad du kan.' : 'Ingen færdigheder angivet.')],
    min && h('button', { type: 'button', class: 'knap sekundaer', onclick: () => faerdighedArk(faerdigheder, (liste) => gem({ faerdigheder: liste })) },
      ikon('plus'), faerdigheder.length ? 'Ret færdigheder' : 'Vælg færdigheder'),

    h('div', { class: 'ark-overskrift' }, h('h3', {}, min ? 'Teams' : 'Fælles teams')),
    teams.length
      ? h('div', { class: 'kort' }, teams.map((x) => raekke(x.navn, `${x.medlemmer.length} ${x.medlemmer.length === 1 ? 'medlem' : 'medlemmer'}`)))
      : h('p', { class: 'tom' }, min ? 'Du er ikke med i et team endnu.' : 'Ingen fælles teams.'),

    min && talSektion(),
  ];
}

// Tallene gælder det arbejdssted, der er åbent; i et team kun ens egen tid.
function talSektion() {
  const tal = profilTal(t.state.registreringer, t.bruger.uid);
  const sted = t.team?.navn ?? 'Mig';
  const boks = (titel, v, under) => h('div', { class: 'tal-boks' }, h('span', { class: 'under' }, titel), h('span', { class: 'tal-stor' }, v), under && h('span', { class: 'under' }, under));
  const tid = (x) => `${formatDuration(x.ms)} t`;
  const kunde = t.state.kunder.find((k) => k.id === tal.topKundeId)?.navn;
  return [
    h('div', { class: 'ark-overskrift' }, h('h3', {}, 'Tid og indtjening'), h('span', { class: 'valgfri' }, `i ${sted}, uden moms`)),
    tal.antal
      ? [
        h('div', { class: 'tal-gitter' },
          boks('Denne måned', tid(tal.maaned), formatKr(tal.maaned.kr)),
          boks('I år', tid(tal.aar), formatKr(tal.aar.kr)),
          boks('I alt', tid(tal.iAlt), formatKr(tal.iAlt.kr)),
          boks('Gns. timepris', formatKr(tal.snitTimepris)),
        ),
        h('div', { class: 'kort' },
          raekke('Registreringer', String(tal.antal)),
          raekke('Kunder', String(tal.kunder)),
          kunde && raekke('Mest tid hos', kunde),
          raekke('Første registrering', new Date(tal.foerste).toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' })),
        ),
      ]
      : h('p', { class: 'tom' }, `Ingen registreringer i ${sted} endnu.`),
  ];
}

function navnArk(navn, gem) {
  const input = h('input', { value: navn, autocomplete: 'name', enterkeyhint: 'done', maxlength: 60 });
  const fejl = h('p', { class: 'fejl' });
  aabnArk(h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return (fejl.textContent = 'Skriv et navn');
      lukArk();
      await gem(v);
    },
  }, arkTop('Navn', h('button', { type: 'submit', class: 'tekstknap staerk' }, 'Gem')), felt('Dit navn', input),
  h('p', { class: 'hjaelp' }, 'Navnet bruges, når andre søger efter dig for at invitere dig til et team.'), fejl));
  input.focus();
}

// --- Vælg færdigheder ---------------------------------------------------------------
// Fast liste med søgning, forslag ud fra det valgte og hvad andre har valgt, og alle
// kategorier at bladre i. Et tryk vælger eller fravælger. Mangler en færdighed, kan den
// tilføjes fra søgefeltet.

function faerdighedArk(start, gem) {
  const valgte = [...start];
  let andre = [];
  let ekstra = [];
  const soeg = h('input', { type: 'search', autocomplete: 'off', placeholder: 'Søg eller skriv en ny', enterkeyhint: 'done' });
  const valgtEl = h('div', { class: 'chips' });
  const valgtTitel = h('span');
  const valgtBoks = foldbar(valgtTitel, [valgtEl, h('p', { class: 'hjaelp' }, 'Tryk på en valgt for at fjerne den.')], { klasse: 'kategori valgte' });
  const forslagEl = h('div', { class: 'forslag' });
  const aabne = new Set();

  const skift = (f) => {
    if (!f) return;
    const i = valgte.indexOf(f);
    if (i >= 0) valgte.splice(i, 1);
    else if (valgte.length >= MAKS_FAERDIGHEDER) return besked(`Du kan højst vælge ${MAKS_FAERDIGHEDER}`);
    else valgte.push(f);
    if (soeg.value) {
      soeg.value = '';
      soeg.focus();
    }
    tegn();
  };
  const chips = (liste) => h('div', { class: 'chips' }, liste.map((f) => chip(f, { valgt: valgte.includes(f), onclick: () => skift(f) })));

  function tegn() {
    valgtEl.replaceChildren(...valgte.map((f) => h('button', { type: 'button', class: 'chip', 'aria-pressed': 'true', onclick: () => skift(f), 'aria-label': `Fjern ${f}` }, f, ikon('kryds'))));
    valgtTitel.textContent = `Valgt · ${valgte.length} af ${MAKS_FAERDIGHEDER}`;
    valgtBoks.hidden = !valgte.length;
    const tekst = soeg.value.trim();
    if (tekst) {
      const fundne = soegFaerdigheder(tekst, valgte, 12, ekstra);
      const ny = egenFaerdighed(tekst, ekstra);
      const tilfoej = ny && !fundne.includes(ny) && !valgte.includes(ny)
        && h('button', { type: 'button', class: 'chip ny', onclick: () => skift(ny) }, ikon('plus'), `Tilføj »${ny}«`);
      forslagEl.replaceChildren(h('div', { class: 'chips' }, fundne.map((f) => chip(f, { onclick: () => skift(f) })), tilfoej));
      return;
    }
    forslagEl.replaceChildren(
      h('div', { class: 'ark-overskrift' }, h('h3', {}, 'Forslag til dig')),
      chips(foreslaaFaerdigheder(valgte, andre, 8)),
      h('div', { class: 'ark-overskrift' }, h('h3', {}, 'Alle kategorier')),
      ...Object.entries(FAERDIGHEDER).map(([kategori, liste]) => {
        const antal = liste.filter((f) => valgte.includes(f)).length;
        return foldbar([kategori, antal ? h('span', { class: 'valgfri' }, ` · ${antal} valgt`) : null], chips(liste),
          { aaben: aabne.has(kategori), klasse: 'kategori', onSkift: (v) => { if (v) aabne.add(kategori); else aabne.delete(kategori); } });
      }),
    );
  }

  soeg.addEventListener('input', tegn);
  // Enter vælger det skrevne: en kendt færdighed med samme navn eller en ny.
  soeg.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    skift(egenFaerdighed(soeg.value, ekstra));
  });
  aabnArk(
    arkTop('Færdigheder', h('button', { type: 'button', class: 'tekstknap staerk', onclick: async () => { lukArk(); await gem(valgte); } }, 'Gem')),
    valgtBoks,
    felt('Søg', h('div', { class: 'soeg' }, ikon('soeg'), soeg)),
    h('p', { class: 'hjaelp' }, 'Mangler en færdighed? Skriv den, og tryk Tilføj.'),
    forslagEl,
  );
  tegn();
  // Andres færdigheder gør forslag og søgning bedre, men arket virker uden dem.
  hentKatalog().then((k) => {
    andre = k.filter((x) => x.uid !== t.bruger.uid).map((x) => x.faerdigheder ?? []);
    ekstra = [...new Set(andre.flat().filter((f) => typeof f === 'string' && !kendtFaerdighed(f)))];
    if (!soeg.value) tegn();
  }, console.error);
}
