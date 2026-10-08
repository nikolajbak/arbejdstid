// Opstart, login-skærme, faner og rendering.

import { fejlTekst, flet } from './core.js';
import { createStore } from './store.js';
import {
  lytKonto, logInd, opretKonto, sendBekraeftelse, nulstilKode, opdaterBruger, logUd,
  hentGodkendelse, lytGodkendelse, sikrProfil, lytBrugere,
} from './konto.js';
import { startSky } from './sky.js';
import { t, commit, setRender } from './tilstand.js';
import { h, felt } from './ui.js';
import { visTid } from './tid.js';
import { visHistorik } from './historik.js';
import { visIndstillinger, opdaterBrugere } from './indstillinger.js';

const FANER = {
  tid: { titel: 'Tid', vis: visTid },
  historik: { titel: 'Historik', vis: visHistorik },
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
  visUde('Arbejdstid',
    h('p', { class: 'intro' }, 'Log ind for at registrere din tid.'),
    h('form', { class: 'kort form-kort', onsubmit: proev(fejl, () => logInd(email.value, kode.value)) },
      felt('E-mail', email),
      felt('Adgangskode', kode),
      fejl,
      h('div', { class: 'knapper' },
        h('button', { class: 'knap', type: 'submit' }, 'Log ind'),
        h('button', { class: 'knap sekundaer', type: 'button', onclick: proev(fejl, () => opretKonto(email.value, kode.value)) }, 'Opret konto'),
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
  t.sky = startSky(user.uid, {
    data(d) {
      const foerste = !t.state;
      t.state = d;
      if (foerste) document.body.classList.remove('ude');
      render();
      if (foerste) tilbydOverfoersel();
    },
    status(v) {
      t.ventende = v;
      document.getElementById('sync').hidden = !v;
    },
    fejl: skyFejl,
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
  if (hvor === 'lyt' && err.code === 'permission-denied') return adgangFjernet();
  console.error(err);
}

// --- Rendering ------------------------------------------------------------

function render() {
  if (!t.state) return;
  document.getElementById('titel').textContent = FANER[fane].titel;
  for (const b of document.querySelectorAll('.faner button')) {
    if (b.dataset.fane === fane) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  indhold.replaceChildren(...[FANER[fane].vis()].flat(Infinity).filter(Boolean));
}

setRender(render);

for (const b of document.querySelectorAll('.faner button')) {
  b.addEventListener('click', () => skiftFane(b.dataset.fane));
}

lytKonto(efterLogin);
