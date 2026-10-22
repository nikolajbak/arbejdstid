// Profilen: navn, e-mail, billede, fødselsdag, færdigheder, teams og egne tal.
// Ens egen kan redigeres; et andet medlems vises fra teamet uden tal.

import {
  FAERDIGHEDER, MAKS_FAERDIGHEDER, fejlTekst, foedselsdagTekst, foreslaaFaerdigheder, formatDuration, formatKr,
  personNavn, profilTal, soegFaerdigheder,
} from './core.js';
import { profilbillede } from './billede.js';
import { gemBillede, gemProfil, hentKatalog, hentProfil, standardNavn } from './team.js';
import { t, render } from './tilstand.js';
import { h, aabnArk, lukArk, arkTop, besked, chip, felt, ikon } from './ui.js';

// Den seneste kendte egen profil, så rækken i Indstillinger kan vise billede og navn.
let egen = null;

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

// --- Rækken øverst i Indstillinger -------------------------------------------------

export function profilKort() {
  const tegn = () => h('button', { type: 'button', class: 'kort profil-kort', onclick: () => visProfil() },
    avatar(egen ?? { navn: standardNavn(t.bruger.email) }),
    h('span', { class: 'hoved' },
      h('span', { class: 'titel' }, egen?.navn ?? standardNavn(t.bruger.email)),
      h('span', { class: 'under' }, 'Din profil')),
    ikon('hoejre'));
  let el = tegn();
  if (!egen) {
    hentProfil(t.bruger.uid).then((p) => {
      egen = p;
      const ny = tegn();
      el.replaceWith(ny);
      el = ny;
    }, console.error);
  }
  return el;
}

// --- Profilen ----------------------------------------------------------------------

export function visProfil(uid = t.bruger.uid) {
  const min = uid === t.bruger.uid;
  const indhold = h('div', { class: 'profil' }, h('p', { class: 'tom' }, 'Henter profil …'));
  aabnArk(arkTop(min ? 'Din profil' : 'Profil'), indhold);
  const hent = () => hentProfil(uid).then((p) => {
    // Et medlem, der ikke har åbnet appen siden profilerne kom, har kun navnet i teamet.
    if (!p.navn) p.navn = min ? standardNavn(t.bruger.email) : personNavn(t.team, uid);
    if (!p.email && min) p.email = t.bruger.email;
    if (min) {
      egen = p;
      render();
    }
    indhold.replaceChildren(...profilIndhold(p, min, hent).flat(Infinity).filter((x) => x instanceof Node));
  }, (err) => {
    console.error(err);
    indhold.replaceChildren(h('p', { class: 'fejl' }, 'Profilen kunne ikke hentes. Prøv igen med internet.'));
  });
  hent();
}

function profilIndhold(p, min, hent) {
  const gem = async (felter) => {
    try {
      await gemProfil(p.uid, felter);
    } catch (err) {
      return besked(fejlTekst(err.code));
    }
    hent();
  };
  const fil = h('input', { type: 'file', accept: 'image/*', hidden: true });
  fil.addEventListener('change', async () => {
    const f = fil.files?.[0];
    if (!f) return;
    try {
      await gemBillede(p.uid, await profilbillede(f));
    } catch (err) {
      console.error(err);
      return besked('Billedet kunne ikke gemmes. Prøv igen.');
    }
    hent();
  });
  const fjernBillede = async () => {
    try {
      await gemBillede(p.uid, null);
    } catch (err) {
      return besked(fejlTekst(err.code));
    }
    hent();
  };

  const dato = h('input', { type: 'date', value: p.foedselsdag ?? '', max: new Date().toISOString().slice(0, 10) });
  dato.addEventListener('change', () => gem({ foedselsdag: dato.value || null }));

  const teams = min ? t.teams : t.teams.filter((x) => x.medlemmer.includes(p.uid));
  const faerdigheder = p.faerdigheder ?? [];

  return [
    h('div', { class: 'profil-top' },
      avatar(p, true),
      min && h('div', { class: 'profil-billedknapper' },
        fil,
        h('button', { type: 'button', class: 'tekstknap', onclick: () => fil.click() }, p.billede ? 'Skift billede' : 'Tilføj billede'),
        p.billede && h('button', { type: 'button', class: 'tekstknap', onclick: fjernBillede }, 'Fjern')),
    ),
    h('div', { class: 'kort' },
      raekke('Navn', p.navn, min ? () => navnArk(p.navn, (navn) => gem({ navn })) : null),
      raekke('E-mail', p.email ?? '—'),
      min
        ? h('label', { class: 'raekke' }, h('span', { class: 'hoved' }, h('span', { class: 'under' }, 'Fødselsdag'),
          h('span', { class: 'titel' }, p.foedselsdag ? foedselsdagTekst(p.foedselsdag).split(' · ')[1] : 'Ikke angivet')), dato)
        : p.foedselsdag && raekke('Fødselsdag', foedselsdagTekst(p.foedselsdag)),
    ),

    h('div', { class: 'ark-overskrift' }, h('h3', {}, 'Færdigheder'),
      h('span', { class: 'valgfri' }, faerdigheder.length ? `${faerdigheder.length}` : '')),
    faerdigheder.length
      ? h('div', { class: 'chips' }, faerdigheder.map((f) => h('span', { class: 'chip' }, f)))
      : h('p', { class: 'tom' }, min ? 'Vælg dine færdigheder, så dit team ved, hvad du kan.' : 'Ingen færdigheder angivet.'),
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
// kategorier at bladre i. Et tryk vælger eller fravælger.

function faerdighedArk(start, gem) {
  const valgte = [...start];
  let andre = [];
  const soeg = h('input', { type: 'search', autocomplete: 'off', placeholder: 'Søg, fx tømrer, Excel eller kørekort', enterkeyhint: 'search' });
  const valgtEl = h('div', { class: 'chips' });
  const status = h('p', { class: 'hjaelp' });
  const forslagEl = h('div');
  const aabne = new Set();

  const skift = (f) => {
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
    status.textContent = valgte.length ? `${valgte.length} af ${MAKS_FAERDIGHEDER} valgt. Tryk på en valgt for at fjerne den.` : 'Intet valgt endnu.';
    const tekst = soeg.value.trim();
    if (tekst) {
      const fundne = soegFaerdigheder(tekst, valgte);
      forslagEl.replaceChildren(fundne.length ? chips(fundne) : h('p', { class: 'tom' }, 'Ingen færdighed hedder sådan. Prøv et andet ord, eller find den i kategorierne.'));
      return;
    }
    forslagEl.replaceChildren(
      h('div', { class: 'ark-overskrift' }, h('h3', {}, 'Forslag til dig')),
      chips(foreslaaFaerdigheder(valgte, andre, 8)),
      h('div', { class: 'ark-overskrift' }, h('h3', {}, 'Alle kategorier')),
      ...Object.entries(FAERDIGHEDER).map(([kategori, liste]) => {
        const antal = liste.filter((f) => valgte.includes(f)).length;
        return h('details', { class: 'kategori', open: aabne.has(kategori), ontoggle: (e) => { if (e.target.open) aabne.add(kategori); else aabne.delete(kategori); } },
          h('summary', {}, kategori, antal ? h('span', { class: 'valgfri' }, ` · ${antal} valgt`) : null),
          chips(liste));
      }),
    );
  }

  soeg.addEventListener('input', tegn);
  aabnArk(
    arkTop('Færdigheder', h('button', { type: 'button', class: 'tekstknap staerk', onclick: async () => { lukArk(); await gem(valgte); } }, 'Gem')),
    valgtEl,
    status,
    felt('Søg', soeg),
    forslagEl,
  );
  tegn();
  // Andres færdigheder gør forslagene bedre, men arket virker uden dem.
  hentKatalog().then((k) => {
    andre = k.filter((x) => x.uid !== t.bruger.uid).map((x) => x.faerdigheder ?? []);
    if (!soeg.value) tegn();
  }, console.error);
}
