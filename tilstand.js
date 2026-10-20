// Fælles tilstand for alle skærme.

import { nyeBeskeder } from './core.js';

export const t = {
  // Brugerens data. null indtil de er hentet efter login.
  state: null,
  sky: null,
  bruger: null,
  godk: null,
  // Ændringer, der endnu ikke er synkroniseret.
  ventende: false,
  // Brugerlisten, kun for administratorer.
  brugerliste: [],
  // Arbejdssted: null er Mig, ellers et team-id. team er teamets dokument.
  arbejdssted: null,
  team: null,
  teams: [],
  invitationer: [],
  // Sat fra en notifikation: Tid-fanen åbner Til godkendelse, når data er hentet.
  visGodkend: false,
};

let tegn = () => {};

export function setRender(fn) {
  tegn = fn;
}

export function render() {
  tegn();
}

let skift = () => {};

export function setSkift(fn) {
  skift = fn;
}

// Skifter til Mig (null) eller et team.
export function skiftArbejdssted(id) {
  skift(id);
}

let gaa = () => {};

export function setGaaTil(fn) {
  gaa = fn;
}

// Skifter til en fane.
export function gaaTil(fane) {
  gaa(fane);
}

// Den indloggede brugers uid, når der arbejdes i et team, ellers null.
export const migITeam = () => (t.arbejdssted ? t.bruger.uid : null);

// Registreringer og poster, som de så ud sidst, der blev meldt beskeder ud fra.
// Sættes ved hver data fra skyen og ved skift af arbejdssted, så ændringer fra en
// anden enhed (fx en afvisning dér) ikke meldes én gang til herfra.
let basis = null;

export function saetBasis(state) {
  basis = state ? structuredClone({ registreringer: state.registreringer ?? [], poster: state.poster ?? [] }) : null;
}

// Får push-beskederne fra commit. Sættes af app.js, så denne fil ikke afhænger af browserens API'er.
let vedBeskeder = () => {};

export function setVedBeskeder(fn) {
  vedBeskeder = fn;
}

// Gemmer ændringerne i skyen og tegner skærmen igen. I et team meldes det, der
// nu venter på en anden, eller som er afvist (slettet), mens det ventede.
export function commit() {
  const beskeder = t.arbejdssted && basis ? nyeBeskeder(basis, t.state, t.bruger.uid) : [];
  if (t.arbejdssted) saetBasis(t.state);
  t.sky.gem(t.state);
  render();
  if (beskeder.length) vedBeskeder(beskeder);
}

// Ændrer elementet i den aktuelle tilstand. Et åbent ark kan holde en ældre
// kopi, hvis der er kommet data fra en anden enhed, mens det var åbent.
export function aendr(samling, x, aendring) {
  const aktuel = t.state[samling].find((y) => y.id === x.id);
  if (aktuel) Object.assign(aktuel, aendring);
  else t.state[samling].push({ ...x, ...aendring });
}

// Lægger x i stedet for elementet med samme id, eller tilføjer det. Til hele
// kopier, hvor felter også kan forsvinde (fx afventer efter en godkendelse).
export function erstat(samling, x) {
  const i = t.state[samling].findIndex((y) => y.id === x.id);
  if (i >= 0) t.state[samling][i] = x;
  else t.state[samling].push(x);
}

export const aktive = (liste) => liste.filter((x) => !x.arkiveret);
export const arkiverede = (liste) => liste.filter((x) => x.arkiveret);
export const kundePaa = (id) => t.state.kunder.find((k) => k.id === id);
