// Opstart, login-skærme, faner og rendering.

import { fejlTekst, flet } from './core.js';
import { createStore } from './store.js';
import {
  lytKonto, logInd, opretKonto, sendBekraeftelse, nulstilKode, opdaterBruger, logUd,
  hentGodkendelse, lytGodkendelse, sikrProfil, lytBrugere,
} from './konto.js';
import { startSky, migSted, teamSted } from './sky.js';
import { lytMineTeams } from './team.js';
import { t, commit, setRender, setSkift, setGaaTil } from './tilstand.js';
import { h, felt, besked } from './ui.js';
import { aabnSteder } from './teamark.js';
import { visTid } from './tid.js';
import { visHistorik } from './historik.js';
import { visKunder } from './kunder.js';
import { visIndstillinger, opdaterBrugere } from './indstillinger.js';

const FANER = {
  tid: { titel: 'Tid', vis: visTid },
  historik: { titel: 'Historik', vis: visHistorik },
  kunder: { titel: 'Kunder', vis: visKunder },
  indstillinger: { titel: 'Indstillinger', vis: visIndstillinger },
};

let fane = 'tid';
try { fane = sessionStorage.getItem('arbejdstid.fane') || 'tid'; } catch {}
// Faner fra før redesignet.
if (fane === 'registreringer' || fane === 'oversigt') fane = 'historik';
if (!FANER[fane]) fane = 'tid';

const indhold = document.getElementById('indhold');

function skiftFane(ny) {
  fane = ny;
  try { sessionStorage.setItem('arbejdstid.fane', ny); } catch {}
  render();
  window.scrollTo(0, 0);
}

// --- Login ----------------------------------------------------------------

// Besked, der skal overleve genindlæsningen ved log ud, fx "Din adgang er fjernet."
let udeBesked = null;
try {
  udeBesked = sessionStorage.getItem('arbejdstid.besked');
  sessionStorage.removeItem('arbejdstid.besked');
} catch {}

// Viser en skærm uden for appen (login m.m.), uden bundnavigation.
function visUde(titel, ...boern) {
  document.body.classList.add('ude');
  document.getElementById('titel').textContent = titel;
  document.getElementById('sted').hidden = true;
  indhold.replaceChildren(...[udeBesked && h('p', { class: 'fejl' }, udeBesked), ...boern].flat(Infinity).filter(Boolean));
}

// Kører en handling og viser en eventuel fejl på dansk i `besked`.
const proev = (besked, fn) => async (e) => {
  e?.preventDefault();
  besked.textContent = '';
  try {
    await fn();
  } catch (err) {
    besked.textContent = fejlTekst(err.code);
  }
};

function visLogin() {
  const email = h('input', { type: 'email', autocomplete: 'username', inputmode: 'email', autocapitalize: 'off', required: true });
  const kode = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const fejl = h('p', { class: 'fejl' });
  const info = h('p', { class: 'hjaelp' });
  // Opret konto er ikke en submit-knap, så browserens tjek af tomme felter
  // springes over; uden dette svarer Firebase "ugyldig e-mail" på to tomme felter.
  const udfyldt = () => {
    if (!email.value.trim()) { email.focus(); throw { code: 'auth/missing-email' }; }
    if (!kode.value) { kode.focus(); throw { code: 'auth/missing-password' }; }
  };
  visUde('Arbejdstid',
    h('p', { class: 'intro' }, 'Log ind for at registrere din tid. Ny her? Skriv din e-mail, vælg en adgangskode og tryk Opret konto.'),
    h('form', { class: 'kort form-kort', onsubmit: proev(fejl, () => (udfyldt(), logInd(email.value, kode.value))) },
      felt('E-mail', email),
      felt('Adgangskode', kode),
      fejl,
      h('div', { class: 'knapper' },
        h('button', { class: 'knap', type: 'submit' }, 'Log ind'),
        h('button', { class: 'knap sekundaer', type: 'button', onclick: proev(fejl, async () => {
          udfyldt();
          const { user, sendFejl } = await opretKonto(email.value, kode.value);
          if (sendFejl) {
            udeBesked = `Mailen kunne ikke sendes: ${fejlTekst(sendFejl.code)} Tryk Send igen om lidt.`;
            visBekraeft(user);
          }
        }) }, 'Opret konto'),
      ),
    ),
    h('button', {
      class: 'tekstknap',
      type: 'button',
      onclick: proev(fejl, async () => {
        info.textContent = '';
        await nulstilKode(email.value);
        info.textContent = 'Hvis e-mailen findes, har vi sendt et link.';
      }),
    }, 'Vælg eller nulstil adgangskode'),
    info,
  );
}

function visBekraeft(user) {
  const besked = h('p', { class: 'hjaelp' });
  visUde('Bekræft e-mail',
    h('p', {}, `Bekræft din e-mail via linket, vi sendte til ${user.email}`),
    h('p', { class: 'hjaelp' }, 'Mailen kommer fra noreply@arbejdstid-dfdc6.firebaseapp.com. Kig også i uønsket post, hvis den ikke er i indbakken.'),
    besked,
    h('div', { class: 'knapper' },
      h('button', {
        class: 'knap',
        onclick: proev(besked, async () => {
          const u = await opdaterBruger();
          if (u.emailVerified) efterLogin(u);
          else besked.textContent = 'E-mailen er ikke bekræftet endnu.';
        }),
      }, 'Jeg har bekræftet'),
      h('button', {
        class: 'knap sekundaer',
        onclick: proev(besked, async () => {
          await sendBekraeftelse();
          besked.textContent = 'Vi har sendt en ny mail.';
        }),
      }, 'Send igen'),
      h('button', { class: 'knap fare', onclick: () => logUd() }, 'Log ud'),
    ),
  );
}

function visIkkeInviteret() {
  visUde('Arbejdstid',
    h('p', {}, 'Denne e-mail er ikke inviteret. Spørg den, der administrerer appen.'),
    h('div', { class: 'knapper' }, h('button', { class: 'knap fare', onclick: () => logUd() }, 'Log ud')),
  );
}

async function efterLogin(user) {
  if (!user) return visLogin();
  if (!user.emailVerified) return visBekraeft(user);
  visUde('Arbejdstid', h('p', { class: 'tom' }, 'Henter …'));
  try {
    // Et adgangsbevis fra før bekræftelsen mangler e-mail_verified, som reglerne kræver.
    // Uden net kan et udløbet bevis ikke fornyes; Firestore bruger så sin kopi og
    // synkroniserer, når der er forbindelse igen.
    try {
      if (!(await user.getIdTokenResult()).claims.email_verified) await user.getIdToken(true);
    } catch (err) {
      if (err.code !== 'auth/network-request-failed') throw err;
    }
    t.godk = await hentGodkendelse(user.email);
    if (!t.godk) return visIkkeInviteret();
    await sikrProfil(user, t.godk);
  } catch (err) {
    return visUde('Arbejdstid',
      h('p', { class: 'fejl' }, err.code === 'unavailable' ? fejlTekst('auth/network-request-failed') : fejlTekst(err.code)),
      h('div', { class: 'knapper' }, h('button', { class: 'knap', onclick: () => efterLogin(user) }, 'Prøv igen')),
    );
  }
  t.bruger = user;
  udeBesked = null;
  // Arbejdsstedet åbnes, når listen over teams er kendt, så et husket team kan
  // tjekkes. Fejler listen (fx før reglerne er udgivet), åbnes Mig.
  let gemt = null;
  try { gemt = localStorage.getItem(stedNoegle(user.uid)); } catch {}
  let startet = false;
  const aabnFoerste = () => {
    if (startet) return;
    startet = true;
    skiftArbejdssted(gemt && t.teams.some((x) => x.id === gemt) ? gemt : null);
  };
  lytMineTeams(user.uid, user.email, ({ teams, invitationer }) => {
    t.teams = teams;
    t.invitationer = invitationer;
    if (!startet) return aabnFoerste();
    if (t.arbejdssted && !teams.some((x) => x.id === t.arbejdssted)) return udAfTeam();
    t.team = teams.find((x) => x.id === t.arbejdssted) ?? null;
    render();
  }, (err) => {
    console.error(err);
    aabnFoerste();
  });
  // Firestore afbryder ikke kørende lyttere, når adgangen fjernes, så det
  // opdages via brugerens eget dokument på listen over godkendte.
  let lytterTilBrugere = false;
  lytGodkendelse(user.email, (g) => {
    if (!g) return adgangFjernet();
    t.godk = g;
    if (t.godk.admin && !lytterTilBrugere) {
      lytterTilBrugere = true;
      lytBrugere((liste) => {
        t.brugerliste = liste;
        opdaterBrugere();
        if (fane === 'indstillinger') render();
      }, () => {});
    }
    if (fane === 'indstillinger') render();
  });
}

// --- Arbejdssted ----------------------------------------------------------

// Pr. bruger, så to konti på samme telefon ikke deler valget.
const stedNoegle = (uid) => `arbejdstid.arbejdssted.${uid}`;

// null er Mig, ellers et team-id.
function skiftArbejdssted(id) {
  // Et åbent ark hører til det gamle arbejdssted og må ikke gemme i det nye.
  for (const ark of document.querySelectorAll('dialog.ark[open]')) ark.close();
  t.sky?.stop();
  t.state = null;
  t.arbejdssted = id;
  t.team = id ? t.teams.find((x) => x.id === id) ?? null : null;
  try { localStorage.setItem(stedNoegle(t.bruger.uid), id ?? ''); } catch {}
  indhold.replaceChildren(h('p', { class: 'tom' }, 'Henter …'));
  visSted();
  const uid = t.bruger.uid;
  t.sky = startSky(id ? teamSted(id, uid) : migSted(uid), {
    data(d) {
      const foerste = !t.state;
      t.state = d;
      if (foerste) document.body.classList.remove('ude');
      render();
      if (foerste && !id) tilbydOverfoersel();
    },
    status(v) {
      t.ventende = v;
      document.getElementById('sync').hidden = !v;
    },
    fejl: skyFejl,
  });
}

setSkift(skiftArbejdssted);

// Man er fjernet fra teamet (eller har meldt sig ud): tilbage til Mig.
function udAfTeam() {
  const navn = t.team?.navn ?? 'teamet';
  skiftArbejdssted(null);
  besked(`Du er ikke længere med i ${navn}`);
}

function visSted() {
  const knap = document.getElementById('sted');
  knap.hidden = false;
  knap.firstChild.textContent = t.team?.navn ?? 'Mig';
  knap.classList.toggle('prik-ny', t.invitationer.length > 0);
}

function adgangFjernet() {
  try { sessionStorage.setItem('arbejdstid.besked', fejlTekst('permission-denied')); } catch {}
  t.sky.stop();
  logUd();
}

// Tilbyder én gang pr. telefon at flytte data fra før login ind på kontoen.
function tilbydOverfoersel() {
  let raa;
  try {
    if (localStorage.getItem('arbejdstid.overfoersel')) return;
    raa = localStorage.getItem('arbejdstid.v1');
  } catch {
    return;
  }
  if (raa === null) return;
  const lokal = createStore().load();
  if (lokal.kunder.length || lokal.registreringer.length) {
    const n = lokal.registreringer.length;
    if (confirm(`Overfør ${n} ${n === 1 ? 'registrering' : 'registreringer'} fra denne telefon til din konto?`)) {
      t.state = flet(lokal, t.state);
      commit();
      try {
        localStorage.setItem(`arbejdstid.v1.overfoert-${Date.now()}`, raa);
        localStorage.removeItem('arbejdstid.v1');
      } catch {}
    }
  }
  try { localStorage.setItem('arbejdstid.overfoersel', '1'); } catch {}
}

// En lytter afvist af reglerne betyder, at adgangen er fjernet.
function skyFejl(err, hvor) {
  // I et team betyder en afvist lytter, at man ikke længere er medlem.
  if (hvor === 'lyt' && err.code === 'permission-denied') return t.arbejdssted ? udAfTeam() : adgangFjernet();
  console.error(err);
}

// --- Rendering ------------------------------------------------------------

function render() {
  if (!t.state) return;
  document.getElementById('titel').textContent = FANER[fane].titel;
  visSted();
  for (const b of document.querySelectorAll('.faner button')) {
    if (b.dataset.fane === fane) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  indhold.replaceChildren(...[FANER[fane].vis()].flat(Infinity).filter(Boolean));
}

setRender(render);
setGaaTil(skiftFane);

for (const b of document.querySelectorAll('.faner button')) {
  b.addEventListener('click', () => skiftFane(b.dataset.fane));
}
document.getElementById('sted').addEventListener('click', aabnSteder);

lytKonto(efterLogin);
